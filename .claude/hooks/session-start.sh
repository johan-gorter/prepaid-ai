#!/bin/bash
# SessionStart hook — sets up the remote environment for development.
#
# IMPORTANT: For SessionStart hooks, Claude Code treats stdout as context
# (and tries to parse it as JSON). All progress/log output MUST go to
# stderr (>&2). Only intentional JSON or context text should go to stdout.

# Only run in Claude Code remote environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

# --- Configure git to use project hooks directory ----------------------------
git config core.hooksPath .githooks 2>/dev/null || true

# --- Cleanup trap: kill any background processes we started ----------------
BACKGROUND_PIDS=()
cleanup() {
  for pid in "${BACKGROUND_PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
    # Also kill the process group in case of child processes (Java, etc.)
    kill -- -"$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup EXIT

# --- Fix proxy exclusions --------------------------------------------------
# The default NO_PROXY excludes *.googleapis.com and *.google.com, but in the
# sandbox there is no direct DNS for those hosts. Route them through the proxy
# so downloads (Playwright browsers, Firebase emulator JARs) can succeed.
FIXED_NO_PROXY="localhost,127.0.0.1,169.254.169.254,metadata.google.internal,*.svc.cluster.local,*.local"
export NO_PROXY="$FIXED_NO_PROXY"
export no_proxy="$FIXED_NO_PROXY"

# Fully unset JAVA_TOOL_OPTIONS — setting it to "" still causes Java to
# print "Picked up JAVA_TOOL_OPTIONS:" which crashes the storage rules runtime.
unset JAVA_TOOL_OPTIONS

# Persist env fixes early so the agent session has them even if later steps fail
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo "export NO_PROXY=\"$FIXED_NO_PROXY\"" >> "$CLAUDE_ENV_FILE"
  echo "export no_proxy=\"$FIXED_NO_PROXY\"" >> "$CLAUDE_ENV_FILE"
  echo 'unset JAVA_TOOL_OPTIONS' >> "$CLAUDE_ENV_FILE"
fi

# --- 1. Install npm dependencies ------------------------------------------
NPM_OK=false
echo "Installing npm dependencies..." >&2
if timeout 180 npm install >&2 2>&1; then
  NPM_OK=true
else
  echo "Warning: npm install failed or timed out" >&2
fi

# Install Cloud Functions dependencies (needed for emulator startup)
echo "Installing Cloud Functions dependencies..." >&2
if ! timeout 60 npm --prefix functions install >&2 2>&1; then
  echo "Warning: functions npm install failed or timed out" >&2
fi


# If npm install failed, skip steps that depend on installed packages
if [ "$NPM_OK" != true ]; then
  echo "Skipping Playwright, emulator, and devservices setup (npm install failed)" >&2
  echo "Session start hook complete (with warnings)" >&2
  exit 0
fi

# --- 2. Install Playwright chromium ----------------------------------------
# Let Playwright decide whether the correct browser revision is already
# cached.  The previous manual "ls chromium-*" check caused false positives
# when the pre-installed revision (e.g. 1194) didn't match what the current
# Playwright version actually requires (e.g. 1208).
echo "Installing Playwright chromium (idempotent — skips if up-to-date)..." >&2
if ! timeout 120 npx playwright install --with-deps chromium >&2 2>&1; then
  echo "Warning: Playwright install failed or timed out" >&2
fi

# --- 3. Pre-cache Firebase emulator JARs ----------------------------------
# Start emulators briefly to download JARs, then stop them.
if ! command -v java &>/dev/null; then
  echo "Warning: Java not found, skipping emulator pre-cache" >&2
elif ! [ -x node_modules/.bin/firebase ]; then
  echo "Warning: firebase-tools not installed, skipping emulator pre-cache" >&2
else
  echo "Pre-caching Firebase emulator JARs..." >&2
  # Start in a new process group so we can kill the whole tree
  setsid npx firebase emulators:start --project demo-prepaid-ai >/dev/null 2>&1 &
  EMULATOR_PID=$!
  BACKGROUND_PIDS+=("$EMULATOR_PID")

  # Wait for emulators to become ready (up to 45s)
  EMULATOR_READY=false
  for i in $(seq 1 45); do
    if ! kill -0 "$EMULATOR_PID" 2>/dev/null; then
      echo "Emulator process exited early" >&2
      break
    fi
    if curl -s --max-time 2 http://127.0.0.1:4000 >/dev/null 2>&1; then
      echo "Firebase emulators are ready (${i}s)" >&2
      EMULATOR_READY=true
      break
    fi
    sleep 1
  done

  if [ "$EMULATOR_READY" = false ]; then
    echo "Warning: Emulators did not become ready in time" >&2
  fi

  # Stop the emulators — they were only started to cache the JARs.
  # Kill the whole process group (npx + java children).
  kill -- -"$EMULATOR_PID" 2>/dev/null || kill "$EMULATOR_PID" 2>/dev/null || true
  wait "$EMULATOR_PID" 2>/dev/null || true
  BACKGROUND_PIDS=()
fi

# --- 4. Start tracked development services --------------------------------
echo "Starting tracked development services..." >&2
if ! timeout 180 npm run devservices >&2 2>&1; then
  echo "Warning: devservices failed or timed out" >&2
  echo "Session start hook complete (with warnings)" >&2
  exit 0
fi

echo "Session start hook complete" >&2
