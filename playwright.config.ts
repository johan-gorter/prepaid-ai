import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/specs",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"]],

  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",

  use: {
    baseURL: "http://localhost:5174",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "home-chromium",
      testMatch: /home\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
      workers: 1,
    },
    {
      name: "home-mobile-chrome",
      testMatch: /home\.spec\.ts/,
      use: { ...devices["Pixel 5"] },
      workers: 1,
      dependencies: ["home-chromium"],
    },
    {
      name: "chromium",
      testIgnore: /home\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["home-mobile-chrome"],
    },
    {
      name: "mobile-chrome",
      testIgnore: /home\.spec\.ts/,
      use: { ...devices["Pixel 5"] },
      dependencies: ["home-mobile-chrome"],
    },
  ],
});
