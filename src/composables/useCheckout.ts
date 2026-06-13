import { httpsCallable } from "firebase/functions";
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { functions } from "../firebase";
import { useAuth } from "./useAuth";
import {
  clearPendingPurchase,
  getPendingPurchase,
  setPendingPurchase,
} from "./usePendingPurchase";
import { track } from "./useTrack";

const isEmulatorMode = import.meta.env.VITE_USE_EMULATORS === "true";

export function useCheckout() {
  const route = useRoute();
  const router = useRouter();
  const { t } = useI18n();
  const { currentUser } = useAuth();

  const isProcessing = ref(false);
  const errorMessage = ref<string | null>(null);

  const minCredits = computed(() => Number(route.query.min ?? 0) || 0);
  const maxCredits = computed(() => Number(route.query.max ?? 0) || 0);

  /**
   * Same-origin path the user should land on after a successful purchase.
   * Refuses arrays, foreign-origin URLs, and `javascript:` payloads.
   */
  const redirectTo = computed(() => {
    const raw = route.query.redirect;
    const candidate = Array.isArray(raw) ? raw[0] : raw;
    if (
      typeof candidate === "string" &&
      candidate.startsWith("/") &&
      !candidate.startsWith("//")
    ) {
      return candidate;
    }
    return "/";
  });

  async function tryResumePending() {
    const pending = await getPendingPurchase();
    if (!pending) return;
    // Auto-resume only when the post-login detour brought us back here. A
    // user who navigated to /buy-credits manually shouldn't have a stale
    // intent silently fire on them.
    const isResume = route.query.resume === "1";
    if (isResume && currentUser.value && !isProcessing.value) {
      await runCheckout(pending.credits, pending.redirect);
    }
  }

  /**
   * Run a checkout against an explicit (already-persisted) intent. Used by
   * `tryResumePending` so the saved redirect from the original buy click
   * isn't overwritten by whatever query happens to be on the URL now.
   */
  async function runCheckout(credits: number, redirect: string) {
    if (isProcessing.value) return;
    errorMessage.value = null;
    isProcessing.value = true;

    try {
      if (!currentUser.value) {
        // Sign in first; the login page returns us to /buy-credits with a
        // resume=1 flag so the watcher picks the intent back up.
        router.push({
          path: "/login",
          query: {
            redirect: `/buy-credits?resume=1&min=${minCredits.value}&max=${maxCredits.value}&redirect=${encodeURIComponent(redirect)}`,
          },
        });
        return;
      }

      if (isEmulatorMode) {
        // Dummy implementation: skip the payment provider entirely and
        // credit the balance via a Cloud Function, then re-enter the site
        // via a full page reload — mirroring production where Stripe's
        // off-site redirect navigates the browser back to the origin.
        const purchase = httpsCallable<
          { amount: number; idempotencyKey: string },
          { amount: number; newBalance: number }
        >(functions, "purchaseCredits");
        const idempotencyKey = newIdempotencyKey();
        await purchase({ amount: credits, idempotencyKey });
        await clearPendingPurchase();
        track("payment_done");
        window.location.href = redirect;
        return;
      }

      // Production: hand off to Stripe Checkout.
      const createCheckoutSession = httpsCallable<
        { credits: number; successUrl: string; cancelUrl: string },
        { url: string }
      >(functions, "createCheckoutSession");
      const origin = window.location.origin;
      const successUrl = `${origin}/balance/success?session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${origin}/buy-credits`;
      const result = await createCheckoutSession({
        credits,
        successUrl,
        cancelUrl,
      });
      await clearPendingPurchase();
      window.location.href = result.data.url;
    } catch (err) {
      errorMessage.value =
        err instanceof Error ? err.message : t("buyCredits.errorGeneric");
      // Drop the saved intent so a returning user isn't trapped in an
      // auto-fire loop replaying the same failure on every /buy-credits visit.
      await clearPendingPurchase();
    } finally {
      isProcessing.value = false;
    }
  }

  function newIdempotencyKey(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  async function startCheckout(credits: number) {
    track("amount_chosen");
    // Persist the intent first so a sign-in detour or a tab refresh after
    // the user picks an amount can resume from the same place.
    await setPendingPurchase({ credits, redirect: redirectTo.value });
    await runCheckout(credits, redirectTo.value);
  }

  onMounted(() => {
    track("paywall_view");
    void tryResumePending();
  });

  watch(
    () => currentUser.value?.uid,
    (uid, oldUid) => {
      if (uid && uid !== oldUid) {
        void tryResumePending();
      }
    },
  );

  return {
    isProcessing,
    errorMessage,
    minCredits,
    maxCredits,
    startCheckout,
  };
}
