import { expect, test } from "@playwright/experimental-ct-vue";
import ShareDialog from "../src/components/ShareDialog.vue";

const SHARE_URL = "https://payasyougo.app/share/abcdef0123456789abcdef0123456789";

test.describe("ShareDialog", () => {
  test("renders the share URL when open", async ({ mount, page }) => {
    await mount(ShareDialog, {
      props: { open: true, url: SHARE_URL },
    });
    // The dialog element itself is the component root; its testid is on the
    // root so locate it via `page` rather than the mount-scoped wrapper.
    await expect(page.getByTestId("share-dialog")).toHaveCount(1);
    await expect(page.getByTestId("share-url")).toHaveValue(SHARE_URL);
  });

  test("Copy button writes the URL to the clipboard", async ({
    mount,
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    const component = await mount(ShareDialog, {
      props: { open: true, url: SHARE_URL },
    });
    await component.getByTestId("share-copy").click();

    // Label flips to "Copied" once the write succeeds
    await expect(component.getByText("Copied")).toBeVisible();

    const clipboardText = await page.evaluate(() =>
      navigator.clipboard.readText(),
    );
    expect(clipboardText).toBe(SHARE_URL);
  });

  test("emits close when Close is clicked", async ({ mount }) => {
    const closes: unknown[] = [];
    const component = await mount(ShareDialog, {
      props: { open: true, url: SHARE_URL },
      on: { close: (payload: unknown) => closes.push(payload) },
    });
    await component.getByRole("button", { name: "Close" }).click();
    expect(closes.length).toBe(1);
  });
});
