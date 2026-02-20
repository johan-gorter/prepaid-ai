import { defineConfig, devices } from "@playwright/test";

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
    command: "vite build --mode test && vite preview --port 4173",
    port: 4173,
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_FIREBASE_API_KEY: "fake-api-key",
      VITE_FIREBASE_AUTH_DOMAIN: "localhost",
      VITE_FIREBASE_PROJECT_ID: "renovision-ai-test",
      VITE_FIREBASE_STORAGE_BUCKET: "renovision-ai-test.appspot.com",
      VITE_FIREBASE_MESSAGING_SENDER_ID: "000000000",
      VITE_FIREBASE_APP_ID: "1:000000000:web:fake",
      VITE_USE_EMULATORS: "true",
    },
  },
});
