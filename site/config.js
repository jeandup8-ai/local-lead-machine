/* ============================================================
   LOCAL LEAD MACHINE — THE ONE PLACE TO CHANGE BUSINESS DETAILS
   On Netlify you can instead set environment variables
   (WHATSAPP_NUMBER, CONTACT_PHONE, CONTACT_EMAIL, LEGAL_NAME,
   PRICE_FOUNDING, PRICE_STANDARD, PRICE_CARE) — the build step
   rewrites this file from them. See README.md.
   ============================================================ */
window.LLM_CONFIG = {
  brand: "Local Lead Machine",
  legalName: "Local Lead Machine",

  // Digits only, international format, no + or spaces. Example: "27821234567"
  // Leave empty until you have your real number — WhatsApp buttons then fall back to the contact form.
  whatsappNumber: "27813932430",

  // Shown on "Call" buttons. Example: "+27821234567". Leave empty to hide Call buttons.
  phoneNumber: "",

  // Where people can email you, and the fallback if a form can't be submitted.
  email: "",

  pricing: {
    founding: "R990",
    standard: "R2,490",
    care: "R399",
    foundingSlots: "3"
  },

  messages: {
    default: "Hi, I'd like to get a free Local Lead Machine audit.",
    electricians: "Hi, I'm an electrician and I'd like a free Local Lead Machine audit.",
    pricing: "Hi, I'm interested in the {founding} founding offer from Local Lead Machine.",
    audit: "Hi, I run {business}. I saw my Local Lead Machine audit (score {score}/100) and would like to discuss fixing the issues."
  }
};
