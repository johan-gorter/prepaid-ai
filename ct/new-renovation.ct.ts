import { expect, test } from "@playwright/experimental-ct-vue";
import NewRenovationPage from "../src/views/renovation/old/NewRenovationPage.vue";

test.describe("NewRenovationPage component", () => {
  test("shows step 1 with photo input", async ({ mount }) => {
    const component = await mount(NewRenovationPage);

    await expect(component.getByText("1. Capture Image")).toBeVisible();
    await expect(
      component.getByRole("button", { name: "Select or Capture Photo" }),
    ).toBeVisible();
  });

  test("next button is disabled until photo is provided", async ({ mount }) => {
    const component = await mount(NewRenovationPage);

    const nextBtn = component.getByRole("button", { name: "Next" });
    await expect(nextBtn).toBeDisabled();
  });

  test("back button is disabled on step 1", async ({ mount }) => {
    const component = await mount(NewRenovationPage);

    const backBtn = component.getByRole("button", { name: "Back", exact: true });
    await expect(backBtn).toBeDisabled();
  });
});
