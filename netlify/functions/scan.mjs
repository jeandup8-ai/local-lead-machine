// Local Lead Machine — website scanner (Netlify Function, Node 18+)
// Fetches ONE public web page and returns plain signals. Scoring happens in the browser
// (site/assets/scoring.js) so every point is traceable to a signal.
//
// Security:
//  - only http/https, ports 80/443, no credentials in URL
//  - hostname must resolve to public IPs only (blocks localhost, private ranges, cloud metadata)
//  - redirects followed manually (max 3) and every hop re-validated
//  - 8s timeout, 1.5 MB body cap, HTML only
//  - best-effort per-IP rate limit (20 scans / 10 min per warm instance)

import dns from "node:dns/promises";
import net from "node:net";

const MAX_BYTES = 1_500_000;
const TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;
const UA = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36 LocalLeadMachineAudit/1.0";

const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 600_000);
  if (recent.length >= 20) return true;
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return false;
}

class UserError extends Error {}

export function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0)) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  const l = ip.toLowerCase();
  if (l === "::" || l === "::1") return true;
  if (l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe8") || l.startsWith("fe9") || l.startsWith("fea") || l.startsWith("feb")) return true;
  if (l.startsWith("::ffff:")) return isPrivateIp(l.slice(7));
  if (l.startsWith("64:ff9b:")) return true;
  return false;
}

export function normaliseUrl(raw) {
  let s = String(raw || "").trim();
  if (!s) throw new UserError("Please enter a website address.");
  if (s.length > 300) throw new UserError("That address is too long.");
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  let u;
  try { u = new URL(s); } catch { throw new UserError("That doesn't look like a valid website address."); }
  return u;
}

export async function assertPublic(u) {
  if (!["http:", "https:"].includes(u.protocol)) throw new UserError("Only http and https websites can be checked.");
  if (u.username || u.password) throw new UserError("Website addresses with logins can't be checked.");
  if (u.port && !["80", "443"].includes(u.port)) throw new UserError("Only standard web ports can be checked.");
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host.includes(".") || host === "localhost" || /\.(local|internal|localhost|lan|home|corp)$/.test(host)) {
    throw new UserError("That address isn't a public website.");
  }
  let addrs;
  if (net.isIP(host)) addrs = [{ address: host }];
  else {
    try { addrs = await dns.lookup(host, { all: true }); }
    catch { throw new UserError("We couldn't find that website. Check the spelling."); }
  }
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new UserError("That address isn't a public website.");
}

async function readCapped(res) {
  const reader = res.body?.getReader();
  if (!reader) return { text: "", bytes: 0, truncated: false };
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_BYTES) { try { await reader.cancel(); } catch {} break; }
    chunks.push(value);
  }
  return { text: Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8"), bytes: total, truncated: total > MAX_BYTES };
}

async function safeFetch(startUrl, { method = "GET", readBody = true } = {}) {
  let url = startUrl;
  const t0 = Date.now();
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublic(url);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res;
    try {
      res = await fetch(url, { method, redirect: "manual", signal: ctrl.signal, headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5" } });
    } catch (e) {
      clearTimeout(timer);
      throw new UserError(e.name === "AbortError" ? "The website took too long to respond (over 8 seconds)." : "We couldn't connect to that website.");
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      clearTimeout(timer);
      try { await res.body?.cancel(); } catch {}
      url = new URL(res.headers.get("location"), url);
      continue;
    }
    const firstByteMs = Date.now() - t0;
    let body = { text: "", bytes: 0, truncated: false };
    if (readBody) {
      const type = res.headers.get("content-type") || "";
      if (!/html|xml|text\/plain/i.test(type) && type) { clearTimeout(timer); try { await res.body?.cancel(); } catch {} throw new UserError("That address isn't a web page."); }
      try { body = await readCapped(res); } catch { clearTimeout(timer); throw new UserError("The website stopped responding while loading."); }
    } else { try { await res.body?.cancel(); } catch {} }
    clearTimeout(timer);
    return { res, finalUrl: url, firstByteMs, totalMs: Date.now() - t0, ...body };
  }
  throw new UserError("The website redirects too many times.");
}

const SERVICE_TERMS = [
  ["emergency", /emergenc|24\s*\/\s*7|24 hour|after[- ]hours/],
  ["fault finding", /fault[- ]?finding|faults?\b|trip(ping)?/],
  ["DB boards", /\bdb\b|distribution board|db board/],
  ["CoC", /\bcoc\b|certificate of compliance/],
  ["lighting", /lighting|lights?\b|downlights?/],
  ["installations", /install/],
  ["wiring / rewiring", /re-?wir|wiring/],
  ["maintenance", /maintenance/],
  ["solar / backup", /solar|inverter|backup power|load[- ]?shedding|generator/],
  ["geysers", /geyser/],
  ["plugs / sockets", /plug points?|sockets?|power points?/],
  ["commercial", /commercial|industrial|business(es)? /],
  ["residential", /residential|homes?\b|household/],
  ["repairs", /repair/],
  ["electric fencing / gates", /electric fenc|gate motor/],
];

const SA_PLACES = ["pretoria","tshwane","centurion","johannesburg","joburg","jhb","sandton","randburg","roodepoort","midrand","soweto","benoni","boksburg","germiston","kempton park","alberton","edenvale","krugersdorp","fourways","bryanston","cape town","bellville","durbanville","stellenbosch","somerset west","paarl","durban","umhlanga","pinetown","ballito","pietermaritzburg","port elizabeth","gqeberha","east london","bloemfontein","polokwane","mbombela","nelspruit","rustenburg","witbank","emalahleni","vereeniging","vanderbijlpark","george","kimberley","gauteng","western cape","kwazulu","kzn","limpopo","mpumalanga","north west","free state","eastern cape","northern cape","hatfield","menlyn","montana","brooklyn","garsfontein","faerie glen","moreleta","lynnwood","waterkloof"];

function decode(s) {
  return s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
}

export function analyzeHtml(html, { finalUrl, businessName = "", city = "" } = {}) {
  const lower = html.toLowerCase();
  const pick = (re) => { const m = html.match(re); return m ? decode(m[1].replace(/\s+/g, " ").trim()) : ""; };
  const title = pick(/<title[^>]*>([\s\S]*?)<\/title>/i).slice(0, 200);
  const metaDescription = pick(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i) || pick(/<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i);
  const viewportTag = (html.match(/<meta[^>]+name=["']viewport["'][^>]*>/i) || [""])[0].toLowerCase();
  const viewport = /width\s*=\s*device-width/.test(viewportTag);

  const anchors = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].map((m) => {
    const href = (m[1].match(/href\s*=\s*["']([^"']*)["']/i) || [, ""])[1].trim();
    const text = decode(m[2].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim().toLowerCase();
    return { href, hrefL: href.toLowerCase(), text };
  });
  const buttons = [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/gi)].map((m) => decode(m[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim().toLowerCase());
  const inputs = [...html.matchAll(/<input\b[^>]*type=["']?(submit|button)["']?[^>]*>/gi)].map((m) => ((m[0].match(/value=["']([^"']*)["']/i) || [, ""])[1]).toLowerCase());
  const ctaTexts = [...anchors.map((a) => a.text), ...buttons, ...inputs];

  const text = decode(
    html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<noscript[\s\S]*?<\/noscript>/gi, " ").replace(/<svg[\s\S]*?<\/svg>/gi, " ").replace(/<[^>]+>/g, " ")
  ).replace(/\s+/g, " ").trim();
  const textL = text.toLowerCase();

  const telLinks = anchors.filter((a) => a.hrefL.startsWith("tel:")).length;
  const phoneMatches = textL.match(/(\+27|\(?0)\s?\(?\d{2}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g) || [];
  const waLinks = anchors.filter((a) => /wa\.me\/|api\.whatsapp\.com|chat\.whatsapp\.com|whatsapp:\/\/|web\.whatsapp\.com/.test(a.hrefL)).length + (/(wa\.me\/|api\.whatsapp\.com\/send)/.test(lower) && !anchors.some((a) => /wa\.me|whatsapp\.com/.test(a.hrefL)) ? 1 : 0);
  const whatsappMention = /whatsapp/.test(textL);
  const mailto = anchors.some((a) => a.hrefL.startsWith("mailto:"));
  const contactLink = anchors.some((a) => /contact|get-in-touch|enquir|inquir/.test(a.hrefL) || /^(contact|contact us|get in touch|enquire|enquiry)/.test(a.text));
  const forms = (lower.match(/<form\b/g) || []).length;
  const quoteCta = ctaTexts.some((t) => /quote|estimate|pricing|book (a|an|now)|request/.test(t));
  const ctaCount = ctaTexts.filter((t) => /quote|estimate|call|whatsapp|contact|book|enquir|get in touch|request/.test(t)).length;
  const early = textL.slice(0, 1200);
  const earlyCta = /(call|whatsapp|quote|contact us|book|enquir)/.test(early);

  const servicesFound = SERVICE_TERMS.filter(([, re]) => re.test(textL)).map(([n]) => n);
  const electricWords = /electric/.test(textL);
  const titleL = title.toLowerCase();
  const titleHasService = /electric|electrician|plumb|repair|install|service/.test(titleL);

  const places = new Set(SA_PLACES.filter((p) => new RegExp("\\b" + p.replace(/ /g, "\\s+") + "\\b").test(textL)));
  const cityL = city.trim().toLowerCase();
  const cityFound = cityL.length > 2 ? textL.includes(cityL) : null;
  const titleHasPlace = SA_PLACES.some((p) => titleL.includes(p)) || (cityL.length > 2 && titleL.includes(cityL));
  const areaPhrase = /areas? (we )?(serve|cover|service)|service areas?|areas covered|we (serve|cover|work in)|serving (the )?/.test(textL);
  const ldjson = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join(" ");
  const localSchema = /localbusiness|electrician|homeandconstructionbusiness|"plumber"|professionalservice/i.test(ldjson);

  const reviews = /testimonial|what (our )?(clients|customers) say|google reviews?|customer reviews?|\breviews\b|★|5[- ]star|rated \d/.test(textL);
  const faq = /\bfaqs?\b|frequently asked/.test(textL);
  const social = [...new Set(anchors.map((a) => (a.hrefL.match(/(facebook|instagram|linkedin|tiktok|youtube|x)\.com/) || [])[1]).filter(Boolean))];
  const nameL = businessName.trim().toLowerCase();
  const nameFound = nameL.length > 2 ? textL.includes(nameL) || titleL.includes(nameL) : null;
  const imgs = (lower.match(/<img\b/g) || []).length;
  const imgsNoAlt = [...html.matchAll(/<img\b[^>]*>/gi)].filter((m) => !/\balt\s*=/.test(m[0])).length;
  const copyrightYear = (() => { const m = textL.match(/(©|copyright|\(c\))\s*(\d{4})(\s*[-–]\s*(\d{4}))?/); return m ? Number(m[4] || m[2]) : null; })();
  const fixedWidthHint = /<meta[^>]+viewport[^>]+width=\d{3,4}/i.test(html) || /<table[^>]+width=["']?\d{3,4}/i.test(html);
  const flash = /\.swf|<embed|<object/i.test(lower);

  let origin = "";
  try { origin = new URL(finalUrl).origin; } catch {}
  const internalLinks = [...new Set(anchors.map((a) => a.href).filter((h) => h && !h.startsWith("#") && !/^(tel|mailto|javascript|whatsapp):/i.test(h)).map((h) => { try { return new URL(h, finalUrl).href.split("#")[0]; } catch { return null; } }).filter((h) => h && h.startsWith(origin) && h !== finalUrl))];

  return {
    title, metaDescription: metaDescription.slice(0, 300), viewport, fixedWidthHint, flash,
    telLinks, phoneOnPage: phoneMatches.length > 0, waLinks, whatsappMention, mailto, contactLink, forms,
    quoteCta, ctaCount, earlyCta,
    servicesFound, electricWords, titleHasService, titleHasPlace,
    placesFound: [...places].slice(0, 12), cityFound, areaPhrase, localSchema,
    reviews, faq, social, nameFound, imgs, imgsNoAlt, copyrightYear,
    wordCount: text ? text.split(" ").length : 0,
    internalLinks: internalLinks.slice(0, 40),
  };
}

async function checkLinks(urls) {
  const sample = urls.slice(0, 6);
  const results = await Promise.all(sample.map(async (href) => {
    try {
      const r = await safeFetch(new URL(href), { method: "GET", readBody: false });
      return { href, ok: r.res.status < 400, status: r.res.status };
    } catch { return { href, ok: false, status: 0 }; }
  }));
  return { checked: results.length, broken: results.filter((r) => !r.ok).map((r) => ({ href: r.href, status: r.status })) };
}

const json = (status, data) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff" } });

export default async (req, context) => {
  if (req.method !== "POST") return json(405, { error: "Use POST." });
  const ip = context?.ip || req.headers.get("x-nf-client-connection-ip") || "unknown";
  if (rateLimited(ip)) return json(429, { error: "Too many audits from this connection. Please wait a few minutes." });
  let body;
  try { body = await req.json(); } catch { return json(400, { error: "Invalid request." }); }
  const businessName = String(body.businessName || "").slice(0, 120);
  const city = String(body.city || "").slice(0, 80);
  try {
    const u = normaliseUrl(body.url);
    const r = await safeFetch(u);
    if (r.res.status >= 400) return json(200, { ok: false, reachable: true, status: r.res.status, error: `The website returned an error (HTTP ${r.res.status}).` });
    const signals = analyzeHtml(r.text, { finalUrl: r.finalUrl.href, businessName, city });
    const links = await checkLinks(signals.internalLinks);
    delete signals.internalLinks;
    return json(200, {
      ok: true, requestedUrl: u.href, finalUrl: r.finalUrl.href, https: r.finalUrl.protocol === "https:",
      status: r.res.status, responseMs: r.totalMs, htmlBytes: r.bytes, truncated: r.truncated,
      links, signals, scannedAt: new Date().toISOString(),
    });
  } catch (e) {
    if (e instanceof UserError) return json(200, { ok: false, reachable: false, error: e.message });
    console.error("scan error", e);
    return json(200, { ok: false, reachable: false, error: "Something went wrong while checking that website." });
  }
};

export const config = { path: "/api/scan" };
