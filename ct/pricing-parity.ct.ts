import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/experimental-ct-vue";

// `shared/pricing.json` is the canonical pricing table (docs/viral-flow.md §10).
// The client (`src/credits.ts`) and Cloud Functions (`functions/src/credits.ts`)
// each keep their own typed copy of these numbers because the two TypeScript
// builds plus the Firebase deploy boundary (only `functions/` is uploaded) make
// a single runtime-shared module awkward. This test is the guard that keeps the
// duplication honest: it fails the build the moment either copy drifts from the
// canonical JSON, so a stale tariff on one side can never ship silently.
//
// The copies are plain literal `export const`s (see the modules), so we verify
// them by reading the source text — that works regardless of the runner's
// module system and does not depend on importing a CommonJS Functions module
// into this ESM test.

const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

const pricing = JSON.parse(read("../shared/pricing.json")) as {
  creditValueUsd: number;
  aiBudgetRatio: number;
  geminiProInputPricePerM: number;
  geminiProOutputPricePerM: number;
  imageGenerationPriceUsd: number;
  minTopupCredits: number;
  actionCredits: {
    remove: number;
    colorChange: number;
    freePrompt: number;
    applyMaterial: number;
    addFurniture: number;
  };
};

/** Pull `export const NAME = <number>;` out of a credits.ts source file. */
function scalar(source: string, name: string): number {
  const match = source.match(new RegExp(`export const ${name} = ([\\d.]+)`));
  if (!match) throw new Error(`could not find "export const ${name}" in source`);
  return Number.parseFloat(match[1]);
}

/** Pull the per-action numbers out of the `ACTION_CREDITS = { ... }` literal. */
function actionCredits(source: string): {
  remove: number;
  colorChange: number;
  freePrompt: number;
  applyMaterial: number;
  addFurniture: number;
} {
  const block = source.match(/ACTION_CREDITS = \{([\s\S]*?)\}/);
  if (!block) throw new Error("could not find ACTION_CREDITS literal in source");
  const num = (key: string): number => {
    const m = block[1].match(new RegExp(`${key}:\\s*(\\d+)`));
    if (!m) throw new Error(`ACTION_CREDITS.${key} missing in source`);
    return Number.parseInt(m[1], 10);
  };
  return {
    remove: num("remove"),
    colorChange: num("colorChange"),
    freePrompt: num("freePrompt"),
    applyMaterial: num("applyMaterial"),
    addFurniture: num("addFurniture"),
  };
}

const clientSrc = read("../src/credits.ts");
const functionsSrc = read("../functions/src/credits.ts");

test.describe("pricing single source of truth", () => {
  test("client constants match the canonical table", () => {
    expect(scalar(clientSrc, "CREDIT_VALUE_USD")).toBe(pricing.creditValueUsd);
    expect(scalar(clientSrc, "AI_BUDGET_RATIO")).toBe(pricing.aiBudgetRatio);
    expect(scalar(clientSrc, "GEMINI_PRO_INPUT_PRICE_PER_M")).toBe(
      pricing.geminiProInputPricePerM,
    );
    expect(scalar(clientSrc, "IMAGE_GENERATION_PRICE_USD")).toBe(
      pricing.imageGenerationPriceUsd,
    );
    expect(scalar(clientSrc, "MIN_TOPUP_CREDITS")).toBe(pricing.minTopupCredits);
    expect(actionCredits(clientSrc)).toEqual(pricing.actionCredits);
  });

  test("Cloud Functions constants match the canonical table", () => {
    expect(scalar(functionsSrc, "CREDIT_VALUE_USD")).toBe(
      pricing.creditValueUsd,
    );
    expect(scalar(functionsSrc, "AI_BUDGET_RATIO")).toBe(pricing.aiBudgetRatio);
    expect(scalar(functionsSrc, "GEMINI_PRO_INPUT_PRICE_PER_M")).toBe(
      pricing.geminiProInputPricePerM,
    );
    expect(scalar(functionsSrc, "GEMINI_PRO_OUTPUT_PRICE_PER_M")).toBe(
      pricing.geminiProOutputPricePerM,
    );
    expect(scalar(functionsSrc, "IMAGE_GENERATION_PRICE_USD")).toBe(
      pricing.imageGenerationPriceUsd,
    );
    expect(scalar(functionsSrc, "MIN_TOPUP_CREDITS")).toBe(
      pricing.minTopupCredits,
    );
    expect(actionCredits(functionsSrc)).toEqual(pricing.actionCredits);
  });
});
