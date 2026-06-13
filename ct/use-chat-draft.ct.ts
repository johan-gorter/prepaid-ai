import { expect, test } from "@playwright/experimental-ct-vue";
import ChatDraftHarness from "./helpers/ChatDraftHarness.vue";

// `useChatDraft` is the twin of `useImpressionDraft` (#94) — the chat half of
// the sign-in / buy-credits detour invariant (docs/viral-flow.md §1). It
// persists the conversation to IndexedDB, so it is driven here through a mounted
// harness component (CT test bodies run in Node, which has no IndexedDB).

test.describe("useChatDraft", () => {
  test("persist writes messages + input + maxCredits (Proxy survives structured clone)", async ({
    mount,
  }) => {
    const c = await mount(ChatDraftHarness);
    await c.getByTestId("btn-persist").click();

    await expect(c.getByTestId("idb-input")).toHaveText("hello");
    await expect(c.getByTestId("idb-maxcredits")).toHaveText("20");
    await expect(c.getByTestId("idb-msgcount")).toHaveText("2");
  });

  test("restore fills empty refs from a persisted draft", async ({ mount }) => {
    const c = await mount(ChatDraftHarness);
    await c.getByTestId("btn-restore-empty").click();

    await expect(c.getByTestId("input-val")).toHaveText("restored input");
    await expect(c.getByTestId("maxcredits-val")).toHaveText("9");
    await expect(c.getByTestId("msg-count")).toHaveText("1");
  });

  test("restore does not clobber input the user already typed", async ({
    mount,
  }) => {
    const c = await mount(ChatDraftHarness);
    await c.getByTestId("btn-restore-noclobber").click();

    // Existing input and messages are preserved; only the credit limit (which
    // has no fast-typer race) is taken from the draft.
    await expect(c.getByTestId("input-val")).toHaveText("typed");
    await expect(c.getByTestId("msg-count")).toHaveText("1");
    await expect(c.getByTestId("maxcredits-val")).toHaveText("30");
  });

  test("input edits persist at rest", async ({ mount }) => {
    const c = await mount(ChatDraftHarness);
    await c.getByTestId("btn-edit-input").click();

    await expect(c.getByTestId("idb-input")).toHaveText("edited");
  });

  test("edits while streaming are not persisted", async ({ mount }) => {
    const c = await mount(ChatDraftHarness);
    await c.getByTestId("btn-edit-streaming").click();

    // The mid-stream edit must not reach IDB — the last at-rest value stands.
    await expect(c.getByTestId("idb-input")).toHaveText("before stream");
    await expect(c.getByTestId("input-val")).toHaveText("during stream");
  });

  test("stream end persists the final conversation exactly once", async ({
    mount,
  }) => {
    const c = await mount(ChatDraftHarness);
    await c.getByTestId("btn-stream-end").click();

    await expect(c.getByTestId("idb-input")).toHaveText("post stream");
    await expect(c.getByTestId("idb-msgcount")).toHaveText("2");
  });
});
