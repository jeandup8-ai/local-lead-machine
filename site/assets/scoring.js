/* Local Lead Machine — transparent audit scoring.
   Every point comes from a signal returned by /api/scan. Nothing is guessed.
   Status: pass | warn | fail | nv (not verified). Not-verified checks earn 0 and are shown separately. */
(function (root) {
  "use strict";

  var CATS = [
    { id: "web", name: "Website & mobile experience", max: 20 },
    { id: "contact", name: "Contactability", max: 20 },
    { id: "wa", name: "WhatsApp conversion", max: 15 },
    { id: "service", name: "Service clarity", max: 15 },
    { id: "local", name: "Local signals", max: 10 },
    { id: "trust", name: "Trust signals", max: 10 },
    { id: "cta", name: "Call-to-action quality", max: 10 }
  ];

  var FIX = {
    w_live: "Build a fast, mobile-first page customers can actually find and open.",
    w_https: "Serve the page securely (HTTPS) so browsers don't show 'Not secure'.",
    w_viewport: "Make the page properly mobile-friendly so it doesn't need pinching and zooming.",
    w_speed: "Slim the page down so it opens quickly on mobile data.",
    c_phone: "Show your phone number clearly at the top of the page.",
    c_tel: "Make the phone number a one-tap 'Call now' button.",
    c_contact: "Add a short enquiry form so customers can reach you any time.",
    wa: "Add a 'WhatsApp us' button that opens a chat with a pre-filled message.",
    s_list: "List your services in plain language (e.g. fault finding, DB boards, emergency call-outs).",
    s_title: "Rewrite the page title so Google and customers see what you do and where.",
    s_meta: "Write a clear search description that makes people want to tap your result.",
    l_place: "Name the city and suburbs you work in so local customers know you cover them.",
    l_area: "Add an 'Areas we cover' section.",
    l_schema: "Add local business structured data so Google understands your business details.",
    t_reviews: "Add a reviews/trust section that points to your real Google reviews.",
    t_name: "Make your business name obvious on the page.",
    t_social: "Link to your active social profiles (if you have them).",
    cta_quote: "Add a clear 'Get a quote' button.",
    cta_early: "Put Call / WhatsApp / Quote buttons at the top, where customers look first."
  };

  var MANUAL_GBP = [
    { id: "g_rating", label: "Google rating and number of reviews" },
    { id: "g_site", label: "Website link on the Google Business Profile" },
    { id: "g_services", label: "Services listed on the Google profile" },
    { id: "g_area", label: "Service area set on the Google profile" },
    { id: "g_hours", label: "Opening hours accurate (incl. emergency availability)" },
    { id: "g_photos", label: "Recent photos of real work" },
    { id: "g_replies", label: "Owner replies to reviews" }
  ];

  function score(input) {
    input = input || {};
    var scan = input.scan && input.scan.ok ? input.scan : null;
    var s = scan ? scan.signals : null;
    var noSite = !!input.noWebsite;
    var why = input.scanError || (input.scan && input.scan.error) || "No website address was entered, so the website couldn't be checked.";
    var checks = [];

    function add(cat, id, label, max, fn) {
      var c = { cat: cat, id: id, label: label, max: max, earned: 0, status: "nv", reason: "", fix: FIX[id] || "" };
      if (noSite) {
        c.status = "fail";
        c.reason = id === "w_live"
          ? "No website. Customers who want more detail than your Google profile shows have nowhere to go."
          : "No website, so this can't help customers decide.";
      } else if (!s && id === "w_live" && input.scan && input.scan.ok === false && "reachable" in input.scan) {
        c.status = "fail";
        c.reason = "The website didn't load properly when we tried to open it: " + why + " If customers hit the same problem, they leave.";
      } else if (!s) {
        c.reason = "Not verified — " + why;
      } else {
        var r = fn(s);
        c.status = r[0]; c.earned = Math.max(0, Math.min(max, r[1])); c.reason = r[2];
      }
      checks.push(c);
    }

    var pages = function (n) { return n === 1 ? "1" : String(n); };

    add("web", "w_live", "Website loads", 6, function () {
      return ["pass", 6, "The website opened successfully" + (scan.finalUrl !== scan.requestedUrl ? " (redirected to " + scan.finalUrl + ")." : ".")];
    });
    add("web", "w_https", "Secure (HTTPS)", 4, function () {
      return scan.https ? ["pass", 4, "The site uses HTTPS."] : ["fail", 0, "The site isn't using HTTPS, so browsers may label it 'Not secure'."];
    });
    add("web", "w_viewport", "Mobile-friendly setup", 5, function (s) {
      if (s.viewport && !s.fixedWidthHint && !s.flash) return ["pass", 5, "The page is set up to fit phone screens."];
      if (s.viewport) return ["warn", 2, "The page has a mobile setting, but parts of it use fixed desktop widths that can break on phones."];
      return ["fail", 0, "No mobile viewport setting was found — on phones the page likely shows as a tiny desktop page."];
    });
    add("web", "w_speed", "Basic speed indicator", 5, function () {
      var ms = scan.responseMs, kb = Math.round(scan.htmlBytes / 1024);
      var d = "Server response " + (ms / 1000).toFixed(1) + "s, page HTML " + kb + " KB (basic indicator, not a full speed test).";
      if (ms <= 2500 && kb <= 600) return ["pass", 5, d];
      if (ms <= 5000 && kb <= 1500) return ["warn", 2, d + " Slower than ideal on mobile data."];
      return ["fail", 0, d + " Likely to feel slow on a phone."];
    });

    add("contact", "c_phone", "Phone number visible", 6, function (s) {
      return s.phoneOnPage ? ["pass", 6, "A South African phone number was found on the page."] : ["fail", 0, "No phone number was detected in the page text."];
    });
    add("contact", "c_tel", "Tap-to-call button", 8, function (s) {
      if (s.telLinks > 0) return ["pass", 8, pages(s.telLinks) + " tap-to-call link(s) found."];
      if (s.phoneOnPage) return ["fail", 0, "The number is shown as text but isn't tappable — mobile visitors must copy it manually."];
      return ["fail", 0, "No tap-to-call link was found."];
    });
    add("contact", "c_contact", "Contact form or contact page", 6, function (s) {
      if (s.forms > 0) return ["pass", 6, "An enquiry/contact form was found on the page."];
      if (s.contactLink || s.mailto) return ["warn", 3, "There's a contact link or email, but no enquiry form on this page."];
      return ["fail", 0, "No contact form, contact page link or email link was found."];
    });

    add("wa", "wa", "WhatsApp button", 15, function (s) {
      if (s.waLinks > 0) return ["pass", 15, "A tap-to-WhatsApp link was found."];
      if (s.whatsappMention) return ["warn", 5, "WhatsApp is mentioned, but there's no button that opens a chat."];
      return ["fail", 0, "No WhatsApp link was found. Many South African customers prefer to WhatsApp first."];
    });

    add("service", "s_list", "Services clearly listed", 8, function (s) {
      var n = s.servicesFound.length;
      if (n >= 4) return ["pass", 8, n + " service types detected: " + s.servicesFound.join(", ") + "."];
      if (n >= 1) return ["warn", 4, "Only " + n + " service type(s) detected (" + s.servicesFound.join(", ") + "). Customers may not see that you do what they need."];
      return ["fail", 0, "No specific services were detected in the page text."];
    });
    add("service", "s_title", "Page title says what you do", 4, function (s) {
      if (!s.title) return ["fail", 0, "The page has no title — that's the headline Google shows in search results."];
      if (s.titleHasService) return ["pass", 4, "Title: “" + s.title + "”."];
      return ["warn", 2, "Title “" + s.title + "” doesn't say what service you offer."];
    });
    add("service", "s_meta", "Search description", 3, function (s) {
      var n = (s.metaDescription || "").length;
      if (n >= 50) return ["pass", 3, "A search description is set (" + n + " characters)."];
      if (n > 0) return ["warn", 1, "The search description is very short (" + n + " characters)."];
      return ["fail", 0, "No search description — Google will pick random text from the page."];
    });

    add("local", "l_place", "Location mentioned", 5, function (s) {
      var city = (input.city || "").trim();
      if (s.cityFound === true) return ["pass", 5, "“" + city + "” is mentioned on the page."];
      if (s.placesFound.length && s.cityFound === false) return ["warn", 3, "Places mentioned (" + s.placesFound.join(", ") + "), but not “" + city + "”."];
      if (s.placesFound.length) return ["pass", 5, "Places mentioned: " + s.placesFound.join(", ") + "."];
      return ["fail", 0, "No town, city or suburb was detected — customers can't tell if you work in their area."];
    });
    add("local", "l_area", "Service areas section", 3, function (s) {
      return s.areaPhrase ? ["pass", 3, "The page describes the areas served."] : ["fail", 0, "No 'areas we cover' wording was found."];
    });
    add("local", "l_schema", "Local business data for Google", 2, function (s) {
      return s.localSchema ? ["pass", 2, "Local business structured data was found."] : ["fail", 0, "No local business structured data was found."];
    });

    add("trust", "t_reviews", "Reviews or testimonials", 5, function (s) {
      return s.reviews ? ["pass", 5, "Review/testimonial wording was found on the page."] : ["fail", 0, "No reviews or testimonials section was detected."];
    });
    add("trust", "t_name", "Business name on page", 3, function (s) {
      if (s.nameFound === null) return ["nv", 0, "Not verified — no business name was entered."];
      return s.nameFound ? ["pass", 3, "Your business name appears on the page."] : ["fail", 0, "The business name you entered wasn't found on the page."];
    });
    add("trust", "t_social", "Social profiles linked", 2, function (s) {
      return s.social.length ? ["pass", 2, "Linked: " + s.social.join(", ") + "."] : ["fail", 0, "No social profile links were found."];
    });

    add("cta", "cta_quote", "'Get a quote' action", 6, function (s) {
      return s.quoteCta ? ["pass", 6, "A quote/request button or link was found."] : ["fail", 0, "No obvious quote CTA was detected on the website."];
    });
    add("cta", "cta_early", "Actions near the top", 4, function (s) {
      if (s.earlyCta && s.ctaCount >= 2) return ["pass", 4, "Contact actions appear early and more than once."];
      if (s.earlyCta || s.ctaCount >= 2) return ["warn", 2, s.earlyCta ? "A contact prompt appears early, but there are few clear action buttons." : "There are action buttons, but not near the top of the page."];
      return ["fail", 0, "No call/WhatsApp/quote prompt near the top of the page."];
    });

    var cats = CATS.map(function (c) {
      var cc = checks.filter(function (k) { return k.cat === c.id; });
      return { id: c.id, name: c.name, max: c.max, earned: cc.reduce(function (a, k) { return a + k.earned; }, 0), checks: cc };
    });
    var total = checks.reduce(function (a, k) { return a + k.earned; }, 0);
    var nvPoints = checks.filter(function (k) { return k.status === "nv"; }).reduce(function (a, k) { return a + k.max; }, 0);
    var leaking = checks.filter(function (k) { return k.status === "fail" || k.status === "warn"; })
      .sort(function (a, b) { return (b.max - b.earned) - (a.max - a.earned); });
    var working = checks.filter(function (k) { return k.status === "pass"; });

    var info = [];
    if (s) {
      if (scan.links && scan.links.checked) {
        info.push(scan.links.broken.length
          ? { status: "warn", text: scan.links.broken.length + " of " + scan.links.checked + " internal links checked appear broken." }
          : { status: "pass", text: "All " + scan.links.checked + " internal links checked worked." });
      }
      info.push(s.faq ? { status: "pass", text: "An FAQ section was found." } : { status: "warn", text: "No FAQ section — answering common questions removes reasons not to call." });
      if (s.imgs && s.imgsNoAlt) info.push({ status: "warn", text: s.imgsNoAlt + " of " + s.imgs + " images have no description (alt text)." });
      var yr = new Date().getFullYear();
      if (s.copyrightYear && s.copyrightYear < yr - 1) info.push({ status: "warn", text: "Footer copyright says " + s.copyrightYear + " — the site may look outdated." });
      if (s.flash) info.push({ status: "fail", text: "Uses outdated embedded media that phones can't display." });
    }

    var verifiedMax = 100 - nvPoints;
    return {
      total: total, max: 100, verifiedMax: verifiedMax, nvPoints: nvPoints,
      categories: cats, checks: checks, working: working, leaking: leaking,
      top3: leaking.slice(0, 3), info: info, manual: MANUAL_GBP,
      fixes: leaking.map(function (k) { return k.fix; }).filter(function (f, i, a) { return f && a.indexOf(f) === i; }),
      grade: verifiedMax < 50 ? "incomplete" : total >= 80 ? "strong" : total >= 55 ? "leaking" : "weak"
    };
  }

  var api = { score: score, CATS: CATS, MANUAL_GBP: MANUAL_GBP };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LLMScore = api;
})(this);
