import { expect, test } from "@playwright/experimental-ct-vue";
import NewRenovationPage from "../src/views/NewRenovationPage.vue";

// Note: useRouter() returns undefined when no router is provided but does not
// throw. Since this test never clicks the back button, mounting without a
// router is safe and avoids needing a full router setup for a static TODO page.
test.describe("NewRenovationPage component", () => {
  test("shows TODO placeholder content", async ({ mount }) => {
    const component = await mount(NewRenovationPage);

    await expect(component.getByText("Coming Soon")).toBeVisible();
    await expect(component.getByText("TODO")).toBeVisible();
    await expect(
      component.getByText("photo upload, mask drawing, and prompt input"),
    ).toBeVisible();
  });
});
