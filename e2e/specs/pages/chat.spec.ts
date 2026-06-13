import { test as baseTest, expect as baseExpect } from "@playwright/test";
import { createRandomTestUser, createTestUser } from "../../helpers/auth";
import { expect, test } from "../../fixtures";

test.describe("PrivateChatPage", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "chromium only");
  });

  test("shows chat page with empty state", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/chat");
    await expect(page.getByTestId("chat-empty-state")).toBeVisible();
  });

  test("shows chat input and send button", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/chat");
    await expect(page.getByTestId("chat-input")).toBeVisible();
    await expect(page.getByTestId("chat-send")).toBeVisible();
  });

  test("uses document scrolling for overflowing chat content", async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/chat");
    await expect(page.getByTestId("chat-input")).toBeVisible();

    const layout = await page.evaluate(() => {
      const root = document.documentElement;
      const chatMessages =
        document.querySelector<HTMLElement>(".chat-messages");
      const filler = document.createElement("div");
      filler.dataset.testid = "chat-scroll-filler";
      filler.style.height = "1200px";
      chatMessages?.append(filler);
      window.scrollTo({ top: root.scrollHeight });
      return {
        documentScrollHeight: root.scrollHeight,
        documentClientHeight: root.clientHeight,
        documentScrollTop: root.scrollTop,
        messageScrollTop: chatMessages?.scrollTop ?? null,
        messageOverflowY: chatMessages
          ? getComputedStyle(chatMessages).overflowY
          : null,
      };
    });

    expect(layout.messageOverflowY).toBe("visible");
    expect(layout.documentScrollHeight).toBeGreaterThan(
      layout.documentClientHeight,
    );
    expect(layout.documentScrollTop).toBeGreaterThan(0);
    expect(layout.messageScrollTop).toBe(0);
  });

  test("adds keyboard inset as document scroll runway", async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/chat");
    await expect(page.getByTestId("chat-input")).toBeVisible();

    const layout = await page.evaluate(async () => {
      document.documentElement.style.setProperty("--kb-inset", "300px");
      await new Promise((resolve) => window.setTimeout(resolve, 180));
      const root = document.documentElement;
      const app = document.querySelector<HTMLElement>("#app");
      const chatPage = document.querySelector<HTMLElement>(".chat-page");
      const input = document.querySelector<HTMLElement>(
        "[data-testid='chat-input']",
      );
      window.scrollTo({ top: root.scrollHeight });
      const inputRect = input?.getBoundingClientRect();
      return {
        appPaddingBottom: app ? getComputedStyle(app).paddingBottom : null,
        chatMinHeight: chatPage ? getComputedStyle(chatPage).minHeight : null,
        documentScrollHeight: root.scrollHeight,
        documentClientHeight: root.clientHeight,
        documentScrollTop: root.scrollTop,
        inputBottom: inputRect?.bottom ?? null,
        visibleBottom: root.clientHeight - 300,
      };
    });

    expect(layout.appPaddingBottom).toBe("300px");
    expect(layout.chatMinHeight).toBe("844px");
    expect(layout.documentScrollHeight).toBeGreaterThanOrEqual(
      layout.documentClientHeight + 300,
    );
    expect(layout.documentScrollTop).toBeGreaterThan(0);
    expect(layout.inputBottom).toBeLessThanOrEqual(layout.visibleBottom);
  });

  test("send button disabled when input empty", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/chat");
    await expect(page.getByTestId("chat-send")).toBeDisabled();
  });

  test("shows balance display in header", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/chat");
    await expect(page.getByTestId("header-balance")).toBeVisible();
  });

  test("can send a message and receive response", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/chat");

    const message = "Hello from Playwright";
    await page.getByTestId("chat-input").fill(message);
    await page.getByTestId("chat-send").click();

    await expect(page.getByText("[dummy] Echo:")).toBeVisible({
      timeout: 15000,
    });

    // After response completes, result footer shows with Continue Chat button
    await page.getByTestId("chat-continue").click();
    await expect(page.getByTestId("chat-estimate")).toBeVisible();
  });

  test("shows max credits input", async ({ authenticatedPage: page }) => {
    await page.goto("/chat");
    await expect(page.getByTestId("max-credits")).toBeVisible();
  });
});

baseTest.describe("PrivateChatPage anonymous → buy → login flow", () => {
  baseTest.beforeEach(async ({}, testInfo) => {
    baseTest.skip(testInfo.project.name !== "chromium", "chromium only");
  });

  baseTest(
    "restores chat prompt after anonymous send → buy credits → login round-trip",
    async ({ page }) => {
      // Pre-create the user server-side (parallel-safe). The user signs in
      // mid-test, simulating an anonymous → authenticated transition.
      const user = await createTestUser(createRandomTestUser());

      const prompt = "Investigate the perfect kitchen renovation strategy";

      // 1. Anonymous user lands on /chat and types a prompt.
      await page.goto("/chat");
      await baseExpect(page.getByTestId("chat-input")).toBeVisible();
      await page.getByTestId("chat-input").fill(prompt);

      // 2. Pressing Send while anonymous redirects to /buy-credits.
      await page.getByTestId("chat-send").click();
      await page.waitForURL(/\/buy-credits\?/);
      await baseExpect(
        page.getByTestId("buy-credits-cost-message"),
      ).toBeVisible();

      // 3. Pick a preset, accept the waiver, confirm → not signed in,
      //    redirects to /login.
      await page.getByTestId("buy-credits-preset-200").check();
      await page.getByTestId("buy-credits-waiver").check();
      await page.getByTestId("buy-credits-submit").click();
      await page.waitForURL(/\/login\?/);

      // Capture the post-login redirect target the BuyCreditsPage stashed.
      const loginUrl = new URL(page.url());
      const postLoginRedirect = loginUrl.searchParams.get("redirect");
      baseExpect(postLoginRedirect).toContain("/buy-credits");
      baseExpect(postLoginRedirect).toContain("resume=1");

      // 4. Sign in and follow the redirect, mirroring LoginPage.handleSignIn.
      await page.waitForFunction(
        () => typeof (window as any).__testSignIn === "function",
      );
      await page.evaluate(
        async (creds) => {
          await (window as any).__testSignIn(creds.email, creds.password);
        },
        { email: user.email, password: user.password },
      );
      await page.waitForFunction(() =>
        (window as any)
          .__testAuthReady?.()
          .then((uid: string | null) => uid != null),
      );
      await page.goto(postLoginRedirect!);

      // 5. The buy-credits page should auto-resume the pending purchase and
      //    return the user to the chat with the original prompt restored.
      await page.waitForURL("/chat", { timeout: 15_000 });
      await baseExpect(page.getByTestId("chat-input")).toHaveValue(prompt);
    },
  );
});
