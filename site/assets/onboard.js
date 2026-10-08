/* Local Lead Machine — customer intake (after payment).
   Shrinks photos in the browser, then posts everything to Netlify Forms ("intake")
   and asks the site to rebuild so the customer's draft page is created straight away. */
(function () {
  "use strict";
  var LLM = window.LLM, form = document.getElementById("onboard-form");
  if (!form) return;
  var status = document.getElementById("o-status");
  var MAX_PHOTOS = 4;

  function say(cls, html) { status.className = "alert " + cls; status.innerHTML = html; status.hidden = false; }

  function shrink(file, maxSide, quality) {
    return new Promise(function (resolve) {
      if (!file || !/^image\//.test(file.type)) return resolve(null);
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var s = Math.min(1, maxSide / Math.max(img.width, img.height));
        var c = document.createElement("canvas");
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        var ctx = c.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { resolve(b); }, "image/jpeg", quality);
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!LLM.validate(form)) { say("alert-bad", "Please check the highlighted fields."); return; }
    var photos = [].slice.call(document.getElementById("o-photos").files || []).slice(0, MAX_PHOTOS);
    var logo = (document.getElementById("o-logo").files || [])[0];
    var btn = form.querySelector("[type=submit]"); btn.disabled = true;
    say("alert-info", "Preparing your photos and sending…");

    Promise.all([shrink(logo, 600, 0.9)].concat(photos.map(function (p) { return shrink(p, 1400, 0.8); }))).then(function (blobs) {
      var fd = new FormData();
      new FormData(form).forEach(function (v, k) { if (typeof v === "string") fd.append(k, v.trim().slice(0, 1500)); });
      if (blobs[0]) fd.append("logo", blobs[0], "logo.jpg");
      blobs.slice(1).forEach(function (b, i) { if (b) fd.append("photo" + (i + 1), b, "photo" + (i + 1) + ".jpg"); });
      return fetch("/", { method: "POST", body: fd });
    }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      fetch("/api/intake-notify", { method: "POST" }).catch(function () {});
      var biz = form.querySelector("[name=business]").value.trim();
      var wa = LLM.waLink("Hi, I've just sent my business details for " + biz + " on the Local Lead Machine site.");
      form.reset();
      say("alert-ok", "<b>Done — thank you!</b> We're building your page now. We'll check it and WhatsApp you the link, usually within 24 hours." +
        (wa ? '<br><a class="btn btn-wa btn-block" style="margin-top:10px" href="' + wa + '">Let us know on WhatsApp</a>' : ""));
    }).catch(function () {
      var wa = LLM.waLink("Hi, I tried to send my business details on the Local Lead Machine site but it didn't go through.");
      say("alert-bad", "Sorry — that didn't send. Please try again" + (wa ? ', or <a href="' + wa + '">WhatsApp us your details</a>' : "") + ".");
    }).then(function () { btn.disabled = false; });
  });
})();
