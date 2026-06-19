// Footer + the three legal pages: About, Privacy Policy, and Usage Terms.
// Restructured from the former single combined "about" page into a real footer
// linking three short, focused pages (#81). Trade/identity details are kept
// deliberately minimal (PO decision): KvK number + e-mail + country, no street
// address, personal name, legal form, or btw-id (VAT-exempt under the KOR).
const legal = {
  footer: {
    about: "About",
    privacy: "Privacy Policy",
    terms: "Usage Terms",
    // Business-identity row kept directly in the footer so the art. 3:15d BW
    // information stays easily and permanently accessible. {year} is current.
    identity: "© {year} johangorter.com · KvK 94834571",
  },
  about: {
    title: "About payasyougo.app",
    intro:
      "payasyougo.app helps you visualize renovation ideas by combining your photos with AI-powered image editing. Upload a photo of your space, highlight the area you want to change, describe your vision, and receive an AI-generated preview of the result.",
    colofonTitle: "Who runs this service",
    colofonTradeName: "Trade name: johangorter.com",
    colofonKvk: "Chamber of Commerce (KvK): 94834571",
    colofonEmail: "Contact: {email}",
    colofonCountry: "Netherlands",
    colofonVat: "VAT-exempt under the Dutch small-business scheme (KOR).",
    moreLinks: "See also our {privacy} and {terms}.",
  },
  privacy: {
    title: "Privacy Policy",
    intro:
      "This policy explains what personal data payasyougo.app processes, why, and what your rights are. We keep data collection to the minimum needed to run the service.",
    dataTitle: "What we collect",
    dataAccount:
      "Your account identity (e-mail address) from your Google or Microsoft sign-in.",
    dataPhotos: "Photos you upload to generate renovation impressions.",
    dataChat: "The text you send in the private chat.",
    dataPayment:
      "Payment data, handled by Stripe — we never see your card details.",
    processorsTitle: "Who processes your data",
    processorsIntro: "We rely on a small number of trusted processors:",
    processorsFirebase:
      "Google Firebase / Google Cloud — authentication, database, and image storage.",
    processorsVertex:
      "Google Vertex AI / Gemini — generates renovation impressions and chat responses.",
    processorsStripe: "Stripe — payment processing.",
    purposesTitle: "Why we use it",
    purposes:
      "We use your data only to provide the service: signing you in, generating and storing your impressions and chat answers, and processing payments. We do not sell your data and do not share it with third parties for advertising.",
    aiTitle: "AI and your content",
    ai: "Your photos and chat content are never used to train AI models. They are not reviewed by humans, except where strictly necessary to investigate abuse or to comply with the law.",
    retentionTitle: "How long we keep it",
    retention:
      "Uploaded images and generated results are kept for 12 to 24 months from the date of upload. You can delete individual images from the renovation detail page, or delete your entire account at any time from the {account} page.",
    storageTitle: "Cookies and local storage",
    storage:
      "We use only functional client-side storage (IndexedDB) to keep the app working — for example your drafts, cached images, and language choice. We use no tracking or advertising cookies, so there is no cookie-consent banner.",
    rightsTitle: "Your rights",
    rights:
      "You have the right to access, correct, or delete your personal data, and to object to or restrict its processing. To exercise these rights, contact us at {email}.",
    contactTitle: "Contact",
    contact: "Questions about your privacy? E-mail {email}.",
  },
  terms: {
    title: "Usage Terms",
    intro:
      "By using payasyougo.app you agree to these terms. Please read them together with our {privacy}.",
    acceptableUseTitle: "Acceptable use",
    acceptableUseIntro:
      "You are responsible for the images you upload. Uploaded images {mustNot} contain:",
    mustNot: "must not",
    acceptableUseNoHarmfulContent:
      "Harmful, hateful, violent, or otherwise objectionable content",
    acceptableUseNoPii:
      "Personal or private information (PII) of any individual",
    acceptableUseNoPeopleWithoutConsent:
      "Recognizable persons without their explicit consent",
    acceptableUseNoLicensePlates:
      "Readable license plates or other identifying markers",
    acceptableUseOutro:
      "We reserve the right to remove any content that violates these guidelines without prior notice.",
    creditsTitle: "Credits",
    credits:
      "Credits are bought up front and spent per action. Credits never expire. They have no cash value and cannot be paid back out, but unused credits can be transferred to another user.",
    withdrawalTitle: "Right of withdrawal",
    withdrawal:
      "Buying credits gives you immediate access to a digital service. When you buy credits you expressly agree to immediate performance and acknowledge that you thereby waive your statutory 14-day right of withdrawal. You confirm this with a checkbox before every purchase.",
    ageTitle: "Minimum age",
    age: "You must be at least 13 years old to use payasyougo.app. If you are under 16, you may only use it with the consent of a parent or guardian.",
    aiTitle: "AI output",
    ai: "Results are generated by AI and can be inaccurate. Renovation images are illustrative impressions, not construction, architectural, or engineering advice. Chat answers are informational only and are not legal, medical, financial, or other professional advice. Always verify important decisions with a qualified professional.",
    liabilityTitle: "Liability",
    liability:
      'The service is provided "as is", without warranty of any kind. To the extent permitted by law, we are not liable for any damage arising from use of the service or from reliance on AI-generated output. We may modify or discontinue the service at any time.',
    lawTitle: "Governing law",
    law: "These terms are governed by Dutch law. Disputes will be submitted to the competent Dutch court.",
    changesTitle: "Changes",
    changes:
      "We may update these terms. Continued use after changes constitutes acceptance of the updated terms.",
  },
};

export type LegalMessages = typeof legal;
export default legal;
