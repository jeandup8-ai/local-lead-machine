import test from "node:test";
import assert from "node:assert/strict";
import { renderCustomerPage, slugify } from "../scripts/customer-template.mjs";

test("customer page escapes input, drops unsafe links, uses real numbers", () => {
  const html = renderCustomerPage({ business: 'Bad <img src=x onerror=alert(1)>', trade: "Plumber", city: "Pretoria", phone: "0712345678",
    whatsapp: "", services: "Burst pipes\nGeysers", areas: "Hatfield, Brooklyn", google_profile: "javascript:alert(1)", consent: "yes" }, { slug: "draft-x", draft: true });
  assert.ok(!html.includes("<img src=x"));
  assert.ok(!html.includes("javascript:alert"));
  assert.ok(html.includes("tel:+27712345678"));
  assert.ok(html.includes("https://wa.me/27712345678"));
  assert.ok(html.includes("noindex"));
});
test("slugify", () => assert.equal(slugify("Ndlovu Electrical (Pty) Ltd"), "ndlovu-electrical-pty-ltd"));
