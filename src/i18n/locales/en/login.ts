// Authentication: the login page and the account/danger-zone page.
const login = {
  login: {
    reimagineYourSpace: "Reimagine your space with AI",
    withGoogle: "Sign in with Google",
    withMicrosoft: "Sign in with Microsoft",
    withApple: "Sign in with Apple",
    errorAccountExists:
      "An account already exists with this email address using a different sign-in method. Please sign in with the method you used originally.",
    errorGeneric: "Sign-in failed. Please try again.",
    termsPrefix: "By signing in, you agree to our {terms}.",
    termsLink: "Terms of Service",
    devMode: "Dev / Emulator mode",
    devSeedHint: "Run {command} once to create this user.",
    devLogin: "Dev Login ({email})",
    devLoginFailed:
      "Dev login failed.\n\nMake sure you have run:\n  npm run emulators:seed",
  },
  account: {
    title: "Account",
    lastActivity: "Last Activity",
    noActivity: "No activity recorded yet.",
    dangerZone: "Danger Zone",
    deleteAccount: "Delete Account",
    deleteDescription:
      "Permanently delete your account and all associated data, including all renovations, impressions, and uploaded images. This action cannot be undone.",
    deleteButton: "Delete my account",
    areYouSure: "Are you sure?",
    areYouSureDetail: "This will permanently delete everything.",
    confirmDelete: "Yes, delete everything",
    deleting: "Deleting...",
    deleteFailed: "Failed to delete account",
  },
};

export type LoginMessages = typeof login;
export default login;
