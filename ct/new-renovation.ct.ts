import { expect, test } from "@playwright/experimental-ct-vue";
import NewRenovationPage from "../src/views/NewRenovationPage.vue";

// Mock vue-router
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // Provide a minimal router mock for useRouter()
    (window as unknown as Record<string, unknown>).__VUE_ROUTER_MOCK__ = true;
  });
});

test.describe("NewRenovationPage component", () => {
  test("shows TODO placeholder content", async ({ mount }) => {
    const component = await mount(NewRenovationPage, {
      global: {
        stubs: {
          // Stub router-link to plain anchor
          "router-link": {
            template: "<a><slot /></a>",
          },
        },
        mocks: {
          $router: { push: () => {} },
        },
      },
    });

    await expect(component.getByText("Coming Soon")).toBeVisible();
    await expect(component.getByText("TODO")).toBeVisible();
    await expect(
      component.getByText("photo upload, mask drawing, and prompt input"),
    ).toBeVisible();
  });
});
