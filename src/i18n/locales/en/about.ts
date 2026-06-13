// The About / usage-terms / privacy page.
const about = {
  about: {
    title: "About payasyougo.app",
    intro:
      "payasyougo.app helps you visualize renovation ideas by combining your photos with AI-powered image editing. Upload a photo of your space, highlight the area you want to change, describe your vision, and receive an AI-generated preview of the result.",
    acceptableUseTitle: "Acceptable Use",
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
    dataRetentionTitle: "Data Retention",
    dataRetention:
      "Uploaded images and generated results will be retained for a minimum of {min} and a maximum of {max} from the date of upload. After the retention period, images may be permanently deleted. You can delete your images at any time from the renovation detail page, or delete your entire account from the {account} page.",
    dataRetentionMin: "12 months",
    dataRetentionMax: "24 months",
    privacyTitle: "Privacy",
    privacy:
      "We collect only the information necessary to provide the service: your authentication identity (via Google, Microsoft, or Apple sign-in) and the images and prompts you submit. We do not sell or share your data with third parties. Image processing is performed by Google's Gemini AI service.",
    termsTitle: "Terms of Service",
    terms:
      'By using payasyougo.app, you agree to these terms. The service is provided "as is" without warranty of any kind. We may modify or discontinue the service at any time. Continued use after changes constitutes acceptance of the updated terms.',
  },
};

export type AboutMessages = typeof about;
export default about;
