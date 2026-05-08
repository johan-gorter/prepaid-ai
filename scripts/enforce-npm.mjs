#!/usr/bin/env node

const userAgent = process.env.npm_config_user_agent ?? "";

if (userAgent.startsWith("pnpm/") || userAgent.startsWith("yarn/")) {
  console.error("");
  console.error("This project uses npm, not pnpm or yarn.");
  console.error("Run: npm install");
  console.error("");
  console.error("npm install also installs functions/ dependencies.");
  process.exit(1);
}