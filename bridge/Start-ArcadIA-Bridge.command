#!/bin/bash
# ═══════════════════════════════════════════════════════════
#  ArcadIA Bridge — Double-click this file to connect
# ═══════════════════════════════════════════════════════════

clear
echo ""
echo "  ⚡ ArcadIA Bridge"
echo "  ─────────────────"
echo ""

# Check if bridge is already installed
BRIDGE_DIR="$HOME/.arcadia-bridge"
BRIDGE_FILE="$BRIDGE_DIR/arcadia-bridge.js"

if [ ! -f "$BRIDGE_FILE" ]; then
    echo "  → First-time setup: downloading bridge..."
    mkdir -p "$BRIDGE_DIR"
    
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
    
    # Check for Claude Code
    if ! command -v claude &> /dev/null; then
        echo "  ✗ Claude Code not found."
        echo "  Please install Claude Code first: https://fburl.com/claude.code.users"
        echo "  Press any key to exit..."
        read -n 1
        exit 1
    fi
    
    # Download bridge
    curl -sL "https://raw.githubusercontent.com/ikosoymeta/Arcadia/main/bridge/arcadia-bridge.js" -o "$BRIDGE_FILE"
    
    if [ ! -f "$BRIDGE_FILE" ]; then
        echo "  ✗ Failed to download bridge. Check your internet connection."
        echo "  Press any key to exit..."
        read -n 1
        exit 1
    fi
    
    echo "  ✓ Bridge installed"
    echo ""
fi

# Kill any existing bridge process
pkill -f "arcadia-bridge.js" 2>/dev/null
sleep 1

echo "  ✓ Claude Code detected"
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
