/* Local Lead Machine — internal tools (prospect audit, tracker, sales scripts, launch dashboard).
   All data stays in this browser (localStorage). */
(function () {
  "use strict";
  var LLM = window.LLM, C = LLM.cfg, esc = LLM.esc;
  var KEY = "llm_tracker_v1";
  var STATUSES = ["NEW", "CONTACTED", "REPLIED", "AUDIT SENT", "INTERESTED", "QUOTE SENT", "WON", "LOST", "FOLLOW UP"];
  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || "null"); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
  function today() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function prospects() { return store(KEY) || []; }
  function saveProspects(list) { store(KEY, list); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function waNum(n) { n = String(n || "").replace(/\D/g, ""); if (n.charAt(0) === "0") n = "27" + n.slice(1); return n; }
  function origin() { return location.origin && location.origin !== "null" ? location.origin : ""; }
  document.querySelectorAll("[data-origin]").forEach(function (el) { el.textContent = origin(); });

  /* ---------------- PROSPECT AUDIT ---------------- */
  var pForm = document.getElementById("p-form");
  if (pForm) {
    var manual = document.getElementById("p-manual");
    manual.innerHTML = window.LLMScore.MANUAL_GBP.filter(function (m) { return m.id !== "g_rating"; }).map(function (m) {
      return '<label>' + esc(m.label) + '<select data-m="' + m.id + '"><option value="">Not checked</option><option value="yes">Yes / fine</option><option value="no">No / problem</option></select></label>';
    }).join("");
    var PHRASE = {
      w_live: "you don't seem to have a website", wa: "there's no WhatsApp button on your website", c_tel: "your phone number isn't tappable on a phone",
      c_phone: "I couldn't find your phone number on your website", w_viewport: "your website doesn't fit properly on a phone screen",
      cta_quote: "there's no easy way to request a quote on your website", s_list: "your website doesn't clearly list the services you offer",
      l_place: "your website doesn't say which areas you cover", l_area: "your website doesn't say which areas you cover",
      w_https: "your website shows as 'Not secure' in some browsers", w_speed: "your website is slow to open on mobile data",
      c_contact: "there's no enquiry form on your website", cta_early: "there are no call or WhatsApp buttons at the top of your website"
    };
    var MPHRASE = { g_site: "your Google profile doesn't link to a website", g_services: "your Google profile doesn't list your services", g_area: "your Google profile doesn't show a service area", g_hours: "your opening hours on Google look incomplete", g_photos: "there aren't many recent photos of your work on Google", g_replies: "reviews on your Google profile haven't had replies" };
    var LABEL = { g_site: "Website on Google profile", g_services: "Services on Google", g_area: "Service area on Google", g_hours: "Hours on Google", g_photos: "Recent photos", g_replies: "Replies to reviews" };

    pForm.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!LLM.validate(pForm)) return;
      var v = function (id) { return document.getElementById(id).value.trim(); };
      var d = { business: v("p-name"), contact: v("p-contact"), site: v("p-site"), city: v("p-city"), phone: v("p-phone"), wa: v("p-wa"), gbp: v("p-gbp"), rating: v("p-rating"), reviews: v("p-reviews"), notes: v("p-notes") };
      var m = {}; manual.querySelectorAll("select").forEach(function (s) { m[s.dataset.m] = s.value; });
      var st = document.getElementById("p-status");
      var btn = pForm.querySelector("[type=submit]"); btn.disabled = true;
      st.className = "alert alert-info"; st.textContent = d.site ? "Checking the website…" : "Building the checklist…"; st.hidden = false;
      var p = d.site ? window.fetch("/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: d.site, businessName: d.business, city: d.city }) }).then(function (r) { return r.ok ? r.json() : { ok: false, checker: true, error: "the website checker isn't available (HTTP " + r.status + ")." }; }).catch(function () { return { ok: false, checker: true, error: "the website checker couldn't be reached." }; }) : Promise.resolve(null);
      p.then(function (scan) {
        var r = window.LLMScore.score({ scan: scan, noWebsite: !d.site, city: d.city, scanError: scan && !scan.ok ? scan.error : null });
        renderProspect(d, m, scan, r);
        st.hidden = true;
      }).then(function () { btn.disabled = false; });
    });

    function renderProspect(d, m, scan, r) {
      var byId = {}; r.checks.forEach(function (c) { byId[c.id] = c; });
      function line(label, ids) {
        var cs = ids.map(function (i) { return byId[i]; });
        var worst = cs.some(function (c) { return c.status === "fail"; }) ? "fail" : cs.some(function (c) { return c.status === "warn"; }) ? "warn" : cs.every(function (c) { return c.status === "pass"; }) ? "pass" : "nv";
        return '<div class="check-row"><span class="lbl">' + label + '</span><span class="meta"><span class="st st-' + worst + '">' + { pass: "Pass", warn: "Warning", fail: "Fail", nv: "Not verified" }[worst] + '</span></span><span class="why">' + cs.map(function (c) { return esc(c.reason); }).join(" ") + "</span></div>";
      }
      var siteDown = scan && scan.ok === false && !scan.checker;
      var issues = [];
      if (siteDown) issues.push("your website didn't load properly when I tried to open it");
      if (!d.site) issues.push(PHRASE.w_live);
      else r.leaking.forEach(function (c) { var t = PHRASE[c.id]; if (t && issues.indexOf(t) < 0 && (c.status === "fail")) issues.push(t); });
      Object.keys(m).forEach(function (k) { if (m[k] === "no" && MPHRASE[k]) issues.push(MPHRASE[k]); });
      var good = parseFloat(d.rating) >= 4 && parseInt(d.reviews, 10) >= 10;
      var msg = "Hi " + (d.contact || "there") + ", I found " + d.business + " on Google while looking for electricians" + (d.city ? " in " + d.city : "") + ". ";
      if (good) msg += "You've got a strong " + d.rating + "★ rating from " + d.reviews + " reviews, ";
      if (issues.length) msg += (good ? "but " : "") + "I noticed " + issues.slice(0, 2).join(" and ") + ". That can make it harder for people to contact you, especially from a phone. ";
      else msg += (good ? "and " : "") + "I had a quick look at your online customer journey and spotted a few things that may make it harder for people to contact you. ";
      msg += "I'm doing a small launch for local businesses and offering a free 5-minute audit. No obligation. Would you like me to send it?";
      var auditUrl = origin() + "/audit/?" + new URLSearchParams(Object.entries({ site: d.site, name: d.business, city: d.city, ref: "outreach" }).filter(function (x) { return x[1]; })).toString();
      var num = waNum(d.wa || d.phone);
      var top = issues[0];
      var pitch = top ? "Lead with the biggest verified leak: “" + top + "”. Send the audit link so they see it themselves, then quote the " + C.pricing.founding + " founding offer to fix it within 24 hours." : "No obvious verified leak. Check the Google profile manually before messaging — or deprioritise this prospect.";
      if (!d.site) pitch = "No website found — the strongest pitch is the demo page plus the " + C.pricing.founding + " founding offer. Show them " + origin() + "/demo/sparkpro/";

      var h = '<div class="score-card"><div class="gauge"><svg viewBox="0 0 170 170"><circle cx="85" cy="85" r="70" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="14"/><circle cx="85" cy="85" r="70" fill="none" stroke="#2BD9F4" stroke-width="14" stroke-linecap="round" stroke-dasharray="' + (439.8 * r.total / 100).toFixed(1) + ' 439.8"/></svg><div class="num"><div><b>' + r.total + '</b><small>/ 100</small></div></div></div><div><span class="k">Prospect checklist</span><h2>' + esc(d.business) + "</h2><p>" + (d.site ? (scan && scan.ok ? "Checked " + esc(scan.finalUrl) : "Website not verified — " + esc(scan && scan.error)) : "No website entered (treated as no website).") + "</p>" + (r.nvPoints ? "<p>" + r.nvPoints + " points not verified.</p>" : "") + "</div></div>";
      h += '<div class="panel">' +
        line("Website status", ["w_live", "w_https"]) + line("Mobile status", ["w_viewport", "w_speed"]) + line("WhatsApp", ["wa"]) +
        line("Phone CTA", ["c_phone", "c_tel"]) + line("Services", ["s_list"]) + line("Service areas", ["l_place", "l_area"]) +
        line("Reviews / trust", ["t_reviews", "t_social"]) + line("Quote CTA", ["cta_quote", "cta_early"]) + line("Local SEO", ["s_title", "s_meta", "l_schema"]);
      h += '<div class="check-row"><span class="lbl">Google rating</span><span class="meta">' + (d.rating && d.reviews ? '<span class="st ' + (good ? "st-pass" : "st-warn") + '">' + esc(d.rating) + "★ · " + esc(d.reviews) + "</span>" : '<span class="st st-nv">Not entered</span>') + '</span><span class="why">' + (d.rating && d.reviews ? (good ? "Meets the 4.0+ / 10+ reviews target profile." : "Below the ideal 4.0+ / 10+ reviews profile — weaker prospect.") : "Enter what you see on Google.") + "</span></div>";
      Object.keys(LABEL).forEach(function (k) { if (m[k]) h += '<div class="check-row"><span class="lbl">' + LABEL[k] + '</span><span class="meta"><span class="st ' + (m[k] === "yes" ? "st-pass" : "st-fail") + '">' + (m[k] === "yes" ? "OK (you checked)" : "Problem (you checked)") + "</span></span></div>"; });
      h += "</div>";
      h += '<div class="panel"><h2 style="font-size:1.2rem">Potential missed opportunities</h2>' + (issues.length ? '<ul class="mini-list">' + issues.map(function (i) { return "<li>" + esc(i.charAt(0).toUpperCase() + i.slice(1)) + "</li>"; }).join("") + "</ul>" : '<p style="color:var(--muted)">None verified yet.</p>') + '<h2 style="font-size:1.2rem;margin-top:16px">Recommended pitch</h2><p>' + esc(pitch) + "</p></div>";
      h += '<div class="panel form"><div class="field"><label for="p-msg">Opening message <span class="opt">(edit before sending — based only on what was verified)</span></label><textarea id="p-msg" style="min-height:170px">' + esc(msg) + '</textarea></div>' +
        '<div class="btn-row"><button class="btn btn-line" type="button" data-copy="#p-msg">Copy message</button>' + (num.length >= 11 ? '<a class="btn btn-wa" id="p-send" target="_blank" rel="noopener noreferrer" href="#">Open WhatsApp chat</a>' : "") + '</div>' +
        '<div class="field" style="margin-top:8px"><label for="p-link">Pre-filled audit link for this prospect</label><input id="p-link" readonly value="' + esc(auditUrl) + '"></div><button class="btn btn-line" type="button" data-copy="#p-link">Copy audit link</button>' +
        '<button class="btn btn-primary btn-block" type="button" id="p-save" style="margin-top:6px">Save to tracker</button><div id="p-saved" role="status" hidden class="alert alert-ok"></div></div>';
      var out = document.getElementById("p-out");
      out.innerHTML = h; out.hidden = false;
      var send = document.getElementById("p-send");
      if (send) send.addEventListener("click", function () { send.href = "https://wa.me/" + num + "?text=" + encodeURIComponent(document.getElementById("p-msg").value); });
      document.getElementById("p-save").addEventListener("click", function () {
        var list = prospects();
        var notes = [d.notes, "Audit " + r.total + "/100" + (issues.length ? " — " + issues.join("; ") : ""), d.gbp ? "Google: " + d.gbp : ""].filter(Boolean).join("\n");
        list.unshift({ id: uid(), business: d.business, contact: d.contact, phone: d.phone, whatsapp: d.wa, website: d.site, city: d.city, status: "NEW", source: "Prospect audit", contacted: "", followup: "", value: "", notes: notes, created: today() });
        saveProspects(list);
        var s = document.getElementById("p-saved"); s.hidden = false; s.innerHTML = 'Saved. <a href="/tracker/">Open tracker</a>';
      });
      out.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  /* ---------------- TRACKER ---------------- */
  var tList = document.getElementById("t-list");
  if (tList) {
    var dlg = document.getElementById("t-dlg"), tform = document.getElementById("t-form");
    var F = ["business", "contact", "phone", "whatsapp", "website", "city", "status", "source", "contacted", "followup", "value", "notes"];
    var due = function (p) { return p.followup && p.followup <= today() && p.status !== "WON" && p.status !== "LOST"; };
    function draw() {
      var list = prospects(), f = document.getElementById("t-filter").value, q = document.getElementById("t-search").value.toLowerCase();
      var won = list.filter(function (p) { return p.status === "WON"; });
      var k = [["Prospects", list.length], ["Contacted", list.filter(function (p) { return p.status !== "NEW"; }).length], ["Follow-ups due", list.filter(due).length], ["Won", won.length + ' <small>R' + won.reduce(function (a, p) { return a + (parseInt(String(p.value).replace(/\D/g, ""), 10) || 0); }, 0).toLocaleString("en-ZA") + "</small>"]];
      document.getElementById("t-kpis").innerHTML = k.map(function (x) { return '<div class="kpi"><div class="v">' + x[1] + '</div><div class="l">' + x[0] + "</div></div>"; }).join("");
      var shown = list.filter(function (p) { return (!f || (f === "DUE" ? due(p) : p.status === f)) && (!q || JSON.stringify(p).toLowerCase().indexOf(q) >= 0); });
      shown.sort(function (a, b) { return (due(b) - due(a)) || String(a.followup || "9").localeCompare(String(b.followup || "9")); });
      tList.innerHTML = shown.length ? shown.map(function (p) {
        var n = waNum(p.whatsapp || p.phone);
        return '<div class="prospect-card' + (due(p) ? " due" : "") + '"><div class="top"><b>' + esc(p.business) + '</b><span class="status ' + esc(p.status.replace(/ /g, "-")) + '">' + esc(p.status) + '</span></div>' +
          '<div class="meta">' + [p.contact, p.city, p.source].filter(Boolean).map(esc).join(" · ") + "</div>" +
          (p.followup ? '<div class="meta">' + (due(p) ? "<b style=\"color:var(--warn)\">Follow up due " : "Follow up ") + esc(p.followup) + (due(p) ? "</b>" : "") + "</div>" : "") +
          (p.notes ? '<div class="meta" style="white-space:pre-wrap">' + esc(p.notes.slice(0, 220)) + (p.notes.length > 220 ? "…" : "") + "</div>" : "") +
          '<div class="btn-row" style="margin-top:6px"><button class="btn btn-line btn-sm" data-edit="' + esc(p.id) + '">Edit</button>' +
          (n.length >= 11 ? '<a class="btn btn-wa btn-sm" target="_blank" rel="noopener noreferrer" href="https://wa.me/' + n + '">WhatsApp</a>' : "") +
          (p.phone ? '<a class="btn btn-line btn-sm" href="tel:' + esc(p.phone.replace(/[^\d+]/g, "")) + '">Call</a>' : "") +
          (p.website ? '<a class="btn btn-line btn-sm" href="/prospect/" data-reaudit="' + esc(p.id) + '">Audit</a>' : "") + "</div></div>";
      }).join("") : '<div class="card"><p>No prospects yet. Add one, or use <a href="/prospect/">Prospect audit</a> and “Save to tracker”.</p></div>';
    }
    function open(p) {
      p = p || { status: "NEW", contacted: "", followup: "" };
      document.getElementById("tf-id").value = p.id || "";
      F.forEach(function (k) { document.getElementById("tf-" + k).value = p[k] || (k === "status" ? "NEW" : ""); });
      document.getElementById("t-dlg-title").textContent = p.id ? "Edit prospect" : "Add prospect";
      document.getElementById("tf-delete").hidden = !p.id;
      dlg.showModal();
    }
    document.getElementById("t-add").addEventListener("click", function () { open(); });
    document.getElementById("tf-cancel").addEventListener("click", function () { dlg.close(); });
    document.getElementById("tf-delete").addEventListener("click", function () {
      if (!confirm("Delete this prospect?")) return;
      var id = document.getElementById("tf-id").value; saveProspects(prospects().filter(function (p) { return p.id !== id; })); dlg.close(); draw();
    });
    document.getElementById("tf-status").addEventListener("change", function (e) {
      var c = document.getElementById("tf-contacted");
      if (e.target.value === "CONTACTED" && !c.value) c.value = today();
      if (e.target.value === "CONTACTED" && !document.getElementById("tf-followup").value) { var d = new Date(); d.setDate(d.getDate() + 3); document.getElementById("tf-followup").value = d.toISOString().slice(0, 10); }
      if (e.target.value === "WON" && !document.getElementById("tf-value").value) document.getElementById("tf-value").value = String(C.pricing.founding).replace(/\D/g, "");
    });
    tform.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!LLM.validate(tform)) return;
      var list = prospects(), id = document.getElementById("tf-id").value, rec = { id: id || uid(), created: today() };
      F.forEach(function (k) { rec[k] = document.getElementById("tf-" + k).value.trim().slice(0, 2000); });
      var i = list.findIndex(function (p) { return p.id === id; });
      if (i >= 0) { rec.created = list[i].created; list[i] = rec; } else list.unshift(rec);
      saveProspects(list); dlg.close(); draw();
    });
    tList.addEventListener("click", function (e) {
      var b = e.target.closest("[data-edit]");
      if (b) { var p = prospects().find(function (x) { return x.id === b.dataset.edit; }); if (p) open(p); }
      var a = e.target.closest("[data-reaudit]");
      if (a) { var q = prospects().find(function (x) { return x.id === a.dataset.reaudit; }); if (q) { e.preventDefault(); store("llm_prefill", q); location.href = "/prospect/"; } }
    });
    ["t-filter", "t-search"].forEach(function (id) { document.getElementById(id).addEventListener("input", draw); });
    document.getElementById("t-export").addEventListener("click", function () {
      var cols = ["id", "created"].concat(F);
      var csv = cols.join(",") + "\n" + prospects().map(function (p) { return cols.map(function (c) { var v = String(p[c] == null ? "" : p[c]); if (/^[=+\-@]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; }).join(","); }).join("\n");
      var a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }));
      a.download = "prospects-" + today() + ".csv"; document.body.appendChild(a); a.click(); a.remove();
    });
    document.getElementById("t-import").addEventListener("change", function (e) {
      var file = e.target.files[0]; if (!file) return;
      file.text().then(function (txt) {
        var rows = parseCSV(txt.replace(/^﻿/, "")); if (rows.length < 2) return alert("No rows found.");
        var head = rows[0].map(function (h) { return h.trim().toLowerCase(); }), list = prospects(), ids = {}, added = 0;
        list.forEach(function (p) { ids[p.id] = true; });
        rows.slice(1).forEach(function (r) {
          var p = {}; head.forEach(function (h, i) { p[h] = String(r[i] || "").replace(/^'(?=[=+\-@])/, "").slice(0, 2000); });
          if (!p.business) return;
          if (STATUSES.indexOf(p.status) < 0) p.status = "NEW";
          if (!p.id || ids[p.id]) p.id = uid();
          ids[p.id] = true; list.push(p); added++;
        });
        saveProspects(list); draw(); alert("Imported " + added + " prospects."); e.target.value = "";
      });
    });
    draw();
  }
  function parseCSV(t) {
    var rows = [], row = [], f = "", q = false;
    for (var i = 0; i < t.length; i++) {
      var c = t[i];
      if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true;
      else if (c === ",") { row.push(f); f = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; }
      else f += c;
    }
    if (f || row.length) { row.push(f); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (x) { return x.trim(); }); });
  }

  // prefill prospect form from tracker
  if (pForm) {
    var pre = store("llm_prefill");
    if (pre) {
      localStorage.removeItem("llm_prefill");
      [["p-name", "business"], ["p-contact", "contact"], ["p-site", "website"], ["p-city", "city"], ["p-phone", "phone"], ["p-wa", "whatsapp"]].forEach(function (x) { document.getElementById(x[0]).value = pre[x[1]] || ""; });
    }
  }

  /* ---------------- SALES SCRIPTS ---------------- */
  var vars = document.getElementById("s-vars");
  if (vars) {
    var saved = store("llm_sales_vars") || {};
    var inputs = vars.querySelectorAll("[data-var]");
    inputs.forEach(function (i) { if (saved[i.dataset.var]) i.value = saved[i.dataset.var]; });
    var upd = function () {
      var v = {}; inputs.forEach(function (i) { v[i.dataset.var] = i.value.trim(); });
      store("llm_sales_vars", v);
      v["Audit link"] = origin() + "/audit/";
      v.Price = C.pricing.founding;
      document.querySelectorAll("pre[data-tpl]").forEach(function (pre) {
        pre.textContent = pre.getAttribute("data-tpl").replace(/\[([^\]]+)\]/g, function (m, k) { return v[k] || m; });
      });
    };
    inputs.forEach(function (i) { i.addEventListener("input", upd); });
    upd();
  }

  /* ---------------- LAUNCH DASHBOARD ---------------- */
  var lk = document.getElementById("l-kpis");
  if (lk) {
    var dk = "llm_launch_" + today();
    var st = store(dk) || { prospects: 0, conversations: 0, audits: 0, sales: 0, tasks: [] };
    var T = [["prospects", "Prospects found", 50], ["conversations", "Meaningful conversations", 10], ["audits", "Audits sent", 3], ["sales", "Sales", 1]];
    function drawK() {
      lk.innerHTML = T.map(function (t) {
        return '<div class="kpi"><div class="v">' + st[t[0]] + " <small>/ " + t[2] + '</small></div><div class="l">' + t[1] + '</div><div class="ctr"><button type="button" data-k="' + t[0] + '" data-d="-1" aria-label="Decrease ' + t[1] + '">−</button><button type="button" data-k="' + t[0] + '" data-d="1" aria-label="Increase ' + t[1] + '">+</button></div></div>';
      }).join("");
    }
    lk.addEventListener("click", function (e) { var b = e.target.closest("[data-k]"); if (!b) return; st[b.dataset.k] = Math.max(0, st[b.dataset.k] + Number(b.dataset.d)); store(dk, st); drawK(); });
    document.querySelectorAll("[data-task]").forEach(function (c) {
      c.checked = st.tasks.indexOf(c.dataset.task) >= 0;
      c.addEventListener("change", function () { st.tasks = [].slice.call(document.querySelectorAll("[data-task]:checked")).map(function (x) { return x.dataset.task; }); store(dk, st); });
    });
    document.getElementById("l-reset").addEventListener("click", function () { st = { prospects: 0, conversations: 0, audits: 0, sales: 0, tasks: [] }; store(dk, st); document.querySelectorAll("[data-task]").forEach(function (c) { c.checked = false; }); drawK(); });
    drawK();
  }
})();
