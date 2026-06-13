/**
 * Hydrates the wizard from a public `/share/:token` link.
 *
 * The `source === "share"` branch of the wizard's route init: fetch the public
 * share doc, drop any stale impression state left over from a previous device
 * session, pull the result image into the impression source, and land on the
 * preview stage. From there the recipient can Next Change → paint / prompt /
 * Generate like any other source. Kept separate so the wizard's normal-source
 * init path stays uncluttered.
 */

import { type Ref } from "vue";
import { useI18n } from "vue-i18n";
import {
  clearImpressionDraft,
  clearImpressionMask,
  clearImpressionSource,
  setImpressionSource,
} from "./useImpressionStore";
import { fetchShare } from "./useShare";
import type { Stage } from "../views/renovation/wizard/wizardTypes";

export interface ShareHydrationContext {
  sourceObjectUrl: Ref<string | null>;
  shareError: Ref<string | null>;
  stage: Ref<Stage>;
}

export function useShareHydration(ctx: ShareHydrationContext) {
  const { sourceObjectUrl, shareError, stage } = ctx;
  const { t } = useI18n();

  async function hydrateShare(token: string | undefined): Promise<void> {
    if (!token) return;
    const share = await fetchShare(token);
    if (!share) {
      shareError.value = t("newImpression.shareLinkUnavailable");
      return;
    }
    await Promise.all([
      clearImpressionSource(),
      clearImpressionMask(),
      clearImpressionDraft(),
    ]);
    let blob: Blob;
    try {
      const res = await fetch(share.resultImageUrl);
      if (!res.ok) throw new Error(`status ${res.status}`);
      blob = await res.blob();
    } catch {
      shareError.value = t("newImpression.shareImageUnavailable");
      return;
    }
    await setImpressionSource(blob);
    sourceObjectUrl.value = URL.createObjectURL(blob);
    stage.value = "preview";
  }

  return { hydrateShare };
}
