/**
 * Credit-gift transfer flow across two real accounts.
 *
 * Each test creates a fresh sender + recipient in the Auth emulator and signs
 * them into separate browser contexts, so we can drive both sides of the
 * notification handshake: sender escrows credits, recipient sees the gift
 * notification popup and accepts/declines, and balances reconcile.
 */
import { test, type Browser, type Page } from "@playwright/test";
import { expect } from "../../fixtures";
import {
  createRandomTestUser,
  createTestUser,
  signInTestUser,
  type TestUser,
} from "../../helpers/auth";

const INITIAL_BALANCE = 100;

/** Create a fresh emulator user, sign them in on a new context, and land on a page. */
async function signedInPage(
  browser: Browser,
  user: TestUser,
): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/login");
  await signInTestUser(page, user);
  await page.waitForFunction(() =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any)
      .__testAuthReady?.()
      .then((uid: string | null) => uid != null),
  );
  return page;
}

async function readBalance(page: Page): Promise<number> {
  await page.goto("/balance");
  const text = await page.getByTestId("balance-amount").textContent();
  return Number((text ?? "").replace(/[^\d]/g, ""));
}

test.describe("Send credits (two accounts)", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "chromium only");
  });

  // Callable cold start + cross-context realtime listener can be slow.
  test.slow();

  test("recipient accepts a gift: credits move and balances reconcile", async ({
    browser,
  }) => {
    const sender = await createTestUser(createRandomTestUser());
    const recipient = await createTestUser(createRandomTestUser());
    const amount = 30;

    const senderPage = await signedInPage(browser, sender);
    const recipientPage = await signedInPage(browser, recipient);

    // Recipient is parked on the balance page, listening for notifications.
    await recipientPage.goto("/balance");
    await expect(recipientPage.getByTestId("balance-amount")).toContainText(
      `${INITIAL_BALANCE} credits`,
    );

    // Sender gifts credits.
    await senderPage.goto("/send-credits");
    await senderPage.getByTestId("send-email").fill(recipient.email);
    await senderPage.getByTestId("send-amount").fill(String(amount));
    await senderPage.getByTestId("send-submit").click();
    await expect(senderPage.getByText("Gift on its way")).toBeVisible();

    // Sender is debited immediately (escrow).
    expect(await readBalance(senderPage)).toBe(INITIAL_BALANCE - amount);

    // Recipient sees the gift popup and accepts.
    const modal = recipientPage.getByTestId("notification-modal");
    await expect(modal).toBeVisible();
    await expect(recipientPage.getByTestId("notification-gift")).toContainText(
      `${amount} credits`,
    );
    await recipientPage.getByTestId("notification-accept").click();

    // Popup clears and the recipient is credited.
    await expect(modal).toBeHidden();
    expect(await readBalance(recipientPage)).toBe(INITIAL_BALANCE + amount);
  });

  test("recipient declines a gift: sender is refunded", async ({ browser }) => {
    const sender = await createTestUser(createRandomTestUser());
    const recipient = await createTestUser(createRandomTestUser());
    const amount = 25;

    const senderPage = await signedInPage(browser, sender);
    const recipientPage = await signedInPage(browser, recipient);

    await recipientPage.goto("/balance");
    await expect(recipientPage.getByTestId("balance-amount")).toContainText(
      `${INITIAL_BALANCE} credits`,
    );

    await senderPage.goto("/send-credits");
    await senderPage.getByTestId("send-email").fill(recipient.email);
    await senderPage.getByTestId("send-amount").fill(String(amount));
    await senderPage.getByTestId("send-submit").click();
    await expect(senderPage.getByText("Gift on its way")).toBeVisible();

    expect(await readBalance(senderPage)).toBe(INITIAL_BALANCE - amount);

    const modal = recipientPage.getByTestId("notification-modal");
    await expect(modal).toBeVisible();
    await recipientPage.getByTestId("notification-decline").click();
    await expect(modal).toBeHidden();

    // Recipient unchanged, sender refunded back to the start.
    expect(await readBalance(recipientPage)).toBe(INITIAL_BALANCE);
    expect(await readBalance(senderPage)).toBe(INITIAL_BALANCE);
  });

  test("cannot gift to your own email", async ({ browser }) => {
    const sender = await createTestUser(createRandomTestUser());
    const senderPage = await signedInPage(browser, sender);

    await senderPage.goto("/send-credits");
    await senderPage.getByTestId("send-email").fill(sender.email);
    await senderPage.getByTestId("send-amount").fill("10");
    await senderPage.getByTestId("send-submit").click();

    await expect(senderPage.getByTestId("send-error")).toContainText(
      /yourself/i,
    );
    // Balance untouched.
    expect(await readBalance(senderPage)).toBe(INITIAL_BALANCE);
  });
});
