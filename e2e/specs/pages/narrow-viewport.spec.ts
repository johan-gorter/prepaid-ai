/**
 * Regression test: at the 320px minimum-supported viewport width, no page
 * should produce a horizontal scrollbar. The AppBar layout in particular
 * has tight constraints (logo + title + balance + user menu) that have
 * historically caused overflow.
 */
import { expect, test } from "../../fixtures";

const NARROW_WIDTH = 320;

const pagesToCheck: Array<{
  path: string;
  description: string;
  ready: string;
}> = [
  { path: "/renovations", description: "renovations home", ready: "My Renovations" },
  { path: "/main", description: "main landing", ready: "AI Impressions for renovations" },
  { path: "/balance", description: "balance", ready: "Recent transactions" },
  { path: "/account", description: "account", ready: "Last Activity" },
  { path: "/about", description: "about", ready: "About payasyougo.app" },
  { path: "/chat", description: "chat", ready: "Start a private conversation with AI" },
];

test.describe("Narrow viewport (320px)", () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.setViewportSize({ width: NARROW_WIDTH, height: 700 });
  });

  for (const { path, description, ready } of pagesToCheck) {
    test(`${description} does not horizontally scroll`, async ({
      authenticatedPage: page,
    }) => {
      await page.goto(path);
      // Wait for an anchor element on the page so layout has actually rendered.
      // Avoid `networkidle` — Firestore long-polls keep the network busy.
      await page.getByText(ready).first().waitFor({ state: "visible" });
      const overflow = await page.evaluate(() => {
        const root = document.documentElement;
        const offenders: Array<{
          tag: string;
          id: string;
          cls: string;
          right: number;
          width: number;
        }> = [];
        const viewport = root.clientWidth;
        document
          .querySelectorAll<HTMLElement>("body *")
          .forEach((el) => {
            const r = el.getBoundingClientRect();
            if (r.right > viewport + 1) {
              offenders.push({
                tag: el.tagName,
                id: el.id,
                cls: el.className.toString().slice(0, 60),
                right: Math.round(r.right),
                width: Math.round(r.width),
              });
            }
          });
        return {
          scrollWidth: root.scrollWidth,
          clientWidth: root.clientWidth,
          offenders: offenders.slice(0, 8),
        };
      });
      expect(
        overflow.scrollWidth,
        `${path} content overflows viewport. Offenders: ${JSON.stringify(
          overflow.offenders,
          null,
          2,
        )}`,
      ).toBeLessThanOrEqual(overflow.clientWidth);
    });
  }
});
