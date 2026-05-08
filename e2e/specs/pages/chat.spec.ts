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
