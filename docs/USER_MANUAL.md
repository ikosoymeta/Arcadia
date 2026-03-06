# ArcadIA Editor — User Manual

**Version 3.6.0** | Last updated: March 2026

ArcadIA Editor is a web-based interface for Claude AI, designed specifically for Meta employees. It connects to Claude Code on your laptop through a lightweight local bridge, so you get full Claude access with zero API keys and zero VPN required. This manual covers every feature, panel, and workflow available in the app.

---

## Table of Contents

1. [Quick Start](#1-quick-start)
2. [The ArcadIA Bridge](#2-the-arcadia-bridge)
3. [Interface Modes](#3-interface-modes)
4. [Simple Mode](#4-simple-mode)
5. [Engineer Mode](#5-engineer-mode)
   - [Terminal Tab — Commands, Claude, & Second Brain](#terminal-tab)
6. [Second Brain](#6-second-brain)
   - [Remote Second Brain (Windows Users)](#remote-second-brain-windows-users)
7. [Sidebar & Conversations](#7-sidebar--conversations)
8. [Settings](#8-settings)
   - [Remote Second Brain Configuration](#remote-second-brain)
9. [Skills & Templates](#9-skills--templates)
10. [Integrations](#10-integrations)
11. [Analytics](#11-analytics)
12. [Benchmark](#12-benchmark)
13. [Code Workspace & Preview](#13-code-workspace--preview)
14. [Team Panel](#14-team-panel)
15. [Help & Support](#15-help--support)
16. [Keyboard Shortcuts](#16-keyboard-shortcuts)
17. [Troubleshooting](#17-troubleshooting)

---

## 1. Quick Start

Getting started with ArcadIA takes about 60 seconds:

1. **Open ArcadIA** in your browser at [https://ikosoymeta.github.io/Arcadia/](https://ikosoymeta.github.io/Arcadia/) or [https://arcadia.manus.space](https://arcadia.manus.space).
2. **Run the bridge** (one-time setup). On your first visit, you will see a setup screen with a single command. Copy it and paste it into your **system Terminal** (not Claude Code's terminal):

   **macOS / Linux (Terminal.app or iTerm):**
   ```bash
   curl -sL https://raw.githubusercontent.com/ikosoymeta/Arcadia/main/bridge/setup.sh | bash
   ```

   **Windows (PowerShell — run as Administrator):**
   ```powershell
   irm https://raw.githubusercontent.com/ikosoymeta/Arcadia/main/bridge/setup.ps1 | iex
   ```

   > **Important:** Paste the command into your system Terminal, not into Claude Code's terminal. Using Claude Code's terminal will trigger a security review that blocks the script.

3. **Wait for the green dot.** Once the bridge is running, the sidebar will show a green "Active" indicator next to your connection name. ArcadIA auto-connects — no API keys, no VPN, no configuration.
4. **Start chatting.** Click "+ New Chat" or pick one of the quick-start prompts on the welcome screen.

After the one-time setup, the bridge auto-starts on login. On macOS this uses a LaunchAgent; on Windows it creates a shortcut in your Startup folder.

---

## 2. The ArcadIA Bridge

The bridge is a small Node.js service that runs locally on your computer (port 8087). It works on **macOS, Windows, and Linux**. It acts as a translator between ArcadIA in your browser and Claude Code on your laptop. Claude Code handles all Meta internal authentication automatically through the `meta@Meta` plugin.

### How it works

```
Browser (ArcadIA)  ──HTTP──▶  localhost:8087 (Bridge)  ──stdin/stdout──▶  Claude Code CLI
```

### Key features (v3.5.0)

| Feature | Description |
|---|---|
| **Cross-platform** | Works on macOS, Windows, and Linux with automatic OS detection |
| **Auto-start** | macOS: LaunchAgent. Windows: Startup folder shortcut. Starts on login automatically |
| **Process pool (x2)** | Keeps TWO standby Claude processes ready for instant dispatch, reducing response time from ~50s to ~5-10s for subsequent requests |
| **Contextual tips** | Shows relevant tips while waiting for Claude, matched to your prompt category (writing, data, code, etc.) |
| **TTFT estimate** | Tracks historical response times and shows "Usually responds in ~Xs" based on your averages |
| **Auto port recovery** | Automatically kills stale processes on port 8087 before starting (uses `lsof` on macOS/Linux, `netstat` on Windows) |
| **Graceful shutdown** | Properly cleans up all pool and child processes on Ctrl+C or system shutdown |
| **Second Brain detection** | Scans your local machine for Second Brain components and supports automated setup |
| **Context management** | Trims old messages to stay within Claude's context window |
| **Streaming** | Real-time SSE streaming so you see tokens as they arrive |

### Manual bridge commands

**macOS / Linux:**
```bash
# Start the bridge manually
node ~/.arcadia-bridge/arcadia-bridge.js

# Re-run setup (updates to latest version)
curl -sL https://raw.githubusercontent.com/ikosoymeta/Arcadia/main/bridge/setup.sh | bash

# Check if bridge is running
curl http://127.0.0.1:8087/health

# View bridge logs
cat ~/.arcadia-bridge/bridge.log
```

**Windows (PowerShell):**
```powershell
# Start the bridge manually
node "$env:USERPROFILE\.arcadia-bridge\arcadia-bridge.js"

# Re-run setup (updates to latest version)
irm https://raw.githubusercontent.com/ikosoymeta/Arcadia/main/bridge/setup.ps1 | iex

# Check if bridge is running
Invoke-RestMethod http://127.0.0.1:8087/health

# View bridge logs
Get-Content "$env:USERPROFILE\.arcadia-bridge\bridge.log" -Tail 50
```

---

## 3. Interface Modes

ArcadIA has two interface modes, toggled via the switcher at the top of the screen:

| Mode | Audience | Description |
|---|---|---|
| **Simple** | Everyone | Clean chat interface with quick-start prompts, follow-up suggestions, and image attachments. No technical knowledge needed. |
| **Engineer** | Developers | Everything in Simple mode plus: API logs, terminal emulator, debug console, token metrics, tool call inspector, and the Validation Pipeline. |

---

## 4. Simple Mode

Simple mode is the default experience. It is designed for non-technical users who want to interact with Claude like chatting with a smart assistant.

### Welcome screen

When you open a new chat, you see a welcome screen with:

- A **model selector** showing the current Claude model (click to change)
- A **connection badge** confirming your Meta corporate connection
- **Six quick-start prompts** that launch common workflows with a single click

### Quick-start prompts

| Prompt | What it does |
|---|---|
| **Meeting notes** | Organizes rough notes into Key Decisions, Action Items (with owners and due dates), and Open Questions |
| **Draft an email** | Helps write a professional email — asks for recipient, purpose, and key points |
| **Summarize data** | Analyzes pasted numbers, tables, or metrics and summarizes key takeaways |
| **Project status update** | Creates a formatted status report with accomplishments, blockers, next steps, and risks |
| **HPM Self-Review** | Drafts your HPM self-review with sections for Impact, Execution, and Collaboration |
| **Brainstorm ideas** | Generates creative solutions organized by effort level (quick wins vs. bigger bets) |

### Inline progress indicator

When you send a message, the response bubble shows real-time progress directly in the chat:

- **Claude is thinking...** — Waiting for the first token (shows elapsed time and estimated time based on your history)
- **Writing response** — Streaming tokens in real-time
- **Preparing results** — Extracting artifacts and code blocks

### Contextual tips while waiting

While Claude is thinking, the response bubble displays rotating tips matched to your prompt category:

| Prompt Category | Example Tips |
|---|---|
| **Writing** (emails, docs) | "Specify the tone: casual, professional, or executive summary" |
| **Data** (numbers, tables) | "Ask for trends, outliers, or comparisons to make data actionable" |
| **Code** (programming) | "Include error handling requirements upfront to get production-ready code" |
| **Meeting** (notes, agendas) | "Paste the raw transcript — Claude handles the formatting" |
| **General** | "Break complex requests into numbered steps for better results" |

Tips rotate every 4.5 seconds with a smooth crossfade animation. After 2+ requests, the bubble also shows **"Usually responds in ~Xs"** based on the median of your last 20 response times.

### Follow-up suggestions

After Claude responds, contextual follow-up buttons appear below the message. These are tailored to the response type — for example, after a meeting summary you might see "Add a timeline", "Make it shorter", "Format as a table", or "Add priority levels".

### Image attachments

Drag and drop images into the chat, or click the paperclip icon. Claude can analyze screenshots, diagrams, photos, and documents. Multiple images can be attached to a single message.

---

## 5. Engineer Mode

Engineer mode adds a tabbed panel below the chat with developer tools:

### Chat tab
The same chat experience as Simple mode, but with additional metadata displayed on each message: input/output token counts, TTFT (Time to First Token), total response time, and the model used.

### Validate tab (Validation Pipeline)
An autonomous code quality system inspired by the GSD Auto-Worker pattern. It runs your configured validation commands (lint, typecheck, tests, build) and, when errors are found, sends them to Claude for automatic fixing.

**Pipeline stages:** Generate → Validate → Auto-Fix → Done

**Configuration options:**
- Toggle individual validation commands on/off
- Add custom commands (any shell command that returns exit code 0 on success)
- Set your project directory (where commands run on your local machine)
- Configure max auto-fix retries (default: 3)

**Common validation commands for Meta projects:**
- `yarn lint` — Code style checks
- `yarn typecheck` — TypeScript type verification
- `yarn test --watchAll=false` — Unit tests
- `yarn build` — Build verification
- `arc lint` — Meta's Arc linter

### Logs tab
Every API request and response logged with timestamps, raw JSON, token counts, and timing metrics. Useful for debugging prompts and understanding Claude's behavior.

### Terminal tab
An interactive terminal emulator with command history and built-in Claude integration. Any input that is not a recognized built-in command is automatically sent to Claude as a prompt, with the response streamed token-by-token into the terminal output.

**Built-in commands:**

| Command | Description |
|---|---|
| `help` | Show all available commands |
| `ls` | List files in the current directory |
| `pwd` | Print working directory |
| `cat <file>` | Display file contents |
| `clear` | Clear the terminal screen |
| `stop` | Cancel an active Claude response mid-stream |
| `reset` | Clear conversation memory (start fresh context) |
| `memory` | Show current conversation memory stats |
| `brain <command>` | Send a slash command or query to Second Brain (e.g., `brain /daily-brief`) |

**Conversation memory:** The terminal maintains a rolling conversation history so Claude remembers context across commands within the same session. Each user prompt and Claude response is accumulated, enabling multi-turn conversations. Use `reset` to clear memory and start fresh, or `memory` to see how many messages are stored.

**Claude integration:** When you type a natural language question or request (e.g., "explain this error" or "write a Python script for..."), it is sent directly to Claude. The response streams in real-time with a thinking indicator showing elapsed time. After completion, token counts, response time, TTFT, and effort level are displayed.

**Second Brain from Terminal:** The `brain` command routes queries to your Second Brain instance via the bridge. For example:
- `brain /daily-brief` — Run your morning briefing
- `brain /eod` — End-of-day summary
- `brain summarize my open threads` — Natural language query to Second Brain

This works with both local and remote bridge connections (see [Remote Second Brain](#remote-second-brain-windows-users)).

### Debug tab
Raw debug console showing internal state, connection diagnostics, and error traces.

### Built-in tools
Engineer mode includes built-in tools that Claude can use during conversations:
- **Calculator** — Evaluate mathematical expressions
- **Get current time** — Retrieve current date and time
- **Web search** — Search the web for information (simulated)

---

## 6. Second Brain

The Second Brain panel (🧠 icon in the sidebar) integrates with the [Second Brain](https://secondbrain-setup.manus.space) personal knowledge system. It detects your local setup, installs missing components automatically, and provides a command center for all Second Brain workflows.

### What is Second Brain?

Second Brain is an AI-powered personal knowledge system that combines Claude Code with Google Drive to create a persistent, organized workspace for your projects, notes, research, and daily workflows. It uses slash commands to automate recurring tasks like morning briefings, end-of-day summaries, and meeting preparation.

### Automated setup

When you open the Second Brain panel, it automatically scans your computer through the bridge and checks for:

| Component | What it checks |
|---|---|
| **Claude Code** | Is the CLI installed? What version? |
| **Google Drive** | Is Google Drive for Desktop installed and signed in? |
| **Workspace** | Does the `claude/` folder exist in your Google Drive? |
| **CLAUDE.md** | Is the configuration file with slash commands present? |
| **Skills & Plugins** | Are Second Brain skills installed (tasks, deep-research, etc.)? |
| **Optional: Wispr Flow** | Voice-to-text app for 3x faster input |
| **Optional: Obsidian** | Local knowledge management app |

A progress bar shows how many components are ready (e.g., "3 of 4 components ready").

### Complete Setup button

If any required components are missing, a **"Complete Setup — Install Everything Automatically"** button appears. Clicking it launches a fully automated installation wizard:

1. **Real-time progress dialog** — Shows each step with status (waiting, running, done, needs action), friendly descriptions, and elapsed time
2. **Automatic installation** — Creates workspace folders, installs skills and plugins, generates CLAUDE.md with all slash commands pre-configured
3. **User prompts only when necessary** — If something truly requires your action (e.g., installing Google Drive for Desktop or Claude Code), a modal dialog appears with an action button and a "I've done this — continue" confirmation. The wizard auto-detects when you're done and advances to the next step
4. **Re-scan after completion** — Automatically re-scans your system to verify everything installed correctly

### Slash commands

Once set up, the panel shows 6 pre-configured slash command cards:

| Command | Description |
|---|---|
| **/daily-brief** | Morning briefing from your priorities, calendar, and recent activity |
| **/eod** | End-of-day wrap-up — processes meeting notes, captures accomplishments, previews tomorrow |
| **/eow** | End-of-week summary — compiles weekly accomplishments, captures PSC-worthy items, outlines next week |
| **/prepare-meeting** | Research a person or topic and generate a structured meeting agenda |
| **/add-context** | Paste any URL or text and it routes to the right project in your workspace |
| **/deep-research** | Conduct thorough multi-source research on any topic with citations |

Each card has a **Copy** button that copies the command to your clipboard for use in Claude Code.

### Writing style guide

The panel includes a section on setting up a personal writing style guide:
1. Feed Claude 3-5 examples of your writing
2. Ask it to generate a style guide
3. Save the guide to your workspace

This ensures Claude matches your tone and style across all writing tasks.

### Optional add-ons

| Add-on | Description | Install method | Status |
|---|---|---|---|
| **Wispr Flow** | Voice-to-text input (3x faster than typing) | macOS: `brew install --cask wispr-flow` / Windows: `winget install WisprAI.WisprFlow` | Detected automatically |
| **GClaude** | Chat with Second Brain via Google Chat | `npm install -g gclaude` (cross-platform) | Manual setup |
| **Obsidian** | Local knowledge management that syncs with your workspace | macOS: `brew install --cask obsidian` / Windows: `winget install Obsidian.Obsidian` | Detected automatically |

The **"Install Automatically"** button in the Second Brain panel detects your OS and runs the appropriate package manager command (`brew` on macOS, `winget` on Windows). You can also install these manually using the commands above.

### Remote Second Brain (Windows users)

If you are a Windows user with Second Brain configured and running on a remote machine (such as a Mac laptop or an OnDemand devserver), you can access it from ArcadIA on your Windows PC without needing a local Second Brain installation. This is an **additional option** that does not replace the standard local setup.

**How it works:**

The ArcadIA Bridge on your remote machine exposes the same HTTP API that ArcadIA uses locally. By configuring a remote bridge URL in Settings, ArcadIA redirects all bridge communication (health checks, detection, messages, setup) to the remote machine instead of `localhost:8087`.

```
Windows PC (ArcadIA in browser)  ──HTTP──▶  Remote machine:8087 (Bridge)  ──▶  Claude Code + Second Brain
```

**Prerequisites:**

1. Second Brain must be fully set up on the remote machine (Claude Code installed, Google Drive workspace configured, CLAUDE.md present)
2. The ArcadIA Bridge must be running on the remote machine with network access enabled
3. The remote machine must be reachable from your Windows PC (same network, VPN, or port forwarding)

**Setup steps:**

The bridge is a **standalone single file** with zero npm dependencies — it only requires Node.js. You do **not** need to clone the Arcadia repository on the remote machine.

**Step 1: Download and start the bridge on the remote machine**

Choose the instructions for your remote machine's operating system:

**Mac / Linux:**

```bash
# Download the bridge (one-time)
# Option A: Direct download from CDN (recommended)
curl -sL "https://files.manuscdn.com/user_upload_by_module/session_file/310519663326120815/BpnQIHTwBWLxOLsq.js" -o ~/arcadia-bridge.js

# Option B: Download from GitHub (if CDN is blocked)
curl -sL https://raw.githubusercontent.com/ikosoymeta/Arcadia/main/bridge/arcadia-bridge.js -o ~/arcadia-bridge.js

# Start the bridge (run each time)
node ~/arcadia-bridge.js --host 0.0.0.0
```

**Windows (PowerShell 7+ or Command Prompt):**

```powershell
# Download the bridge (one-time)
# Option A: Download from CDN (recommended)
Invoke-WebRequest -Uri "https://files.manuscdn.com/user_upload_by_module/session_file/310519663326120815/BpnQIHTwBWLxOLsq.js" -OutFile "$env:USERPROFILE\arcadia-bridge.js"

# Option B: Download from GitHub (if CDN is blocked)
curl.exe -sL https://raw.githubusercontent.com/ikosoymeta/Arcadia/main/bridge/arcadia-bridge.js -o %USERPROFILE%\arcadia-bridge.js

# Start the bridge (run each time)
node "$env:USERPROFILE\arcadia-bridge.js" --host 0.0.0.0
```

> **Important for Windows users:**
> - Use **PowerShell 7+** or **Command Prompt** (not Windows PowerShell 5.x which doesn't support `&&`)
> - Do NOT run the bridge inside **Sandboxie** — it causes SBIE2205 errors. Use a regular terminal.
> - If using Command Prompt, replace `$env:USERPROFILE` with `%USERPROFILE%`

The `--host 0.0.0.0` flag is required so the bridge accepts connections from other machines (not just localhost).

Alternatively, if you already have the Arcadia repo cloned on the remote machine:

**Mac/Linux:**
```bash
cd ~/Arcadia; node bridge/arcadia-bridge.js --host 0.0.0.0
```

**Windows PowerShell:**
```powershell
cd $env:USERPROFILE\Arcadia; node bridge\arcadia-bridge.js --host 0.0.0.0
```

**Step 2: Connect from ArcadIA**

1. **Find the remote machine's IP address or hostname.** For an OnDemand devserver, this is typically the devserver hostname. For a Mac on the same network, use `ifconfig` (Mac/Linux) or `ipconfig` (Windows) to find the local IP.

2. **In ArcadIA**, go to **Settings** (gear icon in the sidebar) and scroll down to the **Remote Second Brain** section.

3. **Enter the hostname or IP** in the address field. ArcadIA automatically adds `http://` and port `:8087` for you. Examples:
   - `192.168.1.50` (local network IP)
   - `my-devserver.corp.example.com` (corporate hostname)

4. **Click "Connect"** or just wait — ArcadIA auto-tests the connection after you stop typing. A green success message confirms the connection, and remote mode activates automatically.

5. **Navigate to the Second Brain panel** (🧠 icon). It should now detect and display the remote machine's Second Brain setup, including all slash commands, workspace status, and add-ons.

**Using Second Brain remotely:**

Once configured, all Second Brain features work identically to a local setup:

- Slash command cards in the Second Brain panel execute on the remote machine
- The Terminal `brain` command routes to the remote bridge (e.g., `brain /daily-brief`)
- Style guide analysis and add-on installation run on the remote machine
- Chat messages in Simple and Engineer mode go through the remote bridge

**Switching between local and remote:**

You can toggle the remote bridge on and off in Settings at any time. When disabled, ArcadIA reverts to `localhost:8087` (your local bridge). This makes it easy to switch between using your local machine and a remote server.

**Troubleshooting remote connections:**

| Issue | Solution |
|---|---|
| "Connection timed out" | Verify the remote machine is reachable: `ping <hostname>`. Check that port 8087 is not blocked by a firewall. |
| "Connection refused" | Ensure the bridge is running on the remote machine with `--host 0.0.0.0`. Check with `curl http://<remote>:8087/health`. |
| "CORS error" in browser console | The bridge (v3.5.0+) includes CORS headers by default. If using an older version, update the bridge. |
| High latency (>500ms) | Expected for remote connections over VPN. Consider using a devserver geographically closer to you. |
| Second Brain panel shows "Bridge Not Connected" | Make sure the toggle in Settings is enabled and the URL is correct. Click "Retry Connection" in the panel. |

---

## 7. Sidebar & Conversations

The left sidebar provides navigation and conversation management.

### Navigation items

| Icon | Section | Description |
|---|---|---|
| Chat | Chat | Main chat interface |
| Code | Code Workspace | File explorer and code editor |
| Skills | Skills | Reusable prompt templates |
| 2nd Brain | Second Brain | AI knowledge system setup and commands |
| Team | Team | Team pods and members |
| Settings | Settings | Connection and app configuration |
| Integrations | Integrations | Enable/disable tool integrations |
| Analytics | Analytics | Usage statistics and charts |
| Bench | Benchmark | Performance testing suite |
| Help | Help | Searchable FAQ and support |

### Conversation management

- **Create:** Click "+ New Chat" to start a new conversation
- **Rename:** Right-click a conversation → Rename, or hover and click the edit icon
- **Pin:** Right-click → Pin to top, or click the star icon on hover
- **Delete:** Right-click → Delete
- **Search:** Use the search bar at the top to filter by title
- **Folders:** Create folders with the "+" button next to "Folders". Right-click any conversation to move it to a folder
- **Share:** Right-click → Share / Export. Options include copy share link, export as Markdown, or export as JSON
- **Visibility:** Set conversations as Private, Team, or Public

---

## 8. Settings

The Settings panel lets you manage API connections and app preferences.

### API Connections

ArcadIA supports multiple connection types:

| Type | Description |
|---|---|
| **Meta Corporate (LDAR)** | Auto-configured. Uses the local bridge + Claude Code. No API key needed. |
| **Anthropic API** | Direct API connection. Requires an API key from console.anthropic.com. |
| **AWS Bedrock** | Enterprise API through AWS. Requires access key, secret, and region. |

### Connection settings

For each connection, you can configure:
- **Name** — Display label for the connection
- **Model** — Select from available Claude models
- **Max tokens** — Maximum output length (default: 8096)
- **Temperature** — Response creativity (0.0 = deterministic, 1.0 = creative)
- **Extended thinking** — Enable Claude's chain-of-thought reasoning (Sonnet 4+ and Opus 4+ only)
- **Thinking budget** — Token budget for extended thinking (default: 10,000)

### Remote Second Brain

The Settings panel includes a **Remote Second Brain** section at the bottom for users who have Second Brain running on a remote machine. This section provides:

1. **Platform-specific instructions** — Switch between Mac/Linux and Windows tabs to see the correct download and run commands for the bridge
2. **One-click copy** — Copy the download command and run command with a single click
3. **Auto-connect** — Enter the remote machine's hostname or IP, and ArcadIA automatically tests the connection after you stop typing. If successful, remote mode activates immediately
4. **Connection status** — Shows bridge version, platform, and latency when connected
5. **Disconnect** — One-click button to disconnect and revert to local bridge

The bridge is a **standalone single file** (no npm install needed) that you download directly to the remote machine. See the [Remote Second Brain](#remote-second-brain-windows-users) section under Second Brain for full setup instructions.

### Available models

| Model | Tier | Best for |
|---|---|---|
| Claude Opus 4.6 | Most Powerful | Complex reasoning, long tasks, multi-agent |
| Claude Sonnet 4.6 | Recommended | Best balance of intelligence and speed |
| Claude Sonnet 4.5 | Best for Code | Complex agents and coding tasks |
| Claude Haiku 4.5 | Fastest | Quick questions, low latency |
| Claude Sonnet 4 | Stable | General-purpose, stable release |
| Claude Opus 4 | Stable | Complex tasks, stable release |
| Claude 3.5 Haiku | Legacy | Fast and affordable |

---

## 9. Skills & Templates

Skills are reusable prompt templates that save time on recurring tasks.

### Pre-built skills

| Skill | Category | Description |
|---|---|---|
| React Component Generator | Code Generation | Generate production-ready React components with TypeScript and CSS modules |
| API Documentation Writer | Documentation | Generate comprehensive API docs from endpoint descriptions |
| Code Review Assistant | Code Review | Analyze code for bugs, security issues, performance, and style |
| Test Generator | Testing | Generate unit and integration tests with edge cases |
| SQL Query Builder | Database | Generate optimized SQL from natural language |

### Creating custom skills

1. Go to the Skills panel (lightning icon in sidebar)
2. Click "+ Create Skill"
3. Fill in: name, description, category, tags, and prompt template
4. Use `[PLACEHOLDERS]` in your prompt for variable parts (e.g., `[COMPONENT_NAME]`, `[LANGUAGE]`)
5. Click Save

### Using a skill

Click a skill card, then "Copy Prompt". Paste it into a new chat and replace the placeholders with your specific values.

---

## 10. Integrations

Integrations give Claude access to external tools during your conversations. Enable or disable them in the Integrations panel.

### Available integrations

| Integration | Tools | Description |
|---|---|---|
| **GitHub** | List repos, read files, create issues, list PRs, search code | Interact with your GitHub repositories directly from chat |
| **Google Drive** | List files, read documents | Access and read your Google Drive files |
| **Web Search** | Search, fetch URL | Search the web and fetch page content |
| **Code Execution** | Run code | Execute code snippets in a sandboxed environment |
| **Long-term Memory** | Store/recall | Persistent memory across conversations |

When an integration is enabled, Claude can use those tools autonomously during your conversation. For example, with GitHub enabled, you can say "Show me the open PRs in my repo" and Claude will call the GitHub API.

---

## 11. Analytics

The Analytics panel provides usage statistics across all your conversations:

- **Total conversations and messages** — Overall usage counts
- **Token usage** — Input and output tokens over time
- **Response times** — Average TTFT and total response time trends
- **Model distribution** — Which models you use most
- **Activity heatmap** — When you use ArcadIA most (by day and hour)

All analytics data is computed locally from your browser-stored conversations. Nothing is sent to external servers.

---

## 12. Benchmark

The Benchmark panel lets you test and compare Claude's performance across different tasks:

### Benchmark suite

| Test | What it measures |
|---|---|
| Simple Q&A | Basic response latency |
| Code Generation | TypeScript function generation speed |
| Long Output | Extended generation throughput |
| Complex Reasoning | Multi-step analysis performance |
| HTML Generation | Full-page HTML/CSS generation |
| Multi-step Analysis | Comparative analysis with table output |

### Metrics collected

- **TTFT** (Time to First Token) — How fast Claude starts responding
- **Total time** — End-to-end response time
- **Tokens/second** — Generation throughput
- **Total tokens** — Output length

Run benchmarks to compare models, identify bottlenecks, and optimize your workflow.

---

## 13. Code Workspace & Preview

### Code Workspace
A built-in file explorer and code editor. Browse project files, view code with syntax highlighting, and edit files directly. Connected to your local filesystem through the bridge.

### Preview Panel
The right panel shows real-time previews of code that Claude generates:
- **HTML artifacts** render in a live sandbox iframe
- **Code blocks** display with syntax highlighting and a copy button
- Click "Open" to view HTML artifacts in a new tab

Resize panels by dragging the borders between them. Your preferred widths are saved automatically. Collapse panels by clicking the arrow button on the panel edge.

---

## 14. Team Panel

The Team panel lets you organize team members into pods:
- Create and manage team pods
- Add members with roles and contact info
- View team structure at a glance

---

## 15. Help & Support

The Help panel (? icon in sidebar) contains a searchable FAQ covering every feature. Use the search bar to find answers quickly.

**Contact support:** [ikosoy@meta.com](mailto:ikosoy@meta.com?subject=ArcadIA%20Editor%20Support)

When reporting issues, include:
- Your OS and version (macOS, Windows, or Linux)
- Output of `claude --version`
- Output of `curl http://127.0.0.1:8087/health` (or `Invoke-RestMethod http://127.0.0.1:8087/health` on Windows)
- Any error messages you see

---

## 16. Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Enter` | Send message |
| `Shift + Enter` | New line in message |
| `Esc` | Stop streaming response |

---

## 17. Troubleshooting

### "Unable to connect" or no green dot

The bridge is not running. Open your **system Terminal** (not Claude Code) and start it:

**macOS / Linux:**
```bash
node ~/.arcadia-bridge/arcadia-bridge.js
```

**Windows (PowerShell):**
```powershell
node "$env:USERPROFILE\.arcadia-bridge\arcadia-bridge.js"
```

If you have not set it up yet, run the one-time setup (see [Quick Start](#1-quick-start)).

### Setup command shows security warnings

If you see a message like "I've reviewed the script. Here are the concerns..." — you pasted the setup command into **Claude Code's terminal** instead of your system Terminal. Open Terminal.app (macOS) or PowerShell (Windows) and paste the command there instead.

### Bridge is running but ArcadIA will not connect

Check that nothing else is using port 8087:

**macOS / Linux:**
```bash
lsof -i :8087
```

**Windows (PowerShell):**
```powershell
netstat -ano | findstr :8087
```

The bridge (v3.2.3+) automatically kills stale processes on startup, but if the issue persists, manually kill the process and restart.

### Node.js not found

If the setup script says "Node.js not found", install it:
- **macOS:** Download from [https://nodejs.org](https://nodejs.org) (click the green LTS button), run the `.pkg` installer, then close and reopen Terminal
- **Windows:** Download from [https://nodejs.org](https://nodejs.org), run the `.msi` installer, then close and reopen PowerShell
- **Alternative (macOS):** Install Homebrew first (`/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`), then re-run the setup command — it will auto-install Node via Homebrew

### Claude Code is not installed

Install Claude Code on your Meta laptop: [https://fburl.com/claude.code.users](https://fburl.com/claude.code.users)

Verify with:
```bash
claude --version
```

### Bridge stopped working after a restart

The bridge should auto-start on login. If it did not:

**macOS:** Reload the LaunchAgent:
```bash
launchctl load ~/Library/LaunchAgents/com.arcadia.bridge.plist
```

**Windows:** Check that the "ArcadIA Bridge" shortcut exists in your Startup folder:
```powershell
ls "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\ArcadIA Bridge.lnk"
```

On either platform, re-run the setup command to reinstall (see [Quick Start](#1-quick-start)).

### Slow first response (~50s)

The first request after bridge startup takes ~50 seconds because Claude Code needs to load Meta's authentication plugins. Subsequent requests should be much faster (~5-10s) thanks to the process pool in v3.4.0+, which keeps two standby processes ready. If every request is slow, check your network connection and Claude Code installation. You can verify pool status via the health endpoint — look for `pool_status` entries where `ready: true`.

### Second Brain setup button does nothing

Open browser DevTools (F12 → Console) and look for `[SecondBrain]` log messages. These show exactly what the detection found and what steps were built. If the log says "Built 0 steps", it means the detection thinks everything is installed but the summary disagrees — click "Re-scan" to refresh the detection, then try the button again.

### Connection diagnostics

On the welcome screen, click "Connection diagnostics" to see bridge status, endpoint, version, and last check time. You can also check the bridge health directly:

**macOS / Linux:**
```bash
curl http://127.0.0.1:8087/health | python3 -m json.tool
```

**Windows (PowerShell):**
```powershell
Invoke-RestMethod http://127.0.0.1:8087/health | ConvertTo-Json
```

This shows bridge version, platform, warm-up status, pool process readiness (2 slots), and request statistics. The `platform` field confirms whether the bridge is running on `darwin` (macOS), `win32` (Windows), or `linux`.
