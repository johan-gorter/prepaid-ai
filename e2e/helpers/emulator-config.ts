/**
 * Centralized emulator configuration for E2E test code.
 *
 * Mirrors scripts/emulator-config.mjs — keep these in sync.
 * (Separate file because Playwright TS files can't import .mjs directly.)
 */

export const PROJECT_ID = "prepaid-ai-emulator";

export const EMULATOR_HOST = "localhost";

export const EMULATOR_PORTS = {
  auth: 9099,
  firestore: 8081,
  storage: 9199,
  functions: 5001,
  ui: 4000,
} as const;

export const EMULATOR_URLS = {
  auth: `http://${EMULATOR_HOST}:${EMULATOR_PORTS.auth}`,
  firestore: `http://${EMULATOR_HOST}:${EMULATOR_PORTS.firestore}`,
  storage: `http://${EMULATOR_HOST}:${EMULATOR_PORTS.storage}`,
  functions: `http://${EMULATOR_HOST}:${EMULATOR_PORTS.functions}`,
  ui: `http://${EMULATOR_HOST}:${EMULATOR_PORTS.ui}`,
} as const;

/** Firebase config env vars used by Playwright webServer */
export const TEST_FIREBASE_ENV = {
  VITE_FIREBASE_API_KEY: "fake-api-key",
  VITE_FIREBASE_AUTH_DOMAIN: "localhost",
  VITE_FIREBASE_PROJECT_ID: PROJECT_ID,
  VITE_FIREBASE_STORAGE_BUCKET: `${PROJECT_ID}.appspot.com`,
  VITE_FIREBASE_MESSAGING_SENDER_ID: "000000000",
  VITE_FIREBASE_APP_ID: "1:000000000:web:fake",
  VITE_USE_EMULATORS: "true",
} as const;
