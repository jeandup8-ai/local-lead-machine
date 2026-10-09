import test from "node:test";
import assert from "node:assert/strict";
import { runStep, waNumber, qualifies, queryAt, LIMITS } from "../netlify/lib/engine.mjs";

const mem = () => { const m = new Map(); return { get: async (k) => (m.has(k) ? JSON.parse(m.get(k)) : null), set: async (k, v) => m.set(k, JSON.stringify(v)), m }; };
const place = (id, o = {}) => ({ id, displayName: { text: "Biz " + id }, rating: 4.6, userRatingCount: 30, businessStatus: "OPERATIONAL",
  internationalPhoneNumber: "+27 82 123 4567", nationalPhoneNumber: "082 123 4567", googleMapsUri: "https://maps.google.com/?cid=" + id, ...o });

test("wa numbers: mobiles only", () => {
  assert.equal(waNumber("+27 82 123 4567"), "27821234567");
  assert.equal(waNumber("", "071 234 5678"), "27712345678");
  assert.equal(waNumber("+27 12 345 6789"), "");
});

test("qualify filters weak / closed / no-phone businesses", () => {
  assert.ok(qualifies(place("a")));
  assert.ok(!qualifies(place("b", { rating: 3.9 })));
  assert.ok(!qualifies(place("c", { userRatingCount: 4 })));
  assert.ok(!qualifies(place("d", { businessStatus: "CLOSED_PERMANENTLY" })));
  assert.ok(!qualifies(place("e", { internationalPhoneNumber: "", nationalPhoneNumber: "" })));
});

test("engine: search, filter, audit, queue with verified-only message; no repeats", async () => {
  const store = mem();
  let searches = 0;
  const fetchImpl = async (url, opts) => {
    searches++;
    assert.match(opts.headers["X-Goog-Api-Key"], /KEY/);
    return new Response(JSON.stringify({ places: [
      place("nosite"), place("weak", { websiteUri: "https://weak.example.co.za" }), place("strong", { websiteUri: "https://strong.example.co.za" }),
      place("lowrated", { rating: 3.1 }), place("landline", { internationalPhoneNumber: "+27 12 345 6789", nationalPhoneNumber: "012 345 6789" }),
    ] }), { status: 200 });
  };
  const scan = async (u) => u.includes("weak")
    ? { ok: true, https: true, responseMs: 900, htmlBytes: 9000, finalUrl: u, requestedUrl: u, links: { checked: 0, broken: [] },
        signals: { title: "Home", metaDescription: "", viewport: false, fixedWidthHint: false, flash: false, telLinks: 0, phoneOnPage: true, waLinks: 0, whatsappMention: false, mailto: false, contactLink: false, forms: 0, quoteCta: false, ctaCount: 0, earlyCta: false, servicesFound: [], electricWords: true, titleHasService: false, titleHasPlace: false, placesFound: [], cityFound: false, areaPhrase: false, localSchema: false, reviews: false, faq: false, social: [], nameFound: true, imgs: 0, imgsNoAlt: 0, copyrightYear: null, wordCount: 100 } }
    : { ok: true, https: true, responseMs: 500, htmlBytes: 9000, finalUrl: u, requestedUrl: u, links: { checked: 0, broken: [] },
        signals: { title: "Electrician Centurion", metaDescription: "x".repeat(80), viewport: true, fixedWidthHint: false, flash: false, telLinks: 2, phoneOnPage: true, waLinks: 1, whatsappMention: true, mailto: true, contactLink: true, forms: 1, quoteCta: true, ctaCount: 4, earlyCta: true, servicesFound: ["a","b","c","d"], electricWords: true, titleHasService: true, titleHasPlace: true, placesFound: ["centurion"], cityFound: true, areaPhrase: true, localSchema: true, reviews: true, faq: true, social: ["facebook"], nameFound: true, imgs: 0, imgsNoAlt: 0, copyrightYear: null, wordCount: 900 } };
  const now = new Date("2026-10-10T03:00:00Z");
  let r = await runStep({ key: "KEY", store, scan, fetchImpl, now });
  r = await runStep({ key: "KEY", store, scan, fetchImpl, now });
  assert.equal(searches, 1, "second run works through pending instead of searching");
  const q = await store.get("queue/2026-10-10");
  const names = q.map((p) => p.id).sort();
  assert.deepEqual(names, ["landline", "nosite", "weak"], JSON.stringify(r.log));
  const weak = q.find((p) => p.id === "weak");
  assert.match(weak.message, /4\.6★ from 30 reviews/);
  assert.match(weak.message, /no WhatsApp button|isn't tappable/);
  assert.equal(weak.wa, "27821234567");
  assert.equal(q.find((p) => p.id === "landline").wa, "");
  assert.match(q.find((p) => p.id === "nosite").message, /don't seem to have a website/);
  // third run: new search, all already seen → nothing new
  r = await runStep({ key: "KEY", store, scan, fetchImpl, now });
  assert.equal(searches, 2);
  assert.equal((await store.get("queue/2026-10-10")).length, 3);
});

test("query rotation alternates trades across areas", () => {
  assert.equal(queryAt(0).trade, "electrician"); assert.equal(queryAt(1).trade, "plumber"); assert.equal(queryAt(0).area, queryAt(1).area);
  assert.notEqual(queryAt(2).area, queryAt(0).area);
  assert.ok(LIMITS.queuePerDay <= 30);
});
