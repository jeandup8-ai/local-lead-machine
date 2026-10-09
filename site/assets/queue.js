/* Local Lead Machine — daily prospect queue (internal). Access key lives in this browser only. */
(function () {
  "use strict";
  var LLM = window.LLM, esc = LLM.esc;
  var KEY_STORE = "llm_admin_key";
  var m = location.hash.match(/k=([\w-]{16,})/);
  if (m) { try { localStorage.setItem(KEY_STORE, m[1]); } catch (e) {} history.replaceState(null, "", location.pathname); }
  var key = ""; try { key = localStorage.getItem(KEY_STORE) || ""; } catch (e) {}
  var list = document.getElementById("q-list"), st = document.getElementById("q-status"), filter = "new", data = [];

  function say(cls, t) { st.className = "alert " + cls; st.innerHTML = t; st.hidden = false; }
  function api(method, body) {
    return fetch("/api/queue", { method: method, headers: { "x-admin-key": key, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || "HTTP " + r.status); return j; }); });
  }
  function load() {
    if (!key) { say("alert-bad", "This page needs your private link (the one ending in #k=…). Open that link once on this phone."); return; }
    say("alert-info", "Loading…");
    api("GET").then(function (j) {
      data = j.prospects || [];
      st.hidden = true;
      if (!j.engine) say("alert-info", "The engine is waiting for its Google key (GOOGLE_PLACES_API_KEY). Once that's added, new prospects appear here every morning.");
      draw();
    }).catch(function (e) { say("alert-bad", "Couldn't load: " + esc(e.message)); });
  }
  function counts() {
    var c = { new: 0, contacted: 0, replied: 0, all: data.length };
    data.forEach(function (p) { if (c[p.status] != null) c[p.status]++; });
    document.querySelectorAll("[data-f]").forEach(function (b) { var f = b.dataset.f; b.querySelector("span").textContent = c[f] != null ? c[f] : ""; b.classList.toggle("on", f === filter); });
  }
  function draw() {
    counts();
    var rows = data.filter(function (p) { return filter === "all" ? true : p.status === filter; });
    list.innerHTML = rows.length ? rows.map(function (p) {
      var wa = p.wa ? "https://wa.me/" + p.wa + "?text=" + encodeURIComponent(p.message) : "";
      return '<div class="prospect-card" data-id="' + esc(p.id) + '" data-day="' + esc(p.day) + '">' +
        '<div class="top"><b>' + esc(p.name) + '</b><span class="status ' + esc(p.status.toUpperCase()) + '">' + esc(p.status) + "</span></div>" +
        '<div class="meta">' + esc(p.trade) + " · " + esc(p.area) + " · " + esc(String(p.rating)) + "★ (" + esc(String(p.reviews)) + ")" + (p.website ? " · site score " + (p.score == null ? "?" : p.score) + "/100" : " · no website") + "</div>" +
        (p.issues && p.issues.length ? '<div class="meta">Found: ' + p.issues.map(esc).join("; ") + "</div>" : "") +
        '<details><summary class="meta" style="cursor:pointer">Message</summary><pre style="white-space:pre-wrap;font-family:inherit;background:var(--paper);padding:10px;border-radius:8px;margin:6px 0">' + esc(p.message) + "</pre></details>" +
        '<div class="btn-row" style="margin-top:6px">' +
        (wa ? '<a class="btn btn-wa btn-sm" data-act="contacted" target="_blank" rel="noopener" href="' + esc(wa) + '">WhatsApp</a>' : (p.phone ? '<a class="btn btn-dark btn-sm" data-act="contacted" href="tel:' + esc(p.phone.replace(/[^\d+]/g, "")) + '">Call (landline)</a>' : "")) +
        '<button class="btn btn-line btn-sm" data-copy-audit="' + esc(p.auditLink) + '">Copy audit link</button>' +
        (p.mapsUrl ? '<a class="btn btn-line btn-sm" target="_blank" rel="noopener" href="' + esc(p.mapsUrl) + '">Google</a>' : "") +
        (p.status !== "replied" ? '<button class="btn btn-line btn-sm" data-act="replied">Replied</button>' : "") +
        (p.status === "new" ? '<button class="btn btn-line btn-sm" data-act="skipped">Skip</button>' : "") +
        '<button class="btn btn-line btn-sm" data-act="dnc" style="color:var(--bad)">Not interested</button>' +
        "</div></div>";
    }).join("") : '<div class="card"><p>Nothing here.' + (filter === "new" ? " New prospects are added every morning." : "") + "</p></div>";
  }
  function setStatus(card, status) {
    var p = data.find(function (x) { return x.id === card.dataset.id && x.day === card.dataset.day; });
    if (!p) return;
    p.status = status; setTimeout(draw, 400);
    api("POST", { day: p.day, id: p.id, status: status }).catch(function (e) { say("alert-bad", "Couldn't save: " + esc(e.message)); });
    if (status === "contacted") addToTracker(p);
  }
  function addToTracker(p) {
    try {
      var k = "llm_tracker_v1", t = JSON.parse(localStorage.getItem(k) || "[]");
      if (t.some(function (x) { return x.id === "eng-" + p.id; })) return;
      var d = new Date(), f = new Date(Date.now() + 3 * 864e5), iso = function (x) { return x.toISOString().slice(0, 10); };
      t.unshift({ id: "eng-" + p.id, business: p.name, contact: "", phone: p.phone, whatsapp: p.wa ? "0" + p.wa.slice(2) : "", website: p.website, city: p.area,
        status: "CONTACTED", source: "Prospect engine", contacted: iso(d), followup: iso(f), value: "", notes: (p.issues || []).join("; ") + "\nAudit link: " + p.auditLink, created: iso(d) });
      localStorage.setItem(k, JSON.stringify(t));
    } catch (e) {}
  }
  list.addEventListener("click", function (e) {
    var card = e.target.closest(".prospect-card"); if (!card) return;
    var a = e.target.closest("[data-act]");
    if (a) { if (a.dataset.act === "dnc" && !confirm("Mark as not interested? They won't be suggested again.")) { e.preventDefault(); return; } setStatus(card, a.dataset.act); }
    var c = e.target.closest("[data-copy-audit]");
    if (c) { var t = c.getAttribute("data-copy-audit"); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { c.textContent = "Copied ✓"; }).catch(function () { prompt("Copy this link:", t); }); }
  });
  document.querySelectorAll("[data-f]").forEach(function (b) { b.addEventListener("click", function () { filter = b.dataset.f; draw(); }); });
  document.getElementById("q-run").addEventListener("click", function () {
    var b = this; b.disabled = true; say("alert-info", "Searching and checking websites… (up to 30 seconds)");
    api("POST", { action: "run" }).then(function (r) { say("alert-ok", esc((r.log || []).join(" · ") || "Nothing new this round.") + " — queued today: " + r.queued); load(); })
      .catch(function (e) { say("alert-bad", esc(e.message)); }).then(function () { b.disabled = false; });
  });
  load();
})();
