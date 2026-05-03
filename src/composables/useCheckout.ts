import { httpsCallable } from "firebase/functions";
import { ref } from "vue";
import { functions } from "../firebase";
import type { CreditPackageId } from "../types";

type CheckoutResult =
  | { url: string }
  | { dummy: true; credits: number };

export function useCheckout() {
  const purchasing = ref(false);
  const error = ref<string | null>(null);
  const dummyResult = ref<{ credits: number } | null>(null);

  async function purchase(packageId: CreditPackageId): Promise<void> {
    purchasing.value = true;
    error.value = null;
    dummyResult.value = null;

    try {
      const fn = httpsCallable<
        { packageId: string; successUrl: string; cancelUrl: string },
        CheckoutResult
      >(functions, "createCheckoutSession");

      // Stripe will replace {CHECKOUT_SESSION_ID} in the success URL template.
      const successUrl = `${window.location.origin}/balance/success?session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${window.location.origin}/balance`;

      const { data } = await fn({ packageId, successUrl, cancelUrl });

      if ("dummy" in data && data.dummy) {
        dummyResult.value = { credits: data.credits };
      } else if ("url" in data && data.url) {
        window.location.href = data.url;
        // Navigation is in progress — keep purchasing=true so the button stays disabled.
        return;
      }
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : "Purchase failed";
    } finally {
      purchasing.value = false;
    }
  }

  return { purchasing, error, dummyResult, purchase };
}
