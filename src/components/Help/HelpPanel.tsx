import React, { useState } from 'react';

const SECTIONS = [
  {
    title: 'Getting Started',
    content: [
      { q: 'How do I start?', a: 'Click "+ New Chat" in the sidebar or use one of the quick action buttons on the welcome screen. Type your message and press Enter to send.' },
      { q: 'How do I connect to Claude?', a: 'ArcadIA connects automatically when you open it. It detects your Meta corporate infrastructure (LDAR proxy) and configures Claude access silently. A green dot in the sidebar confirms your connection is active. If you see a "Connecting..." message, make sure you are on the Meta network or VPN.' },
      { q: 'What models are available?', a: 'Claude Opus 4 (most capable), Claude Sonnet 4 (balanced), and Claude 3.5 Haiku (fastest). The default model is selected automatically. You can change it in Settings if needed.' },
    ],
  },
  {
    title: 'Conversations',
    content: [
      { q: 'How are conversations saved?', a: 'Every conversation is auto-saved with an auto-generated title based on your first message. All data is stored in your browser.' },
      { q: 'How do I rename a conversation?', a: 'Right-click any conversation in the sidebar and select "Rename", or double-click the title.' },
      { q: 'How do I organize conversations?', a: 'Create folders using the "+" button next to "Folders" in the sidebar. Drag conversations into folders to organize them.' },
      { q: 'How do I pin a conversation?', a: 'Right-click a conversation and select "Pin / Unpin". Pinned conversations appear at the top of the sidebar.' },
      { q: 'How do I share a conversation?', a: 'Right-click a conversation, choose "Share (copy URL)" to get a unique link. Set visibility to "Team" or "Public" to control who can access it.' },
      { q: 'What are checkpoints?', a: 'Checkpoints save a snapshot of your conversation at a specific point. Use the checkpoint button in the chat header to create one. You can restore to any checkpoint to review history or branch from that point.' },
    ],
  },
  {
    title: 'Cowork Mode',
    content: [
      { q: 'What is Cowork mode?', a: 'Cowork is an enhanced mode for complex, multi-step tasks. Instead of simple Q&A, Claude plans an approach, shows progress through each step, and delivers complete outputs. Toggle between Chat and Cowork using the mode switch in the chat header.' },
      { q: 'How is Cowork different from Chat?', a: 'Chat mode is for quick questions and conversations. Cowork mode is for tasks like "Build a landing page" or "Create an API with documentation" — Claude breaks the work into steps, tracks progress, and produces production-ready output.' },
      { q: 'What is the activity bar?', a: 'When a Cowork task is running, an activity bar appears below the chat header showing each step, its status (pending, in progress, completed), and overall progress.' },
      { q: 'Can I course-correct during a task?', a: 'Yes. You can send follow-up messages while Claude is working to redirect, provide additional context, or ask it to adjust its approach.' },
      { q: 'What are global instructions?', a: 'Click the gear icon next to the message input to set instructions that apply to all conversations. For example: "Always use TypeScript" or "Respond in bullet points". These instructions persist across sessions.' },
      { q: 'What are folder instructions?', a: 'Each folder can have its own instructions. Click the gear icon on a folder to set context like "This project uses Python 3.12 and Django". These instructions are automatically included when chatting in that folder.' },
    ],
  },
  {
    title: 'Preview Panel',
    content: [
      { q: 'What is the Preview panel?', a: 'The right panel shows real-time previews of code, HTML, and markdown that Claude generates. Click any code block in the chat to view it in the preview panel.' },
      { q: 'Can I preview HTML?', a: 'Yes. When Claude generates HTML with CSS, it renders in a sandboxed iframe. You can also click "Open" to view it in a new tab.' },
      { q: 'How do I copy code?', a: 'Click the "Copy" button in the top-right corner of any code preview.' },
    ],
  },
  {
    title: 'Code Workspace',
    content: [
      { q: 'What is the Code Workspace?', a: 'A VS Code-inspired environment with a file explorer, code editor with line numbers, integrated terminal, debug panel, and AI assistant dock.' },
      { q: 'How do I use the terminal?', a: 'Click "Terminal" in the toolbar. Type commands and press Enter. Supports: ls, pwd, cat, help, npm run dev, git status, npm test, and clear.' },
      { q: 'What is the Debug panel?', a: 'Shows variables, watch expressions, breakpoints, call stack, and performance metrics. Click "Debug" in the toolbar to toggle it.' },
      { q: 'What is the AI Assistant dock?', a: 'A floating panel for quick AI queries about your code. Click "AI Assist" in the toolbar. Ask about code explanations, refactoring, or test generation.' },
    ],
  },
  {
    title: 'Skills Library',
    content: [
      { q: 'What are Skills?', a: 'Reusable prompt templates you can create from successful conversation patterns. They save time by letting you quickly apply proven prompts to new tasks.' },
      { q: 'How do I create a skill?', a: 'Go to Skills (lightning icon), click "+ Create Skill", fill in the name, description, prompt template, and tags. Use [PLACEHOLDERS] for variable parts.' },
      { q: 'How do I use a skill?', a: 'Click a skill card to view its details, then click "Copy Prompt" to copy the template to your clipboard. Paste it into a new chat and fill in the placeholders.' },
    ],
  },
  {
    title: 'Team Pods',
    content: [
      { q: 'What are Team Pods?', a: 'Groups of humans and AI agents that collaborate together. Pod members can share conversations, skills, and work in the same conversation space.' },
      { q: 'How do I create a pod?', a: 'Go to Team (people icon), click "+ Create Pod", name it, and add members. You can add both human users and AI agents.' },
      { q: 'How does access control work?', a: 'Content visibility is controlled per-conversation: Private (only you), Team (your pod members), Public (anyone with the link). Pod admins manage membership.' },
      { q: 'What about authentication?', a: 'ArcadIA supports Meta SSO for enterprise deployments. Members are authenticated through your organization\'s identity provider.' },
    ],
  },
  {
    title: 'Benchmarks',
    content: [
      { q: 'What do benchmarks measure?', a: 'Time to First Token (TTFT), total response time, tokens per second, render time, and Web Vitals (LCP, FID, CLS, TTFB).' },
      { q: 'How do I run benchmarks?', a: 'Go to Benchmarks (chart icon), ensure you have an active connection, and click "Run Benchmark Suite". Results show performance metrics and flag issues.' },
      { q: 'What do the statuses mean?', a: 'Pass = good performance. Slow = below threshold (TTFT > 3s or < 15 tokens/sec). Fail = request error.' },
    ],
  },
  {
    title: 'Keyboard Shortcuts',
    content: [
      { q: 'Chat shortcuts', a: 'Enter = Send message\nShift+Enter = New line\nEsc = Stop streaming' },
      { q: 'Code Workspace shortcuts', a: 'Cmd+P = Quick Open\nCmd+Shift+P = Command Palette\nCmd+B = Toggle Sidebar\nCmd+` = Toggle Terminal\nCmd+I = AI Assistant' },
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
    nav: { width: '220px', background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)', padding: '20px 0', overflow: 'auto' } as React.CSSProperties,
    navTitle: { padding: '0 16px 16px', fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' } as React.CSSProperties,
    navItem: (active: boolean) => ({ display: 'block', width: '100%', padding: '10px 16px', background: active ? 'var(--accent-dim)' : 'none', color: active ? 'var(--accent)' : 'var(--text-secondary)', border: 'none', cursor: 'pointer', fontSize: '13px', textAlign: 'left' as const, borderRadius: 0, transition: 'all 0.1s' }) as React.CSSProperties,
    main: { flex: 1, overflow: 'auto', padding: '24px 32px' } as React.CSSProperties,
    search: { width: '100%', padding: '12px 16px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--text-primary)', fontSize: '14px', outline: 'none', marginBottom: '24px', boxSizing: 'border-box' as const } as React.CSSProperties,
    sectionTitle: { fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '16px' } as React.CSSProperties,
    item: { marginBottom: '16px', padding: '16px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '10px' } as React.CSSProperties,
    question: { fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' } as React.CSSProperties,
    answer: { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-line' as const } as React.CSSProperties,
  };

  return (
    <div style={css.panel}>
      <div style={css.nav}>
        <div style={css.navTitle}>User Manual</div>
        {SECTIONS.map((section, i) => (
          <button key={i} style={css.navItem(i === activeSection)} onClick={() => { setActiveSection(i); setSearchQuery(''); }}>
            {section.title}
          </button>
        ))}
      </div>
      <div style={css.main}>
        <input style={css.search} placeholder="Search the manual..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />

        {filteredSections.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '40px', fontSize: '13px' }}>
            No results found for "{searchQuery}"
          </div>
        ) : (
          (searchQuery ? filteredSections : [filteredSections[activeSection]]).map((section, i) => (
            <div key={i}>
              <div style={css.sectionTitle}>{section.title}</div>
              {section.content.map((item, j) => (
                <div key={j} style={css.item}>
                  <div style={css.question}>{item.q}</div>
                  <div style={css.answer}>{item.a}</div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
