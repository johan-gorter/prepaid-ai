#!/usr/bin/env node
/**
 * One-time project setup script.
 *
 * Installs all dependencies, Playwright browsers, and builds Cloud Functions.
 *
 * Usage:
 *   npm run setup
 */

import { execSync } from "node:child_process";

function run(cmd, label) {
  console.log(`\n▸ ${label}`);
  execSync(cmd, { stdio: "inherit" });
}

run("npm install", "Installing root dependencies");
run("npx playwright install --with-deps", "Installing Playwright browsers");
run(
  "npm install --prefix functions",
  "Installing Cloud Functions dependencies",
);
run("npm run --prefix functions build", "Building Cloud Functions");

console.log("\n✅ Setup complete!");
console.log("\nNext steps:");
console.log("  npm run emulators      — start Firebase Emulators (requires Java)");
console.log("  npm run dev:emulators  — start Vite dev server with emulators");
console.log("  npm run emulators:seed — create a dev user in the Auth Emulator");
