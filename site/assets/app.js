/* Local Lead Machine — shared site behaviour (no dependencies) */
(function () {
  "use strict";
  var C = window.LLM_CONFIG || {};
  var LLM = (window.LLM = window.LLM || {});

  function get(path) { return path.split(".").reduce(function (o, k) { return o == null ? o : o[k]; }, C); }
  function fill(tpl, vars) {
    vars = vars || {};
    return String(tpl || "").replace(/\{(\w+)\}/g, function (m, k) {
      if (vars[k] != null && vars[k] !== "") return vars[k];
      if (C.pricing && C.pricing[k]) return C.pricing[k];
      return k === "business" ? "my business" : m;
    });
  }
  LLM.cfg = C;
  LLM.fill = fill;
  LLM.hasWhatsApp = function () { return /^\d{9,15}$/.test(C.whatsappNumber || ""); };
  LLM.waLink = function (message, number) {
    var n = String(number || C.whatsappNumber || "").replace(/\D/g, "");
    if (!/^\d{9,15}$/.test(n)) return null;
    return "https://wa.me/" + n + "?text=" + encodeURIComponent(message || "");
  };
  LLM.esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  };

  // 1. config text
  document.querySelectorAll("[data-cfg]").forEach(function (el) { var v = get(el.getAttribute("data-cfg")); if (v) el.textContent = v; });

  // 2. WhatsApp buttons: data-wa="messageKey" (optional data-wa-vars='{"business":"x"}')
  LLM.bindWhatsApp = function (scope) {
    (scope || document).querySelectorAll("[data-wa]").forEach(function (el) {
      var vars = {};
      try { vars = JSON.parse(el.getAttribute("data-wa-vars") || "{}"); } catch (e) {}
      var msg = fill((C.messages || {})[el.getAttribute("data-wa")] || el.getAttribute("data-wa"), vars);
      var link = LLM.waLink(msg);
      if (link) { el.href = link; el.target = "_blank"; el.rel = "noopener noreferrer"; }
      else { el.href = "/contact/?via=whatsapp"; el.removeAttribute("target"); el.title = "WhatsApp number not configured yet — opens the contact form"; }
    });
  };
  LLM.bindWhatsApp();
  if (!LLM.hasWhatsApp() && window.console) console.warn("[Local Lead Machine] whatsappNumber is not set in config.js — WhatsApp buttons go to /contact/.");

  // 3. Phone buttons: hidden unless configured
  var phone = String(C.phoneNumber || "").trim();
  document.querySelectorAll("[data-call]").forEach(function (el) {
    if (phone) { el.href = "tel:" + phone.replace(/[^\d+]/g, ""); el.hidden = false; var t = el.querySelector("[data-call-text]"); if (t) t.textContent = phone; }
    else el.hidden = true;
  });
  document.querySelectorAll("[data-call-fallback]").forEach(function (el) { el.hidden = !!phone; });
  document.querySelectorAll("[data-email]").forEach(function (el) {
    if (C.email) { el.href = "mailto:" + C.email; if (!el.children.length) el.textContent = C.email; el.hidden = false; } else el.hidden = true;
  });
  // PayFast payment link: elements with data-payfast stay hidden unless a valid link is configured
  var pf = String(C.payfastLink || "").trim();
  var pfOk = /^\/pay\/?$/.test(pf) || /^https:\/\/([a-z0-9-]+\.)*(payfast\.co\.za|payfast\.io|payf\.st)(\/|$)/i.test(pf);
  LLM.payfast = pfOk ? pf : "";
  document.querySelectorAll("[data-payfast]").forEach(function (el) {
    if (pfOk) { if (el.tagName === "A") { el.href = pf; if (pf.charAt(0) !== "/") { el.target = "_blank"; el.rel = "noopener noreferrer"; } } el.hidden = false; }
    else el.hidden = true;
  });
  document.querySelectorAll("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });

  // 4. Forms posted to Netlify Forms with graceful fallback
  LLM.encode = function (data) {
    return Object.keys(data).map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(data[k] == null ? "" : data[k]); }).join("&");
  };
  LLM.submitNetlify = function (data) {
    return fetch("/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: LLM.encode(data) })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return true; });
  };
  LLM.leadMessage = function (d) {
    var lines = ["Hi, I just sent an enquiry on the Local Lead Machine website" + (d.plan === "founding" ? " for the " + ((C.pricing || {}).founding || "") + " founding offer" : "") + "."];
    [["Name", d.name], ["Business", d.business], ["City", d.city], ["Website", d.website], ["Email", d.email], ["Message", d.need]].forEach(function (x) { if (x[1]) lines.push(x[0] + ": " + x[1]); });
    return lines.join("\n");
  };
  LLM.validate = function (form) {
    var ok = true;
    form.querySelectorAll(".field").forEach(function (f) { f.classList.remove("err"); });
    form.querySelectorAll("input,textarea,select").forEach(function (el) {
      var bad = false, v = (el.value || "").trim();
      if (el.required && !v && el.type !== "checkbox") bad = true;
      if (el.type === "checkbox" && el.required && !el.checked) bad = true;
      if (v && el.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) bad = true;
      if (v && el.type === "tel" && v.replace(/\D/g, "").length < 9) bad = true;
      if (v && el.dataset.url !== undefined && !/^(https?:\/\/)?[^\s.]+\.[^\s]{2,}$/i.test(v)) bad = true;
      if (v.length > 2000) bad = true;
      if (bad) { ok = false; var f = el.closest(".field"); if (f) f.classList.add("err"); }
    });
    var first = form.querySelector(".field.err input,.field.err textarea");
    if (first) first.focus();
    return ok;
  };
  LLM.formData = function (form) {
    var d = {};
    new FormData(form).forEach(function (v, k) { d[k] = typeof v === "string" ? v.trim().slice(0, 2000) : ""; });
    return d;
  };
  LLM.mailtoFallback = function (subject, data) {
    if (!C.email) return null;
    var body = Object.keys(data).filter(function (k) { return k !== "form-name" && k !== "bot-field" && data[k]; }).map(function (k) { return k + ": " + data[k]; }).join("\n");
    return "mailto:" + C.email + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
  };

  document.querySelectorAll("form[data-lead]").forEach(function (form) {
    var status = form.querySelector("[data-status]");
    var params = new URLSearchParams(location.search);
    var plan = form.querySelector("[name=plan]");
    if (plan && params.get("plan")) plan.value = params.get("plan").slice(0, 40);
    var need = form.querySelector("[name=need]");
    if (need && !need.value && params.get("via") === "whatsapp") need.placeholder = "WhatsApp isn't set up on this site yet — leave your number and we'll WhatsApp you.";
    var src = form.querySelector("[name=page]");
    if (src) src.value = location.pathname + (params.get("ref") ? " ref=" + params.get("ref").slice(0, 40) : "");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!LLM.validate(form)) { status.className = "alert alert-bad"; status.textContent = "Please check the highlighted fields."; status.hidden = false; return; }
      var data = LLM.formData(form);
      if (data["bot-field"]) return;
      var btn = form.querySelector("[type=submit]"); btn.disabled = true;
      status.className = "alert alert-info"; status.textContent = "Sending…"; status.hidden = false;
      LLM.submitNetlify(data).then(function () {
        form.reset();
        status.className = "alert alert-ok";
        var wa = LLM.waLink(LLM.leadMessage(data));
        status.innerHTML = "Thanks — your details are saved." + (wa ? ' <b>Last step:</b> send them to us on WhatsApp so we can reply quickly.<br><a class="btn btn-wa btn-block" style="margin-top:10px" href="' + wa + '">Send on WhatsApp</a>' : " We'll be in touch within one business day.");
        if (wa) setTimeout(function () { location.href = wa; }, 1800);
      }).catch(function () {
        var m = LLM.mailtoFallback("Local Lead Machine enquiry", data);
        var w = LLM.waLink("Hi, I'm " + (data.name || "") + " from " + (data.business || "") + ". " + (data.need || "I'd like help with my online enquiries."));
        status.className = "alert alert-bad";
        status.innerHTML = "We couldn't send the form just now." + (w ? ' Please <a href="' + w + '" target="_blank" rel="noopener noreferrer">send it on WhatsApp</a>' : "") + (m ? (w ? " or " : " Please ") + '<a href="' + m + '">email it to us</a>' : "") + (w || m ? "." : " Please try again in a minute.");
      }).then(function () { btn.disabled = false; });
    });
  });

  // 5. copy buttons
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-copy]");
    if (!b) return;
    var t = document.querySelector(b.getAttribute("data-copy"));
    if (!t) return;
    var text = t.value != null && t.tagName !== "PRE" ? t.value : t.innerText;
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () {
      var o = b.textContent; b.textContent = "Copied ✓"; setTimeout(function () { b.textContent = o; }, 1600);
    }).catch(function () { var r = document.createRange(); r.selectNodeContents(t); var s = getSelection(); s.removeAllRanges(); s.addRange(r); });
  });

  // 6. subtle reveal
  if ("IntersectionObserver" in window && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } }); }, { rootMargin: "0px 0px -8% 0px" });
    document.querySelectorAll(".reveal").forEach(function (el) { io.observe(el); });
  } else document.querySelectorAll(".reveal").forEach(function (el) { el.classList.add("in"); });
})();
