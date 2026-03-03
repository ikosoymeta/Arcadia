#!/bin/bash
# ArcadIA Bridge — One-time setup for Meta employees
# This script downloads the bridge, installs it, and sets it to auto-start on login.
# After running this once, ArcadIA will always auto-connect.

set -e

BRIDGE_DIR="$HOME/.arcadia-bridge"
PLIST_PATH="$HOME/Library/LaunchAgents/com.arcadia.bridge.plist"

echo ""
echo "  ⚡ ArcadIA Bridge — One-Time Setup"
echo "  ───────────────────────────────────"
echo ""

# Check Claude Code
if ! command -v claude &> /dev/null; then
  echo "  ✗ Claude Code not found."
  echo "    Install it first: https://fburl.com/claude.code.users"
  echo ""
  exit 1
fi
echo "  ✓ Claude Code found"

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "  → Installing Node.js via brew..."
  brew install node 2>/dev/null || { echo "  ✗ Could not install Node.js. Install it manually."; exit 1; }
fi
echo "  ✓ Node.js found"

# Download bridge
mkdir -p "$BRIDGE_DIR"
echo "  → Downloading bridge..."
curl -sL "https://raw.githubusercontent.com/ikosoymeta/Arcadia/main/bridge/arcadia-bridge.js" -o "$BRIDGE_DIR/arcadia-bridge.js"
chmod +x "$BRIDGE_DIR/arcadia-bridge.js"
echo "  ✓ Bridge installed"

# Create LaunchAgent for auto-start on login
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST_PATH" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.arcadia.bridge</string>
    <key>ProgramArguments</key>
    <array>
        <string>$(which node)</string>
        <string>${BRIDGE_DIR}/arcadia-bridge.js</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${BRIDGE_DIR}/bridge.log</string>
    <key>StandardErrorPath</key>
    <string>${BRIDGE_DIR}/bridge-error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
    </dict>
</dict>
</plist>
EOF

# Load the LaunchAgent (starts bridge now + auto-starts on login)
launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl load "$PLIST_PATH"

echo "  ✓ Auto-start configured (runs on every login)"
echo ""
echo "  ╔═══════════════════════════════════════════════╗"
echo "  ║                                               ║"
echo "  ║   ✅ Setup complete!                          ║"
echo "  ║                                               ║"
echo "  ║   The bridge is running and will auto-start   ║"
echo "  ║   every time you log in. You're all set.      ║"
echo "  ║                                               ║"
echo "  ║   Open ArcadIA now:                           ║"
echo "  ║   https://ikosoymeta.github.io/Arcadia/       ║"
echo "  ║                                               ║"
echo "  ╚═══════════════════════════════════════════════╝"
echo ""
