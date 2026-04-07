#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# ArcadIA Bridge — Devserver Setup (Persistent 24/7)
#
# This script sets up the ArcadIA Bridge on a Meta devserver (CentOS/Linux)
# with persistent 24/7 operation using tmux + cron auto-restart.
#
# What it does:
#   1. Checks prerequisites (Claude Code, Node.js)
#   2. Downloads the latest bridge from GitHub
#   3. Stops any existing bridge process
#   4. Starts the bridge in a tmux session (persists after SSH disconnect)
#   5. Sets up a cron job to auto-restart on reboot and every 6 hours
#   6. Configures the bridge for remote access (--host 0.0.0.0)
#   7. Verifies everything is working
#
# Usage (one-liner from ArcadIA):
#   curl -sL https://raw.githubusercontent.com/ikosoymeta/Arcadia/main/bridge/setup-devserver.sh | bash
#
# Or to just restart:
#   bash ~/.arcadia-bridge/setup-devserver.sh
# ─────────────────────────────────────────────────────────────────────────────

# Colors and formatting
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

BRIDGE_DIR="$HOME/.arcadia-bridge"
BRIDGE_FILE="$BRIDGE_DIR/arcadia-bridge.js"
BRIDGE_URL="https://raw.githubusercontent.com/ikosoymeta/Arcadia/main/bridge/arcadia-bridge.js"
HEALTH_URL="http://127.0.0.1:8087/health"
LOG_FILE="$BRIDGE_DIR/bridge.log"
PORT=8087
TMUX_SESSION="arcadia-bridge"
STEP=0
TOTAL_STEPS=7

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
echo -e "  ${BOLD}${CYAN}⚡ ArcadIA Bridge — Devserver Setup (24/7 Persistent)${NC}"
echo -e "  ${DIM}──────────────────────────────────────────────────────${NC}"
echo -e "  ${DIM}This will set up the bridge on your Meta devserver with${NC}"
echo -e "  ${DIM}persistent operation, auto-restart, and remote access.${NC}"
echo ""

HOSTNAME=$(hostname -f 2>/dev/null || hostname)
echo -e "  ${DIM}Host: ${CYAN}$HOSTNAME${NC}"
echo ""

# ─── Step 1: Check Claude Code ───────────────────────────────────────────────

step "Checking for Claude Code..."

if command -v claude &> /dev/null; then
  CLAUDE_PATH=$(which claude)
  ok "Claude Code found at: ${DIM}$CLAUDE_PATH${NC}"
  CLAUDE_VERSION=$(claude --version 2>/dev/null | head -1) || true
  [ -n "$CLAUDE_VERSION" ] && info "Version: $CLAUDE_VERSION"
else
  fail "Claude Code is not installed!"
  echo ""
  echo -e "        ${YELLOW}Claude Code is required for the bridge to work.${NC}"
  echo -e "        Install it from: ${CYAN}https://fburl.com/claude.code.users${NC}"
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
  fail "Node.js not found!"
  echo ""
  echo -e "        ${YELLOW}Install Node.js on your devserver:${NC}"
  echo -e "        ${CYAN}sudo dnf install -y nodejs${NC}  (CentOS 9)"
  echo -e "        ${CYAN}or: curl -fsSL https://fnm.vercel.app/install | bash && fnm install --lts${NC}"
  echo ""
  exit 1
fi

# ─── Step 3: Check tmux ─────────────────────────────────────────────────────

step "Checking for tmux..."

if command -v tmux &> /dev/null; then
  ok "tmux found: $(tmux -V 2>/dev/null || echo 'installed')"
else
  warn "tmux not found. Installing..."
  if command -v dnf &> /dev/null; then
    sudo dnf install -y tmux 2>&1 | tail -1
  elif command -v yum &> /dev/null; then
    sudo yum install -y tmux 2>&1 | tail -1
  elif command -v apt-get &> /dev/null; then
    sudo apt-get install -y tmux 2>&1 | tail -1
  fi
  if command -v tmux &> /dev/null; then
    ok "tmux installed successfully"
  else
    warn "Could not install tmux. Will use nohup instead (less reliable)."
  fi
fi

# ─── Step 4: Download latest bridge ─────────────────────────────────────────

step "Downloading latest bridge from GitHub..."

mkdir -p "$BRIDGE_DIR"
info "Target: $BRIDGE_FILE"

HTTP_CODE=$(curl -sL -w "%{http_code}" "$BRIDGE_URL" -o "$BRIDGE_FILE.tmp" 2>/dev/null)

if [ "$HTTP_CODE" = "200" ] && [ -s "$BRIDGE_FILE.tmp" ]; then
  mv "$BRIDGE_FILE.tmp" "$BRIDGE_FILE"
  chmod +x "$BRIDGE_FILE"
  BRIDGE_VERSION=$(grep -o "VERSION = '[^']*'" "$BRIDGE_FILE" 2>/dev/null | head -1 | cut -d"'" -f2)
  FILE_SIZE=$(wc -c < "$BRIDGE_FILE" | tr -d ' ')
  ok "Bridge downloaded successfully"
  info "Version: ${BRIDGE_VERSION:-unknown}"
  info "Size: ${FILE_SIZE} bytes"
else
  rm -f "$BRIDGE_FILE.tmp"
  fail "Failed to download bridge (HTTP $HTTP_CODE)"
  exit 1
fi

# Save this setup script locally for easy re-runs
SETUP_URL="https://raw.githubusercontent.com/ikosoymeta/Arcadia/main/bridge/setup-devserver.sh"
curl -sL "$SETUP_URL" -o "$BRIDGE_DIR/setup-devserver.sh" 2>/dev/null && chmod +x "$BRIDGE_DIR/setup-devserver.sh" || true

# ─── Step 5: Stop existing bridge ───────────────────────────────────────────

step "Stopping any existing bridge..."

# Kill existing tmux session
if tmux has-session -t "$TMUX_SESSION" 2>/dev/null; then
  tmux kill-session -t "$TMUX_SESSION" 2>/dev/null || true
  info "Killed existing tmux session"
  sleep 1
fi

# Kill any process on the port
EXISTING_PID=$(lsof -ti:$PORT 2>/dev/null || ss -tlnp "sport = :$PORT" 2>/dev/null | grep -oP 'pid=\K[0-9]+' || true)
if [ -n "$EXISTING_PID" ]; then
  kill "$EXISTING_PID" 2>/dev/null || true
  sleep 1
  kill -9 "$EXISTING_PID" 2>/dev/null || true
  ok "Previous bridge stopped (PID: $EXISTING_PID)"
else
  pkill -f "arcadia-bridge" 2>/dev/null || true
  sleep 0.5
  ok "No existing bridge found (clean start)"
fi

# ─── Step 6: Start bridge in tmux ───────────────────────────────────────────

step "Starting ArcadIA Bridge (persistent tmux session)..."

NODE_FULL_PATH=$(which node)
info "Command: $NODE_FULL_PATH $BRIDGE_FILE --host 0.0.0.0"
info "tmux session: $TMUX_SESSION"
info "Log file: $LOG_FILE"

# Create tmux session with the bridge running
# The bridge is started with --host 0.0.0.0 for remote access
tmux new-session -d -s "$TMUX_SESSION" \
  "while true; do echo \"[\$(date)] Starting ArcadIA Bridge...\" >> $LOG_FILE; $NODE_FULL_PATH $BRIDGE_FILE --host 0.0.0.0 >> $LOG_FILE 2>&1; echo \"[\$(date)] Bridge exited. Restarting in 5s...\" >> $LOG_FILE; sleep 5; done"

if tmux has-session -t "$TMUX_SESSION" 2>/dev/null; then
  ok "Bridge started in tmux session '$TMUX_SESSION'"
  info "The bridge will auto-restart if it crashes"
else
  warn "tmux failed. Falling back to nohup..."
  nohup $NODE_FULL_PATH "$BRIDGE_FILE" --host 0.0.0.0 >> "$LOG_FILE" 2>&1 &
  ok "Bridge started via nohup (PID: $!)"
fi

# Wait for initialization
echo -ne "        ${CYAN}⠋${NC} Waiting for bridge to initialize..."
sleep 2
printf "\r        \033[K"

# ─── Step 7: Set up cron auto-restart ────────────────────────────────────────

step "Setting up auto-restart (cron)..."

CRON_CMD="@reboot sleep 10 && $BRIDGE_DIR/setup-devserver.sh >> $LOG_FILE 2>&1"
HEALTH_CRON="*/30 * * * * curl -sf http://127.0.0.1:$PORT/health > /dev/null || ($BRIDGE_DIR/setup-devserver.sh >> $LOG_FILE 2>&1)"

# Remove old ArcadIA cron entries and add new ones
(crontab -l 2>/dev/null | grep -v "arcadia-bridge" | grep -v "setup-devserver"; echo "$CRON_CMD"; echo "$HEALTH_CRON") | crontab - 2>/dev/null

if crontab -l 2>/dev/null | grep -q "arcadia-bridge\|setup-devserver"; then
  ok "Cron jobs installed:"
  info "• Auto-start on reboot"
  info "• Health check every 30 minutes (auto-restart if down)"
else
  warn "Could not install cron jobs. Bridge will run until tmux session ends."
fi

# ─── Health check ────────────────────────────────────────────────────────────

echo ""
echo -e "  ${BLUE}[✓]${NC} ${BOLD}Verifying bridge is responding...${NC}"

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
  info "Local endpoint: http://127.0.0.1:$PORT"
  info "Remote endpoint: http://$HOSTNAME:$PORT"
  [ -n "$RESP_VERSION" ] && info "Bridge version: $RESP_VERSION"
else
  fail "Bridge is not responding after $MAX_RETRIES attempts"
  echo -e "        ${YELLOW}Check the log: tail -f $LOG_FILE${NC}"
  tail -5 "$LOG_FILE" 2>/dev/null | while read -r line; do
    echo -e "        ${DIM}  $line${NC}"
  done
  exit 1
fi

# ─── Success Banner ──────────────────────────────────────────────────────────

echo ""
echo -e "  ${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "  ${GREEN}║                                                            ║${NC}"
echo -e "  ${GREEN}║${NC}   ${BOLD}${GREEN}✅ ArcadIA Bridge is running 24/7!${NC}                       ${GREEN}║${NC}"
echo -e "  ${GREEN}║                                                            ║${NC}"
echo -e "  ${GREEN}║${NC}   Local:   ${CYAN}http://127.0.0.1:$PORT${NC}                           ${GREEN}║${NC}"
echo -e "  ${GREEN}║${NC}   Remote:  ${CYAN}http://$HOSTNAME:$PORT${NC}"
echo -e "  ${GREEN}║${NC}   tmux:    ${DIM}$TMUX_SESSION${NC}                                     ${GREEN}║${NC}"
echo -e "  ${GREEN}║${NC}   Log:     ${DIM}~/.arcadia-bridge/bridge.log${NC}                      ${GREEN}║${NC}"
echo -e "  ${GREEN}║${NC}   Auto:    ${DIM}Restarts on reboot + health check every 30m${NC}       ${GREEN}║${NC}"
echo -e "  ${GREEN}║                                                            ║${NC}"
echo -e "  ${GREEN}║${NC}   ${BOLD}Open ArcadIA and enter this hostname:${NC}                    ${GREEN}║${NC}"
echo -e "  ${GREEN}║${NC}   ${CYAN}$HOSTNAME${NC}"
echo -e "  ${GREEN}║                                                            ║${NC}"
echo -e "  ${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${DIM}Useful commands:${NC}"
echo -e "  ${DIM}  Restart:    bash ~/.arcadia-bridge/setup-devserver.sh${NC}"
echo -e "  ${DIM}  View logs:  tail -f ~/.arcadia-bridge/bridge.log${NC}"
echo -e "  ${DIM}  Attach:     tmux attach -t $TMUX_SESSION${NC}"
echo -e "  ${DIM}  Stop:       tmux kill-session -t $TMUX_SESSION${NC}"
echo ""
