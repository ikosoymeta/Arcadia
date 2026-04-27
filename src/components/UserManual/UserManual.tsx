import React, { useState, useEffect, useRef } from 'react';
import styles from './UserManual.module.css';

// ─── Table of Contents structure ─────────────────────────────────────────────

interface TocItem {
  id: string;
  label: string;
  level: number;
}

const TOC: TocItem[] = [
  { id: 'getting-started', label: 'Getting Started', level: 1 },
  { id: 'interface-modes', label: 'Interface Modes', level: 2 },
  { id: 'navigation', label: 'Navigation & Sidebar', level: 2 },

  { id: 'chat', label: 'Chat', level: 1 },
  { id: 'simple-mode', label: 'Simple Mode', level: 2 },
  { id: 'engineer-mode', label: 'Engineer Mode', level: 2 },
  { id: 'conversations', label: 'Conversations & Folders', level: 2 },
  { id: 'sharing', label: 'Sharing & Exporting', level: 2 },
  { id: 'model-selection', label: 'Model Selection', level: 2 },
  { id: 'suggestions', label: 'Suggestion Cards & Preloading', level: 2 },
  { id: 'presentations', label: 'Create Presentation', level: 2 },

  { id: 'second-brain', label: 'Second Brain', level: 1 },
  { id: 'sb-overview', label: 'What is Second Brain?', level: 2 },
  { id: 'bridge-setup', label: 'Bridge Setup', level: 2 },
  { id: 'bridge-local', label: 'Local Setup — Recommended', level: 3 },
  { id: 'bridge-devserver', label: 'Meta Devserver (Advanced)', level: 3 },
  { id: 'bridge-manual', label: 'Manual Setup (Alternative)', level: 3 },
  { id: 'bridge-remote', label: 'Remote Setup (Another Machine)', level: 3 },
  { id: 'bridge-update', label: 'Updating the Bridge', level: 3 },
  { id: 'sb-detection', label: 'Automated Detection & Install', level: 2 },
  { id: 'slash-commands', label: 'Slash Commands', level: 2 },
  { id: 'custom-skills-sb', label: 'Custom Skills as Slash Commands', level: 2 },
  { id: 'session-hook', label: 'Session Startup Hook', level: 2 },
  { id: 'writing-style', label: 'Writing Style Guide', level: 2 },
  { id: 'addons', label: 'Add-ons', level: 2 },
  { id: 'addon-gclaude', label: 'GClaude', level: 3 },
  { id: 'addon-wispr', label: 'Wispr Flow / SuperWhisper', level: 3 },
  { id: 'addon-obsidian', label: 'Obsidian', level: 3 },
  { id: 'scheduling', label: 'Scheduled Automations', level: 2 },
  { id: 'sb-preview', label: 'Preview Panel & Chat', level: 2 },
  { id: 'sb-downloads', label: 'Downloading Outputs', level: 2 },

  { id: 'skills', label: 'Skills', level: 1 },
  { id: 'skills-overview', label: 'Overview', level: 2 },
  { id: 'skills-create', label: 'Creating Custom Skills', level: 2 },
  { id: 'skills-schedule', label: 'Scheduling Skills', level: 2 },

  { id: 'code-workspace', label: 'Code Workspace', level: 1 },

  { id: 'settings', label: 'Settings', level: 1 },
  { id: 'settings-connections', label: 'API Connections', level: 2 },
  { id: 'settings-bridge', label: 'Remote Bridge Configuration', level: 2 },
  { id: 'settings-models', label: 'Available Models', level: 2 },

  { id: 'other-panels', label: 'Other Panels', level: 1 },
  { id: 'panel-team', label: 'Team', level: 2 },
  { id: 'panel-integrations', label: 'Integrations', level: 2 },
  { id: 'panel-analytics', label: 'Analytics', level: 2 },
  { id: 'panel-benchmarks', label: 'Benchmarks', level: 2 },
  { id: 'panel-help', label: 'Help', level: 2 },

  { id: 'troubleshooting', label: 'Troubleshooting', level: 1 },
  { id: 'ts-bridge', label: 'Bridge Connection Issues', level: 2 },
  { id: 'ts-model', label: 'Model Errors', level: 2 },
  { id: 'ts-secondbrain', label: 'Second Brain Setup Failures', level: 2 },
  { id: 'ts-general', label: 'General Tips', level: 2 },
];

// ─── Section Components ──────────────────────────────────────────────────────

function SectionHeading({ id, children, level = 2 }: { id: string; children: React.ReactNode; level?: number }) {
  const Tag = level === 1 ? 'h2' : level === 3 ? 'h4' : 'h3';
  return (
    <Tag id={id} className={level === 1 ? styles.h1 : level === 3 ? styles.h3 : styles.h2}>
      {children}
    </Tag>
  );
}

function Cmd({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={styles.cmdBlock}>
      <code className={styles.cmdCode}>{children}</code>
      <button
        className={styles.cmdCopy}
        onClick={() => { navigator.clipboard.writeText(children); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      >
        {copied ? '✓ Copied' : 'Copy'}
      </button>
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return <div className={styles.tip}><span className={styles.tipIcon}>💡</span><div>{children}</div></div>;
}

function Warning({ children }: { children: React.ReactNode }) {
  return <div className={styles.warning}><span className={styles.warningIcon}>⚠️</span><div>{children}</div></div>;
}

function InfoBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.infoBox}>
      <div className={styles.infoBoxTitle}>{title}</div>
      <div className={styles.infoBoxContent}>{children}</div>
    </div>
  );
}

function StepList({ steps }: { steps: { title: string; desc: React.ReactNode }[] }) {
  return (
    <div className={styles.stepList}>
      {steps.map((step, i) => (
        <div key={i} className={styles.stepItem}>
          <div className={styles.stepNumber}>{i + 1}</div>
          <div className={styles.stepContent}>
            <div className={styles.stepTitle}>{step.title}</div>
            <div className={styles.stepDesc}>{step.desc}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function TableRow({ cells }: { cells: React.ReactNode[] }) {
  return (
    <tr>
      {cells.map((cell, i) => <td key={i} className={styles.td}>{cell}</td>)}
    </tr>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function UserManual() {
  const [activeSection, setActiveSection] = useState('getting-started');
  const [tocOpen, setTocOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const contentRef = useRef<HTMLDivElement>(null);

  // Intersection observer for active section tracking
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: '-80px 0px -70% 0px', threshold: 0.1 }
    );

    const sections = document.querySelectorAll('[id]');
    sections.forEach(s => {
      if (TOC.some(t => t.id === s.id)) observer.observe(s);
    });

    return () => observer.disconnect();
  }, []);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveSection(id);
    }
  };

  const filteredToc = searchQuery
    ? TOC.filter(t => t.label.toLowerCase().includes(searchQuery.toLowerCase()))
    : TOC;

  return (
    <div className={styles.container}>
      {/* ─── Table of Contents Sidebar ─── */}
      <aside className={`${styles.tocSidebar} ${tocOpen ? '' : styles.tocCollapsed}`}>
        <div className={styles.tocHeader}>
          <span className={styles.tocTitle}>User Manual</span>
          <button className={styles.tocToggle} onClick={() => setTocOpen(!tocOpen)} title={tocOpen ? 'Collapse' : 'Expand'}>
            {tocOpen ? '◀' : '▶'}
          </button>
        </div>
        {tocOpen && (
          <>
            <div className={styles.tocSearch}>
              <input
                type="text"
                placeholder="Search sections..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className={styles.tocSearchInput}
              />
            </div>
            <nav className={styles.tocNav}>
              {filteredToc.map(item => (
                <button
                  key={item.id}
                  className={`${styles.tocItem} ${styles[`tocLevel${item.level}`]} ${activeSection === item.id ? styles.tocActive : ''}`}
                  onClick={() => scrollTo(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          </>
        )}
      </aside>

      {/* ─── Content ─── */}
      <main className={styles.content} ref={contentRef}>
        <div className={styles.contentInner}>
          {/* Hero */}
          <div className={styles.hero}>
            <div className={styles.heroIcon}>📖</div>
            <h1 className={styles.heroTitle}>ArcadIA Editor — User Manual</h1>
            <p className={styles.heroSubtitle}>
              Complete guide to all features, setup, and configuration
            </p>
            <div className={styles.heroMeta}>
              Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </div>
          </div>

          {/* ════════════════════════════════════════════════════════════════════ */}
          {/* GETTING STARTED */}
          {/* ════════════════════════════════════════════════════════════════════ */}

          <SectionHeading id="getting-started" level={1}>Getting Started</SectionHeading>
          <p className={styles.p}>
            ArcadIA Editor is an AI-powered code editor and chat interface powered by Claude. It provides two distinct interface modes designed for different user types: a friendly <strong>Simple mode</strong> for non-technical users and a full-featured <strong>Engineer mode</strong> with terminal access, API logs, and debugging tools.
          </p>

          <SectionHeading id="interface-modes">Interface Modes</SectionHeading>
          <p className={styles.p}>
            At the top of the chat view, you will see a mode switcher with two options:
          </p>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Mode</th>
                <th className={styles.th}>Best For</th>
                <th className={styles.th}>Features</th>
              </tr>
            </thead>
            <tbody>
              <TableRow cells={[
                <><strong>Simple</strong></>,
                'Non-technical users',
                'Clean chat interface, suggestion cards, preview panel, drag-and-drop images, presentation creator'
              ]} />
              <TableRow cells={[
                <><strong>Engineer</strong></>,
                'Developers & power users',
                'Terminal tab, API logs, debug console, tool use, validation panel, raw request/response inspection'
              ]} />
            </tbody>
          </table>
          <Tip>Your selected mode is saved automatically and persists across sessions.</Tip>

          <SectionHeading id="navigation">Navigation & Sidebar</SectionHeading>
          <p className={styles.p}>
            The left sidebar provides access to all major sections of ArcadIA. The sidebar is resizable — drag its right edge to adjust the width. You can also collapse it entirely using the collapse button in the header.
          </p>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Icon</th>
                <th className={styles.th}>Section</th>
                <th className={styles.th}>Description</th>
              </tr>
            </thead>
            <tbody>
              <TableRow cells={['💬', <strong>Chat</strong>, 'Main conversation interface with Claude']} />
              <TableRow cells={['⌨', <strong>Code</strong>, 'Code workspace for editing and reviewing files']} />
              <TableRow cells={['⚡', <strong>Skills</strong>, 'Create, manage, and schedule reusable prompt templates']} />
              <TableRow cells={['👥', <strong>Team</strong>, 'Team collaboration features']} />
              <TableRow cells={['⚙', <strong>Settings</strong>, 'API connections, model configuration, bridge settings']} />
              <TableRow cells={['🧠', <strong>2nd Brain</strong>, 'Second Brain dashboard with slash commands and automations']} />
              <TableRow cells={['🔌', <strong>Integrations</strong>, 'External service connections']} />
              <TableRow cells={['📈', <strong>Analytics</strong>, 'Usage analytics and metrics']} />
              <TableRow cells={['📊', <strong>Bench</strong>, 'Model benchmarking tools']} />
              <TableRow cells={['?', <strong>Help</strong>, 'Help and documentation']} />
            </tbody>
          </table>
          <p className={styles.p}>
            Below the navigation icons, you will find the <strong>conversation list</strong> organized into folders. You can create new conversations, organize them into folders, search through them, and manage them with right-click context menus (rename, pin, delete, share).
          </p>

          {/* ════════════════════════════════════════════════════════════════════ */}
          {/* CHAT */}
          {/* ════════════════════════════════════════════════════════════════════ */}

          <SectionHeading id="chat" level={1}>Chat</SectionHeading>

          <SectionHeading id="simple-mode">Simple Mode</SectionHeading>
          <p className={styles.p}>
            Simple mode provides a clean, friendly chat interface. Type your message in the input box at the bottom and press <strong>Enter</strong> to send. You can also:
          </p>
          <ul className={styles.ul}>
            <li><strong>Attach images</strong> — drag and drop images directly into the chat, or click the attachment button.</li>
            <li><strong>Preview panel</strong> — click the "Preview" button in the header to open a resizable side panel that shows rendered HTML artifacts, code previews, and other visual outputs from Claude's responses.</li>
            <li><strong>Model selector</strong> — click the model name below the title to switch between Claude models on the fly.</li>
          </ul>

          <SectionHeading id="engineer-mode">Engineer Mode</SectionHeading>
          <p className={styles.p}>
            Engineer mode adds several powerful tabs alongside the chat:
          </p>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Tab</th>
                <th className={styles.th}>Purpose</th>
              </tr>
            </thead>
            <tbody>
              <TableRow cells={[<strong>Chat</strong>, 'Standard conversation with Claude, with markdown rendering and code highlighting']} />
              <TableRow cells={[<strong>Terminal</strong>, 'Terminal-style interface for running commands. Supports conversation memory across commands.']} />
              <TableRow cells={[<strong>Validate</strong>, 'Validate and test Claude responses, check for errors, and run assertions']} />
              <TableRow cells={[<strong>Logs</strong>, 'View raw API request/response logs, including headers, tokens used, latency, and full payloads']} />
              <TableRow cells={[<strong>Debug</strong>, 'Debug console for inspecting errors, tool calls, and internal state']} />
            </tbody>
          </table>
          <Tip>In Engineer mode, you also get access to built-in tools: <strong>calculator</strong>, <strong>get_current_time</strong>, and <strong>web_search</strong>. Claude can use these tools automatically during conversations.</Tip>

          <SectionHeading id="conversations">Conversations & Folders</SectionHeading>
          <p className={styles.p}>
            All conversations are saved automatically in the sidebar. You can organize them using the following features:
          </p>
          <ul className={styles.ul}>
            <li><strong>New Chat</strong> — click the "+ New Chat" button to start a fresh conversation.</li>
            <li><strong>Folders</strong> — create folders to group related conversations. Click the folder icon next to "+ New Chat".</li>
            <li><strong>Search</strong> — use the search box to filter conversations by title or content.</li>
            <li><strong>Right-click menu</strong> — right-click any conversation for options: Rename, Pin to top, Move to folder, Share, Delete.</li>
            <li><strong>Edit questions</strong> — click on any of your previous messages to edit and re-send them.</li>
          </ul>
          <Warning>Empty conversations (where no messages were sent) are not saved.</Warning>

          <SectionHeading id="sharing">Sharing & Exporting</SectionHeading>
          <p className={styles.p}>
            You can share conversations via a shareable link or export them as files:
          </p>
          <ul className={styles.ul}>
            <li><strong>Share link</strong> — generates a URL that encodes the conversation. Recipients can open it in ArcadIA to view the full conversation.</li>
            <li><strong>Export as Markdown</strong> — downloads the conversation as a .md file with all messages and artifacts.</li>
            <li><strong>Export as JSON</strong> — downloads the raw conversation data for programmatic use.</li>
          </ul>

          <SectionHeading id="model-selection">Model Selection</SectionHeading>
          <p className={styles.p}>
            ArcadIA supports multiple Claude models. You can change the active model in Settings or directly from the chat home screen:
          </p>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Model</th>
                <th className={styles.th}>Best For</th>
                <th className={styles.th}>Notes</th>
              </tr>
            </thead>
            <tbody>
              <TableRow cells={[<strong>Claude Opus 4.6</strong>, 'Complex reasoning, long tasks, multi-agent', 'Most powerful. Supports extended thinking and vision.']} />
              <TableRow cells={[<strong>Claude Sonnet 4.6</strong>, 'Best balance of intelligence and speed', 'Recommended for most users. Supports thinking and vision.']} />
              <TableRow cells={[<strong>Claude Sonnet 4.5</strong>, 'Complex coding and agents', 'Best coding model. Supports thinking and vision.']} />
              <TableRow cells={[<strong>Claude Haiku 4.5</strong>, 'Quick questions, fast responses', 'Fastest model. Supports vision but not extended thinking.']} />
              <TableRow cells={[<strong>Claude Sonnet 4</strong>, 'Stable general use', 'Stable Sonnet 4 release.']} />
              <TableRow cells={[<strong>Claude Opus 4</strong>, 'Stable advanced use', 'Stable Opus 4 release.']} />
              <TableRow cells={[<strong>Claude 3.5 Haiku</strong>, 'Fast and affordable', 'Legacy model, still available.']} />
            </tbody>
          </table>

          <SectionHeading id="suggestions">Suggestion Cards & Preloading</SectionHeading>
          <p className={styles.p}>
            When you open a new chat, you will see suggestion cards on the home screen. These are pre-built prompts for common tasks. Responses to these prompts are <strong>preloaded in the background</strong>, so clicking them gives you an almost instant reply (indicated by a ⚡ icon).
          </p>
          <p className={styles.p}>
            The home screen also includes quick-access buttons for <strong>Create Presentation</strong> and <strong>AI Landing Page</strong>.
          </p>

          <SectionHeading id="presentations">Create Presentation</SectionHeading>
          <p className={styles.p}>
            Click the "Create Presentation" button on the home screen to open the presentation dialog. Describe your topic and Claude will generate a slide deck for you. This feature uses Claude to create structured slide content that you can download and use.
          </p>

          {/* ════════════════════════════════════════════════════════════════════ */}
          {/* SECOND BRAIN */}
          {/* ════════════════════════════════════════════════════════════════════ */}

          <SectionHeading id="second-brain" level={1}>Second Brain</SectionHeading>

          <SectionHeading id="sb-overview">What is Second Brain?</SectionHeading>
          <p className={styles.p}>
            Second Brain is ArcadIA's knowledge management system. It connects Claude to your local files, Google Drive workspace, and project context — turning Claude from a generic assistant into a personalized one that knows your projects, priorities, and working style.
          </p>
          <InfoBox title="What Second Brain Does">
            <ul className={styles.ul}>
              <li><strong>Organizes your knowledge</strong> using the PARA method (Projects, Areas, Resources, Archive) in Google Drive</li>
              <li><strong>Configures CLAUDE.md</strong> with slash commands and project context so Claude knows your workflow</li>
              <li><strong>Installs skills and plugins</strong> that extend Claude's capabilities</li>
              <li><strong>Syncs external content</strong> from Workplace posts and Google Docs into your workspace</li>
            </ul>
          </InfoBox>

          <SectionHeading id="bridge-setup">Bridge Setup</SectionHeading>
          <p className={styles.p}>
            Second Brain requires the <strong>ArcadIA Bridge</strong> — a small helper program that connects ArcadIA to Claude Code and your Google Drive files. The bridge listens on port <strong>8087</strong> by default.
          </p>
          <p className={styles.p}>
            When you first open the Second Brain panel, you will see three options:
          </p>
          <ul className={styles.ul}>
            <li><strong>This Computer (Recommended)</strong> — one-command setup on your Mac or Windows PC. Auto-starts on login.</li>
            <li><strong>Meta Devserver</strong> — connect to a shared devserver with the bridge running 24/7. For advanced users with Meta internal network access.</li>
            <li><strong>Custom Remote Machine</strong> — connect to a bridge running on your own devserver or remote machine.</li>
          </ul>
          <Tip>ArcadIA auto-detects a local bridge on page load. If the bridge is already running on <code>localhost:8087</code>, it connects automatically — no clicks needed.</Tip>

          <SectionHeading id="bridge-local" level={3}>Local Setup — This Computer (Recommended)</SectionHeading>
          <p className={styles.p}>
            The recommended setup runs the bridge on your own computer. A single command installs everything, starts the bridge, and configures auto-start on login.
          </p>
          <p className={styles.p}>
            <strong>Mac / Linux:</strong>
          </p>
          <Cmd>curl -sL https://raw.githubusercontent.com/ikosoymeta/Arcadia/main/bridge/setup.sh | bash</Cmd>
          <p className={styles.p}>
            <strong>Windows (PowerShell):</strong>
          </p>
          <Cmd>irm https://raw.githubusercontent.com/ikosoymeta/Arcadia/main/bridge/setup.ps1 | iex</Cmd>
          <InfoBox title="What the setup script does">
            <ul className={styles.ul}>
              <li>Checks for Claude Code CLI and Node.js (installs Node.js if missing)</li>
              <li>Downloads the latest bridge from GitHub</li>
              <li>Stops any existing bridge and starts the new one</li>
              <li>Sets up auto-start: <strong>LaunchAgent</strong> on Mac, <strong>Task Scheduler</strong> on Windows, <strong>cron + tmux</strong> on Linux</li>
              <li>Runs a health check to verify everything is working</li>
            </ul>
          </InfoBox>
          <p className={styles.p}>
            After the script finishes, go back to ArcadIA and click <strong>"Bridge is running — Connect"</strong> or just refresh the page. ArcadIA will auto-detect the local bridge.
          </p>
          <Warning>
            <strong>Prerequisite:</strong> Claude Code must be installed on your computer. If you don't have it yet, install it from <a href="https://fburl.com/claude.code.users" target="_blank" rel="noopener noreferrer" style={{ color: '#818cf8' }}>fburl.com/claude.code.users</a>.
          </Warning>
          <Warning>
            Use your system <strong>Terminal</strong> (or PowerShell on Windows), not Claude Code's terminal. Pasting into Claude Code will trigger a security review instead of running the setup.
          </Warning>

          <SectionHeading id="bridge-devserver" level={3}>Meta Devserver (Advanced)</SectionHeading>
          <p className={styles.p}>
            For advanced users with Meta internal network access, you can connect to a shared devserver (<code>devvm423.maz0.facebook.com</code>) with the bridge running as a persistent 24/7 service. Click <strong>"One-Click Connect"</strong> on the setup screen.
          </p>
          <p className={styles.p}>
            <strong>Note:</strong> The devserver is only reachable from within Meta's internal network. If you're working from a personal machine or outside the office, use the local setup instead.
          </p>
          <p className={styles.p}>
            <strong>If the bridge needs to be set up or restarted on the devserver:</strong>
          </p>
          <StepList steps={[
            {
              title: 'SSH into the devserver',
              desc: <>
                <Cmd>ssh devvm423.maz0.facebook.com</Cmd>
              </>,
            },
            {
              title: 'Run the one-liner setup script',
              desc: <>
                <Cmd>curl -sL https://raw.githubusercontent.com/ikosoymeta/Arcadia/main/bridge/setup-devserver.sh | bash</Cmd>
                <p className={styles.smallText}>This single command downloads, installs, and starts the bridge with auto-restart. It sets up:</p>
                <ul className={styles.ul}>
                  <li>A <strong>tmux session</strong> that persists after SSH disconnect</li>
                  <li>A <strong>cron job</strong> that auto-restarts the bridge on reboot</li>
                  <li>A <strong>health check</strong> every 30 minutes that restarts if the bridge is down</li>
                  <li><strong>Remote access</strong> via <code>--host 0.0.0.0</code></li>
                </ul>
              </>,
            },
            {
              title: 'Connect from ArcadIA',
              desc: <>
                <p className={styles.p}>Go back to ArcadIA and click <strong>"One-Click Connect"</strong> or just refresh the page — it will auto-detect.</p>
              </>,
            },
          ]} />
          <InfoBox title="Devserver Details">
            <ul className={styles.ul}>
              <li><strong>Hostname:</strong> devvm423.maz0.facebook.com</li>
              <li><strong>Specs:</strong> 30 cores, 80 GB RAM, 429 GB disk (CentOS 9)</li>
              <li><strong>Pool:</strong> AI Assistant (dev7_small)</li>
              <li><strong>Bridge URL:</strong> <code>http://devvm423.maz0.facebook.com:8087</code></li>
            </ul>
          </InfoBox>
          <p className={styles.p}>
            <strong>Useful devserver commands:</strong>
          </p>
          <ul className={styles.ul}>
            <li><code>tmux attach -t arcadia-bridge</code> — view bridge output live</li>
            <li><code>tail -f ~/.arcadia-bridge/bridge.log</code> — view logs</li>
            <li><code>bash ~/.arcadia-bridge/setup-devserver.sh</code> — restart/update bridge</li>
            <li><code>tmux kill-session -t arcadia-bridge</code> — stop bridge</li>
          </ul>

          <SectionHeading id="bridge-manual" level={3}>Manual Setup (Alternative)</SectionHeading>
          <p className={styles.p}>
            If the one-command setup script doesn't work for your environment, you can set up the bridge manually in 3 steps:
          </p>
          <StepList steps={[
            {
              title: 'Open Terminal',
              desc: <>
                <strong>Mac/Linux:</strong> Press <strong>Cmd + Space</strong>, type <strong>Terminal</strong>, and press Enter.<br />
                <strong>Windows:</strong> Press the <strong>Windows key</strong>, type <strong>PowerShell</strong>, and click to open it.
              </>,
            },
            {
              title: 'Download the bridge',
              desc: <>
                <p className={styles.p}>Copy and paste this command into your terminal, then press Enter:</p>
                <p className={styles.p}><strong>Mac/Linux:</strong></p>
                <Cmd>{`curl -sL "https://files.manuscdn.com/user_upload_by_module/session_file/310519663326120815/fWRKXaZSkMJsFLJB.js" -o ~/arcadia-bridge.js`}</Cmd>
                <p className={styles.p}><strong>Windows (PowerShell):</strong></p>
                <Cmd>{`Invoke-WebRequest -Uri "https://files.manuscdn.com/user_upload_by_module/session_file/310519663326120815/fWRKXaZSkMJsFLJB.js" -OutFile "$env:USERPROFILE\\arcadia-bridge.js"`}</Cmd>
                <p className={styles.smallText}>This downloads a small file (~84KB) to your home folder. You only need to do this once.</p>
              </>,
            },
            {
              title: 'Start the bridge',
              desc: <>
                <p className={styles.p}>Copy and paste this command, then press Enter:</p>
                <p className={styles.p}><strong>Mac/Linux:</strong></p>
                <Cmd>node ~/arcadia-bridge.js</Cmd>
                <p className={styles.p}><strong>Windows (PowerShell):</strong></p>
                <Cmd>{`node "$env:USERPROFILE\\arcadia-bridge.js"`}</Cmd>
                <p className={styles.smallText}>You should see a message like "ArcadIA Bridge running on port 8087". Keep this terminal window open.</p>
              </>,
            },
          ]} />
          <Warning>
            <strong>Prerequisite:</strong> Node.js must be installed on your computer. If you see "command not found: node" or "'node' is not recognized", <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer" style={{ color: '#818cf8' }}>download Node.js here</a> and try again.
          </Warning>

          <SectionHeading id="bridge-remote" level={3}>Remote Setup (Another Machine)</SectionHeading>
          <p className={styles.p}>
            If the bridge is running on a different machine (e.g., an OnDemand devserver), choose "Another Computer" and follow these steps:
          </p>
          <StepList steps={[
            {
              title: 'Download & start the bridge on the remote machine',
              desc: <>
                <p className={styles.p}>SSH into the remote machine and run the same download + start commands as the local setup (see above). Make sure the bridge is running and accessible.</p>
              </>,
            },
            {
              title: 'Enter the bridge URL',
              desc: <>
                <p className={styles.p}>Back in ArcadIA, enter the URL of the remote bridge. The format is:</p>
                <Cmd>http://your-remote-host:8087</Cmd>
                <p className={styles.smallText}>ArcadIA will auto-test the connection when you type. A green checkmark means it's connected.</p>
              </>,
            },
          ]} />
          <Tip>For OnDemand devservers at Meta, the bridge URL is typically <code>http://your-devserver-name:8087</code>. Meta employees on work computers can auto-connect without VPN.</Tip>

          <SectionHeading id="bridge-update" level={3}>Updating the Bridge</SectionHeading>
          <p className={styles.p}>
            If ArcadIA detects that your bridge is outdated or doesn't support Second Brain features, you will see a warning banner at the top of the dashboard. The easiest way to update is to re-run the setup script:
          </p>
          <p className={styles.p}>
            <strong>Mac / Linux:</strong>
          </p>
          <Cmd>curl -sL https://raw.githubusercontent.com/ikosoymeta/Arcadia/main/bridge/setup.sh | bash</Cmd>
          <p className={styles.p}>
            <strong>Windows (PowerShell):</strong>
          </p>
          <Cmd>irm https://raw.githubusercontent.com/ikosoymeta/Arcadia/main/bridge/setup.ps1 | iex</Cmd>
          <p className={styles.p}>
            The setup script automatically stops the old bridge, downloads the latest version, starts it, and re-configures auto-start. Alternatively, you can update manually:
          </p>
          <StepList steps={[
            {
              title: 'Stop the bridge',
              desc: <>Go to the Terminal/PowerShell window where the bridge is running and press <strong>Ctrl+C</strong> to stop it.</>,
            },
            {
              title: 'Download the update',
              desc: <>Run the same download command from the setup steps above. This overwrites the old file with the latest version.</>,
            },
            {
              title: 'Restart the bridge',
              desc: <>Run the same start command. The bridge will now support all Second Brain features.</>,
            },
          ]} />

          <SectionHeading id="sb-detection">Automated Detection & Install</SectionHeading>
          <p className={styles.p}>
            Once the bridge is connected, Second Brain automatically scans your computer for required components:
          </p>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Component</th>
                <th className={styles.th}>What It Checks</th>
                <th className={styles.th}>Auto-Install?</th>
              </tr>
            </thead>
            <tbody>
              <TableRow cells={[<strong>Claude Code CLI</strong>, 'Whether the Claude Code command-line tool is installed', 'No — must be installed manually']} />
              <TableRow cells={[<strong>Google Drive Workspace</strong>, 'Whether Google Drive is mounted and PARA folders exist', 'Yes — creates workspace folders automatically']} />
              <TableRow cells={[<strong>CLAUDE.md Configuration</strong>, 'Whether CLAUDE.md exists with slash command definitions', 'Yes — creates and configures automatically']} />
              <TableRow cells={[<strong>Skills & Plugins</strong>, 'Whether required skills are installed in the workspace', 'Yes — installs missing skills automatically']} />
            </tbody>
          </table>
          <p className={styles.p}>
            The dashboard shows a status overview with green checkmarks for ready components and red warnings for missing ones. Click <strong>"Run Full Setup"</strong> to automatically install and configure all missing components.
          </p>

          <SectionHeading id="slash-commands">Slash Commands</SectionHeading>
          <p className={styles.p}>
            Slash commands are pre-built actions that run through the bridge. Type <code>/</code> in the Second Brain chat to see the autocomplete menu, or click any command card to execute it immediately.
          </p>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Command</th>
                <th className={styles.th}>Description</th>
              </tr>
            </thead>
            <tbody>
              <TableRow cells={[<code>/daily-brief</code>, 'Morning briefing from your priorities and calendar. Get a summary of what needs your attention today.']} />
              <TableRow cells={[<code>/eod</code>, 'End-of-day wrap-up: processes meeting notes, captures decisions, and previews tomorrow.']} />
              <TableRow cells={[<code>/eow</code>, 'Weekly wrap-up and PSC capture. Reviews the week, highlights wins, and sets next week priorities.']} />
              <TableRow cells={[<code>/prepare-meeting</code>, 'Research a person or topic and generate a meeting agenda with talking points.']} />
              <TableRow cells={[<code>/add-context</code>, 'Paste any URL or text and it routes to the right project in your workspace.']} />
              <TableRow cells={[<code>/deep-research</code>, 'In-depth research on a topic with source citations and structured findings.']} />
              <TableRow cells={[<code>/sync-context</code>, 'Sync your own Google Drive files and Workplace posts into your PARA workspace.']} />
              <TableRow cells={[<code>/sync-context-all</code>, 'Sync everything: your Drive files, your Workplace posts, AND co-worker posts from tracked groups.']} />
            </tbody>
          </table>
          <p className={styles.p}>
            Each command card has a <strong>▶ Run</strong> button to execute it and a <strong>⏰</strong> button to schedule it for automatic execution.
          </p>

          <SectionHeading id="custom-skills-sb">Custom Skills as Slash Commands</SectionHeading>
          <p className={styles.p}>
            Any custom skill you create in the Skills panel automatically appears as a slash command in Second Brain. Custom skills show with a green <code>custom</code> badge and are prefixed with <code>/skill-</code>. They execute through the Claude API (not the bridge) and use your configured API connection.
          </p>

          <SectionHeading id="session-hook">Session Startup Hook</SectionHeading>
          <p className={styles.p}>
            The Session Startup Hook configures your CLAUDE.md file to automatically load your Second Brain project context at the start of every Claude Code session. This gives Claude immediate awareness of your projects, priorities, and recent activity.
          </p>
          <ul className={styles.ul}>
            <li><strong>Enable</strong> — click the "Enable Hook" button. This adds a startup directive to your CLAUDE.md.</li>
            <li><strong>Disable</strong> — click "Disable Hook" to remove the startup directive.</li>
            <li><strong>Performance impact</strong> — adds approximately 1–2 seconds to each session start.</li>
          </ul>
          <Tip>The session hook is a one-time configuration. Once enabled, it works automatically for all future Claude Code sessions.</Tip>

          <SectionHeading id="writing-style">Writing Style Guide</SectionHeading>
          <p className={styles.p}>
            The Writing Style Guide feature analyzes your writing samples and creates a personalized style guide that Second Brain uses to match your tone in all future output.
          </p>
          <StepList steps={[
            {
              title: 'Click "Create Style Guide"',
              desc: 'Opens the input area where you can paste your writing samples.',
            },
            {
              title: 'Paste 3–5 writing samples',
              desc: 'Include examples from emails, docs, Workplace posts, or any writing that represents your style. Minimum 50 characters required.',
            },
            {
              title: 'Click "Analyze My Style"',
              desc: 'Claude analyzes your writing and generates a comprehensive style guide covering tone, sentence structure, vocabulary, formatting preferences, and more. This may take 2–3 minutes.',
            },
            {
              title: 'Save to Workspace',
              desc: 'Click "Save to Workspace" to save the guide as STYLE_GUIDE.md in your Google Drive workspace. Second Brain will reference this in future outputs.',
            },
          ]} />

          <SectionHeading id="addons">Add-ons</SectionHeading>
          <p className={styles.p}>
            Second Brain supports optional add-ons that extend its capabilities. Each add-on can be installed automatically via the bridge or set up manually.
          </p>

          <SectionHeading id="addon-gclaude" level={3}>GClaude</SectionHeading>
          <p className={styles.p}>
            GClaude lets you chat with your Second Brain via Google Chat. Send messages to the "gclaude" bot in Google Chat and it will respond using your Second Brain context.
          </p>
          <ul className={styles.ul}>
            <li><strong>Auto-install:</strong> Click "Install Automatically" to install the GClaude skill via the bridge. A terminal-style log panel shows real-time progress.</li>
            <li><strong>Manual setup:</strong> Visit <a href="https://chat.google.com" target="_blank" rel="noopener noreferrer" style={{ color: '#818cf8' }}>Google Chat</a> and search for the gclaude bot.</li>
          </ul>

          <SectionHeading id="addon-wispr" level={3}>Wispr Flow / SuperWhisper</SectionHeading>
          <p className={styles.p}>
            Voice-to-text that's 3x faster than typing. Speak naturally and it transcribes into any app, including ArcadIA.
          </p>
          <ul className={styles.ul}>
            <li><strong>Auto-install:</strong> Click "Install Automatically" to install via the bridge.</li>
            <li><strong>Manual setup:</strong> Visit <a href="https://www.wispr.com/" target="_blank" rel="noopener noreferrer" style={{ color: '#818cf8' }}>wispr.com</a> to download.</li>
          </ul>

          <SectionHeading id="addon-obsidian" level={3}>Obsidian</SectionHeading>
          <p className={styles.p}>
            Local knowledge management app that syncs with your Second Brain for offline access. Great for browsing your PARA workspace without an internet connection.
          </p>
          <ul className={styles.ul}>
            <li><strong>Auto-install:</strong> Click "Install Automatically" to install via the bridge.</li>
            <li><strong>Manual setup:</strong> Visit <a href="https://obsidian.md/" target="_blank" rel="noopener noreferrer" style={{ color: '#818cf8' }}>obsidian.md</a> to download.</li>
          </ul>
          <Tip>During add-on installation, a terminal-style log panel shows real-time progress with color-coded lines (green for success, red for errors, gray for info). Some harmless warnings may appear during installation — these are automatically filtered out.</Tip>

          <SectionHeading id="scheduling">Scheduled Automations</SectionHeading>
          <p className={styles.p}>
            You can schedule any slash command or custom skill to run automatically at specific times. Schedules are managed from the "Scheduled Automations" section on the Second Brain dashboard.
          </p>

          <InfoBox title="Quick Start: Morning Routine Bundle">
            <p className={styles.p}>Click the "Morning Routine Bundle" button to set up 3 automations in one click:</p>
            <ul className={styles.ul}>
              <li>☀️ <strong>Daily Brief</strong> — Weekdays at 9:00 AM</li>
              <li>🌙 <strong>End of Day</strong> — Weekdays at 5:00 PM → saves to session_log.md</li>
              <li>📦 <strong>Weekly Review</strong> — Fridays at 4:00 PM → saves to pulse.md</li>
            </ul>
          </InfoBox>

          <p className={styles.p}>
            For each scheduled automation, you can configure:
          </p>
          <ul className={styles.ul}>
            <li><strong>Frequency</strong> — daily, weekdays only, weekly, or custom days</li>
            <li><strong>Time</strong> — the time of day to run</li>
            <li><strong>Vault output</strong> — optionally save the output to a file in your workspace</li>
            <li><strong>Notifications</strong> — get a toast notification when the automation runs</li>
            <li><strong>Pause/Resume</strong> — click the status badge on any scheduled item to toggle it</li>
          </ul>
          <p className={styles.p}>
            The <strong>Recent Runs</strong> section shows a timeline of past executions with status dots, timestamps, duration, and vault paths.
          </p>

          <SectionHeading id="sb-preview">Preview Panel & Chat</SectionHeading>
          <p className={styles.p}>
            The right side of the Second Brain dashboard is the <strong>Preview panel</strong>. This is where slash command outputs appear and where you can have a conversation with your Second Brain.
          </p>
          <ul className={styles.ul}>
            <li><strong>Slash commands</strong> route through the bridge (uses your Claude Code connection).</li>
            <li><strong>Natural language messages</strong> route through the Claude API (uses your configured API key).</li>
            <li><strong>Autocomplete</strong> — type <code>/</code> to see all available commands. The menu filters as you type.</li>
            <li><strong>Follow-up questions</strong> — after a command runs, you can ask follow-up questions about the results.</li>
          </ul>

          <SectionHeading id="sb-downloads">Downloading Outputs</SectionHeading>
          <p className={styles.p}>
            After a slash command produces output, you can download it in multiple formats using the download menu:
          </p>
          <ul className={styles.ul}>
            <li><strong>Markdown</strong> (.md) — preserves formatting</li>
            <li><strong>HTML</strong> (.html) — if the output contains HTML content or artifacts</li>
            <li><strong>Word</strong> (.docx) — for sharing in Microsoft Word</li>
            <li><strong>PDF</strong> (.pdf) — for printing or formal sharing</li>
            <li><strong>Plain Text</strong> (.txt) — simple text fallback</li>
          </ul>

          {/* ════════════════════════════════════════════════════════════════════ */}
          {/* SKILLS */}
          {/* ════════════════════════════════════════════════════════════════════ */}

          <SectionHeading id="skills" level={1}>Skills</SectionHeading>

          <SectionHeading id="skills-overview">Overview</SectionHeading>
          <p className={styles.p}>
            Skills are reusable prompt templates that you can create, organize, and share. They appear in the Skills panel and are also available as slash commands in Second Brain. ArcadIA comes with several pre-built sample skills:
          </p>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Skill</th>
                <th className={styles.th}>Category</th>
                <th className={styles.th}>Description</th>
              </tr>
            </thead>
            <tbody>
              <TableRow cells={[<strong>Meeting Notes Cleanup</strong>, 'Productivity', 'Turn messy meeting notes into a clean summary with action items']} />
              <TableRow cells={[<strong>Professional Email Writer</strong>, 'Communication', 'Draft a polished professional email from bullet points']} />
              <TableRow cells={[<strong>Data Explainer</strong>, 'Data', 'Explain data or numbers in plain English']} />
              <TableRow cells={[<strong>Research Summary</strong>, 'Research', 'Summarize a topic with pros, cons, and recommendations']} />
            </tbody>
          </table>

          <SectionHeading id="skills-create">Creating Custom Skills</SectionHeading>
          <p className={styles.p}>
            To create a custom skill:
          </p>
          <StepList steps={[
            { title: 'Go to the Skills panel', desc: 'Click the ⚡ Skills icon in the sidebar.' },
            { title: 'Click "Create Skill"', desc: 'Opens the skill editor form.' },
            { title: 'Fill in the details', desc: <>
              <ul className={styles.ul}>
                <li><strong>Name</strong> — a descriptive name for your skill</li>
                <li><strong>Description</strong> — what the skill does (shown in the skill card)</li>
                <li><strong>Category</strong> — Writing, Code, Research, Data, Communication, Productivity, Creative, or Custom</li>
                <li><strong>Prompt</strong> — the full prompt template. Use placeholders like [YOUR TEXT HERE] for user input.</li>
                <li><strong>Icon</strong> — choose an emoji icon from the picker</li>
              </ul>
            </> },
            { title: 'Save', desc: 'Your skill is now available in the Skills panel and as a slash command in Second Brain.' },
          ]} />

          <SectionHeading id="skills-schedule">Scheduling Skills</SectionHeading>
          <p className={styles.p}>
            Any skill (built-in or custom) can be scheduled for automatic execution. Click the ⏰ button on any skill card or slash command to open the scheduling dialog. Configure the frequency, time, and output options, then save.
          </p>

          {/* ════════════════════════════════════════════════════════════════════ */}
          {/* CODE WORKSPACE */}
          {/* ════════════════════════════════════════════════════════════════════ */}

          <SectionHeading id="code-workspace" level={1}>Code Workspace</SectionHeading>
          <p className={styles.p}>
            The Code Workspace provides a file editor for reviewing and editing code. Access it by clicking the ⌨ Code icon in the sidebar. It supports syntax highlighting, file navigation, and integration with Claude for code review and generation.
          </p>

          {/* ════════════════════════════════════════════════════════════════════ */}
          {/* SETTINGS */}
          {/* ════════════════════════════════════════════════════════════════════ */}

          <SectionHeading id="settings" level={1}>Settings</SectionHeading>

          <SectionHeading id="settings-connections">API Connections</SectionHeading>
          <p className={styles.p}>
            Settings is where you configure your API connections to Claude. You can add multiple connections and switch between them.
          </p>
          <p className={styles.p}>
            To add a new connection:
          </p>
          <StepList steps={[
            { title: 'Click "Add Connection"', desc: 'Opens the connection form.' },
            {
              title: 'Choose connection type',
              desc: <>
                <ul className={styles.ul}>
                  <li><strong>API Key</strong> — use your Anthropic API key directly. Enter your key, choose a model, and configure parameters.</li>
                  <li><strong>Proxy</strong> — connect through a proxy server (e.g., corporate proxy). Enter the proxy base URL.</li>
                </ul>
              </>,
            },
            {
              title: 'Configure parameters',
              desc: <>
                <ul className={styles.ul}>
                  <li><strong>Model</strong> — select from available Claude models</li>
                  <li><strong>Max Tokens</strong> — maximum response length (default: 8096)</li>
                  <li><strong>Temperature</strong> — creativity level, 0.0 to 1.0 (default: 0.7)</li>
                  <li><strong>Extended Thinking</strong> — enable for complex reasoning tasks (with configurable thinking budget)</li>
                  <li><strong>Effort Level</strong> — max, high, medium, or low</li>
                  <li><strong>Prompt Caching</strong> — enable to cache system prompts for faster responses</li>
                </ul>
              </>,
            },
            { title: 'Test & Save', desc: 'Click "Test Connection" to verify, then save.' },
          ]} />

          <SectionHeading id="settings-bridge">Remote Bridge Configuration</SectionHeading>
          <p className={styles.p}>
            The Settings panel also includes a <strong>Remote Bridge</strong> section where you can configure a remote bridge URL. This is the same as the "Another Computer" option in Second Brain setup, but accessible from Settings for convenience.
          </p>
          <p className={styles.p}>
            Enter the bridge URL (e.g., <code>http://devserver:8087</code>) and ArcadIA will auto-test the connection. When connected, the bridge status shows the version, platform, and latency.
          </p>

          <SectionHeading id="settings-models">Available Models</SectionHeading>
          <p className={styles.p}>
            See the <a href="#model-selection" style={{ color: '#818cf8' }}>Model Selection</a> section above for a full list of supported models and their capabilities.
          </p>

          {/* ════════════════════════════════════════════════════════════════════ */}
          {/* OTHER PANELS */}
          {/* ════════════════════════════════════════════════════════════════════ */}

          <SectionHeading id="other-panels" level={1}>Other Panels</SectionHeading>

          <SectionHeading id="panel-team">Team</SectionHeading>
          <p className={styles.p}>
            The Team panel provides collaboration features for working with colleagues. Access it via the 👥 icon in the sidebar.
          </p>

          <SectionHeading id="panel-integrations">Integrations</SectionHeading>
          <p className={styles.p}>
            The Integrations panel lets you connect ArcadIA to external services and tools. Access it via the 🔌 icon in the sidebar.
          </p>

          <SectionHeading id="panel-analytics">Analytics</SectionHeading>
          <p className={styles.p}>
            The Analytics panel shows usage metrics and statistics for your ArcadIA instance. Track message counts, model usage, response times, and more. Access it via the 📈 icon in the sidebar.
          </p>

          <SectionHeading id="panel-benchmarks">Benchmarks</SectionHeading>
          <p className={styles.p}>
            The Benchmarks panel lets you compare Claude model performance on various tasks. Run benchmarks to see how different models handle speed, accuracy, and quality. Access it via the 📊 icon in the sidebar.
          </p>

          <SectionHeading id="panel-help">Help</SectionHeading>
          <p className={styles.p}>
            The Help panel provides quick-reference documentation and support links. Access it via the ? icon in the sidebar.
          </p>

          {/* ════════════════════════════════════════════════════════════════════ */}
          {/* TROUBLESHOOTING */}
          {/* ════════════════════════════════════════════════════════════════════ */}

          <SectionHeading id="troubleshooting" level={1}>Troubleshooting</SectionHeading>

          <SectionHeading id="ts-bridge">Bridge Connection Issues</SectionHeading>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Problem</th>
                <th className={styles.th}>Solution</th>
              </tr>
            </thead>
            <tbody>
              <TableRow cells={[
                'Bridge not connecting',
                <>
                  <ol className={styles.ol}>
                    <li>Make sure the bridge is running (you should see "ArcadIA Bridge running on port 8087" in your terminal).</li>
                    <li>Check that Node.js is installed: run <code>node --version</code> in your terminal.</li>
                    <li>Try restarting the bridge: press Ctrl+C to stop, then run the start command again.</li>
                  </ol>
                </>
              ]} />
              <TableRow cells={[
                '"Bridge Update Required" banner',
                <>Your bridge version is too old. Follow the 3-step update process: stop the bridge (Ctrl+C), download the latest version, restart it. See the <a href="#bridge-update" style={{ color: '#818cf8' }}>Updating the Bridge</a> section.</>
              ]} />
              <TableRow cells={[
                'Remote bridge not reachable',
                <>Make sure the remote machine is accessible from your network. Check that the bridge is running on the remote machine and the port (8087) is not blocked by a firewall.</>
              ]} />
            </tbody>
          </table>

          <SectionHeading id="ts-model">Model Errors</SectionHeading>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Problem</th>
                <th className={styles.th}>Solution</th>
              </tr>
            </thead>
            <tbody>
              <TableRow cells={[
                '"Model Not Available" error in Second Brain',
                <>
                  <p className={styles.p}>Your Claude Code bridge has a model configured that isn't accessible. Two options:</p>
                  <p className={styles.p}><strong>Option 1:</strong> Change the bridge model:</p>
                  <Cmd>claude config set model claude-sonnet-4-6</Cmd>
                  <p className={styles.p}>Then restart your bridge.</p>
                  <p className={styles.p}><strong>Option 2:</strong> Use a direct API key in ArcadIA Settings. This bypasses the bridge for slash commands.</p>
                </>
              ]} />
              <TableRow cells={[
                'Slow responses',
                <>Try switching to a faster model like Claude Haiku 4.5. You can change the model in Settings or from the chat home screen.</>
              ]} />
            </tbody>
          </table>

          <SectionHeading id="ts-secondbrain">Second Brain Setup Failures</SectionHeading>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Problem</th>
                <th className={styles.th}>Solution</th>
              </tr>
            </thead>
            <tbody>
              <TableRow cells={[
                'Setup steps show errors',
                <>If multiple steps fail with "Bridge update required", your bridge doesn't support Second Brain routes. Update your bridge to the latest version (see <a href="#bridge-update" style={{ color: '#818cf8' }}>Updating the Bridge</a>).</>
              ]} />
              <TableRow cells={[
                'Claude Code not detected',
                <>Install Claude Code CLI from the official source. After installation, restart the bridge and re-run detection.</>
              ]} />
              <TableRow cells={[
                'Google Drive workspace not found',
                <>Make sure Google Drive is installed and syncing on your computer. The bridge needs access to your Google Drive folder to create the PARA workspace.</>
              ]} />
              <TableRow cells={[
                'Add-on installation shows warnings',
                <>Some harmless warnings (like "unsettled top-level await" or "ExperimentalWarning") may appear during installation. These are automatically filtered and do not indicate a problem. If the install log shows a green checkmark at the end, the installation was successful.</>
              ]} />
            </tbody>
          </table>

          <SectionHeading id="ts-general">General Tips</SectionHeading>
          <ul className={styles.ul}>
            <li><strong>Refresh the page</strong> if the UI becomes unresponsive. Your conversations and settings are saved locally.</li>
            <li><strong>Check the browser console</strong> (F12 → Console) for detailed error messages if something isn't working.</li>
            <li><strong>Clear local storage</strong> as a last resort: open the browser console and run <code>localStorage.clear()</code>. This resets all settings and conversations.</li>
            <li><strong>Multiple connections</strong> — if one API connection isn't working, try adding another one in Settings as a backup.</li>
          </ul>

          {/* Footer */}
          <div className={styles.footer}>
            <p>ArcadIA Editor — User Manual</p>
            <p>For additional help, visit the Help panel in the sidebar or contact support.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
