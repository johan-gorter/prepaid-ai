---
name: interactive-browser
description: "Drive a live headed browser session for payasyougo.app and capture screenshots — start an interactive Playwright session (mobile-emulated 376×835, CDP on port 9222), follow the user's clicks/navigation through its log, grab on-demand screenshots, and run DOM snippets to measure or drive the page. Use when: visually inspecting a running screen, watching the user drive a flow, taking a screenshot of the live app, measuring an element's box/overflow, or driving/inspecting the live DOM."
argument-hint: "Optional: a URL or screen to open"
---

# Interactive Browser

A live, headed browser you (or the user) can drive, with on-demand screenshots and
DOM access. Use it whenever you need to *see* the running app rather than reason about
it from source — visual inspection, watching the user walk a flow, measuring a layout,
or poking the DOM.

## The three scripts

Run from the project root. They are permission-allowlisted, so they don't prompt; raw
`node …` invocations are **not** allowed — always go through these.

- **Start the session** (headed, mobile-emulated **376×835**, CDP on port **9222**):
  `npm run interactive-browser -- [url]` — run it **in the background**. It logs the
  user's `[nav]`, `[click]`, `[keydown]`, `[pageerror]`, `[console.error]` to stdout,
  so when the **user drives**, you follow along by reading that task output. Let them
  navigate; ask them to tell you when they're on a screen you should look at. If they
  killed it, restart it.
- **Screenshot without disturbing the session**:
  `npm run interactive-screenshot -- <name>.png` → writes `temp/interactive/<name>.png`
  and prints the live URL (which tells you the exact route/state). Then **Read that PNG**
  to see it.
- **Drive or measure the DOM yourself** — write a snippet to a file (e.g.
  `temp/measure.mjs`) and run it **inside the page** with
  `npm run interactive-javascript -- temp/measure.mjs`. The snippet is `page.evaluate`'d
  in the live browser, so it's sandboxed to the DOM (no Node, no filesystem). The file is
  the body of an `async` function — use `await`, and `return` a JSON-serialisable value,
  which is printed:
  ```js
  // temp/measure.mjs — measure an element, or click/navigate via the DOM
  const r = document.querySelector('[data-testid="cta"]').getBoundingClientRect();
  // document.querySelector('button.primary').click();  // or: location.href = "/buy-credits"
  return { x: r.x, y: r.y, w: r.width, h: r.height, cs: getComputedStyle(document.body).fontSize };
  ```

Assume the browser may **already** be running on CDP port **9222**. If a screenshot or
connect fails with a connection error, the session probably isn't running — restart it
(or ask the user to). Connecting to `localhost:9222` is a network call; if the sandbox
blocks it, retry with the sandbox disabled.

## WSL → Windows host

This repo is usually worked on from **WSL**. The default scripts launch a Linux Chromium
(shown via WSLg). To run the browser on the **Windows host** instead — its own checkout
lives at `D:\github\prepaid-ai`, which has Windows-side `node_modules` and Playwright
browsers installed — use the Windows variant:

```bash
npm run interactive-browser:windows
```

It `cmd.exe`-shells into the Windows checkout and runs the same `scripts/interactive.mjs`
with Windows `node`. The default URL `http://localhost:5174` still works: WSL2 forwards
WSL localhost ports to Windows localhost, so the Windows browser reaches the WSL dev
server.

**Screenshots when the session is on Windows:** CDP port 9222 is then bound on the
Windows host and is **not** reachable from WSL `localhost`, so `npm run
interactive-screenshot` from WSL will fail. Take the screenshot on the Windows side and
read the file back through `/mnt/d`:

```bash
cmd.exe /c "cd /d D:\github\prepaid-ai && node scripts/interactive-screenshot.mjs <name>.png"
# then Read /mnt/d/github/prepaid-ai/temp/interactive/<name>.png
```

The Windows checkout runs **its own committed copy** of the scripts — uncommitted WSL
edits to `scripts/interactive*.mjs` won't take effect there until synced.

## Multi-width responsive check

For checking wrapping, truncation, alignment, and horizontal overflow across several
viewport widths at once (e.g. 320 / 360 / 412), invoke the `responsive-screenshots`
skill instead of the single live session.

## Notes

- **Mind emulator mode.** AI generation is a no-op there — you'll see the mask, not a
  real result. Don't critique the generated image itself.
- **Measure, don't guess** when a layout looks wrong. Use `getBoundingClientRect` /
  `getComputedStyle` via `interactive-javascript` to *prove* an overlap or truncation
  with numbers rather than describing it from a screenshot.
