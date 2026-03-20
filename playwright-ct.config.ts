import { defineConfig } from "@playwright/experimental-ct-vue";

export default defineConfig({
  testDir: "./ct",
  testMatch: "**/*.ct.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"]],

  use: {
    trace: "on-first-retry",
  },
});
