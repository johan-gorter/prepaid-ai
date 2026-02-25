import { defineConfig, devices } from "@playwright/test";
import { TEST_FIREBASE_ENV } from "./e2e/helpers/emulator-config";

/**
 * PWA tests run against a production build (vite preview) so the
 * service worker, manifest, and all PWA assets are generated for real.
 */
export default defineConfig({
  testDir: "./e2e/pwa",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["html"]] : "html",

  use: {
    baseURL: "http://localhost:4173",
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
    command: "vite build --mode test && vite preview --port 4173 --outDir dist-test",
    port: 4173,
    reuseExistingServer: !process.env.CI,
    env: TEST_FIREBASE_ENV,
  },
});
