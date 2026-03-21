#!/usr/bin/env node
/**
 * One-time project setup script.
 *
 * Installs all dependencies and Playwright browsers.
 *
 * Usage:
 *   npm -s run setup
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

console.log("\n✅ Setup complete!");
console.log("\nNext steps:");
console.log(
  "  npm -s run services:start emulators       — start Firebase Emulators (requires Java)",
);
console.log(
  "  npm -s run services:start dev:emulators   — start Vite dev server with emulators",
);
console.log(
  "  npm -s run emulators:seed — create a dev user in the Auth Emulator",
);
