// Private AI chat page.
const chat = {
  chat: {
    title: "Chat",
    emptyTitle: "Start a private conversation with AI.",
    emptyHint: "Conversations are stored only on this device.",
    you: "You",
    ai: "AI",
    stop: "Stop",
    download: "Download",
    continueChat: "Continue Chat",
    inputPlaceholder: "Paste text from documents and type questions",
    estimatedCost: "Estimated cost:",
    limit: "Limit:",
    sendAria: "Send (Ctrl+Enter)",
    downloadConvAria: "Download conversation",
    // Inline AI disclaimer shown by the composer (#81). The full version lives
    // in the Usage Terms; this keeps the reminder visible where people ask.
    aiDisclaimer: "Not legal advice — AI can make mistakes.",
  },
};

export type ChatMessages = typeof chat;
export default chat;
