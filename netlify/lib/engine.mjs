// Local Lead Machine — prospect engine (runs on Netlify, no phone or personal account needed).
// Each run: (1) if nothing is waiting, search Google Maps for one trade+area, keep good businesses
// with weak online presence; (2) audit a few waiting websites; (3) add them to the daily queue
// with a personalised first message built ONLY from verified facts (Google data + audit results).
// Sending stays one-to-one and manual from the business WhatsApp (WhatsApp rules + POPIA).
import scoring from "../../site/assets/scoring.js";

export const TRADES = ["electrician", "plumber"];
export const AREAS = [
  "Centurion", "Pretoria East", "Moreleta Park", "Faerie Glen", "Midrand", "Montana Pretoria", "Pretoria North",
  "Lynnwood Pretoria", "Garsfontein", "Sandton", "Fourways", "Randburg", "Roodepoort", "Kempton Park",
  "Boksburg", "Benoni", "Germiston", "Alberton", "Krugersdorp", "Edenvale", "Bryanston", "Silverton Pretoria",
];
export const LIMITS = { searchesPerDay: 8, queuePerDay: 25, scansPerRun: 3, minRating: 4.0, minReviews: 10, maxScore: 70 };

const FIELD_MASK = [
  "places.id", "places.displayName", "places.formattedAddress", "places.rating", "places.userRatingCount",
  "places.websiteUri", "places.nationalPhoneNumber", "places.internationalPhoneNumber", "places.googleMapsUri", "places.businessStatus",
].join(",");

export function today(now = new Date()) {
  return new Date(now.getTime() + 2 * 3600e3).toISOString().slice(0, 10); // SAST date
}

export function queryAt(i) {
  const t = TRADES[i % TRADES.length];
  const a = AREAS[Math.floor(i / TRADES.length) % AREAS.length];
  return { trade: t, area: a, text: `${t} in ${a}, South Africa` };
}

export async function searchPlaces(text, key, fetchImpl = fetch) {
  const r = await fetchImpl("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "content-type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELD_MASK },
    body: JSON.stringify({ textQuery: text, regionCode: "ZA", languageCode: "en", pageSize: 20 }),
  });
  if (!r.ok) throw new Error("Places API HTTP " + r.status + " " + (await r.text()).slice(0, 200));
  return (await r.json()).places || [];
}

// SA mobile numbers (WhatsApp-able) start 06/07/08 → 27 6x/7x/8x
export function waNumber(intl, national) {
  let d = String(intl || "").replace(/\D/g, "");
  if (!d && national) { d = String(national).replace(/\D/g, ""); if (d.startsWith("0")) d = "27" + d.slice(1); }
  return /^27[678]\d{8}$/.test(d) ? d : "";
}

export function qualifies(p) {
  if (p.businessStatus && p.businessStatus !== "OPERATIONAL") return false;
  if (!(p.rating >= LIMITS.minRating) || !(p.userRatingCount >= LIMITS.minReviews)) return false;
  if (!p.internationalPhoneNumber && !p.nationalPhoneNumber) return false;
  return true;
}

const PHRASE = {
  w_live: "you don't seem to have a website", wa: "there's no WhatsApp button on your website",
  c_tel: "your phone number isn't tappable on a phone", c_phone: "I couldn't find your phone number on your website",
  w_viewport: "your website doesn't fit properly on a phone screen", cta_quote: "there's no easy way to ask for a quote on your website",
  s_list: "your website doesn't clearly list your services", l_place: "your website doesn't say which areas you cover",
  w_https: "your website shows as 'Not secure' in some browsers", w_speed: "your website is slow to open on mobile data",
};

export function buildProspect(place, q, scan, siteUrl) {
  const name = String(place.displayName?.text || "").slice(0, 80);
  const website = place.websiteUri || "";
  const res = scoring.score({ scan: website ? scan : null, noWebsite: !website, city: q.area.replace(/ Pretoria$/, "") });
  const issues = [];
  if (!website) issues.push(PHRASE.w_live);
  else if (scan && scan.ok === false && scan.reachable !== undefined) issues.push("your website didn't load when I tried to open it");
  else res.leaking.forEach((c) => { if (c.status === "fail" && PHRASE[c.id] && !issues.includes(PHRASE[c.id])) issues.push(PHRASE[c.id]); });
  const rating = place.rating, reviews = place.userRatingCount;
  const msg = `Hi, is this ${name}? I came across you on Google while looking at ${q.trade}s in ${q.area.replace(/ Pretoria$/, "")}. ` +
    `You've got a strong ${rating}★ from ${reviews} reviews` +
    (issues.length ? `, but I noticed ${issues.slice(0, 2).join(" and ")}. That can make it harder for people to contact you from their phones. ` : `. `) +
    `I help local trades turn Google searches into calls and WhatsApps, and I'm offering a free 5-minute check of your online presence — no obligation. Can I send you yours?`;
  const audit = new URL((siteUrl || "https://local-lead-machine.netlify.app") + "/audit/");
  if (website) audit.searchParams.set("site", website);
  audit.searchParams.set("name", name);
  audit.searchParams.set("city", q.area.replace(/ Pretoria$/, ""));
  audit.searchParams.set("ref", "engine");
  return {
    id: place.id, name, trade: q.trade, area: q.area, address: String(place.formattedAddress || "").slice(0, 160),
    phone: place.nationalPhoneNumber || place.internationalPhoneNumber || "", wa: waNumber(place.internationalPhoneNumber, place.nationalPhoneNumber),
    website, mapsUrl: place.googleMapsUri || "", rating, reviews,
    score: website && scan && scan.ok ? res.total : website ? null : 0,
    issues: issues.slice(0, 4), message: msg, auditLink: audit.href,
  };
}

// One engine step. store = { get(key) -> json|null, set(key, json) }
export async function runStep({ key, store, scan, fetchImpl = fetch, now = new Date(), siteUrl = "" }) {
  const day = today(now);
  const log = [];
  const state = (await store.get("state")) || { cursor: 0 };
  const daily = (await store.get("daily/" + day)) || { searches: 0, queued: 0 };
  const seen = (await store.get("seen")) || {};
  let pending = (await store.get("pending")) || [];

  if (!pending.length && daily.searches < LIMITS.searchesPerDay && daily.queued < LIMITS.queuePerDay) {
    const q = queryAt(state.cursor);
    state.cursor++;
    daily.searches++;
    const places = await searchPlaces(q.text, key, fetchImpl);
    let kept = 0;
    for (const p of places) {
      if (!p.id || seen[p.id]) continue;
      seen[p.id] = day;
      if (!qualifies(p)) continue;
      pending.push({ place: p, q });
      kept++;
    }
    log.push(`searched "${q.text}": ${places.length} found, ${kept} new & qualified`);
  }

  const batch = pending.splice(0, LIMITS.scansPerRun);
  const queue = (await store.get("queue/" + day)) || [];
  await Promise.all(batch.map(async ({ place, q }) => {
    const result = place.websiteUri ? await scan(place.websiteUri, { businessName: place.displayName?.text, city: q.area }) : null;
    const pr = buildProspect(place, q, result, siteUrl);
    if (pr.website && pr.score !== null && pr.score > LIMITS.maxScore) { log.push(`skip ${pr.name} (score ${pr.score})`); return; }
    if (daily.queued >= LIMITS.queuePerDay) return;
    queue.push({ ...pr, status: "new", found: day });
    daily.queued++;
    log.push(`queued ${pr.name} (${pr.website ? "score " + pr.score : "no website"})`);
  }));

  await store.set("pending", pending);
  await store.set("queue/" + day, queue);
  await store.set("daily/" + day, daily);
  await store.set("seen", seen);
  await store.set("state", state);
  return { day, log, queued: daily.queued, pending: pending.length, searches: daily.searches };
}
