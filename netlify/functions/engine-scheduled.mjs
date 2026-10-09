// Runs every hour on Netlify's servers. Does nothing until GOOGLE_PLACES_API_KEY is set.
import { runStep } from "../lib/engine.mjs";
import { prospectStore } from "../lib/store.mjs";
import { scanSite } from "./scan.mjs";

export default async () => {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) { console.log("[engine] GOOGLE_PLACES_API_KEY not set — idle"); return; }
  try {
    const r = await runStep({ key, store: prospectStore(), scan: (u, o) => scanSite(u, { ...o, checkLinks: false }), siteUrl: process.env.URL });
    console.log("[engine]", JSON.stringify(r));
  } catch (e) { console.error("[engine] failed", e); }
};

export const config = { schedule: "7 * * * *" };
