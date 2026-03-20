import { defineConfig, devices } from "@playwright/test";
import { TEST_FIREBASE_ENV } from "./e2e/helpers/emulator-config";

/**
 * PWA tests run against an emulator-backed build (vite preview) so the
 * service worker, manifest, and all PWA assets are generated for real.
 */
export default defineConfig({
  testDir: "./e2e/pwa",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"]],

  use: {
    baseURL: "http://localhost:4175",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: "npm run preview:emulators",
    port: 4175,
    reuseExistingServer: !process.env.CI,
    env: TEST_FIREBASE_ENV,
  },
});
