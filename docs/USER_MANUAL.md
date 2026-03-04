# ArcadIA Editor — User Manual

**Version 3.3.0** | Last updated: March 2026

ArcadIA Editor is a web-based interface for Claude AI, designed specifically for Meta employees. It connects to Claude Code on your laptop through a lightweight local bridge, so you get full Claude access with zero API keys and zero VPN required. This manual covers every feature, panel, and workflow available in the app.

---

## Table of Contents

1. [Quick Start](#1-quick-start)
2. [The ArcadIA Bridge](#2-the-arcadia-bridge)
3. [Interface Modes](#3-interface-modes)
4. [Simple Mode](#4-simple-mode)
5. [Engineer Mode](#5-engineer-mode)
6. [Sidebar & Conversations](#6-sidebar--conversations)
7. [Settings](#7-settings)
8. [Skills & Templates](#8-skills--templates)
9. [Integrations](#9-integrations)
10. [Analytics](#10-analytics)
11. [Benchmark](#11-benchmark)
12. [Code Workspace & Preview](#12-code-workspace--preview)
13. [Team Panel](#13-team-panel)
14. [Help & Support](#14-help--support)
15. [Keyboard Shortcuts](#15-keyboard-shortcuts)
16. [Troubleshooting](#16-troubleshooting)

---

## 1. Quick Start

Getting started with ArcadIA takes about 60 seconds:

1. **Open ArcadIA** in your browser at [https://ikosoymeta.github.io/Arcadia/](https://ikosoymeta.github.io/Arcadia/) or [https://arcadia.manus.space](https://arcadia.manus.space).
2. **Run the bridge** (one-time setup). On your first visit, you will see a setup screen with a single command. Copy it, paste it into Terminal on your Mac, and press Enter:
   ```
   curl -sL https://raw.githubusercontent.com/ikosoymeta/Arcadia/main/bridge/setup.sh | bash
   ```
3. **Wait for the green dot.** Once the bridge is running, the sidebar will show a green "Active" indicator next to your connection name. ArcadIA auto-connects — no API keys, no VPN, no configuration.
4. **Start chatting.** Click "+ New Chat" or pick one of the quick-start prompts on the welcome screen.

After the one-time setup, the bridge auto-starts on login (via a macOS LaunchAgent), so you just open ArcadIA and go.

---

## 2. The ArcadIA Bridge

The bridge is a small Node.js service that runs locally on your Mac (port 8087). It acts as a translator between ArcadIA in your browser and Claude Code on your laptop. Claude Code handles all Meta internal authentication automatically through the `meta@Meta` plugin.

### How it works

```
Browser (ArcadIA)  ──HTTP──▶  localhost:8087 (Bridge)  ──stdin/stdout──▶  Claude Code CLI
```

### Key features (v3.3.0)

| Feature | Description |
|---|---|
| **Auto-start** | Installs a macOS LaunchAgent so the bridge starts on login |
| **Process pre-spawning** | Keeps a standby Claude process ready for instant dispatch, reducing response time from ~50s to ~5-10s for subsequent requests |
| **Phase-aware progress** | Sends real-time status (Connecting → Authenticating → Waiting) to the frontend |
| **Auto port recovery** | Automatically kills stale processes on port 8087 before starting |
| **Graceful shutdown** | Properly cleans up child processes on Ctrl+C or system shutdown |
| **Context management** | Trims old messages to stay within Claude's context window |
| **Streaming** | Real-time SSE streaming so you see tokens as they arrive |

### Manual bridge commands

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

- **Connecting to Claude Code...** — Dispatching your request to the bridge
- **Claude is thinking...** — Waiting for the first token (shows elapsed time)
- **Writing response** — Streaming tokens in real-time
- **Preparing results** — Extracting artifacts and code blocks

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
An interactive terminal emulator with command history. Runs commands locally through the bridge on your machine.

### Debug tab
Raw debug console showing internal state, connection diagnostics, and error traces.

### Built-in tools
Engineer mode includes built-in tools that Claude can use during conversations:
- **Calculator** — Evaluate mathematical expressions
- **Get current time** — Retrieve current date and time
- **Web search** — Search the web for information (simulated)

---

## 6. Sidebar & Conversations

The left sidebar provides navigation and conversation management.

### Navigation items

| Icon | Section | Description |
|---|---|---|
| Chat | Chat | Main chat interface |
| Code | Code Workspace | File explorer and code editor |
| Skills | Skills | Reusable prompt templates |
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

## 7. Settings

The Settings panel lets you manage API connections and app preferences.

### API Connections

ArcadIA supports multiple connection types:

| Type | Description |
|---|---|
| **Meta Corporate (LDAR)** | Auto-configured. Uses the local bridge + Claude Code. No API key needed. |
| **Anthropic API** | Direct API connection. Requires your own Anthropic API key. |
| **Custom Proxy** | Connect through a custom proxy URL (e.g., for team-shared endpoints). |

### Connection settings

For each connection, you can configure:
- **Name** — Display label for the connection
- **Model** — Select from available Claude models
- **Max tokens** — Maximum output length (default: 8096)
- **Temperature** — Response creativity (0.0 = deterministic, 1.0 = creative)
- **Extended thinking** — Enable Claude's chain-of-thought reasoning (Sonnet 4+ and Opus 4+ only)
- **Thinking budget** — Token budget for extended thinking (default: 10,000)

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

## 8. Skills & Templates

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

## 9. Integrations

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

## 10. Analytics

The Analytics panel provides usage statistics across all your conversations:

- **Total conversations and messages** — Overall usage counts
- **Token usage** — Input and output tokens over time
- **Response times** — Average TTFT and total response time trends
- **Model distribution** — Which models you use most
- **Activity heatmap** — When you use ArcadIA most (by day and hour)

All analytics data is computed locally from your browser-stored conversations. Nothing is sent to external servers.

---

## 11. Benchmark

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

## 12. Code Workspace & Preview

### Code Workspace
A built-in file explorer and code editor. Browse project files, view code with syntax highlighting, and edit files directly. Connected to your local filesystem through the bridge.

### Preview Panel
The right panel shows real-time previews of code that Claude generates:
- **HTML artifacts** render in a live sandbox iframe
- **Code blocks** display with syntax highlighting and a copy button
- Click "Open" to view HTML artifacts in a new tab

Resize panels by dragging the borders between them. Your preferred widths are saved automatically. Collapse panels by clicking the arrow button on the panel edge.

---

## 13. Team Panel

The Team panel lets you organize team members into pods:
- Create and manage team pods
- Add members with roles and contact info
- View team structure at a glance

---

## 14. Help & Support

The Help panel (? icon in sidebar) contains a searchable FAQ covering every feature. Use the search bar to find answers quickly.

**Contact support:** [ikosoy@meta.com](mailto:ikosoy@meta.com?subject=ArcadIA%20Editor%20Support)

When reporting issues, include:
- Your Mac model and macOS version
- Output of `claude --version`
- Output of `lsof -i :8087`
- Any error messages you see

---

## 15. Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Enter` | Send message |
| `Shift + Enter` | New line in message |
| `Esc` | Stop streaming response |

---

## 16. Troubleshooting

### "Unable to connect" or no green dot

The bridge is not running. Open Terminal and run:
```bash
node ~/.arcadia-bridge/arcadia-bridge.js
```

If you have not set it up yet, run the one-time setup:
```bash
curl -sL https://raw.githubusercontent.com/ikosoymeta/Arcadia/main/bridge/setup.sh | bash
```

### Bridge is running but ArcadIA will not connect

Check that nothing else is using port 8087:
```bash
lsof -i :8087
```
The bridge (v3.2.3+) automatically kills stale processes on startup, but if the issue persists, manually kill the process and restart.

### Claude Code is not installed

Install Claude Code on your Meta laptop: [https://fburl.com/claude.code.users](https://fburl.com/claude.code.users)

Verify with:
```bash
claude --version
```

### Bridge stopped working after a restart

The bridge should auto-start on login. If it did not, reload the LaunchAgent:
```bash
launchctl load ~/Library/LaunchAgents/com.arcadia.bridge.plist
```

Or re-run the setup command to reinstall.

### Slow first response (~50s)

The first request after bridge startup takes ~50 seconds because Claude Code needs to load Meta's authentication plugins. Subsequent requests should be much faster (~5-10s) thanks to process pre-spawning in v3.3.0. If every request is slow, check your network connection and Claude Code installation.

### Connection diagnostics

On the welcome screen, click "Connection diagnostics" to see bridge status, endpoint, version, and last check time. You can also check the bridge health directly:
```bash
curl http://127.0.0.1:8087/health | python3 -m json.tool
```

This shows bridge version, warm-up status, standby process readiness, and request statistics.
