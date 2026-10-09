/* Local Lead Machine — public audit page */
(function () {
  "use strict";
  var LLM = window.LLM, C = LLM.cfg, esc = LLM.esc;
  var form = document.getElementById("audit-form");
  var report = document.getElementById("report");
  var status = document.getElementById("a-status");
  var site = document.getElementById("a-site");
  var noSite = document.getElementById("a-nosite");
  var go = document.getElementById("a-go");

  var q = new URLSearchParams(location.search);
  if (q.get("site")) site.value = q.get("site").slice(0, 200);
  if (q.get("name")) document.getElementById("a-name").value = q.get("name").slice(0, 120);
  if (q.get("city")) document.getElementById("a-city").value = q.get("city").slice(0, 80);
  noSite.addEventListener("change", function () { site.disabled = noSite.checked; if (noSite.checked) site.value = ""; });

  function say(cls, html) { status.className = "alert " + cls; status.innerHTML = html; status.hidden = false; }

  window.LLMScan = function (url, businessName, city) {
    return fetch("/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: url, businessName: businessName, city: city }) })
      .then(function (r) {
        if (r.status === 429) return r.json().then(function (j) { return { ok: false, error: j.error }; });
        if (!r.ok) return { ok: false, error: "the automatic website checker isn't available right now." };
        return r.json();
      })
      .catch(function () { return { ok: false, error: "the automatic website checker couldn't be reached." }; });
  };

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!LLM.validate(form)) { say("alert-bad", "Please check the highlighted fields."); return; }
    var d = LLM.formData(form);
    if (d["bot-field"]) return;
    var hasSite = !noSite.checked && d.website;
    go.disabled = true;
    go.innerHTML = '<span class="spinner" aria-hidden="true"></span> Checking ' + (hasSite ? "your website…" : "…");
    say("alert-info", hasSite ? "Opening your website the way a customer's phone would. This usually takes 5–15 seconds." : "Building your report…");
    var p = hasSite ? window.LLMScan(d.website, d.business, d.city) : Promise.resolve(null);
    p.then(function (scan) {
      var res = window.LLMScore.score({ scan: scan, noWebsite: noSite.checked, city: d.city, scanError: scan && !scan.ok ? cap(scan.error) : null });
      render(res, d, scan);
      status.hidden = true;
      // send lead + result (best effort; never blocks the report)
      d.score = res.total + "/100 (" + res.verifiedMax + " pts verifiable)";
      d.summary = res.top3.map(function (c) { return c.label + ": " + c.reason; }).join(" | ").slice(0, 1500) || "No leaks detected";
      d.no_website = noSite.checked ? "yes" : "";
      LLM.submitNetlify(d).catch(function () {});
    }).then(function () { go.disabled = false; go.innerHTML = "Run the audit again"; });
  });

  function cap(s) { s = String(s || ""); return s.charAt(0).toUpperCase() + s.slice(1); }
  function chip(st) { var t = { pass: "Pass", warn: "Warning", fail: "Fail", nv: "Not verified" }[st]; return '<span class="st st-' + st + '">' + t + "</span>"; }

  function render(r, d, scan) {
    var name = d.business || "your business";
    var headline = {
      strong: "Solid foundations — just a few leaks left.",
      leaking: "Customers can find you, but you're leaking enquiries.",
      weak: "Customers are probably dropping off before they contact you.",
      incomplete: "We couldn't check enough to give a full score."
    }[r.grade];
    if (noSite.checked) headline = "No website: customers who look you up have nowhere to go.";
    var pct = r.total / 100, circ = 439.8;
    var col = r.total >= 80 ? "#2BD9F4" : r.total >= 55 ? "#FFB547" : "#FF6B5B";
    var nvNote = r.nvPoints > 0 ? "<p><b>" + r.nvPoints + " of 100 points couldn't be verified automatically</b> and are scored as 0 until checked. " + (scan && !scan.ok ? esc(cap(scan.error)) : "") + "</p>" : "";
    var waMsg = LLM.fill(C.messages.audit, { business: d.business || "my business", score: String(r.total) }) +
      (r.top3.length ? "\n\nBiggest issues:\n" + r.top3.map(function (c, i) { return (i + 1) + ". " + c.label; }).join("\n") : "") +
      (d.website ? "\nWebsite: " + d.website : "");
    var wa = LLM.waLink(waMsg);
    var phone = (C.phoneNumber || "").trim();

    var h = "";
    h += '<div class="score-card"><div class="gauge" role="img" aria-label="Score ' + r.total + ' out of 100"><svg viewBox="0 0 170 170"><circle cx="85" cy="85" r="70" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="14"/><circle cx="85" cy="85" r="70" fill="none" stroke="' + col + '" stroke-width="14" stroke-linecap="round" stroke-dasharray="' + (circ * pct).toFixed(1) + " " + circ + '"/></svg><div class="num"><div><b>' + r.total + "</b><small>/ 100</small></div></div></div>";
    h += '<div><span class="k">Your local lead score</span><h2>' + esc(headline) + "</h2><p>Preliminary audit for <b>" + esc(name) + "</b>" + (d.city ? " · " + esc(d.city) : "") + (scan && scan.ok ? " · checked " + esc(scan.finalUrl) : "") + ".</p>" + nvNote + '<p style="font-size:.88rem">Every point below comes from an automatic check — nothing is guessed. Google profile details are flagged for a person to check.</p></div></div>';

    if (r.top3.length) {
      h += '<div class="panel"><h2 style="font-size:1.4rem">Top 3 priorities</h2><ol class="prio">' + r.top3.map(function (c) {
        return "<li><div><b>" + esc(c.label) + "</b> " + chip(c.status) + '<div style="color:var(--muted);font-size:.94rem;margin-top:4px">' + esc(c.reason) + '</div><div style="margin-top:6px;font-weight:700;font-size:.94rem">Fix: ' + esc(c.fix) + "</div></div></li>";
      }).join("") + "</ol></div>";
    }

    h += '<div class="grid grid-2">';
    h += '<div class="panel"><h2 style="font-size:1.25rem">What\'s working</h2>' + (r.working.length ? r.working.map(function (c) { return '<div class="check-row"><span class="lbl">' + esc(c.label) + '</span><span class="meta">' + chip("pass") + '</span><span class="why">' + esc(c.reason) + "</span></div>"; }).join("") : '<p style="color:var(--muted)">Nothing we could verify yet.</p>') + "</div>";
    h += '<div class="panel"><h2 style="font-size:1.25rem">What\'s leaking customers</h2>' + (r.leaking.length ? r.leaking.map(function (c) { return '<div class="check-row"><span class="lbl">' + esc(c.label) + '</span><span class="meta">' + chip(c.status) + '</span><span class="why">' + esc(c.reason) + "</span></div>"; }).join("") : '<p style="color:var(--muted)">No leaks detected in what we could check.</p>') + "</div>";
    h += "</div>";

    if (r.fixes.length) {
      h += '<div class="panel"><h2 style="font-size:1.25rem">What we would fix</h2><ul class="checks plain">' + r.fixes.map(function (f) { return '<li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg><span>' + esc(f) + "</span></li>"; }).join("") + "</ul></div>";
    }

    h += '<div class="offer-box"><h3>Fix these leaks — ' + esc(C.pricing.founding) + ' founding offer</h3><p>We build your conversion page with tap-to-call, WhatsApp, your services, your areas and a quote button — usually within 24 hours of getting your details. Founding price is for the first ' + esc(C.pricing.foundingSlots) + " paying businesses only.</p>";
    h += '<div class="btn-row no-print"><a class="btn btn-primary" href="/get-started/?plan=founding&amp;ref=audit">Fix these leaks — ' + esc(C.pricing.founding) + "</a>";
    h += wa ? '<a class="btn btn-wa" href="' + esc(wa) + '" target="_blank" rel="noopener noreferrer">WhatsApp us your audit</a>' : '<a class="btn btn-wa" href="/contact/?via=whatsapp">WhatsApp us your audit</a>';
    if (LLM.payfast) h += '<a class="btn btn-ghost" href="' + esc(LLM.payfast) + '"' + (LLM.payfast.charAt(0) === "/" ? "" : ' target="_blank" rel="noopener noreferrer"') + '>Pay ' + esc(C.pricing.founding) + ' securely (PayFast)</a>';
    if (phone) h += '<a class="btn btn-ghost" href="tel:' + esc(phone.replace(/[^\d+]/g, "")) + '">Call us</a>';
    h += '<button class="btn btn-ghost" type="button" onclick="window.print()">Save as PDF / print</button></div>';
    h += '<p style="font-size:.88rem;margin:14px 0 0">WhatsApp us your audit and we\'ll explain it — no obligation.</p></div>';

    h += '<div class="panel"><h2 style="font-size:1.25rem">Google Business Profile — needs manual verification</h2><p style="color:var(--muted)">We can\'t read Google data automatically, so we don\'t score or guess these. ' + (d.google_profile ? "A person will check the profile link you gave." : "Add your Google profile link and we'll check these by hand.") + "</p>" +
      r.manual.map(function (m) { return '<div class="check-row"><span class="lbl">' + esc(m.label) + '</span><span class="meta">' + chip("nv") + "</span></div>"; }).join("") + "</div>";

    h += '<div class="panel"><h2 style="font-size:1.25rem">Full score breakdown</h2><div class="cat-bars" style="margin:14px 0 22px">' + r.categories.map(function (c) {
      var p = c.max ? c.earned / c.max : 0;
      return '<div class="cat-bar"><div class="row"><span>' + esc(c.name) + "</span><span>" + c.earned + "/" + c.max + '</span></div><div class="track"><div class="fill ' + (p < 0.4 ? "low" : p < 0.75 ? "mid" : "") + '" style="width:' + Math.round(p * 100) + '%"></div></div></div>';
    }).join("") + "</div>";
    h += r.categories.map(function (c) {
      return '<div class="cat-block" style="margin-top:18px"><h3><span>' + esc(c.name) + "</span><span>" + c.earned + "/" + c.max + "</span></h3>" + c.checks.map(function (k) {
        return '<div class="check-row"><span class="lbl">' + esc(k.label) + '</span><span class="meta">' + chip(k.status) + '<span class="pts">' + k.earned + "/" + k.max + '</span></span><span class="why">' + esc(k.reason) + "</span></div>";
      }).join("") + "</div>";
    }).join("") + "</div>";

    if (r.info.length) {
      h += '<div class="panel"><h2 style="font-size:1.25rem">Also noticed <span style="font-weight:600;color:var(--muted);font-size:.9rem">(not scored)</span></h2>' + r.info.map(function (i) { return '<div class="check-row"><span class="lbl" style="font-weight:600">' + esc(i.text) + '</span><span class="meta">' + chip(i.status) + "</span></div>"; }).join("") + "</div>";
    }
    h += '<p class="notice">This is an automated preliminary audit of one public page' + (scan && scan.ok ? " (" + esc(scan.finalUrl) + ", " + new Date(scan.scannedAt).toLocaleString("en-ZA") + ")" : "") + '. The speed figure is a basic indicator, not a full performance test. Recommendations are reviewed by a person before any work is quoted.</p>';
    h += '<div class="btn-row no-print"><a class="btn btn-line" href="/audit/">Run another audit</a><a class="btn btn-line" href="/demo/sparkpro/">See what we build</a></div>';

    report.innerHTML = h;
    report.hidden = false;
    report.focus({ preventScroll: true });
    report.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }
  window.LLMRenderAudit = render;
})();
