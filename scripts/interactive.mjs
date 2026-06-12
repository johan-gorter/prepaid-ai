// Interactive Playwright session — headed browser with Inspector.
// Logs user clicks/keys/navigations and page errors to stdout, so an agent
// running this in the background can follow along.
// Run from project root:  node scripts/interactive.mjs [url]
// Take live screenshots with:  node scripts/interactive-screenshot.mjs
// Close the browser window (or Resume in the Inspector) when done.
import { chromium } from "playwright";
import { mkdirSync, rmSync } from "node:fs";

const URL = process.argv[2] ?? "http://localhost:5174";

// Target page (content) size — mobile phone.
const WIDTH = 376;
const HEIGHT = 835;

// Session artifacts (screenshots etc.) live here; start each session clean.
const OUT = "temp/interactive";
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// Mobile phone emulation via real window size + touch + UA, no emulated
// Playwright viewport (viewport: null) — the page follows the actual window,
// so what you see is exactly what the page gets and manual resizes behave
// naturally. (isMobile/deviceScaleFactor require an emulated viewport.)
// A regular Chromium window can't go narrower than ~500px, so launch as an
// --app window (no tab strip), which allows true phone widths.
const context = await chromium.launchPersistentContext(`${OUT}/profile`, {
  headless: false,
  slowMo: 50,
  viewport: null,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  args: [
    "--remote-debugging-port=9222",
    `--app=${URL}`,
    // Initial guess; corrected to an exact content size after load via CDP.
    `--window-size=${WIDTH},${HEIGHT + 40}`,
  ],
});
const page = context.pages()[0] ?? (await context.waitForEvent("page"));

// Resize the OS window so the page's inner size is exactly WIDTH x HEIGHT,
// compensating for browser chrome (tab strip, address bar, borders).
// Iterates because OS DPI scaling rounds window-to-content mapping.
async function fitWindowToContent() {
  const cdp = await page.context().newCDPSession(page);
  for (let i = 0; i < 4; i++) {
    const inner = await page.evaluate(() => ({
      w: window.innerWidth,
      h: window.innerHeight,
    }));
    if (inner.w === WIDTH && inner.h === HEIGHT) break;
    const { windowId, bounds } = await cdp.send("Browser.getWindowForTarget");
    await cdp.send("Browser.setWindowBounds", {
      windowId,
      bounds: {
        width: bounds.width + (WIDTH - inner.w),
        height: bounds.height + (HEIGHT - inner.h),
      },
    });
    await page.waitForTimeout(150); // let the resize settle before re-measuring
  }
  await cdp.detach();
}

page.on("framenavigated", (frame) => {
  if (frame !== page.mainFrame()) return;
  console.log(`[nav] ${frame.url()}`);
});

// Surface app failures alongside the interaction log.
page.on("pageerror", (err) => console.log(`[pageerror] ${err.message}`));
page.on("console", (msg) => {
  const text = msg.text();
  if (text.startsWith("[event]")) console.log(text);
  else if (msg.type() === "error") console.log(`[console.error] ${text}`);
});

// Inject event listeners into every new document so clicks/keys are logged.
await page.addInitScript(() => {
  const tag = (label, detail) =>
    console.log(`[event] ${label} ${JSON.stringify(detail)}`);

  document.addEventListener("click", (e) => {
    const el = e.target;
    tag("click", {
      x: Math.round(e.clientX),
      y: Math.round(e.clientY),
      tag: el.tagName,
      id: el.id || undefined,
      testid: el.dataset?.testid || undefined,
      text: el.innerText?.slice(0, 60).replace(/\s+/g, " ").trim() || undefined,
    });
  }, true);

  document.addEventListener("keydown", (e) => {
    if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return;
    tag("keydown", { key: e.key, ctrl: e.ctrlKey, shift: e.shiftKey });
  }, true);

  document.addEventListener("mousedown", (e) => {
    if (e.buttons === 1) {
      tag("mousedown", { x: Math.round(e.clientX), y: Math.round(e.clientY) });
    }
  }, true);
});

// Reload so the init-script listeners are present (the --app window already
// navigated before addInitScript ran).
// Do NOT wait for networkidle — Firebase keeps long-lived connections open.
await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(600); // let fonts/layout settle

await fitWindowToContent();
const size = await page.evaluate(() => `${window.innerWidth}x${window.innerHeight}`);
console.log(`[viewport] ${size}`);

// Opens the Playwright Inspector: step through actions, record new ones,
// or just browse freely. Close the browser window to end the session.
await page.pause();

await context.close();
