import { rmSync } from "node:fs";
import { expect, test } from "../../fixtures";
import { EMULATOR_URLS, PROJECT_ID } from "../../helpers/emulator-config";
import {
  createRenovationAndWaitForResult,
  drawMaskStroke,
} from "../../helpers/renovation";

const TOKEN_RE = /\/share\/([0-9a-f]{32})$/;

async function readShareDoc(
  token: string,
): Promise<{ exists: boolean; fields?: Record<string, unknown> }> {
  const res = await fetch(
    `${EMULATOR_URLS.firestore}/v1/projects/${PROJECT_ID}/databases/(default)/documents/shares/${token}`,
    { headers: { Authorization: "Bearer owner" } },
  );
  if (res.status === 404) return { exists: false };
  if (!res.ok) throw new Error(`unexpected status ${res.status}`);
  const body = (await res.json()) as { fields?: Record<string, unknown> };
  return { exists: true, fields: body.fields };
}

test.describe("Share impression", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "chromium only");
  });

  test("creator can open the Share dialog with a stable token", async ({
    authenticatedPage: page,
  }) => {
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "share me",
    );

    try {
      await page.waitForURL(/\/new-impression\?source=impression&/);
      await expect(
        page.getByTestId("share-button"),
      ).toBeVisible();

      // First Share click opens dialog with a token URL
      await page.getByTestId("share-button").click();
      await expect(page.getByTestId("share-dialog")).toBeVisible();
      const url1 = await page.getByTestId("share-url").inputValue();
      expect(url1).toMatch(TOKEN_RE);
      const token1 = url1.match(TOKEN_RE)![1];

      // Share doc exists in Firestore
      const doc = await readShareDoc(token1);
      expect(doc.exists).toBe(true);

      // Close, reopen — same token
      await page.getByRole("button", { name: "Close" }).click();
      await page.getByTestId("share-button").click();
      const url2 = await page.getByTestId("share-url").inputValue();
      expect(url2).toBe(url1);
    } finally {
      rmSync(grayPngPath, { force: true });
    }
  });

  test("anonymous recipient sees the shared image and is redirected on Generate", async ({
    authenticatedPage: creatorPage,
    browser,
  }) => {
    const { grayPngPath } = await createRenovationAndWaitForResult(
      creatorPage,
      "share recipient flow",
    );

    let shareUrl: string;
    let token: string;
    try {
      await creatorPage.getByTestId("share-button").click();
      const shareInput = creatorPage.getByTestId("share-url");
      await expect(shareInput).toHaveValue(TOKEN_RE);
      shareUrl = await shareInput.inputValue();
      token = shareUrl.match(TOKEN_RE)![1];
    } finally {
      rmSync(grayPngPath, { force: true });
    }

    // Open the share URL in a fresh, unauthenticated context
    const anonContext = await browser.newContext();
    try {
      const anonPage = await anonContext.newPage();
      await anonPage.goto(shareUrl);

      // Lands on the wizard preview stage with the shared image visible
      await expect(anonPage.getByAltText("Result")).toBeVisible({
        timeout: 15_000,
      });
      await expect(
        anonPage.getByRole("button", { name: "Next Change" }),
      ).toBeVisible();

      // Trash button is hidden for anonymous recipients
      await expect(
        anonPage.getByRole("button", { name: "Trash" }),
      ).toHaveCount(0);

      // Next Change → mask stage
      await anonPage.getByRole("button", { name: "Next Change" }).click();
      await expect(
        anonPage.getByText("Paint the area you want to change"),
      ).toBeVisible();

      // Paint a mask, advance to prompt, type, hit Generate
      await drawMaskStroke(anonPage);
      await anonPage.getByRole("button", { name: "Next" }).click();
      await anonPage.getByTestId("prompt").fill("my own change");
      await anonPage.getByRole("button", { name: "Generate" }).click();

      // Anonymous → redirected through buy-credits (existing flow). The
      // redirect query points back at the share URL.
      await anonPage.waitForURL(/\/buy-credits\?/);
      const url = new URL(anonPage.url());
      expect(url.searchParams.get("redirect")).toBe(`/share/${token}`);
    } finally {
      await anonContext.close();
    }
  });

  test("invalid share token shows not-found state", async ({ browser }) => {
    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();
      await page.goto("/share/deadbeefdeadbeefdeadbeefdeadbeef");
      await expect(page.getByText("Share link not found.")).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test("deleting the impression removes the share doc", async ({
    authenticatedPage: page,
  }) => {
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "share then delete",
    );

    try {
      await page.getByTestId("share-button").click();
      const shareInput = page.getByTestId("share-url");
      await expect(shareInput).toHaveValue(TOKEN_RE);
      const shareUrl = await shareInput.inputValue();
      const token = shareUrl.match(TOKEN_RE)![1];
      await page.getByRole("button", { name: "Close" }).click();

      expect((await readShareDoc(token)).exists).toBe(true);

      // Trash the impression
      await page.getByRole("button", { name: "Trash" }).click();
      await page.waitForURL(/\/renovation\/[a-zA-Z0-9]+$/);

      // Share doc gone — give Firestore a moment to settle
      await expect
        .poll(async () => (await readShareDoc(token)).exists, {
          timeout: 5_000,
        })
        .toBe(false);
    } finally {
      rmSync(grayPngPath, { force: true });
    }
  });
});
