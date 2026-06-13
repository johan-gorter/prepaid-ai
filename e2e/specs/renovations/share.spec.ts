import { rmSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect, test } from "../../fixtures";
import {
  createRandomTestUser,
  createTestUser,
  signInTestUser,
  type TestUser,
} from "../../helpers/auth";
import { EMULATOR_URLS, PROJECT_ID } from "../../helpers/emulator-config";
import { createRenovationAndWaitForResult } from "../../helpers/renovation";
import {
  advanceToChooseAction,
  chooseFreePrompt,
  clickNextChange,
  fillPrompt,
  goToRenovationDetails,
  paintMask,
  waitForPreviewResult,
} from "../../helpers/wizard";

const TOKEN_RE = /\/share\/([0-9a-f]{32})$/;

interface ShareDocReadResult {
  exists: boolean;
  fields?: Record<string, unknown>;
}

async function readShareDoc(token: string): Promise<ShareDocReadResult> {
  const res = await fetch(
    `${EMULATOR_URLS.firestore}/v1/projects/${PROJECT_ID}/databases/(default)/documents/shares/${token}`,
    { headers: { Authorization: "Bearer owner" } },
  );
  if (res.status === 404) return { exists: false };
  if (!res.ok) throw new Error(`unexpected status ${res.status}`);
  const body = (await res.json()) as { fields?: Record<string, unknown> };
  return { exists: true, fields: body.fields };
}

/**
 * Drive the creator wizard end-to-end and surface the share URL + token.
 */
async function makeShare(
  page: Page,
  promptText: string,
): Promise<{ shareUrl: string; token: string; grayPngPath: string }> {
  const { grayPngPath } = await createRenovationAndWaitForResult(
    page,
    promptText,
  );
  await page.waitForURL(/\/new-impression\?source=impression&/);
  await page.getByTestId("share-button").click();
  const shareInput = page.getByTestId("share-url");
  await expect(shareInput).toHaveValue(TOKEN_RE);
  const shareUrl = await shareInput.inputValue();
  const token = shareUrl.match(TOKEN_RE)![1];
  await page.getByRole("button", { name: "Close" }).click();
  return { shareUrl, token, grayPngPath };
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
      await expect(page.getByTestId("share-button")).toBeVisible();

      // First Share click opens dialog with a token URL
      await page.getByTestId("share-button").click();
      await expect(page.getByTestId("share-dialog")).toBeVisible();
      const shareInput = page.getByTestId("share-url");
      await expect(shareInput).toHaveValue(TOKEN_RE);
      const url1 = await shareInput.inputValue();
      expect(url1).toMatch(TOKEN_RE);
      const token1 = url1.match(TOKEN_RE)![1];
      expect(url1).toBe(`${new URL(page.url()).origin}/share/${token1}`);

      // Share doc exists in Firestore
      const docInitial = await readShareDoc(token1);
      expect(docInitial.exists).toBe(true);
      expect(docInitial.fields).toMatchObject({
        ownerUid: expect.any(Object),
        resultImageUrl: expect.any(Object),
        createdAt: expect.any(Object),
      });

      // Close, reopen — same token (createOrGetShareToken returns the
      // cached value off the impression doc).
      await page.getByRole("button", { name: "Close" }).click();
      await page.getByTestId("share-button").click();
      const url2 = await shareInput.inputValue();
      expect(url2).toBe(url1);

      // And a third click — still the same. The share doc is never
      // duplicated regardless of how many times Share is clicked.
      await page.getByRole("button", { name: "Close" }).click();
      await page.getByTestId("share-button").click();
      const url3 = await shareInput.inputValue();
      expect(url3).toBe(url1);
    } finally {
      rmSync(grayPngPath, { force: true });
    }
  });

  test("anonymous recipient sees the shared image, no Share/Trash, and is redirected on Generate", async ({
    authenticatedPage: creatorPage,
    browser,
  }) => {
    const { shareUrl, token, grayPngPath } = await makeShare(
      creatorPage,
      "share recipient flow",
    );

    try {
      const anonContext = await browser.newContext();
      try {
        const anonPage = await anonContext.newPage();
        await anonPage.goto(shareUrl);

        // Lands on the wizard preview stage with the shared image visible.
        await expect(anonPage.getByAltText("Result")).toBeVisible({
          timeout: 15_000,
        });
        await expect(
          anonPage.getByRole("button", { name: "Next Change" }),
        ).toBeVisible();

        // Owner-only affordances are hidden for the recipient.
        await expect(
          anonPage.getByRole("button", { name: "Trash" }),
        ).toHaveCount(0);
        await expect(anonPage.getByTestId("share-button")).toHaveCount(0);

        // Next Change → mask stage
        await clickNextChange(anonPage);

        // Paint a mask, advance to prompt, type, hit Generate
        await paintMask(anonPage);
        await advanceToChooseAction(anonPage);
        await chooseFreePrompt(anonPage);
        await fillPrompt(anonPage, "my own change");
        await anonPage.getByRole("button", { name: "Generate" }).click();

        // Anonymous → redirected through buy-credits (existing flow). The
        // redirect query points back at the share URL.
        await anonPage.waitForURL(/\/buy-credits\?/);
        const url = new URL(anonPage.url());
        expect(url.searchParams.get("redirect")).toBe(`/share/${token}`);
      } finally {
        await anonContext.close();
      }
    } finally {
      rmSync(grayPngPath, { force: true });
    }
  });

  test("invalid share token shows the share-unavailable error card", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();
      await page.goto("/share/deadbeefdeadbeefdeadbeefdeadbeef");
      const errorCard = page.getByTestId("share-error");
      await expect(errorCard).toBeVisible();
      await expect(errorCard).toContainText("Share unavailable");
      await expect(errorCard).toContainText("no longer available");

      // No preview footer renders in the error state — the recipient only
      // sees the error card and the Go home link.
      await expect(
        page.getByRole("button", { name: "Next Change" }),
      ).toHaveCount(0);

      const homeLink = page.getByTestId("share-error-home");
      await expect(homeLink).toBeVisible();
      await homeLink.click();
      await page.waitForURL(/\/$/);
    } finally {
      await ctx.close();
    }
  });

  test("recipient opening the URL after the owner deletes the impression sees the neat error", async ({
    authenticatedPage: creatorPage,
    browser,
  }) => {
    const { shareUrl, token, grayPngPath } = await makeShare(
      creatorPage,
      "delete after share",
    );

    try {
      // Owner trashes the impression — this should cascade into the share
      // doc being removed so future visits to the URL 404 cleanly.
      await creatorPage.getByRole("button", { name: "Trash" }).click();
      await creatorPage.waitForURL(/\/renovation\/[a-zA-Z0-9]+$/);

      await expect
        .poll(async () => (await readShareDoc(token)).exists, {
          timeout: 5_000,
        })
        .toBe(false);

      // Recipient now opens the link in a fresh anonymous context.
      const anonContext = await browser.newContext();
      try {
        const anonPage = await anonContext.newPage();
        await anonPage.goto(shareUrl);

        const errorCard = anonPage.getByTestId("share-error");
        await expect(errorCard).toBeVisible();
        await expect(errorCard).toContainText("Share unavailable");
        await expect(errorCard).toContainText(
          "The owner may have deleted the impression",
        );

        // No half-broken wizard chrome behind the error.
        await expect(anonPage.locator("canvas")).toHaveCount(0);
        await expect(
          anonPage.getByRole("button", { name: "Next Change" }),
        ).toHaveCount(0);

        // Functional "Go home" affordance routes back to the landing page.
        await anonPage.getByTestId("share-error-home").click();
        await anonPage.waitForURL(/\/$/);
      } finally {
        await anonContext.close();
      }
    } finally {
      rmSync(grayPngPath, { force: true });
    }
  });

  test("deleting the whole renovation cleans up share docs for its impressions", async ({
    authenticatedPage: page,
  }) => {
    const { token, grayPngPath } = await makeShare(
      page,
      "share then delete renovation",
    );

    try {
      expect((await readShareDoc(token)).exists).toBe(true);

      // Navigate to the renovation timeline so the original image is in
      // view, then delete the renovation via the wizard's source=original
      // Trash flow (which uses confirm() — accept the dialog).
      await goToRenovationDetails(page);
      await page.getByAltText("Original").click();
      await page.waitForURL(/\/new-impression\?source=original&renovation=/);

      page.once("dialog", (d) => void d.accept());
      await page.getByRole("button", { name: "Trash" }).click();
      await page.waitForURL(/\/renovations$/);

      // The share doc for every impression of that renovation is gone.
      await expect
        .poll(async () => (await readShareDoc(token)).exists, {
          timeout: 5_000,
        })
        .toBe(false);
    } finally {
      rmSync(grayPngPath, { force: true });
    }
  });

  test("signed-in recipient with credits can generate a new renovation from a share", async ({
    authenticatedPage: creatorPage,
    browser,
  }) => {
    test.slow(); // Recipient runs the Cloud Function to generate
    const { shareUrl, grayPngPath } = await makeShare(
      creatorPage,
      "recipient generates",
    );

    let recipientUser: TestUser | null = null;
    try {
      // Spin up a second signed-in user in a fresh context so the share
      // recipient acts independently of the creator's auth state. The
      // fixture's seeded INITIAL_BALANCE covers the impression cost.
      recipientUser = await createTestUser(createRandomTestUser());

      const recipientContext = await browser.newContext();
      try {
        const recipientPage = await recipientContext.newPage();

        // Load the SDK on /login so __testSignIn is available, then sign in.
        await recipientPage.goto("/login");
        await signInTestUser(recipientPage, recipientUser);
        await recipientPage.waitForFunction(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          () =>
            (window as any)
              .__testAuthReady?.()
              .then((uid: string | null) => uid != null),
        );

        // Open the share link as the signed-in recipient.
        await recipientPage.goto(shareUrl);
        await expect(recipientPage.getByAltText("Result")).toBeVisible({
          timeout: 15_000,
        });

        // Next Change → paint → prompt → Generate (Cloud Function runs).
        await clickNextChange(recipientPage);
        await paintMask(recipientPage);
        await advanceToChooseAction(recipientPage);
        await chooseFreePrompt(recipientPage);
        await fillPrompt(recipientPage, "recipient remix from share");
        await recipientPage.getByRole("button", { name: "Generate" }).click();

        // Lands on the preview stage of a brand-new renovation owned by
        // the recipient, with a generated result image. The URL change is
        // the Cloud-Function-gated wait; the result image after it only
        // needs the default timeout.
        await recipientPage.waitForURL(
          /\/new-impression\?source=impression&renovation=[a-zA-Z0-9]+&impression=[a-zA-Z0-9]+/,
          { timeout: 60_000 },
        );
        await expect(recipientPage.getByAltText("Result")).toBeVisible();
        // The recipient is now an owner of the new impression — Share
        // button is available to them too.
        await expect(
          recipientPage.getByTestId("share-button"),
        ).toBeVisible();
      } finally {
        await recipientContext.close();
      }
    } finally {
      rmSync(grayPngPath, { force: true });
    }
  });
});
