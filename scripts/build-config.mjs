// Build step (runs on Netlify, or locally with `node scripts/build-config.mjs`).
// 1. Merges environment variables into site/config.js
// 2. Writes config values into the static HTML (prices, brand) so they're correct without JavaScript
// 3. Sets absolute canonical / Open Graph URLs + sitemap from SITE_URL (or Netlify's URL)
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "site");
const cfgPath = path.join(root, "config.js");
const src = fs.readFileSync(cfgPath, "utf8");
const sandbox = { window: {} };
vm.runInNewContext(src, sandbox);
const cfg = sandbox.window.LLM_CONFIG;

const env = process.env;
const digits = (s) => String(s).replace(/\D/g, "");
let changed = false;
const set = (obj, key, val) => { if (val !== undefined && val !== "" && obj[key] !== val) { obj[key] = val; changed = true; } };
if (env.WHATSAPP_NUMBER) set(cfg, "whatsappNumber", digits(env.WHATSAPP_NUMBER).replace(/^0/, "27"));
set(cfg, "phoneNumber", env.CONTACT_PHONE);
set(cfg, "email", env.CONTACT_EMAIL);
set(cfg, "payfastLink", env.PAYFAST_LINK);
set(cfg, "legalName", env.LEGAL_NAME);
set(cfg.pricing, "founding", env.PRICE_FOUNDING);
set(cfg.pricing, "standard", env.PRICE_STANDARD);
set(cfg.pricing, "care", env.PRICE_CARE);

if (changed) {
  const header = src.slice(0, src.indexOf("window.LLM_CONFIG"));
  fs.writeFileSync(cfgPath, header + "window.LLM_CONFIG = " + JSON.stringify(cfg, null, 2) + ";\n");
  console.log("config.js updated from environment variables");
}

const siteUrl = (env.SITE_URL || env.URL || "").replace(/\/+$/, "");
const get = (p) => p.split(".").reduce((o, k) => (o == null ? o : o[k]), cfg);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p) : [p];
  });
}

for (const file of walk(root)) {
  if (!/\.(html|xml|txt)$/.test(file)) continue;
  let s = fs.readFileSync(file, "utf8");
  const before = s;
  s = s.replace(/(<(\w+)[^>]*\bdata-cfg="([\w.]+)"[^>]*>)([^<]*)(<\/\2>)/g, (m, open, tag, key, inner, close) => {
    const v = get(key);
    return v ? open + esc(v) + close : m;
  });
  if (siteUrl) s = s.replace(/__SITE_URL__/g, siteUrl);
  else {
    s = s.replace(/^.*__SITE_URL__.*\n?/gm, (line) => (/(canonical|og:url|og:image|twitter:image)/.test(line) ? "" : line));
    s = s.replace(/^Sitemap: __SITE_URL__.*\n?/gm, "");
  }
  if (s !== before) fs.writeFileSync(file, s);
}
if (!siteUrl) {
  const sm = path.join(root, "sitemap.xml");
  if (fs.existsSync(sm)) fs.rmSync(sm);
  // JSON-LD url fields are dropped too
  for (const file of walk(root).filter((f) => f.endsWith(".html"))) {
    const s = fs.readFileSync(file, "utf8");
    const t = s.replace(/,?\s*"url":\s*"__SITE_URL__[^"]*"/g, "");
    if (t !== s) fs.writeFileSync(file, t);
  }
  console.log("No SITE_URL/URL set: canonical tags and sitemap omitted");
} else console.log("Absolute URLs set to " + siteUrl);
