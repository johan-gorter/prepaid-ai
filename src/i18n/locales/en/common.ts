// Cross-cutting UI strings shared across the whole app (app bar, menus,
// language switcher, notifications, share dialog, and generic buttons).
const common = {
  common: {
    signIn: "Sign in",
    signOut: "Sign out",
    account: "Account",
    cancel: "Cancel",
    close: "Close",
    delete: "Delete",
    back: "Back",
    backToMain: "Back to Main",
    backToBalance: "Back to Balance",
  },
  language: {
    label: "Language",
    switch: "Switch language",
    en: "English",
    nl: "Nederlands",
  },
  appBar: {
    homeAriaLabel: "payasyougo home",
  },
  userMenu: {
    menuAriaLabel: "User menu",
    switchToLight: "Switch to light",
    switchToDark: "Switch to dark",
  },
  notification: {
    title: "Notification",
    dismiss: "Dismiss",
    giftTitle: "You received a gift!",
    giftBody: "{sender} sent you {amount}.",
    giftAmount: "{count} credits",
    decline: "Decline",
    accept: "Accept",
  },
  share: {
    title: "Share impression",
    description: "Anyone with this link can view this result image.",
    close: "Close",
    copy: "Copy",
    copied: "Copied",
  },
};

export type CommonMessages = typeof common;
export default common;
