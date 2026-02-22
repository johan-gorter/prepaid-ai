import { defineConfig, devices } from "@playwright/test";

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
    env: {
      VITE_FIREBASE_API_KEY: "fake-api-key",
      VITE_FIREBASE_AUTH_DOMAIN: "localhost",
      VITE_FIREBASE_PROJECT_ID: "prepaid-ai-test",
      VITE_FIREBASE_STORAGE_BUCKET: "prepaid-ai-test.appspot.com",
      VITE_FIREBASE_MESSAGING_SENDER_ID: "000000000",
      VITE_FIREBASE_APP_ID: "1:000000000:web:fake",
      VITE_USE_EMULATORS: "true",
    },
  },
});
