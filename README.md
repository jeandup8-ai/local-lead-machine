# Local Lead Machine

Sales site + free audit tool + internal sales toolkit for selling R990 conversion pages to South African electricians.

Plain HTML/CSS/JS (no framework, no npm dependencies) + one Netlify Function for website scanning. Leads are captured with Netlify Forms.

## Routes

| Route | Public? | What it does |
|---|---|---|
| `/` | yes | Homepage in the specified conversion sequence |
| `/electricians/` | yes | Niche landing page for outreach |
| `/audit/` | yes | Free audit: real website scan → score /100 with reasons, printable report, lead captured |
| `/demo/sparkpro/` | yes | Demo electrician page, labelled "DEMO EXAMPLE — FICTIONAL BUSINESS". Buttons open a demo notice, never contact anyone |
| `/get-started/` | yes | "Get started" lead form for the founding offer (payment arranged manually) |
| `/contact/`, `/privacy/`, `/terms/`, `/thanks/`, `404` | yes | Supporting pages |
| `/launch/` | internal | Daily targets (50/10/3/1), pipeline checklist, opening scripts |
| `/prospect/` | internal | Audit a prospect + your manual Google checks → pitch, opening message, pre-filled audit link, save to tracker |
| `/tracker/` | internal | Prospect tracker with all 9 statuses, follow-up due highlighting, CSV export/import |
| `/sales/` | internal | Copy-ready scripts that fill in name/business/issue automatically |

Internal pages are `noindex`, not in the sitemap and not linked from public pages. They are **not password protected** — they hold no secrets, and tracker data lives only in the browser you use.

## Deploy (Netlify — free plan is enough)

1. Put this folder in a GitHub repository.
2. Netlify → **Add new site → Import an existing project → GitHub** → pick the repo. Build settings are read from `netlify.toml` automatically. Click **Deploy**.
3. Netlify → **Site configuration → Environment variables**, add:

| Variable | Required | Example |
|---|---|---|
| `WHATSAPP_NUMBER` | **yes** (until set, WhatsApp buttons go to the contact form) | `0821234567` or `27821234567` |
| `CONTACT_PHONE` | optional (shows Call buttons) | `+27821234567` |
| `CONTACT_EMAIL` | optional (email fallback if a form fails) | `you@yourdomain.co.za` |
| `LEGAL_NAME` | optional (footer/privacy) | `Your (Pty) Ltd` |
| `PRICE_FOUNDING` / `PRICE_STANDARD` / `PRICE_CARE` | optional | `R990` / `R2,490` / `R399` |
| `SITE_URL` | optional (defaults to Netlify's URL) | `https://yourdomain.co.za` |

4. **Deploys → Trigger deploy** so the variables are applied.
5. Netlify → **Forms** → enable form detection if asked → **Form notifications → Add notification → Email** for both `lead` and `audit` forms. That's how you receive leads.

Netlify Drop (drag-and-drop) also works for the pages, but **the website scanner won't run** there (functions need a Git deploy) — audits would show "Not verified".

## Change things

- **WhatsApp number / phone / email / prices / brand:** environment variables above, or edit `site/config.js` (one place).
- **Pre-filled WhatsApp messages:** `messages` in `site/config.js`.
- **Copy/text:** edit the HTML files in `site/`.

## How the audit scores

`site/assets/scoring.js` — 7 categories totalling 100 (Website/mobile 20, Contactability 20, WhatsApp 15, Service clarity 15, Local 10, Trust 10, CTA 10). Every check is PASS / WARNING / FAIL / NOT VERIFIED with a written reason. Not-verified checks earn 0 and are reported separately. Google Business Profile items are never scored — always "needs manual verification".

The scanner (`netlify/functions/scan.mjs`) fetches one public page: http/https only, ports 80/443, public IPs only (blocks localhost, private ranges, cloud metadata), redirects re-checked, 8s timeout, 1.5 MB cap, rate-limited.

## Local preview / tests

```
node scripts/dev-server.mjs   # http://localhost:8888 (forms show their fallback locally)
npm test                      # scanner, SSRF and scoring tests
```
Don't run `scripts/build-config.mjs` on your source copy without `SITE_URL` — it strips canonical tags (it's meant for the Netlify build).

## First-day workflow

1. Open `/launch/`. Google Maps: "electrician Pretoria East" (then Centurion, Midrand…).
2. Keep listings with 4.0+ rating, 10+ reviews, real number, and no/weak website.
3. Run each through `/prospect/`, tick what you saw on their Google profile, save to tracker.
4. Send the generated opening message from your own WhatsApp, one at a time.
5. When they reply, send the pre-filled audit link. Follow up after 2–3 days (tracker flags due follow-ups).
6. Quote the founding offer → collect payment → collect assets (script on `/sales/`) → build → launch → ask for an honest testimonial.

## Limitations

- The scanner checks one page (the homepage), and the speed figure is a basic server-response/page-size indicator, not a Lighthouse test.
- Some sites block automated visitors; those show "Not verified" or "didn't load".
- Tracker/launch data are per-browser (export CSV for backup). No login on internal pages.
- No online payment by design — payment is arranged manually.
- The founding "first 3" limit is stated, not enforced by software.

## Customer onboarding (after payment)

1. PayFast returns the customer to `/paid/` → they fill in `/onboard/` (details, logo, photos).
2. `/api/intake-notify` triggers a rebuild; `scripts/build-customers.mjs` creates their draft at `/c/draft-<submissionId>/`.
3. A scheduled task sends Jean a summary every morning at 05:45 (new intakes with draft links, leads, audits).
4. Jean checks payment in PayFast, sends the customer the preview, then asks Claude to "approve <business>" → the id goes into `customers/approved.json` and the page moves to `/c/<slug>/`.

Required Netlify environment variables for this: `NETLIFY_API_TOKEN` (personal access token, secret) and `BUILD_HOOK_URL` (a build hook for the main branch).
