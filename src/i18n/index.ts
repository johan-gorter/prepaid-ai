import { createI18n } from "vue-i18n";
import en from "./locales/en";
import nl from "./locales/nl";

export const SUPPORTED_LOCALES = ["en", "nl"] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

/** Human-readable language names, always shown in the language itself. */
export const LOCALE_LABELS: Record<AppLocale, string> = {
  en: "English",
  nl: "Nederlands",
};

export function isSupportedLocale(value: unknown): value is AppLocale {
  return (
    typeof value === "string" &&
    (SUPPORTED_LOCALES as readonly string[]).includes(value)
  );
}

// The instance boots to English. The real locale is decided by `useLocale`
// (navigator detection → IndexedDB → Firestore precedence) so all of that
// logic lives in one place rather than being split across the instance config.
export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: "en",
  fallbackLocale: "en",
  missingWarn: import.meta.env.DEV,
  fallbackWarn: import.meta.env.DEV,
  messages: { en, nl },
});
