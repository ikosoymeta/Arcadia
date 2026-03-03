import React, { useState } from 'react';

const SUPPORT_EMAIL = 'ikosoy@meta.com';
const SUPPORT_SUBJECT = 'ArcadIA Editor Support';
const SUPPORT_HREF = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(SUPPORT_SUBJECT)}`;

const SECTIONS = [
  {
    icon: '🚀',
    title: 'Getting Started',
    content: [
      { q: 'How do I connect to Claude?', a: 'ArcadIA connects automatically when the bridge is running on your laptop. On first use, you\'ll see a one-time setup screen — just copy the command, paste it in Terminal, and press Enter. After that, ArcadIA auto-connects every time you open it.' },
      { q: 'What is the ArcadIA Bridge?', a: 'The bridge is a small background service that runs on your Mac. It connects ArcadIA (in your browser) to Claude Code (on your laptop). Claude Code handles all Meta authentication — no API keys needed. The bridge auto-starts on login, so you only set it up once.' },
      { q: 'How do I start using ArcadIA?', a: 'Once connected (green dot in sidebar), click "+ New Chat" or use one of the quick action buttons. Type your message and press Enter. Claude will respond in real-time.' },
      { q: 'What models are available?', a: 'Claude Opus 4 (most capable, best for complex tasks), Claude Sonnet 4 (balanced speed and quality), and Claude Haiku 3.5 (fastest, best for quick questions). The default is Sonnet 4. Change it in Settings.' },
    ],
  },
  {
    icon: '✨',
    title: 'Simple Mode',
    content: [
      { q: 'What is Simple mode?', a: 'Simple mode is designed for everyone — no technical knowledge needed. Just describe what you want in plain language, and Claude will help you. Think of it like chatting with a very smart assistant.' },
      { q: 'What are the quick action buttons?', a: 'The welcome screen shows 6 common tasks: Build a website, Write an email, Explain a concept, Debug code, Analyze data, and Write content. Click any of them to start with a pre-written prompt.' },
      { q: 'What are follow-up suggestions?', a: 'After Claude responds, you\'ll see suggestion buttons below the message (like "Add dark mode" or "Write tests"). Click them to continue the conversation without typing.' },
      { q: 'Can I attach images?', a: 'Yes! Drag and drop images into the chat, or click the paperclip icon. Claude can analyze images, screenshots, diagrams, and more.' },
    ],
  },
  {
    icon: '⌨️',
    title: 'Engineer Mode',
    content: [
      { q: 'What is Engineer mode?', a: 'Engineer mode adds developer tools: a terminal emulator, debug console with raw API logs, token metrics (TTFT, tokens/sec), a tool call inspector, and the Validation Pipeline. Switch to it using the toggle at the top of the screen.' },
      { q: 'What does the API Logs tab show?', a: 'Every request and response to/from Claude, with timestamps, raw JSON, token counts, and timing metrics. Useful for debugging prompts and understanding Claude\'s behavior.' },
      { q: 'What does the Terminal tab do?', a: 'An interactive terminal emulator with command history. Useful for running commands, checking output, and debugging.' },
      { q: 'What are token metrics?', a: 'TTFT (Time to First Token): how fast Claude starts responding. Tokens/sec: generation speed. Input/output tokens: how much context you\'re using vs. how much Claude generates.' },
    ],
  },
  {
    icon: '✅',
    title: 'Validation Pipeline',
    content: [
      { q: 'What is the Validation Pipeline?', a: 'The Validation Pipeline is an autonomous code quality system inspired by the GSD Auto-Worker pattern. It automatically runs your validation commands (lint, typecheck, tests, build) and — when errors are found — sends them to Claude for automatic fixing. This creates a generate → validate → fix loop that dramatically reduces manual debugging.' },
      { q: 'How do I access it?', a: 'Switch to Engineer Mode (toggle at the top), then click the "✅ Validate" tab. You\'ll see the pipeline visualization, controls, and configuration.' },
      { q: 'How do I set up validation commands?', a: 'Click "⚙ Configure" to open the configuration panel. You\'ll see default commands (yarn lint, yarn typecheck, etc.). You can:\n\n• Toggle commands on/off with the checkbox\n• Remove commands with the ✕ button\n• Add custom commands with the "+ Add" form\n• Set your project directory (where commands will run)\n\nYour configuration is saved automatically in your browser.' },
      { q: 'What commands should I add?', a: 'Common validation commands for Meta projects:\n\n• yarn lint — Check for code style issues\n• yarn typecheck — Verify TypeScript types\n• yarn test --watchAll=false — Run unit tests\n• yarn build — Verify the project builds\n• arc lint — Run Meta\'s Arc linter\n\nYou can add any shell command that returns exit code 0 on success.' },
      { q: 'What is Auto-Fix?', a: 'When enabled, the pipeline automatically sends validation errors to Claude Code for correction. Claude reads the error output, understands the issue, and applies fixes to your codebase. The pipeline then re-validates to check if the fix worked. This repeats up to your configured max retries (default: 3).\n\nThis is the same pattern used by the GSD Auto-Worker pipeline that achieved 100% manual coding reduction on internal tasks.' },
      { q: 'What does the pipeline visualization show?', a: 'The pipeline has 4 stages shown at the top:\n\n• Generate — Claude generates or modifies code\n• Validate — Your configured commands run\n• Auto-Fix — Claude attempts to fix any errors\n• Done — All checks pass (or max retries reached)\n\nEach stage shows its status: pending (gray), active (purple/spinning), complete (green), or failed (red).' },
      { q: 'What is the Pipeline Activity log?', a: 'The activity log shows real-time updates during the validation and auto-fix process. It tells you what\'s happening at each step: which errors were found, when Claude is attempting a fix, and whether the re-validation passed.' },
      { q: 'What is Validation History?', a: 'Every validation run is recorded with its results. Click any run to see detailed output for each command — including error messages, exit codes, and duration. Failed runs show a red border, passed runs show green.' },
      { q: 'Do I need the bridge running?', a: 'Yes. The Validation Pipeline requires bridge v2.1.0 or later. The panel will show a warning if the bridge is not detected or is too old. Start the bridge with:\n\ncd ~/Arcadia && node bridge/arcadia-bridge.js\n\nThe bridge runs validation commands on your local machine where your code lives.' },
      { q: 'Can I use this with any project?', a: 'Yes! Set the "Project Directory" in the configuration to point to any project on your machine. The validation commands will run in that directory. This works with any tech stack — React, Python, Go, etc. — as long as you configure the right commands.' },
    ],
  },
  {
    icon: '💬',
    title: 'Conversations',
    content: [
      { q: 'How are conversations saved?', a: 'Every conversation is auto-saved in your browser. Titles are generated automatically from your first message.' },
      { q: 'How do I organize conversations?', a: 'Create folders using the "+" button next to "Folders" in the sidebar. Right-click any conversation to move it to a folder, pin it, rename it, or delete it.' },
      { q: 'How do I pin a conversation?', a: 'Hover over a conversation in the sidebar and click the star icon, or right-click and select "Pin". Pinned conversations stay at the top.' },
      { q: 'How do I share a conversation?', a: 'Right-click a conversation and choose "Share". You can set visibility (Private, Team, Public), copy a share link, or export as Markdown or JSON.' },
      { q: 'How do I search conversations?', a: 'Use the search bar at the top of the sidebar. It searches across all conversation titles.' },
    ],
  },
  {
    icon: '🔌',
    title: 'Integrations',
    content: [
      { q: 'What integrations are available?', a: 'GitHub (repos, issues, PRs, code search), Google Drive (files, docs), Web Search & Fetch, Code Execution, and Long-term Memory. Enable them in the Integrations panel.' },
      { q: 'How do integrations work?', a: 'When you enable an integration, Claude gains the ability to use those tools during your conversation. For example, with GitHub enabled, Claude can search your repos, read files, and create issues.' },
      { q: 'Do I need to configure anything?', a: 'Some integrations (like GitHub) may need OAuth authentication the first time. The app will guide you through it. Most integrations work out of the box.' },
    ],
  },
  {
    icon: '🖥️',
    title: 'Layout & Panels',
    content: [
      { q: 'How do I resize panels?', a: 'Drag the borders between the sidebar, main content, and preview panels. The borders glow purple when you hover over them. Your preferred widths are saved automatically.' },
      { q: 'How do I collapse/restore panels?', a: 'Click the arrow button on the sidebar or preview panel to collapse it. When collapsed, a tab appears on the edge of the screen — click it to restore the panel.' },
      { q: 'What is the Preview panel?', a: 'The right panel shows real-time previews of code and HTML that Claude generates. HTML renders in a live sandbox. Click "Copy" to grab the code.' },
    ],
  },
  {
    icon: '⚡',
    title: 'Skills & Templates',
    content: [
      { q: 'What are Skills?', a: 'Reusable prompt templates you create from successful conversations. They save time by letting you quickly apply proven prompts to new tasks.' },
      { q: 'How do I create a skill?', a: 'Go to Skills (lightning icon), click "+ Create Skill", fill in the name, description, and prompt template. Use [PLACEHOLDERS] for variable parts.' },
      { q: 'How do I use a skill?', a: 'Click a skill card, then "Copy Prompt". Paste it into a new chat and fill in the placeholders.' },
    ],
  },
  {
    icon: '🔧',
    title: 'Connection Troubleshooting',
    content: [
      { q: 'I see "Unable to connect"', a: 'This means the ArcadIA Bridge is not running. Open Terminal and run:\n\nnode ~/.arcadia-bridge/arcadia-bridge.js\n\nIf you haven\'t set it up yet, run the one-time setup command shown on the welcome screen.' },
      { q: 'The bridge is running but ArcadIA won\'t connect', a: 'Check that nothing else is using port 8087:\n\nlsof -i :8087\n\nIf another process is using it, kill it and restart the bridge.' },
      { q: 'Claude Code is not installed', a: 'Install Claude Code on your Meta laptop. See: https://fburl.com/claude.code.users\n\nAfter installing, verify with: claude --version' },
      { q: 'The bridge stopped working after a restart', a: 'The bridge should auto-start on login. If it didn\'t, run:\n\nlaunchctl load ~/Library/LaunchAgents/com.arcadia.bridge.plist\n\nOr re-run the setup command to reinstall.' },
      { q: 'How do I check connection diagnostics?', a: 'On the welcome screen, click "Connection diagnostics" to see the bridge status, endpoint, and last check time. You can also run a manual check from there.' },
      { q: 'Still having issues?', a: `Contact support: ${SUPPORT_EMAIL}\nSubject: ArcadIA Editor Support\n\nInclude:\n• Your Mac model and macOS version\n• Output of: claude --version\n• Output of: lsof -i :8087\n• Any error messages you see` },
    ],
  },
  {
    icon: '⌨️',
    title: 'Keyboard Shortcuts',
    content: [
      { q: 'Chat shortcuts', a: 'Enter = Send message\nShift+Enter = New line\nEsc = Stop streaming' },
      { q: 'Navigation', a: 'Click sidebar items to switch between Chat, Code, Skills, Team, Settings, Integrations, and Help.' },
    ],
  },
];

export function HelpPanel() {
  const [activeSection, setActiveSection] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredSections = searchQuery
    ? SECTIONS.map(s => ({
        ...s,
        content: s.content.filter(
          item => item.q.toLowerCase().includes(searchQuery.toLowerCase()) || item.a.toLowerCase().includes(searchQuery.toLowerCase())
        ),
      })).filter(s => s.content.length > 0)
    : SECTIONS;

  const css = {
    panel: { display: 'flex', height: '100vh', overflow: 'hidden' } as React.CSSProperties,
    nav: { width: '240px', background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)', padding: '20px 0', overflow: 'auto', flexShrink: 0 } as React.CSSProperties,
    navHeader: { padding: '0 16px 8px', display: 'flex', flexDirection: 'column' as const, gap: '12px' } as React.CSSProperties,
    navTitle: { fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' } as React.CSSProperties,
    navSubtitle: { fontSize: '12px', color: 'var(--text-tertiary)', lineHeight: 1.4 } as React.CSSProperties,
    navItem: (active: boolean) => ({
      display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '10px 16px',
      background: active ? 'var(--accent-dim)' : 'none', color: active ? 'var(--accent)' : 'var(--text-secondary)',
      border: 'none', cursor: 'pointer', fontSize: '13px', textAlign: 'left' as const, borderRadius: 0, transition: 'all 0.1s',
      fontWeight: active ? 600 : 400,
    }) as React.CSSProperties,
    navIcon: { fontSize: '14px', width: '20px', textAlign: 'center' as const } as React.CSSProperties,
    main: { flex: 1, overflow: 'auto', padding: '24px 32px' } as React.CSSProperties,
    search: {
      width: '100%', padding: '12px 16px', background: 'var(--bg-secondary)', border: '1px solid var(--border)',
      borderRadius: '10px', color: 'var(--text-primary)', fontSize: '14px', outline: 'none', marginBottom: '24px', boxSizing: 'border-box' as const,
    } as React.CSSProperties,
    sectionTitle: { fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' } as React.CSSProperties,
    item: { marginBottom: '16px', padding: '16px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '10px' } as React.CSSProperties,
    question: { fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' } as React.CSSProperties,
    answer: { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-line' as const } as React.CSSProperties,
    code: { background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace', fontSize: '12px', color: 'var(--accent)' } as React.CSSProperties,
    supportBar: {
      padding: '16px', borderTop: '1px solid var(--border)', background: 'var(--bg-tertiary)',
      textAlign: 'center' as const, fontSize: '12px', color: 'var(--text-tertiary)',
    } as React.CSSProperties,
    supportLink: { color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 } as React.CSSProperties,
  };

  return (
    <div style={css.panel}>
      <div style={css.nav}>
        <div style={css.navHeader}>
          <div style={css.navTitle}>📖 User Manual</div>
          <div style={css.navSubtitle}>Everything you need to know about ArcadIA Editor</div>
        </div>
        <div style={{ height: '12px' }} />
        {SECTIONS.map((section, i) => (
          <button key={i} style={css.navItem(i === activeSection)} onClick={() => { setActiveSection(i); setSearchQuery(''); }}>
            <span style={css.navIcon}>{section.icon}</span>
            {section.title}
          </button>
        ))}
        <div style={css.supportBar}>
          Need help?{' '}
          <a href={SUPPORT_HREF} style={css.supportLink}>Contact Support</a>
          <div style={{ marginTop: '4px', fontSize: '11px' }}>{SUPPORT_EMAIL}</div>
        </div>
      </div>
      <div style={css.main}>
        <input
          style={css.search}
          placeholder="Search the manual..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />

        {filteredSections.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '40px' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔍</div>
            <div style={{ fontSize: '14px' }}>No results found for "{searchQuery}"</div>
            <div style={{ fontSize: '12px', marginTop: '8px' }}>
              Can't find what you need?{' '}
              <a href={SUPPORT_HREF} style={css.supportLink}>Contact support</a>
            </div>
          </div>
        ) : (
          (searchQuery ? filteredSections : [filteredSections[activeSection]]).map((section, i) => (
            <div key={i}>
              <div style={css.sectionTitle}>
                <span>{section.icon}</span>
                {section.title}
              </div>
              {section.content.map((item, j) => (
                <div key={j} style={css.item}>
                  <div style={css.question}>{item.q}</div>
                  <div style={css.answer}>{item.a}</div>
                </div>
              ))}
            </div>
          ))
        )}

        {/* Bottom support banner */}
        <div style={{
          marginTop: '32px', padding: '20px', background: 'var(--bg-secondary)',
          border: '1px solid var(--border)', borderRadius: '12px', textAlign: 'center',
        }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
            Still need help?
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
            Reach out to the ArcadIA team for support, feature requests, or bug reports.
          </div>
          <a
            href={SUPPORT_HREF}
            style={{
              display: 'inline-block', background: 'var(--accent)', color: 'white',
              padding: '10px 24px', borderRadius: '8px', textDecoration: 'none',
              fontSize: '13px', fontWeight: 600,
            }}
          >
            📧 Email Support
          </a>
        </div>
      </div>
    </div>
  );
}
