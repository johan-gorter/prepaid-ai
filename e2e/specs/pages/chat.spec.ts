import { expect, test } from "../../fixtures";

test.describe("PrivateChatPage", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "chromium only");
  });

  test("shows chat page with empty state", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/chat");
    await expect(
      page.getByText("Start a private conversation with Gemini Pro."),
    ).toBeVisible();
  });

  test("shows chat input and send button", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/chat");
    await expect(page.getByTestId("chat-input")).toBeVisible();
    await expect(page.getByTestId("chat-send")).toBeVisible();
  });

  test("send button disabled when input empty", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/chat");
    await expect(page.getByTestId("chat-send")).toBeDisabled();
  });

  test("shows balance display", async ({ authenticatedPage: page }) => {
    await page.goto("/chat");
    await expect(page.getByTestId("chat-balance")).toBeVisible();
    await expect(page.getByTestId("chat-balance")).toContainText(
      "Balance:",
    );
    await expect(page.getByTestId("chat-balance")).toContainText("credits");
  });

  test("can send a message and receive response", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/chat");

    const message = "Hello from Playwright";
    await page.getByTestId("chat-input").fill(message);
    await page.getByTestId("chat-send").click();

    await expect(
      page.getByText("[dummy] Echo:"),
    ).toBeVisible({ timeout: 15000 });

    await expect(page.getByText("Cost: 1 credit")).toBeVisible({
      timeout: 15000,
    });
  });

  test("shows clear button after messages", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/chat");

    const message = "Test message for clear button";
    await page.getByTestId("chat-input").fill(message);
    await page.getByTestId("chat-send").click();

    // Wait for the response to arrive so streaming is done and clear button appears
    await expect(page.getByText("[dummy] Echo:")).toBeVisible({
      timeout: 15000,
    });

    await expect(page.getByTestId("chat-clear")).toBeVisible();
    await expect(page.getByTestId("chat-clear")).toHaveAttribute(
      "title",
      "Clear chat",
    );
  });
});
