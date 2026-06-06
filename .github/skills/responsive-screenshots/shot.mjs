// Throwaway responsive screenshot + dimension report.
// Copy this into temp/shot.mjs, edit the constants below, then run from the
// project root:  node temp/shot.mjs
// Leaves the PNGs + the script in temp/ (gitignored) for inspection.
//
// For auth-only routes, see authorized-login.md in this skill's directory.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

// ---- edit these for your case -------------------------------------------
const URL = "http://localhost:5174/renovations";
const WIDTHS = [800, 600, 551, 549, 414, 390, 360, 320];
const HEIGHT = 800;
// CSS selectors / testids whose rendered box to report at each width (optional):
const MEASURE = ['[data-testid="new-renovation-card"]'];
// -------------------------------------------------------------------------

const OUT = "temp";
mkdirSync(OUT, { recursive: true });

// Do NOT wait for "networkidle": this app holds long-lived Firebase connections
// open, so the network never goes idle and goto() would hang until timeout.
// Wait for the DOM, then for the element we measure (best-effort), then settle.
async function gotoStable(page, url, settleSelector) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  if (settleSelector) {
    await page
      .locator(settleSelector)
      .first()
      .waitFor({ state: "visible", timeout: 8000 })
      .catch(() => {}); // best-effort: still capture if it never appears
  }
  await page.waitForTimeout(400); // let fonts/layout settle
}

const browser = await chromium.launch();
try {
  for (const width of WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height: HEIGHT } });
    await gotoStable(page, URL, MEASURE[0]);

    // Horizontal-overflow check (the page should stay within the viewport).
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    const overflow =
      scrollWidth > clientWidth ? `  ⚠ overflow +${scrollWidth - clientWidth}px` : "";

    // Rendered element dimensions (width × height @ (x,y), all CSS px).
    const dims = [];
    for (const sel of MEASURE) {
      const box = await page
        .locator(sel)
        .first()
        .boundingBox()
        .catch(() => null);
      dims.push(
        box
          ? `${sel} = ${Math.round(box.width)}×${Math.round(box.height)} @ (${Math.round(box.x)},${Math.round(box.y)})`
          : `${sel} = (not found)`,
      );
    }

    const file = `${OUT}/shot-${width}.png`;
    await page.screenshot({ path: file });
    console.log(`${String(width).padStart(4)}px → ${file}${overflow}`);
    for (const d of dims) console.log(`        ${d}`);
    await page.close();
  }
} finally {
  await browser.close();
}
