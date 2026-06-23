// Run a JavaScript snippet INSIDE the live interactive browser page started by
// scripts/interactive.mjs. The snippet is evaluated in the page context over CDP
// (port 9222), so it can read/measure/drive the DOM but has no Node, filesystem,
// or process access — it is sandboxed by the browser. This is the bounded,
// auto-approvable way to inspect or manipulate the running session.
//
// Run from project root:  node scripts/interactive-javascript.mjs <file.mjs>
// (via npm:               npm run interactive-javascript -- <file.mjs>)
//
// The file is treated as the body of an async function, so it may use `await`
// and `return` a JSON-serialisable value, which is printed. `console.log` from
// the page during evaluation is forwarded to stdout.
//
//   // temp/measure.mjs
//   const r = document.querySelector('[data-testid="cta"]').getBoundingClientRect();
//   return { x: r.x, y: r.y, w: r.width, h: r.height };
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const fileArg = process.argv[2];
if (!fileArg) {
  console.error("Usage: node scripts/interactive-javascript.mjs <file.mjs>");
  console.error("       npm run interactive-javascript -- <file.mjs>");
  process.exit(1);
}

let code;
try {
  code = readFileSync(fileArg, "utf8");
} catch {
  console.error(`Cannot read snippet file: ${fileArg}`);
  process.exit(1);
}

let browser;
try {
  browser = await chromium.connectOverCDP("http://localhost:9222");
} catch {
  console.error(
    "No interactive session on port 9222. Start it first:  npm run interactive-browser -- [url]",
  );
  process.exit(1);
}

const context = browser.contexts()[0];
const page = context.pages().find((p) => p.url().includes("localhost:5174")) ?? context.pages()[0];

// Forward the snippet's own console output so logs aren't swallowed.
const onConsole = (msg) => console.log(`[${msg.type()}] ${msg.text()}`);
page.on("console", onConsole);

let exitCode = 0;
try {
  // Wrap as an async IIFE so the snippet can `await` and `return`.
  const result = await page.evaluate(`(async () => {\n${code}\n})()`);
  page.off("console", onConsole);
  console.log(`--- result (${page.url()}) ---`);
  console.log(result === undefined ? "(no return value)" : JSON.stringify(result, null, 2));
} catch (err) {
  page.off("console", onConsole);
  console.error(`[error] ${err.message}`);
  exitCode = 1;
}

// Disconnects from the CDP session only; the interactive browser stays open.
await browser.close();
process.exit(exitCode);
