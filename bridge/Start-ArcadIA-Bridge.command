#!/bin/bash
# ═══════════════════════════════════════════════════════════
#  ArcadIA Bridge — Double-click this file to connect
#  Always downloads the latest bridge version from GitHub
# ═══════════════════════════════════════════════════════════

clear
echo ""
echo "  ⚡ ArcadIA Bridge"
echo "  ─────────────────"
echo ""

BRIDGE_DIR="$HOME/.arcadia-bridge"
BRIDGE_FILE="$BRIDGE_DIR/arcadia-bridge.js"
BRIDGE_URL="https://raw.githubusercontent.com/ikosoymeta/Arcadia/main/bridge/arcadia-bridge.js"

mkdir -p "$BRIDGE_DIR"

# ─── Check prerequisites ────────────────────────────────────

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "  ✗ Node.js not found. Installing via Homebrew..."
    if command -v brew &> /dev/null; then
        brew install node
    else
        echo "  ✗ Please install Node.js from https://nodejs.org"
        echo "  Press any key to exit..."
        read -n 1
        exit 1
    fi
fi
echo "  ✓ Node.js $(node --version 2>/dev/null)"

# Check for Claude Code
if ! command -v claude &> /dev/null; then
    echo "  ✗ Claude Code not found."
    echo "  Please install Claude Code first: https://fburl.com/claude.code.users"
    echo "  Press any key to exit..."
    read -n 1
    exit 1
fi
echo "  ✓ Claude Code detected"

# ─── Always download the latest bridge ──────────────────────

echo "  → Checking for updates..."

# Save old version for comparison
OLD_VERSION=""
if [ -f "$BRIDGE_FILE" ]; then
    OLD_VERSION=$(grep -o "VERSION = '[^']*'" "$BRIDGE_FILE" 2>/dev/null | head -1 | cut -d"'" -f2)
fi

# Download latest
HTTP_CODE=$(curl -sL -w "%{http_code}" "$BRIDGE_URL" -o "$BRIDGE_FILE.tmp" 2>/dev/null)

if [ "$HTTP_CODE" = "200" ] && [ -s "$BRIDGE_FILE.tmp" ]; then
    mv "$BRIDGE_FILE.tmp" "$BRIDGE_FILE"
    chmod +x "$BRIDGE_FILE"
    
    NEW_VERSION=$(grep -o "VERSION = '[^']*'" "$BRIDGE_FILE" 2>/dev/null | head -1 | cut -d"'" -f2)
    
    if [ -n "$OLD_VERSION" ] && [ "$OLD_VERSION" != "$NEW_VERSION" ]; then
        echo "  ✓ Updated: v${OLD_VERSION} → v${NEW_VERSION}"
    elif [ -n "$NEW_VERSION" ]; then
        echo "  ✓ Bridge v${NEW_VERSION} (latest)"
    else
        echo "  ✓ Bridge downloaded"
    fi
else
    rm -f "$BRIDGE_FILE.tmp"
    if [ -f "$BRIDGE_FILE" ]; then
        echo "  ⚠ Could not check for updates (HTTP $HTTP_CODE). Using existing version."
    else
        echo "  ✗ Failed to download bridge. Check your internet connection."
        echo "  Press any key to exit..."
        read -n 1
        exit 1
    fi
fi

# ─── Kill any existing bridge process ───────────────────────

pkill -f "arcadia-bridge.js" 2>/dev/null
sleep 1

# ─── Start the bridge ───────────────────────────────────────

echo ""
echo "  → Starting bridge on localhost:8087..."
echo ""
echo "  ╔═══════════════════════════════════════════════╗"
echo "  ║                                               ║"
echo "  ║   Bridge is running!                          ║"
echo "  ║                                               ║"
echo "  ║   Open ArcadIA now:                           ║"
echo "  ║   https://ikosoymeta.github.io/Arcadia/       ║"
echo "  ║                                               ║"
echo "  ║   Keep this window open while using ArcadIA.  ║"
echo "  ║   Press Ctrl+C to stop.                       ║"
echo "  ║                                               ║"
echo "  ╚═══════════════════════════════════════════════╝"
echo ""

# Open ArcadIA in the default browser
open "https://ikosoymeta.github.io/Arcadia/" 2>/dev/null

# Start the bridge (this keeps the terminal open)
node "$BRIDGE_FILE"
