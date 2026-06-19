// Landing/home page copy and the renovations list shown there.
const main = {
  main: {
    taglinePayPerUse:
      "Use the best AI tools {highlight}. Simply pay only for what you actually use.",
    withoutMonthlySubscription: "without a monthly subscription",
    sketchYourRenovation: "See the result before you start",
    renovationResultInSeconds:
      "A wall in a new color, a different floor, that cabinet gone — or a full remodel? Take a photo of your space, describe your idea, and see the result in seconds.",
    renovationPreviewAlt: "Renovation preview",
    testYourIdea: "TRY WITH YOUR PHOTO",
    yourRenovations: "YOUR RENOVATIONS",
    securePrivateChat: "Chat privately with AI",
    chatExplainInPlainLanguage:
      "A tricky letter from your municipality, a medical result full of jargon, or help writing a good e-mail? Ask your question and get a clear answer right away.",
    // Precise, defensible privacy claim replacing the former absolute "stay
    // private" wording (#81), linking to the full privacy policy.
    chatPrivacyNote:
      "Your documents are never used to train AI and are not reviewed by humans.",
    chatPrivacyLink: "Read our privacy policy",
    startChatting: "START CHATTING",
    checkCredits: "Check Credits",
    shareYourThoughts: "Share your thoughts",
    feedbackWhichToolMissing:
      "Which feature or AI tool are you missing? Let us know what would make this app even more useful to you.",
    thanksForFeedback: "Thanks for your feedback!",
    tellUsAboutYourIdea: "Tell us about your idea...",
    shareYourIdea: "SHARE YOUR IDEA",
  },
  renovations: {
    title: "Renovations",
    signInPrompt: "Log in to see your renovations",
    loading: "Loading renovations...",
    errorLoading: "Error loading renovations: {error}",
  },
};

export type MainMessages = typeof main;
export default main;
