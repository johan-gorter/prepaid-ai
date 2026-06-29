/**
 * Draft persistence for the impression wizard.
 *
 * This is the subtle code protecting the sign-in / buy-credits detour
 * (docs/viral-flow.md invariant 1): when a guest hits Generate we stash their
 * prompt + mask + paint/remove intent in IndexedDB, send them through login or
 * Stripe, then restore everything on return so they land exactly where they
 * left off. Isolated here (with CT coverage) so the wizard's stage machine
 * stays readable and this never regresses by accident.
 */

import { ref, watch, type ComputedRef, type Ref } from "vue";
import {
  clearImpressionDraft,
  clearImpressionMask,
  getImpressionMask,
  setImpressionDraft,
  setImpressionMask,
  type ImpressionDraft,
} from "./useImpressionStore";
import type { Source } from "../views/renovation/wizard/wizardTypes";
import type { ReferenceKind } from "../data/referenceImageRepo";

interface MaskBlobSource {
  getMaskBlob: () => Promise<Blob | null>;
}

export interface ImpressionDraftContext {
  prompt: Ref<string>;
  sourceParam: ComputedRef<Source | undefined>;
  renovationParam: ComputedRef<string | null>;
  impressionParam: ComputedRef<string | null>;
  useSolidMask: Ref<boolean>;
  usePaintMode: Ref<boolean>;
  paintColor: Ref<string>;
  /** The active reference-image action ("material" / "furniture"), or null. */
  referenceKind: Ref<ReferenceKind | null>;
  /** Storage path of a chosen registry reference, when one is selected. */
  referencePath: Ref<string | null>;
  initialMask: Ref<Blob | null>;
  maskingRef: Ref<MaskBlobSource | null>;
}

export function useImpressionDraft(ctx: ImpressionDraftContext) {
  const {
    prompt,
    sourceParam,
    renovationParam,
    impressionParam,
    useSolidMask,
    usePaintMode,
    paintColor,
    referenceKind,
    referencePath,
    initialMask,
    maskingRef,
  } = ctx;

  // Identifies which wizard context a persisted draft belongs to. The prompt
  // watcher and the restore gate compare against this so a stale draft from a
  // different renovation can never leak across flows.
  const restoredDraftKey = ref<string | null>(null);

  function draftKey(): string {
    return `${sourceParam.value ?? ""}|${renovationParam.value ?? ""}|${
      impressionParam.value ?? ""
    }`;
  }

  function buildDraft(): ImpressionDraft {
    return {
      prompt: prompt.value,
      source: sourceParam.value,
      renovation: renovationParam.value,
      impression: impressionParam.value,
      solidMask: useSolidMask.value,
      paintColor: usePaintMode.value ? paintColor.value : undefined,
      referenceKind: referenceKind.value ?? undefined,
      referencePath:
        referenceKind.value && referencePath.value
          ? referencePath.value
          : undefined,
    };
  }

  async function persistDraft(): Promise<void> {
    await setImpressionDraft(buildDraft());
    restoredDraftKey.value = draftKey();
    if (maskingRef.value) {
      const maskBlob = await maskingRef.value.getMaskBlob();
      if (maskBlob) await setImpressionMask(maskBlob);
    }
  }

  async function clearPersistedDraft(): Promise<void> {
    await Promise.all([clearImpressionDraft(), clearImpressionMask()]);
    restoredDraftKey.value = null;
    useSolidMask.value = false;
    usePaintMode.value = false;
    referenceKind.value = null;
    referencePath.value = null;
  }

  /**
   * Apply a previously persisted draft to the wizard refs, but only when it
   * matches the current source / renovation / impression context. Returns
   * whether it matched so the caller can decide which stage to resume on.
   * Resets `restoredDraftKey` to null when there is no match so a subsequent
   * prompt edit is not mistaken for a draft-backed change.
   */
  async function applyDraftIfMatching(
    draft: ImpressionDraft | null | undefined,
  ): Promise<boolean> {
    const matches =
      !!draft &&
      (draft.source ?? "") === sourceParam.value &&
      (draft.renovation ?? null) === renovationParam.value &&
      (draft.impression ?? null) === impressionParam.value;
    if (matches && draft) {
      prompt.value = draft.prompt;
      useSolidMask.value = draft.solidMask === true;
      if (draft.paintColor) {
        usePaintMode.value = true;
        paintColor.value = draft.paintColor;
      }
      if (draft.referenceKind) {
        referenceKind.value = draft.referenceKind;
        referencePath.value = draft.referencePath ?? null;
      }
      initialMask.value = await getImpressionMask();
      restoredDraftKey.value = draftKey();
      return true;
    }
    restoredDraftKey.value = null;
    return false;
  }

  watch(prompt, async (val) => {
    // Persist prompt edits whenever a draft has been established for this
    // wizard context, so a sign-in detour preserves what the user typed.
    if (restoredDraftKey.value === draftKey() && sourceParam.value) {
      await setImpressionDraft({ ...buildDraft(), prompt: val });
    }
  });

  return {
    restoredDraftKey,
    draftKey,
    persistDraft,
    clearPersistedDraft,
    applyDraftIfMatching,
  };
}
