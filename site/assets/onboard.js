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
      if (!file || !(/^image\//.test(file.type) || /\.(jpe?g|png|webp|heic|heif|gif)$/i.test(file.name || ""))) return resolve(null);
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

    // Shrink each image; if the phone can't (unusual format / memory), fall back to the original if it's small enough.
    function prep(file, side, q) {
      if (!file) return Promise.resolve(null);
      return shrink(file, side, q).catch(function () { return null; }).then(function (b) {
        if (b && b.size > 0) return { blob: b, name: ".jpg" };
        if (file.size > 0 && file.size < 1800000) return { blob: file, name: (file.name.match(/\.\w+$/) || [".jpg"])[0] };
        return null;
      });
    }
    var skipped = 0;
    Promise.all([prep(logo, 600, 0.9)].concat(photos.map(function (p) { return prep(p, 1400, 0.8); }))).then(function (items) {
      var fd = new FormData();
      new FormData(form).forEach(function (v, k) { if (typeof v === "string") fd.append(k, v.trim().slice(0, 1500)); });
      var report = ["v2", "selected=" + photos.length + (logo ? "+logo" : "")].concat(photos.map(function (p, i) { var it = items[i + 1]; return "p" + (i + 1) + ":" + (p.type || "notype") + ":" + Math.round(p.size / 1024) + "KB->" + (it ? Math.round(it.blob.size / 1024) + "KB" : "fail"); })).join(" ");
      fd.set("upload_report", report.slice(0, 500));
      if (items[0]) fd.append("logo", items[0].blob, "logo" + items[0].name); else if (logo) skipped++;
      var total = 0;
      items.slice(1).forEach(function (it, i) {
        if (!it || total + it.blob.size > 7000000) { skipped++; return; }
        total += it.blob.size;
        fd.append("photo" + (i + 1), it.blob, "photo" + (i + 1) + it.name);
      });
      return fetch("/", { method: "POST", body: fd });
    }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      fetch("/api/intake-notify", { method: "POST" }).catch(function () {});
      var biz = form.querySelector("[name=business]").value.trim();
      var wa = LLM.waLink("Hi, I've just sent my business details for " + biz + " on the Local Lead Machine site.");
      form.reset();
      say("alert-ok", "<b>Done — thank you!</b>" + (skipped ? " (" + skipped + " image" + (skipped > 1 ? "s" : "") + " couldn't be uploaded — please WhatsApp " + (skipped > 1 ? "them" : "it") + " to us.)" : "") + " We're building your page now. We'll check it and WhatsApp you the link, usually within 24 hours." +
        (wa ? '<br><a class="btn btn-wa btn-block" style="margin-top:10px" href="' + wa + '">Let us know on WhatsApp</a>' : ""));
    }).catch(function () {
      var wa = LLM.waLink("Hi, I tried to send my business details on the Local Lead Machine site but it didn't go through.");
      say("alert-bad", "Sorry — that didn't send. Please try again" + (wa ? ', or <a href="' + wa + '">WhatsApp us your details</a>' : "") + ".");
    }).then(function () { btn.disabled = false; });
  });
})();
