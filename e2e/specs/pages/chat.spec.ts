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

    await expect(
      page.getByText("[dummy] Echo:"),
    ).toBeVisible({ timeout: 15000 });

    await expect(page.getByTestId("chat-estimate")).toBeVisible();
  });

  test("shows max credits input", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/chat");
    await expect(page.getByTestId("max-credits")).toBeVisible();
  });
});
