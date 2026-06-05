# Plan: Firebase Emulator / local dev stability

Observations gathered on 2026-06-01 while running E2E tests locally on the
Windows workstation. None of these blocked shipping the paint-mode PR (#75),
but each cost time or hid the real failure. Captured here to investigate/fix
later. Roughly ordered by impact.

## Context

- OS: Windows 11, shell PowerShell 7.
- Global Node: **v24.15.0**. Repo pins Node 22 (`.nvmrc`, `functions/package.json` `engines.node: "22"`).
- Emulator ports (source of truth `scripts/emulator-config.mjs`): auth 9099, firestore **8081**, storage 9199, functions 5001, ui 4000.

## Issues

### 1. Emulator startup rebuilds functions, but a build failure surfaces only as a `services:wait` timeout
- **Symptom:** `services:restart emulators` "succeeded", then `services:wait emulators` failed after 45s with `Unresponsive services after 45s: emulators`. No hint as to why. The actual cause was a TypeScript error in `functions/src/ai.ts` (a `const parts` redeclaration) — emulator startup runs `tsc` first, the build failed, so the Functions emulator never bound its port.
- **Evidence:** `logs/services/emulators.log` tail showed `src/ai.ts(113,9): error TS2451: Cannot redeclare block-scoped variable 'parts'.`
- **Impact:** A code error looked like an infra/timeout problem. Had to manually read the log to find it.
- **Fix ideas:**
  - Have the `emulators` service wrapper detect a non-zero `tsc` exit during startup and mark the service `crashed` with the build error as the "last log", rather than letting `services:wait` time out.
  - Run the functions build (`npm --prefix functions run build`) as an explicit pre-step before `firebase emulators:start` so the failure is attributed correctly.
  - Mitigated upstream now that `typecheck:all` actually type-checks functions (see PR that added `functions` `typecheck` script), but the emulator path should still fail loudly.

### 2. Service tracker diverges from reality (stale PIDs, orphaned Firestore)
- **Symptom:** `services:status` reported `emulators` as `crashed` and `preview:emulators` as `crashed`, yet a Firestore process was still listening on **8081** while auth/storage/functions/ui (9099/9199/5001/4000) were all down. `services:restart` reported `stale PID 73312` / `stale PID 24656`.
- **Impact:** "Emulators are running" was both true and false — a half-dead suite with one orphaned child holding a port. Confusing; can also cause "port already in use" on the next start.
- **Fix ideas:**
  - On `services:stop`/crash detection, kill the whole emulator process tree (Firebase spawns child Java/Node processes that can outlive the parent on Windows).
  - Make `services:status` probe the actual ports (per `emulator-config.mjs`) instead of trusting the tracked PID, and report per-emulator port health.

### 3. Node version mismatch: local 24 vs pinned 22
- **Symptom:** Emulator log: `functions: Your requested "node" version "22" doesn't match your global version "24". Using node@24 from host.`
- **Impact:** Non-fatal (falls back to host Node 24), but local Functions run on a different runtime than production (Node 22). Can mask or introduce runtime-only differences that CI/production then behave differently on.
- **Fix ideas:**
  - Install and use Node 22 locally via nvm-windows (the repo already pins it in `.nvmrc`). Document this in `AGENTS.md` / setup.
  - Optionally add a `setup`/preflight check that warns when the active Node major doesn't match `.nvmrc`.

### 4. Firebase CLI auth errors spam during emulator start
- **Symptom:** Repeated `Authentication Error: Your credentials are no longer valid. Please run firebase login --reauth` and `hosting: Could not fetch web app configuration and there is no cached configuration on this machine.`
- **Impact:** Non-fatal for E2E (tests inject fake Firebase config), but adds log noise and could affect the hosting emulator. Makes real errors harder to spot in the log.
- **Fix ideas:**
  - `firebase login --reauth` on the workstation, or
  - Configure emulator start to not fetch the live web app config (it isn't needed for emulator/E2E), to keep startup fully offline and quiet.

### 5. `services:wait` 45s timeout may be too short on cold start
- **Symptom:** First `services:wait emulators` timed out at 45s. Emulator cold start includes a functions `tsc` build + JVM spin-up for Firestore/Storage rules runtimes, which can exceed 45s on a cold machine.
- **Fix ideas:** Raise the emulator wait budget (separate from other services), or make the wait poll the build step then the ports so it can distinguish "still building" from "stuck".

### 6. libuv noisy exit on Windows after Playwright runs
- **Symptom:** After `2 passed`, the process printed `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 76` and exited with code 9.
- **Impact:** Tests had already passed (and "Global teardown complete" printed), but the non-zero exit code makes the run look failed and would break any wrapper that gates on exit code. CI runs on Linux so likely unaffected; this is a Windows-local annoyance.
- **Fix ideas:** Track the Node/Playwright versions; this is a known Node-on-Windows teardown assertion. Consider pinning/upgrading Node, or in local helper scripts treat "exit 9 after all tests reported passed" as success. Low priority.

### 7. Minor: outdated `firebase-functions`
- **Symptom:** `functions: package.json indicates an outdated version of firebase-functions. Please upgrade...` (currently `^7.0.5`).
- **Fix ideas:** Bump in a housekeeping PR; verify trigger signatures still match.

## Suggested priority

1. (#1, #2) Make emulator build failures and process state legible — biggest time sink.
2. (#3) Align local Node to 22.
3. (#4) Silence/auth-fix the Firebase CLI noise.
4. (#5) Tune the wait budget.
5. (#6, #7) Low-priority cleanups.
