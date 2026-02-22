import { defineConfig, devices } from "@playwright/test";
import { TEST_FIREBASE_ENV } from "./e2e/helpers/emulator-config";

export default defineConfig({
  testDir: "./e2e/specs",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html"]] : "html",

  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",

  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"] },
    },
  ],

  /* Start Vite dev server before tests */
  webServer: {
    command: "npx vite --mode test",
    port: 5173,
    reuseExistingServer: !process.env.CI,
    env: TEST_FIREBASE_ENV,
  },
});
