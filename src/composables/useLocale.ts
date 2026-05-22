import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { ref, watch } from "vue";
import { db } from "../firebase";
import {
  isSupportedLocale,
  SUPPORTED_LOCALES,
  i18n,
  type AppLocale,
} from "../i18n";
import { useAuth } from "./useAuth";
import { idbGet, idbSet } from "./useIdbStorage";

const STORAGE_KEY = "locale";

const locale = ref<AppLocale>("en");

// Tracks whether the user has explicitly chosen a language since module load.
// Without this, an in-flight IndexedDB / Firestore read resolving after the
// user picks a language would clobber their choice with the stored value.
// Mirrors the guard in useColorScheme.ts.
let userSelected = false;

// The device-level explicit choice (from IndexedDB or set this session). When
// set, it is authoritative over the per-account Firestore value so two devices
// don't flip-flop a signed-in user's language back and forth.
let deviceLocale: AppLocale | null = null;

function applyLocale(next: AppLocale) {
  locale.value = next;
  // legacy:false → `i18n.global.locale` is a writable ref.
  i18n.global.locale.value = next;
  if (typeof document !== "undefined") {
    document.documentElement.lang = next;
  }
}

/** Pick the best locale from the browser's language preferences. */
function detectLocale(): AppLocale {
  if (typeof navigator === "undefined") return "en";
  const langs = navigator.languages?.length
    ? navigator.languages
    : [navigator.language];
  for (const lang of langs) {
    if (lang?.toLowerCase().startsWith("nl")) return "nl";
  }
  return "en";
}

// 1. Apply the auto-detected locale synchronously so the first paint is in the
//    right language with zero await.
applyLocale(detectLocale());

// 2. An explicit device choice (IndexedDB) overrides auto-detection.
idbGet<AppLocale>(STORAGE_KEY)
  .then((stored) => {
    if (userSelected) return;
    if (isSupportedLocale(stored)) {
      deviceLocale = stored;
      applyLocale(stored);
    }
  })
  .catch(() => {
    // ignore: a failed read just leaves us on the detected locale
  });

// 3. For a signed-in user with no device choice, adopt the per-account
//    Firestore locale so the preference follows them across devices.
const { currentUser } = useAuth();
let unsubscribe: (() => void) | null = null;

watch(
  () => currentUser.value?.uid,
  (uid) => {
    unsubscribe?.();
    unsubscribe = null;

    if (!uid) {
      // Signed out: idbClearAll() wipes the stored locale, so drop the device
      // choice and re-arm adoption. The in-memory `locale` is intentionally
      // left unchanged to avoid a jarring flip at the moment of sign-out — the
      // next cold boot re-detects from the browser.
      deviceLocale = null;
      userSelected = false;
      return;
    }

    const userRef = doc(db, "users", uid);
    unsubscribe = onSnapshot(
      userRef,
      (snap) => {
        const remote = snap.data()?.locale;
        if (isSupportedLocale(remote)) {
          if (!userSelected && deviceLocale == null) {
            applyLocale(remote);
          }
        } else if (snap.exists() && !snap.metadata.hasPendingWrites) {
          // No remote preference yet — seed it from the current locale so it
          // follows the user to other devices.
          void setDoc(userRef, { locale: locale.value }, { merge: true }).catch(
            () => {},
          );
        }
      },
      () => {
        // ignore: a listener error just leaves us on the local locale
      },
    );
  },
  { immediate: true },
);

export function useLocale() {
  function setLocale(next: AppLocale) {
    userSelected = true;
    deviceLocale = next;
    applyLocale(next);
    idbSet(STORAGE_KEY, next).catch(() => {
      // ignore: persistence is best-effort
    });
    const uid = currentUser.value?.uid;
    if (uid) {
      void setDoc(doc(db, "users", uid), { locale: next }, { merge: true }).catch(
        () => {
          // ignore: cross-device sync is best-effort
        },
      );
    }
  }

  return { locale, setLocale, supportedLocales: SUPPORTED_LOCALES };
}
