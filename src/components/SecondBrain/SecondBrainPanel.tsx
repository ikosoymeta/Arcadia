import { useState, useEffect, useCallback, useRef } from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────

interface DetectionResult {
  claudeCode: { installed: boolean; version: string | null; path: string | null };
  googleDrive: { installed: boolean; workspacePath: string | null };
  secondBrain: { initialized: boolean; claudeMdExists: boolean };
  claudeTemplates: { installed: boolean };
  skills: { installed: string[] };
  obsidian: { installed: boolean };
  wisprFlow: { installed: boolean };
  platform: string;
  summary: {
    readyCount: number;
    totalRequired: number;
    fullyReady: boolean;
    components: { name: string; ready: boolean }[];
  };
}

interface SetupAction {
  id: string;
  label: string;
  description: string;
  status: 'pending' | 'running' | 'done' | 'error' | 'skipped';
  output?: string;
}

type Phase = 'detecting' | 'dashboard' | 'setup';

// ─── Slash Commands ─────────────────────────────────────────────────────────

const SLASH_COMMANDS = [
  {
    command: '/daily-brief',
    label: 'Daily Brief',
    icon: '☀️',
    description: 'Morning briefing from your priorities + calendar. Get a summary of what needs your attention today.',
    category: 'daily',
  },
  {
    command: '/eod',
    label: 'End of Day',
    icon: '🌙',
    description: 'End-of-day wrap-up: processes meeting notes, captures decisions, and previews tomorrow.',
    category: 'daily',
  },
  {
    command: '/eow',
    label: 'End of Week',
    icon: '📋',
    description: 'Weekly wrap-up and PSC capture. Reviews the week, highlights wins, and sets next week priorities.',
    category: 'weekly',
  },
  {
    command: '/prepare-meeting',
    label: 'Prepare Meeting',
    icon: '🤝',
    description: 'Research a person or topic and generate a meeting agenda with talking points.',
    category: 'meetings',
  },
  {
    command: '/add-context',
    label: 'Add Context',
    icon: '📎',
    description: 'Paste any URL or text and it routes to the right project in your workspace.',
    category: 'knowledge',
  },
  {
    command: '/deep-research',
    label: 'Deep Research',
    icon: '🔍',
    description: 'In-depth research on a topic with source citations and structured findings.',
    category: 'research',
  },
];

// ─── Add-ons ────────────────────────────────────────────────────────────────

const ADDONS = [
  {
    id: 'wispr-flow',
    name: 'Wispr Flow / SuperWhisper',
    icon: '🎙️',
    description: 'Voice-to-text that\'s 3x faster than typing. Speak naturally and it transcribes into any app.',
    setupUrl: 'https://www.wispr.com/',
    detectionKey: 'wisprFlow' as const,
  },
  {
    id: 'gclaude',
    name: 'GClaude',
    icon: '💬',
    description: 'Chat with your Second Brain via Google Chat. Send messages to the Bunny "gclaude" bot.',
    setupUrl: null,
    detectionKey: null,
  },
  {
    id: 'obsidian',
    name: 'Obsidian',
    icon: '📓',
    description: 'Local knowledge management app that syncs with your Second Brain for offline access.',
    setupUrl: 'https://obsidian.md/',
    detectionKey: 'obsidian' as const,
  },
];

// ─── Styles ─────────────────────────────────────────────────────────────────

const s = {
  container: {
    padding: '24px',
    maxWidth: '800px',
    margin: '0 auto',
    fontFamily: 'var(--font-sans, -apple-system, BlinkMacSystemFont, sans-serif)',
  } as React.CSSProperties,
  card: (color: string, active = false) => ({
    background: active ? `${color}08` : 'var(--bg-secondary)',
    border: `1px solid ${active ? color + '30' : 'var(--border)'}`,
    borderRadius: '12px',
    padding: '16px 20px',
    transition: 'all 0.2s ease',
  }) as React.CSSProperties,
  statusDot: (ready: boolean) => ({
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    background: ready ? '#22c55e' : '#f59e0b',
    display: 'inline-block',
    marginRight: '8px',
    boxShadow: ready ? '0 0 6px #22c55e60' : 'none',
  }) as React.CSSProperties,
  progressBar: (_pct: number, _color: string) => ({
    height: '6px',
    borderRadius: '3px',
    background: 'var(--bg-primary)',
    overflow: 'hidden' as const,
    position: 'relative' as const,
  }),
  progressFill: (pct: number, color: string) => ({
    height: '100%',
    width: `${pct}%`,
    background: `linear-gradient(90deg, ${color}, ${color}cc)`,
    borderRadius: '3px',
    transition: 'width 0.5s ease',
  }),
  commandCard: (_color: string) => ({
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: '10px',
    padding: '14px 16px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
  }) as React.CSSProperties,
  commandIcon: {
    fontSize: '24px',
    lineHeight: '1',
    flexShrink: 0,
    width: '36px',
    height: '36px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '8px',
    background: 'var(--bg-primary)',
  } as React.CSSProperties,
  badge: (bg: string, color: string) => ({
    fontSize: '11px',
    padding: '2px 8px',
    borderRadius: '20px',
    background: bg,
    color: color,
    fontWeight: 600,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
  }) as React.CSSProperties,
  btn: (color: string, variant: 'solid' | 'outline' = 'solid') => ({
    padding: '8px 16px',
    borderRadius: '8px',
    border: variant === 'outline' ? `1px solid ${color}50` : 'none',
    background: variant === 'solid' ? color : 'transparent',
    color: variant === 'solid' ? '#fff' : color,
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
  }) as React.CSSProperties,
  sectionTitle: {
    fontSize: '13px',
    fontWeight: 700,
    color: 'var(--text-tertiary)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    marginBottom: '12px',
    marginTop: '24px',
  } as React.CSSProperties,
};

// ─── Bridge API helpers ─────────────────────────────────────────────────────

const BRIDGE_URL = 'http://127.0.0.1:8087';

async function detectSecondBrain(): Promise<DetectionResult | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(`${BRIDGE_URL}/v1/secondbrain/detect`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function runSetupAction(action: string, command?: string): Promise<{ success: boolean; stdout?: string; stderr?: string; error?: string }> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 120000);
    const res = await fetch(`${BRIDGE_URL}/v1/secondbrain/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, command }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    return await res.json();
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export function SecondBrainPanel() {
  const [phase, setPhase] = useState<Phase>('detecting');
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [bridgeConnected, setBridgeConnected] = useState(false);
  const [setupActions, setSetupActions] = useState<SetupAction[]>([]);
  const [isRunningSetup, setIsRunningSetup] = useState(false);
  const [expandedCommand, setExpandedCommand] = useState<string | null>(null);
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);
  const detectRan = useRef(false);

  // ─── Detection ──────────────────────────────────────────────────────────

  const runDetection = useCallback(async () => {
    setPhase('detecting');

    // First check if bridge is running
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3000);
      const res = await fetch(`${BRIDGE_URL}/health`, { signal: ctrl.signal });
      clearTimeout(timer);
      setBridgeConnected(res.ok);
      if (!res.ok) {
        setPhase('dashboard');
        return;
      }
    } catch {
      setBridgeConnected(false);
      setPhase('dashboard');
      return;
    }

    // Run detection
    const result = await detectSecondBrain();
    setDetection(result);
    setPhase('dashboard');
  }, []);

  useEffect(() => {
    if (!detectRan.current) {
      detectRan.current = true;
      runDetection();
    }
  }, [runDetection]);

  // ─── Setup wizard ───────────────────────────────────────────────────────

  const startSetup = useCallback(async () => {
    if (!detection) return;
    setPhase('setup');
    setIsRunningSetup(true);

    const actions: SetupAction[] = [];

    if (!detection.claudeCode.installed) {
      actions.push({
        id: 'claude-code',
        label: 'Install Claude Code',
        description: 'Claude Code CLI is required. Please install it first from the setup guide.',
        status: 'pending',
      });
    }

    if (!detection.googleDrive.installed) {
      actions.push({
        id: 'google-drive',
        label: 'Set up Google Drive workspace',
        description: 'Create the claude/ folder in your Google Drive to store your Second Brain workspace.',
        status: 'pending',
      });
    }

    if (!detection.claudeTemplates.installed) {
      actions.push({
        id: 'claude-templates',
        label: 'Install claude-templates',
        description: 'Installing the claude-templates CLI tool for managing skills and plugins...',
        status: 'pending',
      });
    }

    if (detection.skills.installed.length === 0) {
      actions.push({
        id: 'install-skills',
        label: 'Install Second Brain skills',
        description: 'Installing tasks, deep-research, google-docs, calendar, and other skills...',
        status: 'pending',
      });
    }

    if (detection.skills.installed.length === 0) {
      actions.push({
        id: 'install-plugins',
        label: 'Install Second Brain plugins',
        description: 'Installing plugins for Google Docs, Sheets, Slides, Calendar, and more...',
        status: 'pending',
      });
    }

    if (!detection.secondBrain.claudeMdExists) {
      actions.push({
        id: 'init-workspace',
        label: 'Initialize Second Brain workspace',
        description: 'Creating CLAUDE.md with your slash commands and workspace configuration...',
        status: 'pending',
      });
    }

    setSetupActions(actions);

    // Run each action sequentially
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];

      // Skip manual steps
      if (action.id === 'claude-code' || action.id === 'google-drive') {
        setSetupActions(prev => prev.map((a, idx) => idx === i ? { ...a, status: 'pending' } : a));
        continue;
      }

      // Mark as running
      setSetupActions(prev => prev.map((a, idx) => idx === i ? { ...a, status: 'running' } : a));

      try {
        let result;
        if (action.id === 'claude-templates') {
          result = await runSetupAction('run-command', 'brew install claude-templates 2>/dev/null || npm install -g claude-templates');
        } else if (action.id === 'install-skills') {
          result = await runSetupAction('install-skills');
        } else if (action.id === 'install-plugins') {
          result = await runSetupAction('install-plugins');
        } else if (action.id === 'init-workspace') {
          result = await runSetupAction('run-command', 'claude --version');
        } else {
          result = { success: true };
        }

        setSetupActions(prev => prev.map((a, idx) =>
          idx === i ? { ...a, status: result.success ? 'done' : 'error', output: result.stdout || result.stderr || result.error } : a
        ));
      } catch (e: any) {
        setSetupActions(prev => prev.map((a, idx) =>
          idx === i ? { ...a, status: 'error', output: e.message } : a
        ));
      }
    }

    setIsRunningSetup(false);
    // Re-detect after setup
    setTimeout(() => runDetection(), 2000);
  }, [detection, runDetection]);

  // ─── Copy command ───────────────────────────────────────────────────────

  const copyCommand = useCallback((cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedCommand(cmd);
    setTimeout(() => setCopiedCommand(null), 2000);
  }, []);

  // ─── Render: Detecting ──────────────────────────────────────────────────

  if (phase === 'detecting') {
    return (
      <div style={s.container}>
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🧠</div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
            Detecting Second Brain...
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '24px' }}>
            Checking your local setup through the ArcadIA Bridge
          </p>
          <div style={{ width: '200px', margin: '0 auto' }}>
            <div style={s.progressBar(100, '#6366f1')}>
              <div style={{
                height: '100%',
                width: '60%',
                background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                borderRadius: '3px',
                animation: 'pulse 1.5s ease-in-out infinite',
              }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Render: No bridge ────────────────────────────────────────────────

  if (!bridgeConnected) {
    return (
      <div style={s.container}>
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            🧠 Second Brain
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            Your AI-powered personal knowledge system — powered by Claude Code and Google Drive.
          </p>
        </div>

        <div style={{
          padding: '20px 24px',
          borderRadius: '12px',
          background: '#ef444410',
          border: '1px solid #ef444430',
          marginBottom: '20px',
        }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#ef4444', marginBottom: '8px' }}>
            Bridge Not Connected
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6', margin: '0 0 12px' }}>
            Second Brain detection requires the ArcadIA Bridge to be running on your computer.
            The bridge scans your local machine for installed components.
          </p>
          <div style={{
            padding: '10px 14px',
            background: 'var(--bg-primary)',
            borderRadius: '8px',
            fontFamily: 'monospace',
            fontSize: '12px',
            color: 'var(--text-primary)',
          }}>
            cd ~/Arcadia && node bridge/arcadia-bridge.js
          </div>
          <button
            onClick={runDetection}
            style={{ ...s.btn('#6366f1'), marginTop: '12px' }}
          >
            🔄 Retry Detection
          </button>
        </div>

        {/* Still show what Second Brain is */}
        <div style={s.sectionTitle}>What is Second Brain?</div>
        <div style={{
          padding: '16px 20px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          fontSize: '13px',
          color: 'var(--text-secondary)',
          lineHeight: '1.7',
        }}>
          <p style={{ margin: '0 0 10px' }}>
            <strong style={{ color: 'var(--text-primary)' }}>Second Brain</strong> is your AI-powered personal knowledge system that runs locally on your computer. It uses Claude Code + Google Drive to:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {[
              '☀️ Give you a daily briefing from your priorities and calendar',
              '🌙 Wrap up your day — process meeting notes, preview tomorrow',
              '📋 Generate weekly summaries and PSC captures',
              '🤝 Research people and topics before meetings',
              '📎 Route any URL or text to the right project',
              '🔍 Run deep research with source citations',
            ].map((item, i) => (
              <div key={i} style={{ paddingLeft: '4px' }}>{item}</div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ─── Render: Setup wizard ─────────────────────────────────────────────

  if (phase === 'setup') {
    const doneCount = setupActions.filter(a => a.status === 'done' || a.status === 'skipped').length;
    const totalCount = setupActions.length;
    const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

    return (
      <div style={s.container}>
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            🧠 Setting Up Second Brain
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            {isRunningSetup ? 'Installing components... This may take a minute.' : `Setup complete — ${doneCount} of ${totalCount} steps done.`}
          </p>
        </div>

        {/* Progress bar */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Progress</span>
            <span style={{ fontSize: '12px', color: '#6366f1', fontWeight: 600 }}>{pct}%</span>
          </div>
          <div style={s.progressBar(pct, '#6366f1')}>
            <div style={s.progressFill(pct, '#6366f1')} />
          </div>
        </div>

        {/* Setup steps */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {setupActions.map((action) => (
            <div key={action.id} style={{
              ...s.card(
                action.status === 'done' ? '#22c55e' :
                action.status === 'error' ? '#ef4444' :
                action.status === 'running' ? '#6366f1' : '#64748b',
                action.status === 'running'
              ),
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '18px' }}>
                  {action.status === 'done' ? '✅' :
                   action.status === 'error' ? '❌' :
                   action.status === 'running' ? '⏳' :
                   action.status === 'skipped' ? '⏭️' : '○'}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '14px' }}>
                    {action.label}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    {action.description}
                  </div>
                </div>
                {action.status === 'running' && (
                  <div style={{
                    width: '16px', height: '16px', border: '2px solid #6366f140',
                    borderTopColor: '#6366f1', borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                  }} />
                )}
              </div>
              {action.output && action.status === 'error' && (
                <div style={{
                  marginTop: '8px', padding: '8px 10px', background: '#ef444410',
                  borderRadius: '6px', fontSize: '11px', fontFamily: 'monospace',
                  color: '#ef4444', maxHeight: '80px', overflow: 'auto',
                }}>
                  {action.output}
                </div>
              )}
              {/* Manual step instructions */}
              {action.id === 'claude-code' && action.status === 'pending' && (
                <div style={{
                  marginTop: '10px', padding: '12px 14px', background: 'var(--bg-primary)',
                  borderRadius: '8px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6',
                }}>
                  Visit <a href="https://secondbrain-setup.manus.space" target="_blank" rel="noopener noreferrer"
                    style={{ color: '#6366f1', textDecoration: 'underline' }}>secondbrain-setup.manus.space</a> and
                  follow the Claude Code installation section. Then come back and click "Re-detect" below.
                </div>
              )}
              {action.id === 'google-drive' && action.status === 'pending' && (
                <div style={{
                  marginTop: '10px', padding: '12px 14px', background: 'var(--bg-primary)',
                  borderRadius: '8px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6',
                }}>
                  Open Google Drive and create a folder called <code style={{ background: 'var(--bg-secondary)', padding: '1px 6px', borderRadius: '4px' }}>claude</code> in
                  My Drive. This will be your Second Brain workspace where all projects, notes, and context are stored.
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
          <button onClick={runDetection} style={s.btn('#6366f1')}>
            🔄 Re-detect
          </button>
          <button onClick={() => setPhase('dashboard')} style={s.btn('#64748b', 'outline')}>
            ← Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // ─── Render: Dashboard ────────────────────────────────────────────────

  const summary = detection?.summary;
  const isFullyReady = summary?.fullyReady ?? false;
  const readyPct = summary ? Math.round((summary.readyCount / summary.totalRequired) * 100) : 0;

  return (
    <div style={s.container}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          🧠 Second Brain
        </h2>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
          Your AI-powered personal knowledge system — powered by Claude Code and Google Drive.
        </p>
      </div>

      {/* Status overview */}
      <div style={{
        display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap',
      }}>
        <div style={{
          padding: '8px 14px', borderRadius: '8px', background: 'var(--bg-secondary)',
          border: `1px solid ${isFullyReady ? '#22c55e30' : '#f59e0b30'}`,
          fontSize: '12px', color: isFullyReady ? '#22c55e' : '#f59e0b',
          display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600,
        }}>
          <span style={{ fontSize: '14px' }}>{isFullyReady ? '●' : '○'}</span>
          {isFullyReady ? 'Fully Configured' : `${summary?.readyCount ?? 0} of ${summary?.totalRequired ?? 4} components ready`}
        </div>
        {detection?.skills.installed.length ? (
          <div style={{
            padding: '8px 14px', borderRadius: '8px', background: 'var(--bg-secondary)',
            border: '1px solid var(--border)', fontSize: '12px', color: 'var(--text-secondary)',
            display: 'flex', alignItems: 'center', gap: '6px',
          }}>
            ⚡ <strong>{detection.skills.installed.length}</strong> skills installed
          </div>
        ) : null}
        <button
          onClick={runDetection}
          style={{
            padding: '8px 14px', borderRadius: '8px', background: 'var(--bg-secondary)',
            border: '1px solid var(--border)', fontSize: '12px', color: 'var(--text-secondary)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
          }}
        >
          🔄 Re-scan
        </button>
      </div>

      {/* Component checklist */}
      <div style={s.card('#6366f1', false)}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-tertiary)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Setup Status
        </div>
        <div style={{ marginBottom: '12px' }}>
          <div style={s.progressBar(readyPct, '#6366f1')}>
            <div style={s.progressFill(readyPct, '#6366f1')} />
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* Claude Code */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
            <span style={s.statusDot(detection?.claudeCode.installed ?? false)} />
            <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>Claude Code</span>
            {detection?.claudeCode.version && (
              <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>
                {detection.claudeCode.version.split('\n')[0].slice(0, 40)}
              </span>
            )}
            {!detection?.claudeCode.installed && (
              <a href="https://secondbrain-setup.manus.space" target="_blank" rel="noopener noreferrer"
                style={{ fontSize: '11px', color: '#6366f1', marginLeft: 'auto' }}>Install →</a>
            )}
          </div>

          {/* Google Drive */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
            <span style={s.statusDot(detection?.googleDrive.installed ?? false)} />
            <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>Google Drive Workspace</span>
            {detection?.googleDrive.workspacePath && (
              <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '250px' }}>
                {detection.googleDrive.workspacePath}
              </span>
            )}
          </div>

          {/* Second Brain initialized */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
            <span style={s.statusDot(detection?.secondBrain.initialized ?? false)} />
            <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>CLAUDE.md Configuration</span>
            {detection?.secondBrain.claudeMdExists && (
              <span style={s.badge('#22c55e18', '#22c55e')}>Active</span>
            )}
          </div>

          {/* Skills & Plugins */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
            <span style={s.statusDot((detection?.skills.installed.length ?? 0) > 0)} />
            <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>Skills & Plugins</span>
            {(detection?.skills.installed.length ?? 0) > 0 && (
              <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                {detection!.skills.installed.slice(0, 5).join(', ')}{detection!.skills.installed.length > 5 ? ` +${detection!.skills.installed.length - 5} more` : ''}
              </span>
            )}
          </div>
        </div>

        {/* Setup button if not fully ready */}
        {!isFullyReady && (
          <button
            onClick={startSetup}
            style={{ ...s.btn('#6366f1'), marginTop: '14px', width: '100%', justifyContent: 'center' }}
          >
            ⚡ Complete Setup — Install Missing Components
          </button>
        )}
      </div>

      {/* ─── Slash Commands ──────────────────────────────────────────────── */}
      <div style={s.sectionTitle}>Slash Commands</div>
      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px', marginTop: '-6px', lineHeight: '1.5' }}>
        {isFullyReady
          ? 'Your Second Brain is ready. Use these commands in Claude Code or click to copy.'
          : 'These commands will be available once setup is complete. Click to copy the command.'}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '10px' }}>
        {SLASH_COMMANDS.map(cmd => (
          <div
            key={cmd.command}
            style={{
              ...s.commandCard('#6366f1'),
              opacity: isFullyReady ? 1 : 0.6,
            }}
            onClick={() => setExpandedCommand(expandedCommand === cmd.command ? null : cmd.command)}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.borderColor = '#6366f150';
              (e.currentTarget as HTMLElement).style.background = 'var(--bg-primary)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
              (e.currentTarget as HTMLElement).style.background = 'var(--bg-secondary)';
            }}
          >
            <div style={s.commandIcon}>{cmd.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <code style={{
                  fontSize: '13px', fontWeight: 700, color: '#6366f1',
                  background: '#6366f115', padding: '2px 8px', borderRadius: '4px',
                }}>
                  {cmd.command}
                </code>
                <button
                  onClick={(e) => { e.stopPropagation(); copyCommand(cmd.command); }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: '12px', color: copiedCommand === cmd.command ? '#22c55e' : 'var(--text-tertiary)',
                    padding: '2px 4px',
                  }}
                  title="Copy command"
                >
                  {copiedCommand === cmd.command ? '✓ Copied' : '📋'}
                </button>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                {cmd.description}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ─── Writing Style Guide ─────────────────────────────────────────── */}
      <div style={s.sectionTitle}>Writing Style Guide</div>
      <div style={{
        ...s.card('#8b5cf6', false),
        display: 'flex', alignItems: 'flex-start', gap: '14px',
      }}>
        <div style={{ fontSize: '28px' }}>✍️</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '14px', marginBottom: '4px' }}>
            Personalize Your Writing Style
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '10px' }}>
            Feed Claude 3-5 examples of your writing (emails, docs, posts) and ask it to generate a style guide.
            Save the guide to your workspace and Claude will match your voice in all future writing.
          </div>
          <div style={{
            padding: '8px 12px', background: 'var(--bg-primary)', borderRadius: '6px',
            fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-primary)', lineHeight: '1.5',
          }}>
            Prompt: "Here are 5 examples of my writing. Analyze my style — tone, sentence length, vocabulary, structure — and create a style guide I can save."
          </div>
        </div>
      </div>

      {/* ─── Add-ons ─────────────────────────────────────────────────────── */}
      <div style={s.sectionTitle}>Optional Add-ons</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {ADDONS.map(addon => {
          const detected = addon.detectionKey ? detection?.[addon.detectionKey] : null;
          const isInstalled = typeof detected === 'object' && detected !== null
            ? (detected as any).installed
            : typeof detected === 'boolean' ? detected : false;

          return (
            <div key={addon.id} style={s.card(isInstalled ? '#22c55e' : '#64748b', isInstalled)}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <div style={{ fontSize: '24px' }}>{addon.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '14px' }}>
                      {addon.name}
                    </span>
                    {isInstalled ? (
                      <span style={s.badge('#22c55e18', '#22c55e')}>✓ Detected</span>
                    ) : (
                      <span style={s.badge('#64748b18', '#64748b')}>Not installed</span>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                    {addon.description}
                  </div>
                  {!isInstalled && addon.setupUrl && (
                    <a
                      href={addon.setupUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: '12px', color: '#6366f1', marginTop: '6px', display: 'inline-block' }}
                    >
                      Install → {addon.setupUrl}
                    </a>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ─── Quick Reference ─────────────────────────────────────────────── */}
      <div style={s.sectionTitle}>Quick Reference</div>
      <div style={{
        padding: '16px 20px', background: 'var(--bg-secondary)',
        border: '1px solid var(--border)', borderRadius: '12px',
        fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.7',
      }}>
        <div style={{ marginBottom: '8px' }}>
          <strong style={{ color: 'var(--text-primary)' }}>How Second Brain works:</strong>
        </div>
        <div style={{ marginBottom: '6px' }}>
          <strong>1. Workspace</strong> — Your Google Drive <code style={{ background: 'var(--bg-primary)', padding: '1px 4px', borderRadius: '3px' }}>claude/</code> folder stores all projects, notes, and context.
        </div>
        <div style={{ marginBottom: '6px' }}>
          <strong>2. CLAUDE.md</strong> — Your configuration file defines slash commands, preferences, and workflows.
        </div>
        <div style={{ marginBottom: '6px' }}>
          <strong>3. Skills</strong> — Modular capabilities (calendar, docs, research) that Claude can use.
        </div>
        <div>
          <strong>4. Plugins</strong> — Extensions that connect Claude to external services (Google Docs, Sheets, etc).
        </div>
      </div>

      {/* CSS for animations */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>
    </div>
  );
}
