#!/usr/bin/env node
/**
 * Runs E2E, component, and PWA tests in parallel.
 *
 * Required services must already be running before this script is invoked.
 */

import { spawn } from "node:child_process";

function runCommand(args, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.platform === "win32" ? "cmd.exe" : "npm",
      process.platform === "win32"
        ? ["/d", "/s", "/c", `npm ${args.join(" ")}`]
        : args,
      {
        stdio: ["inherit", "pipe", "pipe"],
        shell: false,
      },
    );

    child.stdout.on("data", (chunk) => {
      process.stdout.write(`[${label}] ${chunk.toString()}`);
    });

    child.stderr.on("data", (chunk) => {
      process.stderr.write(`[${label}] ${chunk.toString()}`);
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${label} exited with signal ${signal}`));
        return;
      }

      if (code !== 0) {
        reject(new Error(`${label} exited with code ${code ?? 1}`));
        return;
      }

      resolve();
    });
  });
}

try {
  await Promise.all([
    runCommand(["run", "test:e2e"], "test:e2e"),
    runCommand(["run", "test:ct"], "test:ct"),
    runCommand(["run", "test:pwa"], "test:pwa"),
  ]);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
