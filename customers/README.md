# Customer pages

Customer pages are built automatically from "intake" form submissions on every deploy
(`scripts/build-customers.mjs`).

- New submission → draft preview at `/c/draft-<submissionId>/` (not indexed, unguessable link).
- To publish, add the submission id to `approved.json`:

```json
{ "6ac7a1b2c3d4e5f600112233": { "slug": "ndlovu-electrical", "approved": "2026-10-09" } }
```

The page then moves to `/c/ndlovu-electrical/` and is added to the sitemap.
Customer data stays in Netlify Forms; only the id and slug are stored here.
