import { expect, test } from "@playwright/experimental-ct-vue";
import StickyFooter from "../src/components/StickyFooter.vue";

test.describe("StickyFooter", () => {
  test("renders slot content", async ({ mount }) => {
    const component = await mount(StickyFooter, {
      slots: { default: '<button>Tap me</button>' },
    });
    await expect(component.getByRole("button", { name: "Tap me" })).toBeVisible();
  });

  test("destructive button text stays visible on narrow viewport", async ({
    mount,
    page,
  }) => {
    // Below 600px Beer CSS's button color-on-colored-background pairing
    // (`color: var(--on-error)`, white on red) becomes white on a transparent
    // background once the bottom-nav layout strips the red fill. Without
    // overriding the text color the icon and label disappear into the
    // surface-colored footer.
    await page.setViewportSize({ width: 320, height: 600 });
    const component = await mount(StickyFooter, {
      slots: {
        default:
          '<button class="error"><i aria-hidden="true">delete</i><span>Trash</span></button>',
      },
    });
    const trashLabel = component.getByText("Trash");
    await expect(trashLabel).toBeVisible();
    const color = await trashLabel.evaluate(
      (el) => getComputedStyle(el).color,
    );
    // Reject pure white (the unfixed `--on-error` value) — anything else is
    // a successful override to a contrasting color.
    expect(color).not.toBe("rgb(255, 255, 255)");
  });
});
