/**
 * The generate pipeline for the impression wizard.
 *
 * Pure orchestration extracted from NewImpressionPage: balance gate →
 * buy-credits redirect, source-image resolution per source type, composite
 * upload, `createImpression`, and the completion listener. The only template
 * dependency is a `getCompositeBlob` callback (and a readiness probe) for the
 * shared MaskingCanvas, which stays mounted in the page.
 */

import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { ref as storageRef, uploadBytes } from "firebase/storage";
import { computed, type ComputedRef, type Ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import type { User } from "firebase/auth";
import { useBalance } from "./useBalance";
import {
  getImpressionSource,
  getMaterialSource,
  setImpressionSource,
} from "./useImpressionStore";
import { resolveStorageUrl } from "./useStorageUrl";
import { track } from "./useTrack";
import { ACTION_CREDITS, type RenovationAction } from "../credits";
import { createImpression, createRenovation } from "../data/renovationRepo";
import { getOrCreateMaterial } from "../data/materialsRepo";
import { db, storage } from "../firebase";
import type { Source, Stage } from "../views/renovation/wizard/wizardTypes";

/**
 * Safety ceiling for the Cloud Function round-trip. If the function never
 * reports back (crashed, not deployed, emulator down), fail the wait so the
 * user gets an error and their retry buttons back instead of an eternal
 * processing spinner. Generations normally finish well within this.
 */
const COMPLETION_TIMEOUT_MS = 90_000;

type CompositeVariant = "solid" | "checker";

export interface GenerateImpressionContext {
  currentUser: Ref<User | null>;
  prompt: Ref<string>;
  sourceParam: ComputedRef<Source | undefined>;
  renovationParam: ComputedRef<string | null>;
  impressionParam: ComputedRef<string | null>;
  useSolidMask: Ref<boolean>;
  usePaintMode: Ref<boolean>;
  paintColor: Ref<string>;
  useMaterialMode: Ref<boolean>;
  /** Storage path of a chosen registry material; null for a fresh upload. */
  materialPath: Ref<string | null>;
  stage: Ref<Stage>;
  errorMessage: Ref<string | null>;
  isMaskReady: () => boolean;
  getCompositeBlob: (variant: CompositeVariant) => Promise<Blob>;
  persistDraft: () => Promise<void>;
  clearPersistedDraft: () => Promise<void>;
}

export function useGenerateImpression(ctx: GenerateImpressionContext) {
  const {
    currentUser,
    prompt,
    sourceParam,
    renovationParam,
    impressionParam,
    useSolidMask,
    usePaintMode,
    paintColor,
    useMaterialMode,
    materialPath,
    stage,
    errorMessage,
    isMaskReady,
    getCompositeBlob,
    persistDraft,
    clearPersistedDraft,
  } = ctx;

  const { t } = useI18n();
  const route = useRoute();
  const router = useRouter();
  const { balance, waitForLoad: waitForBalance } = useBalance();
  const canGenerate = computed(() => prompt.value.trim().length > 0);

  // The per-action credit price (docs/viral-flow.md §10): remove = 5,
  // colour change = 10, free edit = 10. The balance gate, the buy-credits
  // min/max params, and the server-side charge all key off this so a user
  // is never sent to buy too few credits for the action they picked.
  const action = computed<RenovationAction>(() =>
    useMaterialMode.value
      ? "applyMaterial"
      : usePaintMode.value
        ? "colorChange"
        : useSolidMask.value
          ? "remove"
          : "freePrompt",
  );
  const actionCredits = computed(() => ACTION_CREDITS[action.value]);

  // Synchronous re-entry guard for onGenerate. Awaiting the balance load
  // before flipping stage→"processing" otherwise allows two rapid clicks to
  // both pass the guards, upload the same composite, and create two impression
  // docs (and double-bill the user).
  let generateInFlight = false;

  function waitForCompletion(
    uid: string,
    renoId: string,
    impId: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const docRef = doc(
        db,
        "users",
        uid,
        "renovations",
        renoId,
        "impressions",
        impId,
      );
      const timer = setTimeout(() => {
        unsub();
        reject(new Error(t("newImpression.processingTimeout")));
      }, COMPLETION_TIMEOUT_MS);
      const unsub = onSnapshot(
        docRef,
        (snap) => {
          const data = snap.data();
          if (!data) return;
          if (data.status === "completed" && data.resultImagePath) {
            clearTimeout(timer);
            unsub();
            resolve(data.resultImagePath as string);
          } else if (data.status === "failed") {
            clearTimeout(timer);
            unsub();
            reject(
              new Error(
                (data.error as string | undefined) ??
                  t("newImpression.processingFailed"),
              ),
            );
          }
        },
        (err) => {
          clearTimeout(timer);
          unsub();
          reject(err);
        },
      );
    });
  }

  async function onGenerate() {
    // Synchronous guard — must come before any await so a double-click can't
    // get two invocations through to upload + createImpression.
    if (generateInFlight) return;
    if (!canGenerate.value) return;
    if (!isMaskReady()) {
      errorMessage.value = t("newImpression.maskNotReady");
      return;
    }
    generateInFlight = true;
    // The user committed to a generation. Counted before the balance gate so
    // the generate_click → paywall_view drop is measurable (measurement.md).
    track("generate_click");
    try {
      // Make sure we know the user's actual balance before deciding whether
      // to redirect to /buy-credits — otherwise the initial Firestore snapshot
      // race would bounce a user with funds straight to the purchase page.
      if (currentUser.value) await waitForBalance();
      if (!currentUser.value || balance.value < actionCredits.value) {
        // Persist the in-progress mask + prompt so the buy-credits / sign-in
        // detour leaves the wizard exactly where the user left off.
        await persistDraft();
        router.push({
          path: "/buy-credits",
          query: {
            min: String(actionCredits.value),
            max: String(actionCredits.value),
            redirect: route.fullPath,
          },
        });
        return;
      }

      errorMessage.value = null;
      stage.value = "processing";

      try {
        const uid = currentUser.value.uid;
        const ts = Date.now();
        const source = sourceParam.value!;

        let renovationId = renovationParam.value;
        let sourceImagePath: string;

        if (source === "photo" || source === "crop" || source === "share") {
          // Upload the IDB blob as the new renovation's original
          const sourceBlob = await getImpressionSource();
          if (!sourceBlob) throw new Error("Source image missing");
          const originalImagePath = `users/${uid}/originals/${ts}.webp`;
          await uploadBytes(storageRef(storage, originalImagePath), sourceBlob);
          renovationId = await createRenovation(uid, { originalImagePath });
          sourceImagePath = originalImagePath;
        } else if (source === "original") {
          if (!renovationId) throw new Error("Renovation ID missing");
          const snap = await getDoc(
            doc(db, "users", uid, "renovations", renovationId),
          );
          if (!snap.exists()) throw new Error("Renovation not found");
          sourceImagePath = snap.data().originalImagePath;
        } else {
          // impression
          if (!renovationId || !impressionParam.value) {
            throw new Error("Renovation/impression IDs missing");
          }
          const snap = await getDoc(
            doc(
              db,
              "users",
              uid,
              "renovations",
              renovationId,
              "impressions",
              impressionParam.value,
            ),
          );
          if (!snap.exists()) throw new Error("Source impression not found");
          const path = snap.data().resultImagePath;
          if (!path) throw new Error("Source impression has no result image");
          sourceImagePath = path;
        }

        const compositeImagePath = `users/${uid}/composites/${ts}.webp`;
        // Paint and the free-prompt flow mark the masked area with the magenta
        // checkerboard (50% coverage forces a full repaint while the geometry
        // stays readable between the squares); remove hides it under solid
        // magenta.
        const compositeBlob = await getCompositeBlob(
          useSolidMask.value ? "solid" : "checker",
        );
        await uploadBytes(
          storageRef(storage, compositeImagePath),
          compositeBlob,
        );

        // Apply-material: resolve the chosen material to a Storage path. A
        // registry pick already has one; a fresh upload is hash-deduped into the
        // user's materials registry (reusing the object if seen before).
        let materialImagePath: string | undefined;
        if (useMaterialMode.value) {
          if (materialPath.value) {
            materialImagePath = materialPath.value;
          } else {
            const materialBlob = await getMaterialSource();
            if (!materialBlob) throw new Error("Material image missing");
            materialImagePath = await getOrCreateMaterial(uid, materialBlob);
          }
        }

        const newImpressionId = await createImpression(uid, renovationId!, {
          sourceImagePath,
          compositeImagePath,
          prompt: prompt.value.trim(),
          action: action.value,
          ...(usePaintMode.value
            ? { paintColor: paintColor.value, mode: "paint" }
            : {}),
          ...(useMaterialMode.value
            ? { materialImagePath, mode: "material" }
            : {}),
        });

        const resultPath = await waitForCompletion(
          uid,
          renovationId!,
          newImpressionId,
        );

        // The generation completed and the result is about to be shown — the
        // funnel's wow moment and the start of the share decision.
        track("result_view");

        const resultUrl = await resolveStorageUrl(resultPath);
        const resultBlob = await fetch(resultUrl).then((r) => r.blob());
        await setImpressionSource(resultBlob);
        await clearPersistedDraft();

        router.replace({
          path: "/new-impression",
          query: {
            source: "impression",
            renovation: renovationId!,
            impression: newImpressionId,
          },
        });
      } catch (err) {
        // A failed first edit kills the viral loop — track it as a health
        // proxy (measurement.md). Fires for upload, Cloud Function, and
        // timeout failures alike.
        track("generate_fail");
        errorMessage.value =
          err instanceof Error ? err.message : t("newImpression.unknownError");
        // The Verwijderen / Schilder / material flows skip the free-prompt
        // screen, so on failure fall back to their own step instead: paint and
        // material return to their picker (keeping the selection), remove to
        // choose-action.
        stage.value = useMaterialMode.value
          ? "material"
          : usePaintMode.value
            ? "paint"
            : useSolidMask.value
              ? "choose-action"
              : "prompt";
      }
    } finally {
      generateInFlight = false;
    }
  }

  return { canGenerate, onGenerate };
}
