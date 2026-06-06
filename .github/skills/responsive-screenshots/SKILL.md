---
name: responsive-screenshots
description: "Capture screenshots and report element + viewport dimensions across several viewport widths using a throwaway Playwright script in the gitignored temp/ folder. Use when: verifying responsive layout/breakpoints, checking an element's rendered size/position/alignment, detecting horizontal overflow, or visually confirming a UI change at specific widths."
argument-hint: "Optional: route to capture (e.g. /renovations) and/or widths"
---

# Responsive Screenshots & Dimension Report

Drive the running app with a small Playwright script to grab screenshots at several
viewport widths at once and print each element's rendered dimensions. This is how to
investigate responsive behaviour (breakpoints, wrapping, alignment, overflow) quickly.

## When to Use

- Verifying a responsive layout across breakpoints (e.g. a bar that reflows at 550px).
- Checking an element's rendered size / position / alignment at a given width.
- Detecting horizontal overflow (page wider than the viewport) — the app must stay
  readable down to 320px.
- Visually confirming a UI change at specific widths, or comparing several widths in
  one pass.

For interactive exploration, extend the script with ordinary Playwright actions.

## The `temp/` folder

`temp/` is gitignored — it is the scratch space for these throwaway scripts and the
PNGs they produce.

- **Empty it before you start** so stale shots from a previous investigation don't
  mislead you:
  - PowerShell: `Remove-Item -Recurse -Force temp -ErrorAction SilentlyContinue; New-Item -ItemType Directory temp | Out-Null`
  - Bash: `rm -rf temp && mkdir temp`
- **Leave the script and PNGs behind when you're done — do not clean up.** They let the
  user (and a follow-up turn in the same conversation) re-run or re-inspect the captures.

## Prerequisites

- A dev server must be running — check `npm -s run services:status`:
  - `dev:emulators` → `http://localhost:5174` (emulator mode)
  - `dev` → `http://localhost:5173`
  - Start one if needed, e.g. `npm -s run services:start dev:emulators` then
    `npm -s run services:wait dev:emulators`.
- Pick a route that renders **without interaction**. Many pages render for guests
  (e.g. `/renovations` shows the new-renovation bar plus a sign-in prompt). For
  auth-only pages, sign in as the dev user first — read `authorized-login.md` in this
  skill's directory.
- `playwright` is already a dev dependency (the E2E suite uses it); no install needed.
  If chromium is missing, run `npx playwright install chromium`.

## Workflow

1. Empty `temp/` (see above).
2. Copy `shot.mjs` from this skill's directory to `temp/shot.mjs`, then edit its `URL`,
   `WIDTHS`, and `MEASURE` constants. Put widths on both sides of any breakpoint you're
   testing (e.g. `549` and `551`).
3. Run it from the project root: `node temp/shot.mjs`.
4. Read the console dimension report, then open the PNGs with the `Read` tool to
   inspect each width visually.
5. Iterate — tweak the CSS, re-run, re-read. Leave the artifacts in `temp/`.

## Files in this skill

- `shot.mjs` — the example script to copy into `temp/`. Reports each width's element
  box and flags horizontal overflow.
- `authorized-login.md` — how to sign in as the seeded dev user for auth-only routes
  (read only when you need it).

## Tips

- Measure several elements at once by adding selectors to `MEASURE` — handy for
  checking that two elements share an edge (alignment) at every width.
- To capture only the element instead of the full page, use
  `await page.locator(sel).screenshot({ path: file })`.
- Add `await page.emulateMedia({ colorScheme: "dark" })` before `goto` to check dark mode.
- The `⚠ overflow` flag is the quickest signal that a layout breaks the 320px floor.
