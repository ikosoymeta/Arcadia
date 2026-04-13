#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# ArcadIA Bridge — Cross-Platform Setup & Restart Script
#
# Supports: macOS (LaunchAgent) and Linux/CentOS (tmux + cron)
#
# This script:
#   1. Auto-detects your OS (macOS / Linux)
#   2. Checks prerequisites (Claude Code, Node.js)
#   3. Downloads the latest bridge from GitHub
#   4. Stops any existing bridge process
#   5. Starts the new bridge with persistent auto-restart
#   6. Verifies it's working with a health check
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
BRIDGE_URL="https://raw.githubusercontent.com/ikosoymeta/Arcadia/main/bridge/arcadia-bridge.js"
HEALTH_URL="http://127.0.0.1:8087/health"
LOG_FILE="$BRIDGE_DIR/bridge.log"
PORT=8087
STEP=0

# ─── Auto-detect OS ────────────────────────────────────────────────────────

OS_TYPE="unknown"
case "$(uname -s)" in
  Darwin*)  OS_TYPE="macos" ;;
  Linux*)   OS_TYPE="linux" ;;
  MINGW*|MSYS*|CYGWIN*) OS_TYPE="windows" ;;
esac

if [ "$OS_TYPE" = "macos" ]; then
  TOTAL_STEPS=6
  PLIST_PATH="$HOME/Library/LaunchAgents/com.arcadia.bridge.plist"
elif [ "$OS_TYPE" = "linux" ]; then
  TOTAL_STEPS=6
else
  TOTAL_STEPS=5
fi

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

# ─── Banner ──────────────────────────────────────────────────────────────────

clear 2>/dev/null || true
echo ""
echo -e "  ${BOLD}${CYAN}⚡ ArcadIA Bridge — Setup & Install${NC}"
echo -e "  ${DIM}────────────────────────────────────────${NC}"
echo -e "  ${DIM}This will set up the local bridge that connects${NC}"
echo -e "  ${DIM}ArcadIA web app to Claude Code on your machine.${NC}"
echo ""
echo -e "  ${BOLD}Detected OS:${NC} ${CYAN}${OS_TYPE}${NC}"
echo ""

# ─── Step 1: Check Claude Code ───────────────────────────────────────────────

step "Checking for Claude Code..."

if command -v claude &> /dev/null; then
  CLAUDE_PATH=$(which claude)
  ok "Claude Code found at: ${DIM}$CLAUDE_PATH${NC}"
  
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
  if [ "$OS_TYPE" = "macos" ]; then
    warn "Node.js not found. Attempting to install via Homebrew..."
    if command -v brew &> /dev/null; then
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
  elif [ "$OS_TYPE" = "linux" ]; then
    warn "Node.js not found. Attempting to install..."
    if command -v dnf &> /dev/null; then
      sudo dnf install -y nodejs 2>&1 | tail -3
    elif command -v yum &> /dev/null; then
      sudo yum install -y nodejs 2>&1 | tail -3
    elif command -v apt-get &> /dev/null; then
      sudo apt-get install -y nodejs 2>&1 | tail -3
    fi
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
    fail "Node.js not found"
    echo -e "        Install it from: ${CYAN}https://nodejs.org${NC}"
    exit 1
  fi
fi

# ─── Step 3: Download latest bridge ─────────────────────────────────────────

step "Downloading latest bridge from GitHub..."

mkdir -p "$BRIDGE_DIR"
info "Target: $BRIDGE_FILE"

# Try multiple download methods (some environments block direct curl)
DOWNLOADED=false

# Method 1: Direct curl
HTTP_CODE=$(curl -sL -w "%{http_code}" "$BRIDGE_URL" -o "$BRIDGE_FILE.tmp" 2>/dev/null)
if [ "$HTTP_CODE" = "200" ] && [ -s "$BRIDGE_FILE.tmp" ]; then
  DOWNLOADED=true
fi

# Method 2: curl with proxy (Meta devservers)
if [ "$DOWNLOADED" = false ]; then
  info "Direct download failed, trying with proxy..."
  HTTP_CODE=$(curl -sL --proxy http://fwdproxy:8080 -w "%{http_code}" "$BRIDGE_URL" -o "$BRIDGE_FILE.tmp" 2>/dev/null)
  if [ "$HTTP_CODE" = "200" ] && [ -s "$BRIDGE_FILE.tmp" ]; then
    DOWNLOADED=true
  fi
fi

# Method 3: git clone (handles auth automatically)
if [ "$DOWNLOADED" = false ]; then
  info "Proxy download failed, trying git clone..."
  TEMP_CLONE="/tmp/arcadia-bridge-clone-$$"
  rm -rf "$TEMP_CLONE"
  if HTTPS_PROXY=http://fwdproxy:8080 git clone --depth 1 https://github.com/ikosoymeta/Arcadia.git "$TEMP_CLONE" 2>/dev/null; then
    cp "$TEMP_CLONE/bridge/arcadia-bridge.js" "$BRIDGE_FILE.tmp"
    rm -rf "$TEMP_CLONE"
    if [ -s "$BRIDGE_FILE.tmp" ]; then
      DOWNLOADED=true
    fi
  elif git clone --depth 1 https://github.com/ikosoymeta/Arcadia.git "$TEMP_CLONE" 2>/dev/null; then
    cp "$TEMP_CLONE/bridge/arcadia-bridge.js" "$BRIDGE_FILE.tmp"
    rm -rf "$TEMP_CLONE"
    if [ -s "$BRIDGE_FILE.tmp" ]; then
      DOWNLOADED=true
    fi
  fi
  rm -rf "$TEMP_CLONE" 2>/dev/null || true
fi

if [ "$DOWNLOADED" = true ]; then
  mv "$BRIDGE_FILE.tmp" "$BRIDGE_FILE"
  chmod +x "$BRIDGE_FILE"
  
  BRIDGE_VERSION=$(grep -o "VERSION = '[^']*'" "$BRIDGE_FILE" 2>/dev/null | head -1 | cut -d"'" -f2)
  FILE_SIZE=$(wc -c < "$BRIDGE_FILE" | tr -d ' ')
  
  ok "Bridge downloaded successfully"
  info "Version: ${BRIDGE_VERSION:-unknown}"
  info "Size: ${FILE_SIZE} bytes"
else
  rm -f "$BRIDGE_FILE.tmp"
  fail "Failed to download bridge"
  echo -e "        ${YELLOW}Check your internet connection and try again.${NC}"
  echo -e "        URL: ${DIM}$BRIDGE_URL${NC}"
  echo ""
  echo -e "        ${YELLOW}Alternative: manually clone the repo:${NC}"
  echo -e "        ${CYAN}git clone https://github.com/ikosoymeta/Arcadia.git /tmp/arcadia${NC}"
  echo -e "        ${CYAN}cp /tmp/arcadia/bridge/arcadia-bridge.js ~/.arcadia-bridge/arcadia-bridge.js${NC}"
  exit 1
fi

# Also save this setup script locally for easy re-runs
SETUP_URL="https://raw.githubusercontent.com/ikosoymeta/Arcadia/main/bridge/setup.sh"
curl -sL "$SETUP_URL" -o "$BRIDGE_DIR/setup.sh" 2>/dev/null && chmod +x "$BRIDGE_DIR/setup.sh" || true

# ─── Step 4: Stop existing bridge ───────────────────────────────────────────

step "Stopping any existing bridge process..."

# Check if something is running on the port
if [ "$OS_TYPE" = "macos" ]; then
  EXISTING_PID=$(lsof -ti:$PORT 2>/dev/null || true)
elif [ "$OS_TYPE" = "linux" ]; then
  EXISTING_PID=$(ss -tlnp "sport = :$PORT" 2>/dev/null | grep -oP 'pid=\K[0-9]+' || lsof -ti:$PORT 2>/dev/null || true)
fi

if [ -n "$EXISTING_PID" ]; then
  info "Found existing process on port $PORT (PID: $EXISTING_PID)"
  kill "$EXISTING_PID" 2>/dev/null || true
  sleep 1
  
  if kill -0 "$EXISTING_PID" 2>/dev/null; then
    kill -9 "$EXISTING_PID" 2>/dev/null || true
    sleep 1
  fi
  ok "Previous bridge stopped"
else
  pkill -f "arcadia-bridge" 2>/dev/null || true
  sleep 0.5
  ok "No existing bridge found (clean start)"
fi

# macOS: Unload LaunchAgent if it exists
if [ "$OS_TYPE" = "macos" ] && [ -f "$PLIST_PATH" ]; then
  launchctl unload "$PLIST_PATH" 2>/dev/null || true
  info "Unloaded previous LaunchAgent"
fi

# Linux: Kill existing tmux session
if [ "$OS_TYPE" = "linux" ]; then
  tmux kill-session -t arcadia-bridge 2>/dev/null || true
fi

# ─── Step 5: Start the bridge ───────────────────────────────────────────────

step "Starting ArcadIA Bridge..."

HOST_FLAG=""
if [ "$OS_TYPE" = "linux" ]; then
  HOST_FLAG="--host 0.0.0.0"
  info "Linux detected: binding to 0.0.0.0 for remote access"
fi

if [ "$OS_TYPE" = "linux" ]; then
  # Linux: Use tmux for persistent background process with auto-restart
  info "Starting in tmux session 'arcadia-bridge'..."
  tmux new-session -d -s arcadia-bridge "while true; do node $BRIDGE_FILE $HOST_FLAG >> $LOG_FILE 2>&1; echo '[$(date)] Bridge exited, restarting in 5s...' >> $LOG_FILE; sleep 5; done"
  BRIDGE_PID=$(tmux list-panes -t arcadia-bridge -F '#{pane_pid}' 2>/dev/null | head -1)
  ok "Bridge started in tmux (PID: ${BRIDGE_PID:-unknown})"
  info "View logs: tmux attach -t arcadia-bridge"
else
  # macOS: Start in background with nohup
  info "Command: node $BRIDGE_FILE"
  info "Logging to: $LOG_FILE"
  nohup node "$BRIDGE_FILE" >> "$LOG_FILE" 2>&1 &
  BRIDGE_PID=$!
  info "Process started (PID: $BRIDGE_PID)"
fi

# Wait for initialization
echo -ne "        ${CYAN}⠋${NC} Waiting for bridge to initialize..."
sleep 2
printf "\r        \033[K"

if [ "$OS_TYPE" != "linux" ]; then
  if ! kill -0 "$BRIDGE_PID" 2>/dev/null; then
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
fi

ok "Bridge process is running"

# ─── Step 6: Health check ───────────────────────────────────────────────────

step "Verifying bridge is responding..."

MAX_RETRIES=15
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
  
  RESP_VERSION=$(echo "$HEALTH_RESPONSE" | grep -o '"version":"[^"]*"' | cut -d'"' -f4)
  RESP_CLAUDE=$(echo "$HEALTH_RESPONSE" | grep -o '"claude_path":"[^"]*"' | cut -d'"' -f4)
  
  info "Endpoint: http://127.0.0.1:$PORT"
  [ -n "$RESP_VERSION" ] && info "Bridge version: $RESP_VERSION"
  [ -n "$RESP_CLAUDE" ] && info "Claude path: $RESP_CLAUDE"
else
  warn "Bridge not responding yet (may still be warming up)"
  echo ""
  echo -e "        ${YELLOW}The pool warm-up can take 10-30s. Check in a moment:${NC}"
  echo -e "        ${CYAN}curl http://127.0.0.1:$PORT/health${NC}"
  echo ""
fi

# ─── Set up persistent auto-start ──────────────────────────────────────────

if [ "$OS_TYPE" = "macos" ]; then
  # macOS: LaunchAgent for auto-start on login
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
  info "macOS LaunchAgent installed — bridge auto-starts on login"

elif [ "$OS_TYPE" = "linux" ]; then
  # Linux: cron @reboot for auto-start
  CRON_CMD="@reboot sleep 10 && tmux new-session -d -s arcadia-bridge 'while true; do node $BRIDGE_FILE --host 0.0.0.0 >> $LOG_FILE 2>&1; sleep 5; done'"
  
  # Add to crontab if not already there
  (crontab -l 2>/dev/null | grep -v "arcadia-bridge"; echo "$CRON_CMD") | crontab - 2>/dev/null || true
  info "Linux cron @reboot installed — bridge auto-starts on boot"
fi

# ─── Success Banner ──────────────────────────────────────────────────────────

AUTOSTART_MSG="Starts on every login (LaunchAgent)"
if [ "$OS_TYPE" = "linux" ]; then
  AUTOSTART_MSG="Starts on boot (cron + tmux)"
fi

echo ""
echo -e "  ${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "  ${GREEN}║                                                      ║${NC}"
echo -e "  ${GREEN}║${NC}   ${BOLD}${GREEN}✅ ArcadIA Bridge is running!${NC}                       ${GREEN}║${NC}"
echo -e "  ${GREEN}║                                                      ║${NC}"
echo -e "  ${GREEN}║${NC}   Bridge:  ${CYAN}http://127.0.0.1:$PORT${NC}                  ${GREEN}║${NC}"
echo -e "  ${GREEN}║${NC}   Log:     ${DIM}~/.arcadia-bridge/bridge.log${NC}             ${GREEN}║${NC}"
echo -e "  ${GREEN}║${NC}   Auto:    ${DIM}${AUTOSTART_MSG}${NC}  ${GREEN}║${NC}"
echo -e "  ${GREEN}║                                                      ║${NC}"
echo -e "  ${GREEN}║${NC}   ${BOLD}Open ArcadIA:${NC}                                      ${GREEN}║${NC}"
echo -e "  ${GREEN}║${NC}   ${CYAN}https://arcadia.manus.space${NC}                         ${GREEN}║${NC}"
echo -e "  ${GREEN}║                                                      ║${NC}"
echo -e "  ${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${DIM}To restart later:  bash ~/.arcadia-bridge/setup.sh${NC}"
echo -e "  ${DIM}To view logs:      tail -f ~/.arcadia-bridge/bridge.log${NC}"
echo -e "  ${DIM}To stop:           pkill -f arcadia-bridge${NC}"
if [ "$OS_TYPE" = "linux" ]; then
  echo -e "  ${DIM}To view tmux:      tmux attach -t arcadia-bridge${NC}"
fi
echo ""
