/**
 * Playwright global teardown.
 * Cleans up emulator data after the entire test suite.
 */

import { clearAuthUsers, clearFirestoreData } from "./helpers/auth";

export default async function globalTeardown(): Promise<void> {
  await clearFirestoreData();
  await clearAuthUsers();
  console.log("Global teardown complete: emulator data cleared");
}
