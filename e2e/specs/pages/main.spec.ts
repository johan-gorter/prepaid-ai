import { expect, test } from "../../fixtures";

test.describe("Main Page", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "chromium only");
  });

  test("shows main page content", async ({ authenticatedPage: page }) => {
    await page.goto("/main");
    await expect(page.getByRole("heading", { name: "Prepaid AI", exact: true })).toBeVisible();

    await expect(
      page.getByRole("heading", { name: "AI Impressions for renovations" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Private Chat" }),
    ).toBeVisible();
  });

  test("has navigation links to renovations and chat", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/main");
    await expect(page.getByRole("heading", { name: "Prepaid AI", exact: true })).toBeVisible();

    const renovationsLink = page.getByRole("link", { name: "VISUALIZE NOW" });
    await expect(renovationsLink).toBeVisible();
    await expect(renovationsLink).toHaveAttribute("href", "/renovations");

    const chatLink = page.getByRole("link", { name: "CHAT SECURELY" });
    await expect(chatLink).toBeVisible();
    await expect(chatLink).toHaveAttribute("href", "/chat");
  });

  test("shows feedback form", async ({ authenticatedPage: page }) => {
    await page.goto("/main");
    await expect(page.getByRole("heading", { name: "Prepaid AI", exact: true })).toBeVisible();

    await expect(page.getByTestId("feedback-input")).toBeVisible();
    await expect(page.getByTestId("feedback-submit")).toBeVisible();
  });

  test("can submit feedback", async ({ authenticatedPage: page }) => {
    await page.goto("/main");
    await expect(page.getByRole("heading", { name: "Prepaid AI", exact: true })).toBeVisible();

    await page.getByTestId("feedback-input").fill("This is a great app!");
    await page.getByTestId("feedback-submit").click();

    await expect(page.getByText("Thanks for your feedback!")).toBeVisible();
  });

  test("navigates to balance page", async ({ authenticatedPage: page }) => {
    await page.goto("/main");
    await expect(page.getByRole("heading", { name: "Prepaid AI", exact: true })).toBeVisible();

    await page.getByRole("link", { name: "Check Credits" }).click();
    await page.waitForURL("/balance");

    await expect(page.getByRole("heading", { name: "Balance" })).toBeVisible();
  });
});
