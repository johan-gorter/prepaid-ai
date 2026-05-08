#!/usr/bin/env node

import { execFileSync } from "node:child_process";

const npmCli = process.env.npm_execpath;

if (!npmCli) {
  console.error("npm_execpath is not set; run this script through npm.");
  process.exit(1);
}

execFileSync(process.execPath, [npmCli, "install", "--prefix", "functions"], {
  stdio: "inherit",
});