# ─────────────────────────────────────────────────────────────────────────────
# ArcadIA Bridge — Setup & Restart Script for Windows
#
# This script:
#   1. Checks prerequisites (Claude Code, Node.js)
#   2. Downloads the latest bridge from GitHub
#   3. Stops any existing bridge process
#   4. Starts the new bridge
#   5. Verifies it's working with a health check
#   6. Optionally creates a startup shortcut
#
# Usage (PowerShell):
#   irm https://raw.githubusercontent.com/ikosoymeta/Arcadia/main/bridge/setup.ps1 | iex
#
# Or to just restart:
#   powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\.arcadia-bridge\setup.ps1"
# ─────────────────────────────────────────────────────────────────────────────

$ErrorActionPreference = "Stop"

$BRIDGE_DIR = "$env:USERPROFILE\.arcadia-bridge"
$BRIDGE_FILE = "$BRIDGE_DIR\arcadia-bridge.js"
$BRIDGE_URL = "https://raw.githubusercontent.com/ikosoymeta/Arcadia/main/bridge/arcadia-bridge.js"
$HEALTH_URL = "http://127.0.0.1:8087/health"
$LOG_FILE = "$BRIDGE_DIR\bridge.log"
$PORT = 8087
$STEP = 0
$TOTAL_STEPS = 6

# ─── Helper functions ────────────────────────────────────────────────────────

function Step($msg) {
    $script:STEP++
    Write-Host ""
    Write-Host "  [$script:STEP/$TOTAL_STEPS] " -ForegroundColor Blue -NoNewline
    Write-Host "$msg" -ForegroundColor White
}

function Ok($msg) {
    Write-Host "        " -NoNewline
    Write-Host "[OK] " -ForegroundColor Green -NoNewline
    Write-Host "$msg"
}

function Warn($msg) {
    Write-Host "        " -NoNewline
    Write-Host "[!] " -ForegroundColor Yellow -NoNewline
    Write-Host "$msg"
}

function Fail($msg) {
    Write-Host "        " -NoNewline
    Write-Host "[X] " -ForegroundColor Red -NoNewline
    Write-Host "$msg"
}

function Info($msg) {
    Write-Host "        " -NoNewline
    Write-Host "$msg" -ForegroundColor DarkGray
}

# ─── Banner ──────────────────────────────────────────────────────────────────

Clear-Host
Write-Host ""
Write-Host "  ArcadIA Bridge - Setup & Install (Windows)" -ForegroundColor Cyan
Write-Host "  ──────────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host "  This will set up the local bridge that connects" -ForegroundColor DarkGray
Write-Host "  ArcadIA web app to Claude Code on your machine." -ForegroundColor DarkGray
Write-Host ""

# ─── Step 1: Check Claude Code ───────────────────────────────────────────────

Step "Checking for Claude Code..."

$claudePath = $null
try {
    $claudePath = (Get-Command claude -ErrorAction Stop).Source
    Ok "Claude Code found at: $claudePath"
    
    try {
        $claudeVersion = & claude --version 2>&1 | Select-Object -First 1
        if ($claudeVersion) { Info "Version: $claudeVersion" }
    } catch {}
} catch {
    Fail "Claude Code is not installed!"
    Write-Host ""
    Write-Host "        Claude Code is required for the bridge to work." -ForegroundColor Yellow
    Write-Host "        Install it from: " -NoNewline
    Write-Host "https://fburl.com/claude.code.users" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "        After installing Claude Code, run this script again."
    Write-Host ""
    exit 1
}

# ─── Step 2: Check Node.js ──────────────────────────────────────────────────

Step "Checking for Node.js..."

$nodePath = $null
try {
    $nodePath = (Get-Command node -ErrorAction Stop).Source
    $nodeVersion = & node --version 2>&1
    Ok "Node.js found at: $nodePath"
    Info "Version: $nodeVersion"
} catch {
    Warn "Node.js not found."
    Write-Host ""
    
    # Try winget first
    $hasWinget = $null
    try { $hasWinget = Get-Command winget -ErrorAction Stop } catch {}
    
    if ($hasWinget) {
        Write-Host "        Attempting to install via winget..." -ForegroundColor Yellow
        try {
            & winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements 2>&1 | ForEach-Object {
                Write-Host "        winget: $_" -ForegroundColor DarkGray
            }
            # Refresh PATH
            $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "User")
            $nodePath = (Get-Command node -ErrorAction Stop).Source
            $nodeVersion = & node --version 2>&1
            Ok "Node.js installed successfully!"
            Info "Version: $nodeVersion"
        } catch {
            Fail "Failed to install Node.js via winget"
            Write-Host "        Install it manually from: " -NoNewline
            Write-Host "https://nodejs.org" -ForegroundColor Cyan
            exit 1
        }
    } else {
        Fail "Node.js not found and winget is not available"
        Write-Host "        Install Node.js from: " -NoNewline
        Write-Host "https://nodejs.org" -ForegroundColor Cyan
        exit 1
    }
}

# ─── Step 3: Download latest bridge ─────────────────────────────────────────

Step "Downloading latest bridge from GitHub..."

if (-not (Test-Path $BRIDGE_DIR)) {
    New-Item -ItemType Directory -Path $BRIDGE_DIR -Force | Out-Null
}
Info "Target: $BRIDGE_FILE"

try {
    Invoke-WebRequest -Uri $BRIDGE_URL -OutFile "$BRIDGE_FILE.tmp" -UseBasicParsing
    
    if (Test-Path "$BRIDGE_FILE.tmp") {
        Move-Item -Path "$BRIDGE_FILE.tmp" -Destination $BRIDGE_FILE -Force
        
        $bridgeVersion = (Select-String -Path $BRIDGE_FILE -Pattern "VERSION = '([^']+)'" | ForEach-Object { $_.Matches[0].Groups[1].Value }) | Select-Object -First 1
        $fileSize = (Get-Item $BRIDGE_FILE).Length
        
        Ok "Bridge downloaded successfully"
        Info "Version: $bridgeVersion"
        Info "Size: $fileSize bytes"
    } else {
        throw "Download produced empty file"
    }
} catch {
    Remove-Item -Path "$BRIDGE_FILE.tmp" -Force -ErrorAction SilentlyContinue
    Fail "Failed to download bridge: $_"
    Write-Host "        Check your internet connection and try again." -ForegroundColor Yellow
    Info "URL: $BRIDGE_URL"
    exit 1
}

# Also save this setup script locally
try {
    $SETUP_URL = "https://raw.githubusercontent.com/ikosoymeta/Arcadia/main/bridge/setup.ps1"
    Invoke-WebRequest -Uri $SETUP_URL -OutFile "$BRIDGE_DIR\setup.ps1" -UseBasicParsing 2>$null
} catch {}

# ─── Step 4: Stop existing bridge ───────────────────────────────────────────

Step "Stopping any existing bridge process..."

# Check if something is running on the port
$existingPids = @()
try {
    $netstatOutput = & netstat -ano 2>$null | Select-String ":$PORT" | Select-String "LISTENING"
    foreach ($line in $netstatOutput) {
        $parts = $line.ToString().Trim() -split '\s+'
        $pid = $parts[-1]
        if ($pid -and $pid -ne '0' -and $pid -ne $PID) {
            $existingPids += $pid
        }
    }
} catch {}

$existingPids = $existingPids | Select-Object -Unique

if ($existingPids.Count -gt 0) {
    foreach ($pid in $existingPids) {
        Info "Found existing process on port $PORT (PID: $pid)"
        try {
            Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
        } catch {}
    }
    Start-Sleep -Seconds 1
    Ok "Previous bridge stopped"
} else {
    # Also try to kill by name as fallback
    Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
        $_.CommandLine -like "*arcadia-bridge*"
    } | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500
    Ok "No existing bridge found (clean start)"
}

# ─── Step 5: Start the bridge ───────────────────────────────────────────────

Step "Starting ArcadIA Bridge..."

Info "Command: node $BRIDGE_FILE"
Info "Logging to: $LOG_FILE"

# Start the bridge as a background job
$bridgeProcess = Start-Process -FilePath "node" -ArgumentList "`"$BRIDGE_FILE`"" `
    -RedirectStandardOutput $LOG_FILE `
    -RedirectStandardError "$BRIDGE_DIR\bridge-error.log" `
    -WindowStyle Hidden `
    -PassThru

$bridgePid = $bridgeProcess.Id
Info "Process started (PID: $bridgePid)"

# Wait a moment for it to initialize
Write-Host "        Waiting for bridge to initialize..." -ForegroundColor Cyan -NoNewline
Start-Sleep -Seconds 2

# Check if process is still running
try {
    $proc = Get-Process -Id $bridgePid -ErrorAction Stop
    Write-Host "`r        " -NoNewline
    Ok "Bridge process is running (PID: $bridgePid)"
} catch {
    Write-Host ""
    Fail "Bridge process exited immediately!"
    Write-Host ""
    Write-Host "        Last 10 lines of log:" -ForegroundColor Yellow
    if (Test-Path $LOG_FILE) {
        Get-Content $LOG_FILE -Tail 10 | ForEach-Object { Write-Host "          $_" -ForegroundColor DarkGray }
    }
    Write-Host ""
    Write-Host "        Try running manually to see the error:" -ForegroundColor Yellow
    Write-Host "        node `"$BRIDGE_FILE`"" -ForegroundColor Cyan
    Write-Host ""
    exit 1
}

# ─── Step 6: Health check ───────────────────────────────────────────────────

Step "Verifying bridge is responding..."

$maxRetries = 10
$healthy = $false

for ($retry = 1; $retry -le $maxRetries; $retry++) {
    Write-Host "`r        Health check attempt $retry/$maxRetries..." -ForegroundColor Cyan -NoNewline
    
    try {
        $response = Invoke-RestMethod -Uri $HEALTH_URL -TimeoutSec 5 -ErrorAction Stop
        if ($response.status -eq "ok") {
            $healthy = $true
            break
        }
    } catch {}
    
    Start-Sleep -Seconds 1
}

Write-Host "`r        " -NoNewline

if ($healthy) {
    Ok "Bridge is healthy and responding!"
    Info "Endpoint: http://127.0.0.1:$PORT"
    if ($response.version) { Info "Bridge version: $($response.version)" }
    if ($response.claude_path) { Info "Claude path: $($response.claude_path)" }
} else {
    Fail "Bridge is not responding after $maxRetries attempts"
    Write-Host ""
    Write-Host "        The process is running but not accepting connections." -ForegroundColor Yellow
    Write-Host "        Check the log for errors:" -ForegroundColor Yellow
    Write-Host "        Get-Content `"$LOG_FILE`" -Tail 20" -ForegroundColor Cyan
    Write-Host ""
    if (Test-Path $LOG_FILE) {
        Get-Content $LOG_FILE -Tail 10 | ForEach-Object { Write-Host "          $_" -ForegroundColor DarkGray }
    }
    Write-Host ""
    exit 1
}

# ─── Set up auto-start via Task Scheduler ────────────────────────────────────

$TaskName = "ArcadIA Bridge"

try {
    # Remove existing task if present
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    
    $action = New-ScheduledTaskAction -Execute $nodePath -Argument "`"$BRIDGE_FILE`"" -WorkingDirectory $BRIDGE_DIR
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description "ArcadIA Bridge - connects ArcadIA web app to Claude Code" -Force | Out-Null
    Info "Task Scheduler entry created — bridge auto-starts on login"
} catch {
    Warn "Could not create Task Scheduler entry: $_"
    Info "Falling back to Startup folder shortcut..."
    
    # Fallback: Startup folder shortcut
    try {
        $startupFolder = [System.IO.Path]::Combine($env:APPDATA, "Microsoft\Windows\Start Menu\Programs\Startup")
        $shortcutPath = "$startupFolder\ArcadIA Bridge.lnk"
        $shell = New-Object -ComObject WScript.Shell
        $shortcut = $shell.CreateShortcut($shortcutPath)
        $shortcut.TargetPath = $nodePath
        $shortcut.Arguments = "`"$BRIDGE_FILE`""
        $shortcut.WorkingDirectory = $BRIDGE_DIR
        $shortcut.WindowStyle = 7
        $shortcut.Description = "ArcadIA Bridge - Local proxy for Claude Code"
        $shortcut.Save()
        Info "Auto-start shortcut created in Startup folder"
    } catch {
        Warn "Could not create auto-start shortcut: $_"
        Info "You can start the bridge manually: node `"$BRIDGE_FILE`""
    }
}

# ─── Success Banner ──────────────────────────────────────────────────────────

Write-Host ""
Write-Host "  ╔══════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "  ║                                                      ║" -ForegroundColor Green
Write-Host "  ║" -ForegroundColor Green -NoNewline
Write-Host "   ArcadIA Bridge is running!                       " -ForegroundColor Green -NoNewline
Write-Host "║" -ForegroundColor Green
Write-Host "  ║                                                      ║" -ForegroundColor Green
Write-Host "  ║" -ForegroundColor Green -NoNewline
Write-Host "   Bridge:  " -NoNewline
Write-Host "http://127.0.0.1:$PORT" -ForegroundColor Cyan -NoNewline
Write-Host "                  " -NoNewline
Write-Host "║" -ForegroundColor Green
Write-Host "  ║" -ForegroundColor Green -NoNewline
Write-Host "   PID:     $bridgePid" -ForegroundColor DarkGray -NoNewline
$padding = " " * (39 - $bridgePid.ToString().Length)
Write-Host "$padding" -NoNewline
Write-Host "║" -ForegroundColor Green
Write-Host "  ║" -ForegroundColor Green -NoNewline
Write-Host "   Log:     ~\.arcadia-bridge\bridge.log             " -ForegroundColor DarkGray -NoNewline
Write-Host "║" -ForegroundColor Green
Write-Host "  ║" -ForegroundColor Green -NoNewline
Write-Host "   Auto:    Starts on login (Task Scheduler)          " -ForegroundColor DarkGray -NoNewline
Write-Host "║" -ForegroundColor Green
Write-Host "  ║                                                      ║" -ForegroundColor Green
Write-Host "  ║" -ForegroundColor Green -NoNewline
Write-Host "   Open ArcadIA:                                      " -NoNewline
Write-Host "║" -ForegroundColor Green
Write-Host "  ║" -ForegroundColor Green -NoNewline
Write-Host "   https://arcadia.manus.space                         " -ForegroundColor Cyan -NoNewline
Write-Host "║" -ForegroundColor Green
Write-Host "  ║                                                      ║" -ForegroundColor Green
Write-Host "  ╚══════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "  To restart later:  powershell -File `"$BRIDGE_DIR\setup.ps1`"" -ForegroundColor DarkGray
Write-Host "  To view logs:      Get-Content `"$LOG_FILE`" -Tail 50 -Wait" -ForegroundColor DarkGray
Write-Host "  To stop:           Stop-Process -Name node -Force" -ForegroundColor DarkGray
Write-Host ""
