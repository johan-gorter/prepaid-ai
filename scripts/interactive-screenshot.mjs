// On-demand live screenshot of the interactive Playwright browser
// started by scripts/interactive.mjs. Connects via CDP on port 9222
// without disturbing the running session.
// Run from project root:  node scripts/interactive-screenshot.mjs [filename.png]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "temp/interactive"; // gitignored; cleared by interactive.mjs at session start
mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP("http://localhost:9222");
const context = browser.contexts()[0];
const page = context.pages().find((p) => p.url().includes("localhost:5174")) ?? context.pages()[0];

const file = `${OUT}/${process.argv[2] ?? `live-${Date.now()}.png`}`;
await page.screenshot({ path: file, fullPage: false });
console.log(`snapshot → ${file}  (${page.url()})`);

// Disconnects from the CDP session only; the interactive browser stays open.
await browser.close();
