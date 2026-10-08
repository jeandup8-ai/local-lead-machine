// node --test tests/
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import scan, { analyzeHtml, isPrivateIp, normaliseUrl, assertPublic } from "../netlify/functions/scan.mjs";
const require = createRequire(import.meta.url);
const { score } = require("../site/assets/scoring.js");

const GOOD = `<!doctype html><html><head><title>Ndlovu Electrical | Electrician in Pretoria</title>
<meta name="description" content="Pretoria electrician for emergency call-outs, fault finding, DB boards and CoC certificates. Call or WhatsApp.">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script type="application/ld+json">{"@type":"Electrician","name":"Ndlovu Electrical"}</script></head>
<body><header><a href="tel:+27821234567">Call 082 123 4567</a> <a href="https://wa.me/27821234567">WhatsApp us</a></header>
<h1>Ndlovu Electrical</h1><p>Emergency call-outs 24/7, fault finding, DB board upgrades, lighting, installations, maintenance.</p>
<h2>Areas we serve</h2><p>Pretoria, Centurion, Hatfield</p><h2>Customer reviews</h2><h2>FAQ</h2>
<a href="/contact">Contact</a><button>Get a quote</button><form></form><a href="https://facebook.com/x">FB</a><footer>© 2026</footer></body></html>`;
const BAD = `<html><head><title>Home</title></head><body><table width="980"><tr><td>Welcome to our website. Call 012 345 6789. Find us on WhatsApp. © 2016</td></tr></table></body></html>`;

test("strong site scores high, every point explained", () => {
  const s = analyzeHtml(GOOD, { finalUrl: "https://ndlovu.co.za/", businessName: "Ndlovu Electrical", city: "Pretoria" });
  const r = score({ scan: { ok: true, signals: s, https: true, responseMs: 900, htmlBytes: 9000, finalUrl: "https://ndlovu.co.za/", requestedUrl: "https://ndlovu.co.za/", links: { checked: 0, broken: [] } }, city: "Pretoria" });
  assert.equal(r.total, 100, JSON.stringify(r.leaking.map(c => c.id)));
  assert.ok(r.checks.every(c => c.reason.length > 10));
});

test("weak site gets specific fails", () => {
  const s = analyzeHtml(BAD, { finalUrl: "http://old.co.za/", businessName: "Old Electric", city: "Pretoria" });
  const r = score({ scan: { ok: true, signals: s, https: false, responseMs: 3000, htmlBytes: 2000, finalUrl: "http://old.co.za/", requestedUrl: "http://old.co.za/", links: { checked: 0, broken: [] } }, city: "Pretoria" });
  const byId = Object.fromEntries(r.checks.map(c => [c.id, c]));
  assert.equal(byId.c_phone.status, "pass");
  assert.equal(byId.c_tel.status, "fail");
  assert.equal(byId.wa.status, "warn");
  assert.equal(byId.w_viewport.status, "fail");
  assert.equal(byId.cta_quote.status, "fail");
  assert.ok(r.total < 40, "total " + r.total);
  assert.ok(r.info.some(i => /2016/.test(i.text)));
});

test("no scan = not verified, scores 0 points without inventing anything", () => {
  const r = score({ scan: { ok: false, error: "the checker couldn't be reached." } });
  assert.equal(r.total, 0);
  assert.equal(r.nvPoints, 100);
  assert.ok(r.checks.every(c => c.status === "nv"));
  assert.equal(r.grade, "incomplete");
});

test("no website = fails, not 'not verified'", () => {
  const r = score({ noWebsite: true });
  assert.equal(r.total, 0); assert.equal(r.nvPoints, 0);
});

test("private / internal addresses are blocked", async () => {
  for (const ip of ["127.0.0.1", "10.0.0.5", "172.16.3.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "::ffff:127.0.0.1", "0.0.0.0"]) assert.ok(isPrivateIp(ip), ip);
  for (const ip of ["8.8.8.8", "41.185.8.1", "2001:4860:4860::8888"]) assert.ok(!isPrivateIp(ip), ip);
  for (const u of ["http://localhost/", "http://127.0.0.1/", "http://169.254.169.254/latest/meta-data", "http://[::1]/", "http://example.com:8080/", "http://user:pw@example.com/", "ftp://example.com/", "http://intranet/", "http://2130706433/"]) {
    await assert.rejects(assertPublic(normaliseUrl(u)), u);
  }
});

test("handler validates input and method", async () => {
  let r = await scan(new Request("http://x/api/scan", { method: "GET" }), {});
  assert.equal(r.status, 405);
  r = await scan(new Request("http://x/api/scan", { method: "POST", body: JSON.stringify({ url: "http://127.0.0.1:22" }) }), { ip: "t1" });
  const j = await r.json(); assert.equal(j.ok, false); assert.match(j.error, /public|ports/);
  r = await scan(new Request("http://x/api/scan", { method: "POST", body: "not json" }), { ip: "t1" });
  assert.equal(r.status, 400);
});

test("rate limit kicks in", async () => {
  let last;
  for (let i = 0; i < 22; i++) last = await scan(new Request("http://x/api/scan", { method: "POST", body: JSON.stringify({ url: "" }) }), { ip: "rl" });
  assert.equal(last.status, 429);
});
