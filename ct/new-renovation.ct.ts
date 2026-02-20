import { expect, test } from "@playwright/experimental-ct-vue";
import NewRenovationPage from "../src/views/NewRenovationPage.vue";

test.describe("NewRenovationPage component", () => {
  test("shows renovation form fields", async ({ mount }) => {
    const component = await mount(NewRenovationPage);

    await expect(component.getByText("New Renovation")).toBeVisible();
    await expect(component.getByLabel("Title")).toBeVisible();
    await expect(component.getByLabel("Photo (PNG)")).toBeVisible();
    await expect(
      component.getByLabel("Describe your renovation"),
    ).toBeVisible();
    await expect(
      component.getByRole("button", { name: "Create Renovation" }),
    ).toBeVisible();
  });
});
