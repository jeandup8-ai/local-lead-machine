// Builds customer pages from "intake" form submissions (runs on every Netlify deploy).
//
//   Draft preview (unguessable, never indexed):  /c/draft-<submissionId>/
//   Approved, public page:                         /c/<slug>/   (listed in customers/approved.json)
//
// Needs env NETLIFY_API_TOKEN (personal access token) — Netlify provides SITE_ID automatically.
// Local test: CUSTOMERS_FIXTURE=tests/fixtures/intake.json node scripts/build-customers.mjs
import fs from "node:fs";
import path from "node:path";
import { renderCustomerPage, slugify } from "./customer-template.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUT = path.join(ROOT, "site", "c");
const approvedPath = process.env.CUSTOMERS_APPROVED ? path.resolve(ROOT, process.env.CUSTOMERS_APPROVED) : path.join(ROOT, "customers", "approved.json");
const approved = fs.existsSync(approvedPath) ? JSON.parse(fs.readFileSync(approvedPath, "utf8")) : {};
const siteUrl = (process.env.SITE_URL || process.env.URL || "").replace(/\/+$/, "");
const token = process.env.NETLIFY_API_TOKEN;
const siteId = process.env.SITE_ID;
const API = "https://api.netlify.com/api/v1";

async function api(p) {
  const r = await fetch(API + p, { headers: { authorization: "Bearer " + token } });
  if (!r.ok) throw new Error(p + " → HTTP " + r.status);
  return r.json();
}

async function loadSubmissions() {
  if (process.env.CUSTOMERS_FIXTURE) return JSON.parse(fs.readFileSync(path.resolve(ROOT, process.env.CUSTOMERS_FIXTURE), "utf8"));
  if (!token || !siteId) { console.log("[customers] NETLIFY_API_TOKEN not set — skipping customer pages"); return []; }
  const forms = await api(`/sites/${siteId}/forms`);
  const intake = forms.find((f) => f.name === "intake");
  if (!intake) { console.log("[customers] no intake form yet"); return []; }
  const subs = [];
  for (let page = 1; page <= 5; page++) {
    const batch = await api(`/forms/${intake.id}/submissions?per_page=100&page=${page}`);
    subs.push(...batch);
    if (batch.length < 100) break;
  }
  return subs;
}

async function saveImage(file, dest) {
  // Netlify file fields look like { url, filename, type, size } (or just a url string)
  const url = typeof file === "string" ? file : file && file.url;
  if (!url || !/^https:\/\//.test(url)) return null;
  if (url.startsWith("fixture:")) return null;
  try {
    const r = await fetch(url);
    const type = r.headers.get("content-type") || "";
    if (!r.ok || !/^image\/(jpeg|png|webp)/.test(type)) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 4_000_000) return null;
    const ext = type.includes("png") ? ".png" : type.includes("webp") ? ".webp" : ".jpg";
    fs.writeFileSync(dest + ext, buf);
    return path.basename(dest + ext);
  } catch { return null; }
}

function copyFixtureImage(file, dest) {
  const p = typeof file === "string" && file.startsWith("fixture:") ? path.resolve(ROOT, file.slice(8)) : null;
  if (!p || !fs.existsSync(p)) return null;
  fs.copyFileSync(p, dest + path.extname(p));
  return path.basename(dest + path.extname(p));
}

const subs = await loadSubmissions();
fs.rmSync(OUT, { recursive: true, force: true });
const built = [];
const usedSlugs = new Set();
for (const sub of subs) {
  const d = sub.data || sub;
  const id = String(sub.id || "").replace(/[^a-z0-9]/gi, "");
  if (!id || !d.business || d.consent !== "yes") continue;
  const appr = approved[id];
  let slug = appr ? slugify(appr.slug || d.business) : "draft-" + id;
  if (usedSlugs.has(slug)) slug += "-" + id.slice(-4);
  usedSlugs.add(slug);
  const dir = path.join(OUT, slug);
  fs.mkdirSync(dir, { recursive: true });
  const get = (f, name) => (process.env.CUSTOMERS_FIXTURE ? copyFixtureImage(f, path.join(dir, name)) : saveImage(f, path.join(dir, name)));
  const logo = d.logo ? await get(d.logo, "logo") : null;
  const photos = [];
  for (const k of ["photo1", "photo2", "photo3", "photo4"]) if (d[k]) { const f = await get(d[k], k); if (f) photos.push(f); }
  const html = renderCustomerPage(d, { slug, draft: !appr, logo, photos, siteUrl, submittedAt: sub.created_at });
  fs.writeFileSync(path.join(dir, "index.html"), html);
  built.push({ id, slug, business: d.business, draft: !appr });
}

// Add approved pages to the sitemap
const sm = path.join(ROOT, "site", "sitemap.xml");
if (siteUrl && fs.existsSync(sm)) {
  const live = built.filter((b) => !b.draft).map((b) => `  <url><loc>${siteUrl}/c/${b.slug}/</loc><priority>0.5</priority></url>\n`).join("");
  if (live) fs.writeFileSync(sm, fs.readFileSync(sm, "utf8").replace("</urlset>", live + "</urlset>"));
}
console.log(`[customers] built ${built.length} page(s): ` + built.map((b) => `/c/${b.slug}/${b.draft ? " (draft)" : ""}`).join(", "));
