# ArcadIA + Second Brain — Your AI Knowledge System, Set Up in 2 Minutes

**TL;DR:** ArcadIA now includes a built-in Second Brain panel that detects, installs, and configures the entire Second Brain system automatically. No terminal commands, no manual file creation. Click one button and you're set up with a Google Drive workspace, pre-configured slash commands, and an AI-powered personal knowledge system.

---

## What is Second Brain?

Second Brain is a personal knowledge system powered by Claude Code. It organizes your projects, notes, and daily workflows in a Google Drive workspace that Claude can read and write to. Instead of starting every conversation from scratch, Claude has persistent context about your work — your priorities, your writing style, your projects.

The core workflow is built around **slash commands** — short commands you type in Claude Code that trigger structured workflows:

| Command | What it does |
|---|---|
| **/daily-brief** | Morning briefing from your priorities, calendar, and recent activity |
| **/eod** | End-of-day wrap-up — processes notes, captures accomplishments, previews tomorrow |
| **/eow** | End-of-week summary — compiles weekly wins, PSC-worthy items, next week plan |
| **/prepare-meeting** | Research a person or topic and generate a structured meeting agenda |
| **/add-context** | Paste any URL or text and it routes to the right project |
| **/deep-research** | Multi-source research on any topic with citations |

---

## What's New in ArcadIA

The new **Second Brain panel** (🧠 icon in the sidebar) brings the entire setup and management experience into ArcadIA's visual interface.

### Automated detection and setup

Open the panel and ArcadIA immediately scans your computer for every Second Brain component:

- Claude Code installed?
- Google Drive for Desktop running?
- Workspace folder created?
- CLAUDE.md configuration file present?
- Skills and plugins installed?

A progress bar shows your readiness (e.g., "3 of 4 components ready"). If anything is missing, a single **"Complete Setup"** button installs everything automatically.

### What the setup wizard does

When you click "Complete Setup", a guided wizard handles the entire installation:

1. **Creates your workspace** — Sets up the `claude/` folder structure in Google Drive with organized subfolders for projects, notes, and templates
2. **Generates CLAUDE.md** — Writes the configuration file with all slash commands pre-configured and ready to use
3. **Installs skills and plugins** — Downloads task management, deep research, and other Second Brain skills
4. **Prompts you only when necessary** — If something truly requires your action (like installing Google Drive for Desktop), a clear modal dialog tells you exactly what to do and auto-detects when you're done

The entire process takes about 2 minutes. No terminal commands, no copy-pasting file paths, no editing config files.

### Slash command cards

After setup, the panel displays all 6 slash commands as visual cards. Each card shows the command name, a description of what it does, and a **Copy** button so you can paste it directly into Claude Code.

### Writing style guide

The panel includes guidance on creating a personal writing style guide. Feed Claude a few examples of your writing, and it generates a style profile that ensures all future output matches your tone — whether that's concise and direct, or detailed and analytical.

### Optional add-ons

The panel also tracks optional tools that enhance the Second Brain experience:

- **Wispr Flow** — Voice-to-text input (3x faster than typing). Detected automatically if installed.
- **GClaude** — Chat with your Second Brain via Google Chat
- **Obsidian** — Local knowledge management that syncs with your workspace

---

## How to Try It

1. **Open ArcadIA** at [https://arcadia.manus.space](https://arcadia.manus.space)
2. **Click the 🧠 icon** in the sidebar (or "2nd Brain" label)
3. **Click "Complete Setup"** if any components are missing
4. **Start using slash commands** — copy `/daily-brief` from the panel and paste it into Claude Code

If you already have the bridge running, the panel works immediately. If not, set up the bridge first (one command — see the setup screen when you open ArcadIA).

---

## What's Next

We're working on running slash commands directly from ArcadIA (no need to switch to Claude Code), a Second Brain health dashboard showing sync status and activity, and support for custom slash commands that you create yourself.

---

## Questions?

Reach out to **Igor Kosoy** (ikosoy@meta.com) or file an issue on the [GitHub repo](https://github.com/ikosoymeta/Arcadia).

---

*Built by Igor Kosoy | Meta Content Organization*
