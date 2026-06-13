import { expect, test } from "@playwright/experimental-ct-vue";
import ImpressionDraftHarness from "./helpers/ImpressionDraftHarness.vue";

// `useImpressionDraft` is the subtle code protecting the sign-in / buy-credits
// detour (docs/viral-flow.md invariant 1). It depends on the IndexedDB-backed
// impression store, so it is driven here through a mounted harness component
// (CT test bodies run in Node, which has no IndexedDB).

test.describe("useImpressionDraft", () => {
  test("persistDraft writes prompt + paint intent + mask and records the key", async ({
    mount,
  }) => {
    const c = await mount(ImpressionDraftHarness);
    await c.getByTestId("btn-persist").click();

    await expect(c.getByTestId("idb-prompt")).toHaveText("make it blue");
    await expect(c.getByTestId("idb-paint")).toHaveText("#213529");
    await expect(c.getByTestId("restored-key")).toHaveText("photo||");
    await expect(c.getByTestId("idb-has-mask")).toHaveText("yes");
  });

  test("applyDraftIfMatching restores a matching draft and its mask", async ({
    mount,
  }) => {
    const c = await mount(ImpressionDraftHarness);
    await c.getByTestId("btn-apply-match").click();

    await expect(c.getByTestId("match-result")).toHaveText("true");
    await expect(c.getByTestId("prompt")).toHaveText("restored prompt");
    await expect(c.getByTestId("solid-mask")).toHaveText("true");
    await expect(c.getByTestId("paint-mode")).toHaveText("true");
    await expect(c.getByTestId("paint-color")).toHaveText("#0A0A0A");
    await expect(c.getByTestId("initial-mask")).toHaveText("yes");
    await expect(c.getByTestId("restored-key")).toHaveText("photo||");
  });

  test("applyDraftIfMatching ignores a draft from a different context", async ({
    mount,
  }) => {
    const c = await mount(ImpressionDraftHarness);
    await c.getByTestId("btn-apply-mismatch").click();

    await expect(c.getByTestId("match-result")).toHaveText("false");
    await expect(c.getByTestId("prompt")).toHaveText("");
    await expect(c.getByTestId("restored-key")).toHaveText("null");
  });

  test("clearPersistedDraft removes the draft + mask and resets the flags", async ({
    mount,
  }) => {
    const c = await mount(ImpressionDraftHarness);
    await c.getByTestId("btn-persist-clear").click();

    await expect(c.getByTestId("idb-null")).toHaveText("yes");
    await expect(c.getByTestId("idb-has-mask")).toHaveText("no");
    await expect(c.getByTestId("paint-mode")).toHaveText("false");
    await expect(c.getByTestId("solid-mask")).toHaveText("false");
    await expect(c.getByTestId("restored-key")).toHaveText("null");
  });

  test("prompt edits persist once a draft key is established for the context", async ({
    mount,
  }) => {
    const c = await mount(ImpressionDraftHarness);
    await c.getByTestId("btn-persist").click();
    await expect(c.getByTestId("restored-key")).toHaveText("photo||");

    await c.getByTestId("btn-edit-prompt").click();
    await expect(c.getByTestId("idb-prompt")).toHaveText(
      "edited after establish",
    );
  });
});
