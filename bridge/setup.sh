#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# ArcadIA Bridge — Setup & Restart Script for Meta Employees
#
# This script:
#   1. Checks prerequisites (Claude Code, Node.js)
#   2. Downloads the latest bridge from GitHub
#   3. Stops any existing bridge process
#   4. Starts the new bridge
#   5. Verifies it's working with a health check
#   6. Optionally sets up auto-start on login (macOS LaunchAgent)
#
# Usage:
#   curl -sL https://raw.githubusercontent.com/ikosoymeta/Arcadia/main/bridge/setup.sh | bash
#
# Or to just restart:
#   bash ~/.arcadia-bridge/setup.sh
# ─────────────────────────────────────────────────────────────────────────────

# Colors and formatting
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m' # No Color

BRIDGE_DIR="$HOME/.arcadia-bridge"
BRIDGE_FILE="$BRIDGE_DIR/arcadia-bridge.js"
PLIST_PATH="$HOME/Library/LaunchAgents/com.arcadia.bridge.plist"
BRIDGE_URL="https://raw.githubusercontent.com/ikosoymeta/Arcadia/main/bridge/arcadia-bridge.js"
HEALTH_URL="http://127.0.0.1:8087/health"
LOG_FILE="$BRIDGE_DIR/bridge.log"
PORT=8087
STEP=0
TOTAL_STEPS=6

# ─── Helper functions ────────────────────────────────────────────────────────

step() {
  STEP=$((STEP + 1))
  echo ""
  echo -e "  ${BLUE}[$STEP/$TOTAL_STEPS]${NC} ${BOLD}$1${NC}"
}

ok() {
  echo -e "        ${GREEN}✓${NC} $1"
}

warn() {
  echo -e "        ${YELLOW}⚠${NC} $1"
}

fail() {
  echo -e "        ${RED}✗${NC} $1"
}

info() {
  echo -e "        ${DIM}$1${NC}"
}

spinner() {
  local pid=$1
  local msg=$2
  local spin='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
  local i=0
  while kill -0 "$pid" 2>/dev/null; do
    local c=${spin:i++%${#spin}:1}
    printf "\r        ${CYAN}%s${NC} %s" "$c" "$msg"
    sleep 0.1
  done
  printf "\r        \033[K" # Clear the spinner line
}

# ─── Banner ──────────────────────────────────────────────────────────────────

clear 2>/dev/null || true
echo ""
echo -e "  ${BOLD}${CYAN}⚡ ArcadIA Bridge — Setup & Install${NC}"
echo -e "  ${DIM}────────────────────────────────────────${NC}"
echo -e "  ${DIM}This will set up the local bridge that connects${NC}"
echo -e "  ${DIM}ArcadIA web app to Claude Code on your machine.${NC}"
echo ""

# ─── Step 1: Check Claude Code ───────────────────────────────────────────────

step "Checking for Claude Code..."

if command -v claude &> /dev/null; then
  CLAUDE_PATH=$(which claude)
  ok "Claude Code found at: ${DIM}$CLAUDE_PATH${NC}"
  
  # Try to get version
  CLAUDE_VERSION=$(claude --version 2>/dev/null | head -1) || true
  if [ -n "$CLAUDE_VERSION" ]; then
    info "Version: $CLAUDE_VERSION"
  fi
else
  fail "Claude Code is not installed!"
  echo ""
  echo -e "        ${YELLOW}Claude Code is required for the bridge to work.${NC}"
  echo -e "        Install it from: ${CYAN}https://fburl.com/claude.code.users${NC}"
  echo ""
  echo -e "        After installing Claude Code, run this script again."
  echo ""
  exit 1
fi

# ─── Step 2: Check Node.js ──────────────────────────────────────────────────

step "Checking for Node.js..."

if command -v node &> /dev/null; then
  NODE_PATH=$(which node)
  NODE_VERSION=$(node --version 2>/dev/null)
  ok "Node.js found at: ${DIM}$NODE_PATH${NC}"
  info "Version: $NODE_VERSION"
else
  warn "Node.js not found. Attempting to install via Homebrew..."
  
  if command -v brew &> /dev/null; then
    echo ""
    brew install node 2>&1 | while read -r line; do
      echo -e "        ${DIM}brew: $line${NC}"
    done
    
    if command -v node &> /dev/null; then
      NODE_PATH=$(which node)
      NODE_VERSION=$(node --version 2>/dev/null)
      ok "Node.js installed successfully!"
      info "Version: $NODE_VERSION"
    else
      fail "Failed to install Node.js"
      echo -e "        Install it manually: ${CYAN}https://nodejs.org${NC}"
      exit 1
    fi
  else
    fail "Neither Node.js nor Homebrew found"
    echo -e "        Install Node.js from: ${CYAN}https://nodejs.org${NC}"
    echo -e "        Or install Homebrew: ${CYAN}https://brew.sh${NC}"
    exit 1
  fi
fi

# ─── Step 3: Download latest bridge ─────────────────────────────────────────

step "Downloading latest bridge from GitHub..."

mkdir -p "$BRIDGE_DIR"
info "Target: $BRIDGE_FILE"

# Download with progress indication
HTTP_CODE=$(curl -sL -w "%{http_code}" "$BRIDGE_URL" -o "$BRIDGE_FILE.tmp" 2>/dev/null)

if [ "$HTTP_CODE" = "200" ] && [ -s "$BRIDGE_FILE.tmp" ]; then
  mv "$BRIDGE_FILE.tmp" "$BRIDGE_FILE"
  chmod +x "$BRIDGE_FILE"
  
  # Extract version from the downloaded file
  BRIDGE_VERSION=$(grep -o "VERSION = '[^']*'" "$BRIDGE_FILE" 2>/dev/null | head -1 | cut -d"'" -f2)
  FILE_SIZE=$(wc -c < "$BRIDGE_FILE" | tr -d ' ')
  
  ok "Bridge downloaded successfully"
  info "Version: ${BRIDGE_VERSION:-unknown}"
  info "Size: ${FILE_SIZE} bytes"
else
  rm -f "$BRIDGE_FILE.tmp"
  fail "Failed to download bridge (HTTP $HTTP_CODE)"
  echo -e "        ${YELLOW}Check your internet connection and try again.${NC}"
  echo -e "        URL: ${DIM}$BRIDGE_URL${NC}"
  exit 1
fi

# Also save this setup script locally for easy re-runs
SETUP_URL="https://raw.githubusercontent.com/ikosoymeta/Arcadia/main/bridge/setup.sh"
curl -sL "$SETUP_URL" -o "$BRIDGE_DIR/setup.sh" 2>/dev/null && chmod +x "$BRIDGE_DIR/setup.sh" || true

# ─── Step 4: Stop existing bridge ───────────────────────────────────────────

step "Stopping any existing bridge process..."

# Check if something is running on the port
EXISTING_PID=$(lsof -ti:$PORT 2>/dev/null || true)

if [ -n "$EXISTING_PID" ]; then
  info "Found existing process on port $PORT (PID: $EXISTING_PID)"
  kill "$EXISTING_PID" 2>/dev/null || true
  sleep 1
  
  # Force kill if still running
  if kill -0 "$EXISTING_PID" 2>/dev/null; then
    kill -9 "$EXISTING_PID" 2>/dev/null || true
    sleep 1
  fi
  ok "Previous bridge stopped"
else
  # Also try pkill as fallback
  pkill -f "arcadia-bridge" 2>/dev/null || true
  sleep 0.5
  ok "No existing bridge found (clean start)"
fi

# Unload LaunchAgent if it exists (to prevent auto-restart of old version)
if [ -f "$PLIST_PATH" ]; then
  launchctl unload "$PLIST_PATH" 2>/dev/null || true
  info "Unloaded previous LaunchAgent"
fi

# ─── Step 5: Start the bridge ───────────────────────────────────────────────

step "Starting ArcadIA Bridge..."

info "Command: node $BRIDGE_FILE"
info "Logging to: $LOG_FILE"

# Start the bridge in the background, logging output
nohup node "$BRIDGE_FILE" >> "$LOG_FILE" 2>&1 &
BRIDGE_PID=$!

info "Process started (PID: $BRIDGE_PID)"

# Wait a moment for it to initialize
echo -ne "        ${CYAN}⠋${NC} Waiting for bridge to initialize..."
sleep 1

# Check if process is still running
if ! kill -0 "$BRIDGE_PID" 2>/dev/null; then
  printf "\r        \033[K"
  fail "Bridge process exited immediately!"
  echo ""
  echo -e "        ${YELLOW}Last 10 lines of log:${NC}"
  tail -10 "$LOG_FILE" 2>/dev/null | while read -r line; do
    echo -e "        ${DIM}  $line${NC}"
  done
  echo ""
  echo -e "        ${YELLOW}Try running manually to see the error:${NC}"
  echo -e "        ${CYAN}node $BRIDGE_FILE${NC}"
  echo ""
  exit 1
fi

printf "\r        \033[K"
ok "Bridge process is running (PID: $BRIDGE_PID)"

# ─── Step 6: Health check ───────────────────────────────────────────────────

step "Verifying bridge is responding..."

MAX_RETRIES=10
RETRY=0
HEALTHY=false

while [ $RETRY -lt $MAX_RETRIES ]; do
  RETRY=$((RETRY + 1))
  printf "\r        ${CYAN}⠋${NC} Health check attempt $RETRY/$MAX_RETRIES..."
  
  HEALTH_RESPONSE=$(curl -s --connect-timeout 2 --max-time 5 "$HEALTH_URL" 2>/dev/null || true)
  
  if echo "$HEALTH_RESPONSE" | grep -q '"status":"ok"' 2>/dev/null; then
    HEALTHY=true
    break
  fi
  
  sleep 1
done

printf "\r        \033[K"

if [ "$HEALTHY" = true ]; then
  ok "Bridge is healthy and responding!"
  
  # Parse health response for details
  RESP_VERSION=$(echo "$HEALTH_RESPONSE" | grep -o '"version":"[^"]*"' | cut -d'"' -f4)
  RESP_CLAUDE=$(echo "$HEALTH_RESPONSE" | grep -o '"claude_path":"[^"]*"' | cut -d'"' -f4)
  
  info "Endpoint: http://127.0.0.1:$PORT"
  [ -n "$RESP_VERSION" ] && info "Bridge version: $RESP_VERSION"
  [ -n "$RESP_CLAUDE" ] && info "Claude path: $RESP_CLAUDE"
else
  fail "Bridge is not responding after $MAX_RETRIES attempts"
  echo ""
  echo -e "        ${YELLOW}The process is running but not accepting connections.${NC}"
  echo -e "        ${YELLOW}Check the log for errors:${NC}"
  echo -e "        ${CYAN}cat $LOG_FILE${NC}"
  echo ""
  tail -10 "$LOG_FILE" 2>/dev/null | while read -r line; do
    echo -e "        ${DIM}  $line${NC}"
  done
  echo ""
  exit 1
fi

# ─── Set up LaunchAgent for auto-start ───────────────────────────────────────

NODE_FULL_PATH=$(which node)
mkdir -p "$HOME/Library/LaunchAgents" 2>/dev/null || true

cat > "$PLIST_PATH" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.arcadia.bridge</string>
    <key>ProgramArguments</key>
    <array>
        <string>${NODE_FULL_PATH}</string>
        <string>${BRIDGE_FILE}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${LOG_FILE}</string>
    <key>StandardErrorPath</key>
    <string>${BRIDGE_DIR}/bridge-error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin:${HOME}/.nvm/versions/node/$(node --version 2>/dev/null)/bin</string>
    </dict>
</dict>
</plist>
EOF

launchctl load "$PLIST_PATH" 2>/dev/null || true

# ─── Success Banner ──────────────────────────────────────────────────────────

echo ""
echo -e "  ${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "  ${GREEN}║                                                      ║${NC}"
echo -e "  ${GREEN}║${NC}   ${BOLD}${GREEN}✅ ArcadIA Bridge is running!${NC}                       ${GREEN}║${NC}"
echo -e "  ${GREEN}║                                                      ║${NC}"
echo -e "  ${GREEN}║${NC}   Bridge:  ${CYAN}http://127.0.0.1:$PORT${NC}                  ${GREEN}║${NC}"
echo -e "  ${GREEN}║${NC}   PID:     ${DIM}$BRIDGE_PID${NC}                                   ${GREEN}║${NC}"
echo -e "  ${GREEN}║${NC}   Log:     ${DIM}~/.arcadia-bridge/bridge.log${NC}             ${GREEN}║${NC}"
echo -e "  ${GREEN}║${NC}   Auto:    ${DIM}Starts on every login${NC}                    ${GREEN}║${NC}"
echo -e "  ${GREEN}║                                                      ║${NC}"
echo -e "  ${GREEN}║${NC}   ${BOLD}Open ArcadIA:${NC}                                      ${GREEN}║${NC}"
echo -e "  ${GREEN}║${NC}   ${CYAN}https://ikosoymeta.github.io/Arcadia/${NC}              ${GREEN}║${NC}"
echo -e "  ${GREEN}║                                                      ║${NC}"
echo -e "  ${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${DIM}To restart later:  bash ~/.arcadia-bridge/setup.sh${NC}"
echo -e "  ${DIM}To view logs:      tail -f ~/.arcadia-bridge/bridge.log${NC}"
echo -e "  ${DIM}To stop:           pkill -f arcadia-bridge${NC}"
echo ""
