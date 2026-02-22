#!/bin/bash
set -euo pipefail

# Only run in Claude Code remote environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

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

# 1. Install npm dependencies
npm install

# 2. Install Playwright chromium (the only browser used in tests)
npx playwright install chromium

# 3. Pre-download Firebase emulator binaries by starting and immediately
#    stopping the emulators. This ensures JARs are cached for later use.
npx firebase emulators:start --project prepaid-ai-test &
EMULATOR_PID=$!

# Wait for emulators to become ready (up to 90s)
for i in $(seq 1 90); do
  if curl -s http://127.0.0.1:4000 > /dev/null 2>&1; then
    echo "Firebase emulators are ready (${i}s)"
    break
  fi
  sleep 1
done

# Persist proxy fix so the agent session can start emulators later
echo "export NO_PROXY=\"$FIXED_NO_PROXY\"" >> "$CLAUDE_ENV_FILE"
echo "export no_proxy=\"$FIXED_NO_PROXY\"" >> "$CLAUDE_ENV_FILE"
echo 'export JAVA_TOOL_OPTIONS=""' >> "$CLAUDE_ENV_FILE"

# Stop the emulators — they were only started to cache the JARs
kill "$EMULATOR_PID" 2>/dev/null || true
wait "$EMULATOR_PID" 2>/dev/null || true

echo "Session start hook complete"
