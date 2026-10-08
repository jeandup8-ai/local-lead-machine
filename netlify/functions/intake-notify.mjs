// Called by /onboard/ after a customer submits their details.
// Triggers a site rebuild (via a Netlify build hook) so their draft page is generated within minutes.
// Guarded: only rebuilds if a real intake submission arrived in the last 15 minutes, max once per 2 minutes.
let lastTrigger = 0;

export default async (req) => {
  if (req.method !== "POST") return new Response("Use POST", { status: 405 });
  const hook = process.env.BUILD_HOOK_URL;
  const token = process.env.NETLIFY_API_TOKEN;
  const siteId = process.env.SITE_ID;
  if (!hook || !/^https:\/\/api\.netlify\.com\/build_hooks\/[a-z0-9]+$/i.test(hook)) return Response.json({ ok: false, reason: "not configured" }, { status: 202 });
  if (Date.now() - lastTrigger < 120_000) return Response.json({ ok: true, reason: "recently triggered" }, { status: 202 });
  try {
    if (token && siteId) {
      const h = { authorization: "Bearer " + token };
      const forms = await (await fetch(`https://api.netlify.com/api/v1/sites/${siteId}/forms`, { headers: h })).json();
      const intake = Array.isArray(forms) && forms.find((f) => f.name === "intake");
      if (!intake) return Response.json({ ok: false, reason: "no intake form" }, { status: 202 });
      const subs = await (await fetch(`https://api.netlify.com/api/v1/forms/${intake.id}/submissions?per_page=1`, { headers: h })).json();
      const latest = Array.isArray(subs) && subs[0] && Date.parse(subs[0].created_at);
      if (!latest || Date.now() - latest > 15 * 60_000) return Response.json({ ok: false, reason: "no recent submission" }, { status: 202 });
    }
    lastTrigger = Date.now();
    await fetch(hook + "?trigger_title=" + encodeURIComponent("New customer intake"), { method: "POST" });
    return Response.json({ ok: true }, { status: 202 });
  } catch (e) {
    console.error("intake-notify", e);
    return Response.json({ ok: false }, { status: 202 });
  }
};

export const config = { path: "/api/intake-notify" };
