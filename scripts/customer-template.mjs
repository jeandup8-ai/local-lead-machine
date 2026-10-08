// Renders one customer's conversion page from their intake answers.
// Everything the customer typed is HTML-escaped; only validated links are used.

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clean = (s, max = 300) => String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, max);

export function slugify(s) {
  return String(s || "business").toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 50) || "business";
}

function saNumber(raw) {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.startsWith("0")) d = "27" + d.slice(1);
  return /^\d{10,13}$/.test(d) ? d : "";
}
function prettyNumber(intl) {
  if (!intl.startsWith("27") || intl.length !== 11) return "+" + intl;
  const n = "0" + intl.slice(2);
  return n.slice(0, 3) + " " + n.slice(3, 6) + " " + n.slice(6);
}
function safeGoogle(u) {
  try {
    const x = new URL(String(u || "").trim());
    if (x.protocol !== "https:") return "";
    return /(^|\.)(google\.[a-z.]+|goo\.gl|g\.page|g\.co)$/i.test(x.hostname) ? x.href : "";
  } catch { return ""; }
}

const ACCENTS = {
  Electrician: ["#FFC21A", "#1f1600"], Plumber: ["#38BDF8", "#04202e"], Painter: ["#F472B6", "#2a0718"],
  Landscaper: ["#4ADE80", "#062a12"], Builder: ["#FB923C", "#2b1100"], default: ["#2BD9F4", "#04121a"],
};

const ICON = {
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  wa: '<path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.5A8.4 8.4 0 1 1 21 11.5z"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  check: '<path d="M20 6 9 17l-5-5"/>', pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>', star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.8 1.2 6.9-6.2-3.2L5.8 21 7 14.1 2 9.3l6.9-1z"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>', alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
};
const svg = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;

export function renderCustomerPage(d, { slug, draft, logo, photos = [], siteUrl = "" }) {
  const business = clean(d.business, 80);
  const trade = clean(d.trade, 40) || "Local service";
  const tradeWord = trade === "Other" ? "" : trade.toLowerCase();
  const city = clean(d.city, 60);
  const hours = clean(d.hours, 100);
  const about = clean(d.about, 700);
  const creds = clean(d.credentials, 200);
  const emergency = d.emergency === "yes";
  const email = d.show_email === "yes" && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(d.email || "").trim()) ? String(d.email).trim() : "";
  const callNum = saNumber(d.phone);
  const waNum = saNumber(d.whatsapp) || callNum;
  const google = safeGoogle(d.google_profile);
  const services = String(d.services || "").split(/\r?\n/).map((l) => clean(l, 120)).filter(Boolean).slice(0, 12).map((l) => {
    const [t, ...rest] = l.split(/\s+[—–-]\s+/);
    return { t: clean(t, 60), d: clean(rest.join(" — "), 100) };
  });
  const areas = String(d.areas || "").split(/[,\n;]/).map((a) => clean(a, 40)).filter(Boolean).slice(0, 30);
  const [accent, accentInk] = ACCENTS[trade] || ACCENTS.default;
  const title = `${business}${tradeWord ? " — " + trade : ""}${city ? " in " + city : ""}`;
  const desc = `${business}: ${services.slice(0, 4).map((s) => s.t).join(", ")}${areas.length ? ". Serving " + areas.slice(0, 4).join(", ") : ""}. Call or WhatsApp${emergency ? " — emergency call-outs available" : ""}.`.slice(0, 300);
  const waMsg = `Hi ${business}, I found you online and I need help${tradeWord ? " from " + (/^[aeiou]/.test(tradeWord) ? "an " : "a ") + tradeWord : ""}.`;
  const waHref = waNum ? `https://wa.me/${waNum}?text=${encodeURIComponent(waMsg)}` : "";
  const telHref = callNum ? `tel:+${callNum}` : "";
  const url = siteUrl ? `${siteUrl}/c/${slug}/` : "";

  const schema = {
    "@context": "https://schema.org", "@type": "LocalBusiness", name: business,
    ...(callNum ? { telephone: "+" + callNum } : {}), ...(url ? { url } : {}),
    ...(areas.length ? { areaServed: areas.map((a) => ({ "@type": "Place", name: a })) } : {}),
    ...(logo && url ? { logo: url + logo } : {}), ...(google ? { sameAs: [google] } : {}),
    ...(services.length ? { makesOffer: services.map((s) => ({ "@type": "Offer", itemOffered: { "@type": "Service", name: s.t } })) } : {}),
  };

  const btnCall = telHref ? `<a class="btn" style="background:var(--a);color:var(--ai)" href="${telHref}">${svg("phone")}Call now</a>` : "";
  const btnWa = waHref ? `<a class="btn btn-wa" href="${esc(waHref)}" target="_blank" rel="noopener">${svg("wa")}WhatsApp us</a>` : "";
  const logoHtml = logo ? `<img src="${esc(logo)}" alt="${esc(business)} logo" width="36" height="36" style="width:36px;height:36px;object-fit:contain;border-radius:8px;background:#fff">` : `<span style="width:36px;height:36px;border-radius:9px;background:var(--a);color:var(--ai);display:grid;place-items:center;font-weight:800">${esc(business.charAt(0))}</span>`;

  return `<!doctype html>
<html lang="en-ZA"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="${draft ? "noindex,nofollow" : "index,follow"}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:type" content="website">
${url && !draft ? `<link rel="canonical" href="${esc(url)}"><meta property="og:url" content="${esc(url)}">` : ""}
${photos[0] && url ? `<meta property="og:image" content="${esc(url + photos[0])}">` : ""}
<meta name="theme-color" content="#111827">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;700;800&display=swap">
<link rel="stylesheet" href="/assets/styles.css">
<style>:root{--a:${accent};--ai:${accentInk}}.cp-hero{background:#111827;color:#fff;padding:40px 0 46px}.cp-hero p{color:#C9D1E0;font-size:1.1rem;max-width:620px}.chip{display:inline-block;padding:9px 14px;border-radius:999px;background:#fff;border:1px solid var(--line);font-weight:700;margin:0 6px 8px 0}.gal{display:grid;grid-template-columns:1fr 1fr;gap:10px}.gal img{width:100%;height:auto;aspect-ratio:4/3;object-fit:cover;border-radius:12px}@media(max-width:639px){.svc-grid{grid-template-columns:1fr 1fr}.svc-grid .card{padding:14px}.svc-grid h3{font-size:1rem}}@media(min-width:900px){.gal{grid-template-columns:repeat(4,1fr)}}.svc .ic{width:38px;height:38px;border-radius:10px;background:color-mix(in srgb,var(--a) 22%,#fff);color:#1a1a1a;display:grid;place-items:center;margin-bottom:10px}.svc .ic svg{width:20px;height:20px}</style>
<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, "\\u003c")}</script>
</head><body>
${draft ? `<div class="demo-banner" role="note">PREVIEW — not published yet. Reply to Local Lead Machine on WhatsApp with any changes, or “approved”.</div>` : ""}
<header style="background:#fff;border-bottom:1px solid var(--line)"><div class="wrap" style="display:flex;justify-content:space-between;align-items:center;height:64px;gap:10px">
  <span style="display:flex;align-items:center;gap:10px;font-weight:800;font-size:1.05rem;min-width:0">${logoHtml}<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(business)}</span></span>
  ${telHref ? `<a class="btn btn-sm btn-dark" href="${telHref}">${svg("phone")}Call</a>` : ""}
</div></header>
<main id="main">
<section class="cp-hero"><div class="wrap">
  ${emergency ? `<span class="pill" style="background:rgba(255,255,255,.08)"><span class="dot" style="background:#3DDC84;box-shadow:0 0 0 4px rgba(61,220,132,.2)"></span>Emergency call-outs available</span>` : ""}
  <h1 style="font-size:clamp(2rem,7vw,3.3rem)">${esc(tradeWord ? (city ? `${trade} in ${city}` : trade) : business)}${services.length ? ` — ${esc(services.slice(0, 2).map((s) => s.t).join(" & "))}` : ""}.</h1>
  <p>${esc(business)}${areas.length ? ` serves ${esc(areas.slice(0, 4).join(", "))}${areas.length > 4 ? " and surrounds" : ""}` : ""}. Tap to call or WhatsApp — we'll tell you if we can help.</p>
  <div class="btn-row" style="margin-top:20px">${btnCall}${btnWa}<a class="btn btn-ghost" href="#quote">${svg("file")}Get a quote</a></div>
  <div class="hero-note" style="margin-top:18px">${hours ? `<span>${svg("clock")}${esc(hours)}</span>` : ""}${city ? `<span>${svg("pin")}${esc(city)}</span>` : ""}${creds ? `<span>${svg("shield")}${esc(creds)}</span>` : ""}</div>
</div></section>
${services.length ? `<section class="section" style="padding:48px 0"><div class="wrap"><h2>What we can help with</h2><div class="grid grid-3 svc-grid" style="margin-top:18px">${services.map((s) => `<div class="card svc"><div class="ic">${svg("check")}</div><h3>${esc(s.t)}</h3>${s.d ? `<p>${esc(s.d)}</p>` : ""}</div>`).join("")}</div></div></section>` : ""}
${areas.length ? `<section class="section section-white" style="padding:48px 0"><div class="wrap"><h2>Areas we cover</h2><p class="lead" style="margin-bottom:16px">Not sure if we cover you? WhatsApp us and ask.</p>${areas.map((a) => `<span class="chip">${esc(a)}</span>`).join("")}</div></section>` : ""}
${photos.length ? `<section class="section" style="padding:48px 0"><div class="wrap"><h2>Recent work</h2><div class="gal" style="margin-top:16px">${photos.map((p, i) => `<img src="${esc(p)}" alt="Work by ${esc(business)} (${i + 1})" loading="lazy" width="700" height="525">`).join("")}</div></div></section>` : ""}
${about || creds || google ? `<section class="section section-white" style="padding:48px 0"><div class="wrap split" style="align-items:start"><div><h2>About ${esc(business)}</h2>${about ? `<p class="lead">${esc(about)}</p>` : ""}${creds ? `<p><b>${svg("shield").replace("<svg", '<svg style="width:18px;height:18px;display:inline;vertical-align:-3px;margin-right:6px"')}${esc(creds)}</b></p>` : ""}</div>${google ? `<div class="card"><div style="color:#E8A317;font-size:1.2rem">★★★★★</div><h3 style="margin-top:6px">Read our reviews on Google</h3><p style="margin-bottom:14px">See what real customers say about us.</p><a class="btn btn-dark btn-block" href="${esc(google)}" target="_blank" rel="noopener">${svg("star")}Open our Google reviews</a></div>` : ""}</div></section>` : ""}
<section class="section" id="quote" style="padding:48px 0"><div class="wrap split" style="align-items:start">
  <div><h2>Get a quote</h2><p class="lead">Tell us what you need and where you are. It opens WhatsApp with your message ready — just tap send. Photos of the problem help.</p></div>
  <form class="panel form" id="cq" novalidate>
    <div class="field"><label for="cq-n">Your name</label><input id="cq-n" maxlength="60" autocomplete="name"></div>
    <div class="field"><label for="cq-s">Suburb</label><input id="cq-s" maxlength="60"></div>
    <div class="field"><label for="cq-p">What do you need?</label><textarea id="cq-p" maxlength="600"></textarea></div>
    <button class="btn btn-block" style="background:var(--a);color:var(--ai)" type="submit">${svg("wa")}Send quote request on WhatsApp</button>
  </form>
</div></section>
<section class="section" style="background:#111827;color:#fff;padding:48px 0;text-align:center"><div class="wrap">
  <h2 style="color:#fff">Need ${tradeWord ? (/^[aeiou]/.test(tradeWord) ? "an " : "a ") + esc(tradeWord) : "help"}${city ? " in " + esc(city) : ""}?</h2>
  <div class="btn-row" style="justify-content:center;margin-top:16px">${btnCall}${btnWa}</div>
  ${email ? `<p style="margin-top:14px"><a href="mailto:${esc(email)}" style="color:#C9D1E0">${esc(email)}</a></p>` : ""}
</div></section>
</main>
<footer class="site-footer" style="padding:24px 0"><div class="wrap" style="display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between"><span>© <span data-y></span> ${esc(business)}</span><a href="/?ref=c-${esc(slug)}">Page by Local Lead Machine</a></div></footer>
<div class="mbar">${telHref ? `<a class="btn" style="background:var(--a);color:var(--ai)" href="${telHref}">${svg("phone")}Call</a>` : ""}${waHref ? `<a class="btn btn-wa" href="${esc(waHref)}" target="_blank" rel="noopener">${svg("wa")}WhatsApp</a>` : ""}</div>
<script>
(function(){document.querySelectorAll("[data-y]").forEach(function(e){e.textContent=new Date().getFullYear()});
var f=document.getElementById("cq");f.addEventListener("submit",function(e){e.preventDefault();
var n=document.getElementById("cq-n").value.trim(),s=document.getElementById("cq-s").value.trim(),p=document.getElementById("cq-p").value.trim();
var t="Hi "+${JSON.stringify(business).replace(/</g, "\\u003c")}+", I'd like a quote."+(n?"\\nName: "+n:"")+(s?"\\nSuburb: "+s:"")+(p?"\\nWhat I need: "+p:"");
${waNum ? `location.href="https://wa.me/${waNum}?text="+encodeURIComponent(t);` : `alert("Please call us to request a quote.");`}});})();
</script>
</body></html>
`;
}
