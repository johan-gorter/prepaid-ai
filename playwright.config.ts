import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/specs",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"]],

  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",

  expect: { timeout: 10_000 },

  use: {
    baseURL: "http://localhost:5174",
    trace: "on-first-retry",
    // Pin the browser locale so language auto-detection is deterministic and
    // the existing English text assertions stay green. Tests that exercise
    // Dutch detection create their own context with `locale: "nl-NL"`.
    locale: "en-US",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "home-chromium",
      testMatch: /home\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "home-mobile-chrome",
      testMatch: /home\.spec\.ts/,
      use: { ...devices["Pixel 5"] },
    },
    {
      name: "chromium",
      testIgnore: /home\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chrome",
      testIgnore: /home\.spec\.ts/,
      use: { ...devices["Pixel 5"] },
    },
  ],
});
