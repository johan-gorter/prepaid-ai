# Authorized login (dev user)

For pages that require a signed-in user, log in as the seeded **dev user** from inside
the script. This only works against the emulator-mode server (`dev:emulators`, port
5174) — that build renders a one-click Dev Login button; production mode does not.

1. The emulator suite must be up: `npm -s run services:status` shows both `emulators`
   and `dev:emulators` running.
2. **Seed the dev user first** — it does not exist until you do. The script recreates
   `dev@prepaid.test` (password `dev-password`) with 100 credits and is idempotent:

   ```bash
   node scripts/emulator-seed.mjs   # or: npm -s run emulators:seed
   ```

   Emulator auth state is ephemeral, so **re-seed after any emulator restart** (a
   failed login usually means the user wasn't seeded).
3. In the script, click the Dev Login button on `/login`, then go to your target route.
   The dev email is interpolated into the button label in every locale, so match on it
   (locale-independent). This helper fails fast with a clear message when the button is
   missing (wrong server) or login is rejected (user not seeded) — instead of a 30s hang:

   ```js
   async function devLogin(page) {
     let loginError = null;
     page.on("dialog", (d) => {
       loginError = d.message(); // app alerts "Dev login failed" if the user isn't seeded
       d.dismiss().catch(() => {});
     });

     await page.goto("http://localhost:5174/login", { waitUntil: "domcontentloaded" });

     // Vue renders the button after mount (emulator mode only). Wait via click's
     // auto-wait — don't probe count(), which races the mount and false-negatives.
     try {
       await page
         .getByRole("button", { name: /dev@prepaid\.test/ })
         .click({ timeout: 8000 });
     } catch {
       throw new Error(
         "Dev Login button never appeared — is the server in emulator mode on :5174?",
       );
     }

     try {
       await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 10000 });
     } catch {
       throw new Error(
         loginError
           ? `Dev login failed: "${loginError}" — seed the dev user: node scripts/emulator-seed.mjs`
           : "Dev login did not complete (still on /login).",
       );
     }
   }
   ```

Each `browser.newPage()` starts a **fresh, logged-out session**, so to capture an
authed page across several widths, reuse one page and resize it instead of opening a
new page per width. Reuse `gotoStable()` from `shot.mjs` — never `networkidle`, which
hangs on this app's long-lived Firebase connections:

```js
const page = await browser.newPage({ viewport: { width: WIDTHS[0], height: HEIGHT } });
await devLogin(page);
for (const width of WIDTHS) {
  await page.setViewportSize({ width, height: HEIGHT });
  await gotoStable(page, URL, MEASURE[0]); // same helper as shot.mjs
  // ...measure + screenshot exactly as in shot.mjs...
}
```
