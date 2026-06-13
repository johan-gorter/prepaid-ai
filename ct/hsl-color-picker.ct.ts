import { expect, test } from "@playwright/experimental-ct-vue";
import HslColorPicker from "../src/components/HslColorPicker.vue";

test.describe("HslColorPicker", () => {
  test("renders the bound colour as an uppercased hex readout", async ({
    mount,
  }) => {
    const component = await mount(HslColorPicker, {
      props: { modelValue: "#213529" },
    });
    await expect(component.getByTestId("paint-color")).toHaveValue("#213529");
    await expect(component.getByText("#213529")).toBeVisible();
  });

  test("emits update:modelValue when the native picker changes", async ({
    mount,
  }) => {
    const updates: string[] = [];
    const component = await mount(HslColorPicker, {
      props: { modelValue: "#f4f4f0" },
      on: {
        "update:modelValue": (value: string) => updates.push(value),
      },
    });
    await component.getByTestId("paint-color").fill("#0a0a0a");
    expect(updates).toContain("#0a0a0a");
  });
});
