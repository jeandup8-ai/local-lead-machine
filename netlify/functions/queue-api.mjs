// Prospect queue for the /queue/ page.
//  GET  /api/queue?count=1          → { new: n }   (public, numbers only)
//  GET  /api/queue  (x-admin-key)   → prospects from the last 7 days
//  POST /api/queue  (x-admin-key)   → { day, id, status }  or  { action: "run" } to run one engine step now
import { runStep, today } from "../lib/engine.mjs";
import { prospectStore } from "../lib/store.mjs";
import { scanSite } from "./scan.mjs";

const STATUSES = ["new", "contacted", "replied", "skipped", "dnc"];
const json = (status, data) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

function days(n) {
  const out = [], now = Date.now();
  for (let i = 0; i < n; i++) out.push(today(new Date(now - i * 86400e3)));
  return out;
}

export default async (req) => {
  const store = prospectStore();
  const url = new URL(req.url);
  if (req.method === "GET" && url.searchParams.get("count")) {
    const q = (await store.get("queue/" + today())) || [];
    return json(200, { new: q.filter((p) => p.status === "new").length, today: q.length, engine: !!process.env.GOOGLE_PLACES_API_KEY });
  }
  const admin = process.env.ADMIN_KEY;
  if (!admin || req.headers.get("x-admin-key") !== admin) return json(401, { error: "Not authorised" });

  if (req.method === "GET") {
    const out = [];
    for (const d of days(7)) for (const p of (await store.get("queue/" + d)) || []) out.push({ ...p, day: d });
    return json(200, { prospects: out, engine: !!process.env.GOOGLE_PLACES_API_KEY });
  }
  if (req.method === "POST") {
    let body; try { body = await req.json(); } catch { return json(400, { error: "Bad request" }); }
    if (body.action === "run") {
      if (!process.env.GOOGLE_PLACES_API_KEY) return json(400, { error: "GOOGLE_PLACES_API_KEY not set" });
      try {
        const r = await runStep({ key: process.env.GOOGLE_PLACES_API_KEY, store, scan: (u, o) => scanSite(u, { ...o, checkLinks: false }), siteUrl: process.env.URL });
        return json(200, r);
      } catch (e) { return json(500, { error: String(e.message || e).slice(0, 300) }); }
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.day || "") || !STATUSES.includes(body.status)) return json(400, { error: "Bad request" });
    const key = "queue/" + body.day;
    const q = (await store.get(key)) || [];
    const p = q.find((x) => x.id === body.id);
    if (!p) return json(404, { error: "Not found" });
    p.status = body.status;
    p.updated = new Date().toISOString();
    await store.set(key, q);
    return json(200, { ok: true });
  }
  return json(405, { error: "Method not allowed" });
};

export const config = { path: "/api/queue" };
