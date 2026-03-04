# ArcadIA Editor — Claude AI for Meta, Without the Terminal

**TL;DR:** ArcadIA is a web-based Claude interface built for Meta employees. One command to set up, zero API keys, zero VPN. Open a browser tab and start using Claude for meeting notes, emails, code reviews, status updates, and more.

---

## What is ArcadIA?

ArcadIA Editor gives you a polished, ChatGPT-style interface for Claude — but it runs through your Meta corporate Claude Code license. No API keys to manage, no VPN required, no terminal skills needed. Just open the link and start chatting.

**Try it now:** [https://arcadia.manus.space](https://arcadia.manus.space)

---

## One-Time Setup (60 seconds)

ArcadIA needs a small bridge service running on your Mac to connect to Claude Code. You only do this once — after that, it auto-starts every time you log in.

**Step 1:** Open Terminal on your Mac.

**Step 2:** Paste this command and press Enter:

```
curl -sL https://raw.githubusercontent.com/ikosoymeta/Arcadia/main/bridge/setup.sh | bash
```

**Step 3:** Open [https://arcadia.manus.space](https://arcadia.manus.space) in your browser. You should see a green "Active" dot — you're connected.

That's it. The bridge auto-starts on login, so tomorrow you just open the link and go.

---

## What Can You Do With It?

ArcadIA comes with **two modes** — pick whichever fits your workflow:

### Simple Mode (for everyone)

Click a quick-start button and go. No prompting skills required.

- **Meeting notes** — Paste your rough notes, get organized Key Decisions, Action Items, and Open Questions
- **Draft an email** — Describe the situation, get a polished professional email
- **Project status update** — Answer a few questions, get a stakeholder-ready report
- **HPM Self-Review** — Draft your half review with Impact, Execution, and Collaboration sections
- **Summarize data** — Paste numbers or a table, get plain-language insights
- **Brainstorm ideas** — Describe a challenge, get solutions ranked by effort level

### Engineer Mode (for developers)

Everything in Simple mode, plus:

- **Validation Pipeline** — Auto-run lint, typecheck, tests, and build. When errors are found, Claude fixes them automatically. Generate → Validate → Fix loop.
- **API Logs** — Full request/response logging with token counts and timing
- **Terminal** — Run commands on your local machine through the browser
- **Benchmarks** — Test Claude's speed across different task types

---

## Why ArcadIA Instead of Claude Code in Terminal?

| | Claude Code (Terminal) | ArcadIA Editor |
|---|---|---|
| Interface | Command line | Visual web app |
| Rich formatting | Plain text | Markdown, tables, code highlighting |
| Image support | No | Drag & drop images into chat |
| Conversation history | Lost on close | Saved, searchable, shareable |
| Quick-start templates | None | 6 built-in prompts + custom Skills |
| Team sharing | Copy/paste | Share links, export to Markdown/JSON |
| Analytics | None | Token usage, response times, activity heatmap |
| Setup | Already installed | One command, then auto-starts |

ArcadIA uses the same Claude Code and the same Meta authentication under the hood — it just wraps it in a better interface.

---

## What's Coming Next

We're actively building:

- **Autonomous tool use** — Claude executes multi-step workflows (read files, run commands, iterate) without manual intervention
- **Team skills library** — Share your best prompt templates across the team
- **GitHub/Google Drive integrations** — Claude reads your repos and docs directly
- **Real-time collaboration** — Multiple team members in the same conversation

---

## Requirements

- A Meta laptop with **Claude Code** installed ([install here](https://fburl.com/claude.code.users))
- **Node.js** (pre-installed on most Meta Macs)
- A modern browser (Chrome, Safari, Firefox)
- No VPN needed

---

## Questions or Issues?

Reach out to **Igor Kosoy** (ikosoy@meta.com) or file an issue on the [GitHub repo](https://github.com/ikosoymeta/Arcadia).

---

*Built by Igor Kosoy | Meta Content Organization*
