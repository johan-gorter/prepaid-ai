#!/bin/bash
# SessionStart hook — sets up the remote environment for development.
# Intentionally avoids "set -euo pipefail" so that individual failures
# don't abort the entire hook (which would block env-var persistence
# and make Claude Code appear to hang while waiting for the timeout).

# Only run in Claude Code remote environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

# Fix proxy exclusions: the default NO_PROXY excludes *.googleapis.com and
# *.google.com, but in the sandbox there is no direct DNS for those hosts.
# Route them through the proxy so downloads (Playwright browsers, Firebase
# emulator JARs) can succeed.
FIXED_NO_PROXY="localhost,127.0.0.1,169.254.169.254,metadata.google.internal,*.svc.cluster.local,*.local"
export NO_PROXY="$FIXED_NO_PROXY"
export no_proxy="$FIXED_NO_PROXY"

# Clear Java proxy flags — firebase-tools sets its own, and the default
# JAVA_TOOL_OPTIONS causes a "circular structure" serialisation error.
export JAVA_TOOL_OPTIONS=""

# Persist proxy fix early so the agent session has them even if later steps fail
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo "export NO_PROXY=\"$FIXED_NO_PROXY\"" >> "$CLAUDE_ENV_FILE"
  echo "export no_proxy=\"$FIXED_NO_PROXY\"" >> "$CLAUDE_ENV_FILE"
  echo 'export JAVA_TOOL_OPTIONS=""' >> "$CLAUDE_ENV_FILE"
fi

# 1. Install npm dependencies (skip if node_modules exists and is current)
if [ ! -d node_modules ] || [ package.json -nt node_modules/.package-lock.json ]; then
  echo "Installing npm dependencies..."
  if command -v timeout &>/dev/null; then
    timeout 120 npm install || echo "Warning: npm install failed or timed out"
  else
    npm install || echo "Warning: npm install failed"
  fi
else
  echo "npm dependencies already installed, skipping"
fi

# 2. Install Playwright chromium (skip if already cached)
NEED_PW_INSTALL=true
if npx playwright install --dry-run chromium 2>/dev/null | grep -q "already installed"; then
  NEED_PW_INSTALL=false
fi
if [ "$NEED_PW_INSTALL" = true ]; then
  echo "Installing Playwright chromium..."
  if command -v timeout &>/dev/null; then
    timeout 120 npx playwright install chromium || echo "Warning: Playwright install failed or timed out"
  else
    npx playwright install chromium || echo "Warning: Playwright install failed"
  fi
else
  echo "Playwright chromium already installed, skipping"
fi

# 3. Pre-download Firebase emulator binaries by starting and immediately
#    stopping the emulators. This ensures JARs are cached for later use.
if ! command -v java &>/dev/null; then
  echo "Warning: Java not found, skipping emulator pre-cache"
else
  echo "Pre-caching Firebase emulator JARs..."
  npx firebase emulators:start --project prepaid-ai-emulator &
  EMULATOR_PID=$!

  # Wait for emulators to become ready (up to 30s)
  EMULATOR_READY=false
  for i in $(seq 1 30); do
    # Check if the process died early (e.g. download failure)
    if ! kill -0 "$EMULATOR_PID" 2>/dev/null; then
      echo "Emulator process exited early"
      break
    fi
    if command -v curl &>/dev/null && curl -s http://127.0.0.1:4000 >/dev/null 2>&1; then
      echo "Firebase emulators are ready (${i}s)"
      EMULATOR_READY=true
      break
    fi
    sleep 1
  done

  if [ "$EMULATOR_READY" = false ]; then
    echo "Warning: Emulators did not become ready in time"
  fi

  # Stop the emulators — they were only started to cache the JARs
  kill "$EMULATOR_PID" 2>/dev/null || true
  wait "$EMULATOR_PID" 2>/dev/null || true
fi

echo "Session start hook complete"
