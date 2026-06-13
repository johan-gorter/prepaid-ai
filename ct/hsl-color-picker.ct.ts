import { expect, test } from "@playwright/experimental-ct-vue";
import HslColorPicker from "../src/components/HslColorPicker.vue";

test.describe("HslColorPicker", () => {
  test("shows the bound colour in the editable hex field", async ({
    mount,
  }) => {
    const component = await mount(HslColorPicker, {
      props: { modelValue: "#213529" },
    });
    await expect(component.getByTestId("paint-color")).toHaveValue("#213529");
  });

  test("typing a valid hex emits a normalized update", async ({ mount }) => {
    const updates: string[] = [];
    const component = await mount(HslColorPicker, {
      props: { modelValue: "#F4F4F0" },
      on: {
        "update:modelValue": (value: string) => updates.push(value),
      },
    });
    await component.getByTestId("paint-color").fill("#0a0a0a");
    expect(updates).toContain("#0A0A0A");
  });

  test("moving a slider emits an updated colour", async ({ mount }) => {
    const updates: string[] = [];
    const component = await mount(HslColorPicker, {
      props: { modelValue: "#808080" },
      on: {
        "update:modelValue": (value: string) => updates.push(value),
      },
    });
    // Three sliders: hue, saturation, lightness.
    const sliders = component.locator("input[type='range']");
    await expect(sliders).toHaveCount(3);
    // Drive lightness to its minimum → black, regardless of hue/saturation.
    await sliders.nth(2).fill("0");
    expect(updates).toContain("#000000");
  });
});
