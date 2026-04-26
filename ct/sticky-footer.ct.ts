import { expect, test } from "@playwright/experimental-ct-vue";
import StickyFooter from "../src/components/StickyFooter.vue";

test.describe("StickyFooter", () => {
  test("renders slot content", async ({ mount }) => {
    const component = await mount(StickyFooter, {
      slots: { default: '<button>Tap me</button>' },
    });
    await expect(component.getByRole("button", { name: "Tap me" })).toBeVisible();
  });
});
