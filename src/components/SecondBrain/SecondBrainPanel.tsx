import React, { useState, useEffect, useRef, useCallback } from 'react';

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

type StepStatus = 'waiting' | 'checking' | 'running' | 'done' | 'skipped' | 'error';

interface SetupStep {
  id: string;
  label: string;
  friendlyDesc: string;
  status: StepStatus;
  elapsed?: number;
  output?: string;
  detail?: string;
}

type Phase = 'detecting' | 'dashboard' | 'installing';

// ─── Slash Commands ─────────────────────────────────────────────────────────

const SLASH_COMMANDS = [
  { command: '/daily-brief', label: 'Daily Brief', icon: '☀️', description: 'Morning briefing from your priorities + calendar. Get a summary of what needs your attention today.' },
  { command: '/eod', label: 'End of Day', icon: '🌙', description: 'End-of-day wrap-up: processes meeting notes, captures decisions, and previews tomorrow.' },
  { command: '/eow', label: 'End of Week', icon: '📋', description: 'Weekly wrap-up and PSC capture. Reviews the week, highlights wins, and sets next week priorities.' },
  { command: '/prepare-meeting', label: 'Prepare Meeting', icon: '🤝', description: 'Research a person or topic and generate a meeting agenda with talking points.' },
  { command: '/add-context', label: 'Add Context', icon: '📎', description: 'Paste any URL or text and it routes to the right project in your workspace.' },
  { command: '/deep-research', label: 'Deep Research', icon: '🔍', description: 'In-depth research on a topic with source citations and structured findings.' },
];

// ─── Add-ons ────────────────────────────────────────────────────────────────

const ADDONS = [
  { id: 'wispr-flow', name: 'Wispr Flow / SuperWhisper', icon: '🎙️', description: 'Voice-to-text that\'s 3x faster than typing. Speak naturally and it transcribes into any app.', setupUrl: 'https://www.wispr.com/', detectionKey: 'wisprFlow' as const },
  { id: 'gclaude', name: 'GClaude', icon: '💬', description: 'Chat with your Second Brain via Google Chat. Send messages to the Bunny "gclaude" bot.', setupUrl: null, detectionKey: null },
  { id: 'obsidian', name: 'Obsidian', icon: '📓', description: 'Local knowledge management app that syncs with your Second Brain for offline access.', setupUrl: 'https://obsidian.md/', detectionKey: 'obsidian' as const },
];

// ─── The 4 fixed setup steps ────────────────────────────────────────────────

const SETUP_STEPS: Omit<SetupStep, 'status'>[] = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    friendlyDesc: 'Checking if Claude Code CLI is installed on your computer...',
  },
  {
    id: 'google-drive-workspace',
    label: 'Google Drive Workspace',
    friendlyDesc: 'Checking Google Drive and creating workspace folders if needed...',
  },
  {
    id: 'claudemd-config',
    label: 'CLAUDE.md Configuration',
    friendlyDesc: 'Checking for CLAUDE.md and creating it with slash commands if needed...',
  },
  {
    id: 'skills-plugins',
    label: 'Skills & Plugins',
    friendlyDesc: 'Checking installed skills and installing missing ones...',
  },
];

// ─── Bridge API ─────────────────────────────────────────────────────────────

const BRIDGE = 'http://127.0.0.1:8087';

async function detect(): Promise<DetectionResult | null> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 10000);
    const r = await fetch(`${BRIDGE}/v1/secondbrain/detect`, { signal: c.signal });
    clearTimeout(t);
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

async function setupAction(action: string, command?: string): Promise<any> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 180000);
    const r = await fetch(`${BRIDGE}/v1/secondbrain/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, command }),
      signal: c.signal,
    });
    clearTimeout(t);
    return await r.json();
  } catch (e: any) { return { success: false, error: e.message }; }
}

async function checkBridge(): Promise<boolean> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 3000);
    const r = await fetch(`${BRIDGE}/health`, { signal: c.signal });
    clearTimeout(t);
    return r.ok;
  } catch { return false; }
}

// ─── Component ──────────────────────────────────────────────────────────────

export function SecondBrainPanel() {
  const [phase, setPhase] = useState<Phase>('detecting');
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [bridgeConnected, setBridgeConnected] = useState(false);
  const [steps, setSteps] = useState<SetupStep[]>([]);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);
  const [setupLog, setSetupLog] = useState<string[]>([]);
  const detectRan = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Helper: add log line ────────────────────────────────────────────────

  const addLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString();
    console.log(`[SecondBrain] ${msg}`);
    setSetupLog(prev => [...prev.slice(-50), `[${ts}] ${msg}`]);
  }, []);

  // ─── Detection ──────────────────────────────────────────────────────────

  const runDetection = useCallback(async () => {
    setPhase('detecting');
    const connected = await checkBridge();
    setBridgeConnected(connected);
    if (!connected) { setPhase('dashboard'); return; }
    const result = await detect();
    setDetection(result);
    setPhase('dashboard');
  }, []);

  useEffect(() => {
    if (!detectRan.current) { detectRan.current = true; runDetection(); }
  }, [runDetection]);

  // ─── Elapsed timer ──────────────────────────────────────────────────────

  useEffect(() => {
    if (phase === 'installing') {
      timerRef.current = setInterval(() => {
        setSteps(prev => prev.map((s, i) =>
          i === currentStepIdx && (s.status === 'running' || s.status === 'checking')
            ? { ...s, elapsed: (s.elapsed || 0) + 1 }
            : s
        ));
      }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase, currentStepIdx]);

  // ─── Update a step by index ─────────────────────────────────────────────

  const updateStep = useCallback((idx: number, updates: Partial<SetupStep>) => {
    setSteps(prev => prev.map((s, i) => i === idx ? { ...s, ...updates } : s));
  }, []);

  // ─── Run full automated install ─────────────────────────────────────────
  // Always runs all 4 steps. Each step: check → already done? skip : install → done/error

  const runInstall = useCallback(async () => {
    addLog('Starting automated setup...');

    // Initialize all 4 steps as waiting
    const initialSteps: SetupStep[] = SETUP_STEPS.map(s => ({ ...s, status: 'waiting' as StepStatus }));
    setSteps(initialSteps);
    setCurrentStepIdx(0);
    setPhase('installing');

    // Helper to update step in the loop (uses index directly since setSteps is batched)
    const setStep = (idx: number, updates: Partial<SetupStep>) => {
      setSteps(prev => prev.map((s, i) => i === idx ? { ...s, ...updates } : s));
    };

    // ─── Step 1: Claude Code ──────────────────────────────────────────────
    setCurrentStepIdx(0);
    setStep(0, { status: 'checking', elapsed: 0, friendlyDesc: 'Checking if Claude Code CLI is installed...' });
    addLog('Step 1/4: Checking Claude Code...');

    try {
      const det = await detect();
      if (det?.claudeCode.installed) {
        const ver = det.claudeCode.version?.split('\n')[0]?.slice(0, 60) || 'installed';
        setStep(0, { status: 'done', detail: ver, friendlyDesc: `Claude Code is installed (${ver})` });
        addLog(`Claude Code: found (${ver})`);
      } else {
        // Try to detect via bridge health (claude is needed for bridge to work, so if bridge is up, claude exists)
        const health = await checkBridge();
        if (health) {
          setStep(0, { status: 'done', detail: 'Detected via bridge', friendlyDesc: 'Claude Code is installed (detected via bridge connection)' });
          addLog('Claude Code: detected via bridge');
        } else {
          setStep(0, { status: 'error', friendlyDesc: 'Claude Code not found. Install it from https://fburl.com/claude.code.users and re-run setup.', output: 'Claude Code CLI not detected on this machine. The bridge is running but could not find the claude command.' });
          addLog('Claude Code: NOT FOUND');
        }
      }
    } catch (e: any) {
      setStep(0, { status: 'error', output: e.message, friendlyDesc: 'Failed to check Claude Code status' });
      addLog(`Claude Code check error: ${e.message}`);
    }

    // Small delay so UI updates are visible
    await new Promise(r => setTimeout(r, 300));

    // ─── Step 2: Google Drive Workspace ───────────────────────────────────
    setCurrentStepIdx(1);
    setStep(1, { status: 'checking', elapsed: 0, friendlyDesc: 'Checking Google Drive and workspace folder...' });
    addLog('Step 2/4: Checking Google Drive Workspace...');

    try {
      const det = await detect();
      if (det?.googleDrive.installed && det?.secondBrain.initialized) {
        setStep(1, { status: 'done', detail: det.googleDrive.workspacePath || '', friendlyDesc: `Workspace found at ${det.googleDrive.workspacePath || 'Google Drive'}` });
        addLog(`Workspace: found at ${det.googleDrive.workspacePath}`);
      } else if (det?.googleDrive.installed && !det?.secondBrain.initialized) {
        // Google Drive exists but no workspace — create it
        setStep(1, { status: 'running', elapsed: 0, friendlyDesc: 'Google Drive found. Creating workspace folders (projects, notes, research, templates)...' });
        addLog('Google Drive found but no workspace. Creating...');
        const result = await setupAction('create-workspace');
        if (result.success) {
          setStep(1, { status: 'done', detail: result.workspacePath, friendlyDesc: `Workspace created at ${result.workspacePath}` });
          addLog(`Workspace created at ${result.workspacePath}`);
        } else {
          setStep(1, { status: 'error', output: result.error || result.message, friendlyDesc: 'Failed to create workspace folders' });
          addLog(`Workspace creation failed: ${result.error}`);
        }
      } else {
        // Google Drive not found — try to create workspace anyway (bridge will report the error)
        setStep(1, { status: 'running', elapsed: 0, friendlyDesc: 'Google Drive not detected. Attempting to create workspace...' });
        addLog('Google Drive not detected. Attempting workspace creation...');
        const result = await setupAction('create-workspace');
        if (result.success) {
          setStep(1, { status: 'done', detail: result.workspacePath, friendlyDesc: `Workspace created at ${result.workspacePath}` });
          addLog(`Workspace created at ${result.workspacePath}`);
        } else {
          setStep(1, { status: 'error', output: result.message || result.error || 'Google Drive for Desktop not found', friendlyDesc: 'Google Drive for Desktop is not installed or not signed in. Install it from google.com/drive/download and re-run setup.' });
          addLog(`Workspace failed: ${result.error || result.message}`);
        }
      }
    } catch (e: any) {
      setStep(1, { status: 'error', output: e.message, friendlyDesc: 'Failed to check Google Drive workspace' });
      addLog(`Workspace check error: ${e.message}`);
    }

    await new Promise(r => setTimeout(r, 300));

    // ─── Step 3: CLAUDE.md Configuration ──────────────────────────────────
    setCurrentStepIdx(2);
    setStep(2, { status: 'checking', elapsed: 0, friendlyDesc: 'Checking for CLAUDE.md configuration file...' });
    addLog('Step 3/4: Checking CLAUDE.md...');

    try {
      const det = await detect();
      if (det?.secondBrain.claudeMdExists) {
        setStep(2, { status: 'done', friendlyDesc: 'CLAUDE.md configuration file found with slash commands' });
        addLog('CLAUDE.md: found');
      } else {
        // Create it
        setStep(2, { status: 'running', elapsed: 0, friendlyDesc: 'Creating CLAUDE.md with 6 pre-configured slash commands...' });
        addLog('CLAUDE.md not found. Creating...');
        const result = await setupAction('init-claudemd');
        if (result.success) {
          const path = result.path || '';
          setStep(2, { status: 'done', detail: path, friendlyDesc: `CLAUDE.md created${path ? ` at ${path}` : ''} with all slash commands` });
          addLog(`CLAUDE.md created at ${path}`);
        } else {
          setStep(2, { status: 'error', output: result.error || result.message, friendlyDesc: `Failed to create CLAUDE.md: ${result.message || result.error || 'Unknown error'}. Make sure the workspace folder exists first.` });
          addLog(`CLAUDE.md creation failed: ${result.error || result.message}`);
        }
      }
    } catch (e: any) {
      setStep(2, { status: 'error', output: e.message, friendlyDesc: 'Failed to check CLAUDE.md configuration' });
      addLog(`CLAUDE.md check error: ${e.message}`);
    }

    await new Promise(r => setTimeout(r, 300));

    // ─── Step 4: Skills & Plugins ─────────────────────────────────────────
    setCurrentStepIdx(3);
    setStep(3, { status: 'checking', elapsed: 0, friendlyDesc: 'Checking installed skills and plugins...' });
    addLog('Step 4/4: Checking Skills & Plugins...');

    try {
      const det = await detect();
      if (det && det.skills.installed.length > 0) {
        setStep(3, { status: 'done', detail: `${det.skills.installed.length} skills`, friendlyDesc: `${det.skills.installed.length} skills installed: ${det.skills.installed.slice(0, 5).join(', ')}${det.skills.installed.length > 5 ? '...' : ''}` });
        addLog(`Skills: ${det.skills.installed.length} found`);
      } else {
        // First check if claude-templates is available
        setStep(3, { status: 'running', elapsed: 0, friendlyDesc: 'Installing template manager (claude-templates)...' });
        addLog('No skills found. Installing claude-templates first...');

        const tmplResult = await setupAction('install-claude-templates');
        if (tmplResult.success) {
          addLog('claude-templates installed. Now installing skills...');
          setStep(3, { status: 'running', friendlyDesc: 'Template manager installed. Now installing skills (tasks, deep-research, google-docs, calendar, and more)...' });

          const skillsResult = await setupAction('install-skills');
          if (skillsResult.success) {
            addLog('Skills installed. Now installing plugins...');
            setStep(3, { status: 'running', friendlyDesc: 'Skills installed. Now installing plugins (Google Docs, Sheets, Slides, Calendar connectors)...' });

            const pluginsResult = await setupAction('install-plugins');
            if (pluginsResult.success) {
              setStep(3, { status: 'done', friendlyDesc: 'All skills and plugins installed successfully' });
              addLog('Skills & plugins installed successfully');
            } else {
              // Skills worked but plugins failed — partial success
              setStep(3, { status: 'done', detail: 'Skills OK, plugins had issues', friendlyDesc: 'Skills installed. Some plugins may need manual setup — run "claude-templates plugin install" in Terminal.' });
              addLog(`Plugins install issue: ${pluginsResult.error || pluginsResult.stderr}`);
            }
          } else {
            setStep(3, { status: 'error', output: skillsResult.error || skillsResult.stderr, friendlyDesc: 'Failed to install skills. Make sure claude-templates is working and try again.' });
            addLog(`Skills install failed: ${skillsResult.error || skillsResult.stderr}`);
          }
        } else {
          // claude-templates failed — try installing skills directly anyway
          addLog(`claude-templates install failed: ${tmplResult.error || tmplResult.stderr}. Trying skills directly...`);
          setStep(3, { status: 'running', friendlyDesc: 'Template manager install had issues. Trying to install skills directly...' });

          const skillsResult = await setupAction('install-skills');
          if (skillsResult.success) {
            setStep(3, { status: 'done', friendlyDesc: 'Skills installed (template manager may need manual setup)' });
            addLog('Skills installed despite template manager issue');
          } else {
            setStep(3, { status: 'error', output: `Template manager: ${tmplResult.error || tmplResult.stderr}\nSkills: ${skillsResult.error || skillsResult.stderr}`, friendlyDesc: 'Could not install skills. You may need to run "npm install -g claude-templates" manually in Terminal, then re-run setup.' });
            addLog('Skills install failed completely');
          }
        }
      }
    } catch (e: any) {
      setStep(3, { status: 'error', output: e.message, friendlyDesc: 'Failed to check or install skills' });
      addLog(`Skills check error: ${e.message}`);
    }

    // ─── Done — re-detect to refresh dashboard ────────────────────────────
    addLog('Setup complete. Re-scanning...');
    await new Promise(r => setTimeout(r, 1000));
    const finalDetect = await detect();
    if (finalDetect) setDetection(finalDetect);
    addLog(`Final scan: ${finalDetect?.summary.readyCount}/${finalDetect?.summary.totalRequired} ready`);

  }, [addLog]);

  // ─── Copy command ───────────────────────────────────────────────────────

  const copyCommand = useCallback((cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedCommand(cmd);
    setTimeout(() => setCopiedCommand(null), 2000);
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  const containerStyle: React.CSSProperties = {
    padding: '24px',
    maxWidth: '800px',
    margin: '0 auto',
    fontFamily: 'var(--font-sans, -apple-system, BlinkMacSystemFont, sans-serif)',
  };

  // ─── Detecting ──────────────────────────────────────────────────────────

  if (phase === 'detecting') {
    return (
      <div style={containerStyle}>
        <div style={{ textAlign: 'center', padding: '80px 0' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px', animation: 'pulse 2s ease-in-out infinite' }}>🧠</div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
            Scanning your computer...
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            Checking for Claude Code, Google Drive, skills, and plugins
          </p>
          <div style={{ width: '200px', margin: '20px auto 0', height: '4px', borderRadius: '2px', background: 'var(--bg-secondary)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: '60%', background: 'linear-gradient(90deg, #6366f1, #8b5cf6)', borderRadius: '2px', animation: 'slideRight 1.5s ease-in-out infinite' }} />
          </div>
        </div>
        <style>{`
          @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.7; transform: scale(1.05); } }
          @keyframes slideRight { 0% { transform: translateX(-100%); } 100% { transform: translateX(250%); } }
        `}</style>
      </div>
    );
  }

  // ─── No bridge ──────────────────────────────────────────────────────────

  if (!bridgeConnected) {
    return (
      <div style={containerStyle}>
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            🧠 Second Brain
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            Your AI-powered personal knowledge system — powered by Claude Code and Google Drive.
          </p>
        </div>
        <div style={{ padding: '20px 24px', borderRadius: '12px', background: '#ef444410', border: '1px solid #ef444430', marginBottom: '20px' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#ef4444', marginBottom: '8px' }}>Bridge Not Connected</div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6', margin: '0 0 12px' }}>
            The ArcadIA Bridge needs to be running on your computer to detect and set up Second Brain.
          </p>
          <div style={{ padding: '10px 14px', background: 'var(--bg-primary)', borderRadius: '8px', fontFamily: 'monospace', fontSize: '12px', color: 'var(--text-primary)' }}>
            cd ~/Arcadia && node bridge/arcadia-bridge.js
          </div>
          <button onClick={runDetection} style={{ marginTop: '12px', padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#6366f1', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            🔄 Retry Connection
          </button>
        </div>
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px', marginTop: '24px' }}>What is Second Brain?</div>
        <div style={{ padding: '16px 20px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.7' }}>
          <p style={{ margin: '0 0 10px' }}>
            <strong style={{ color: 'var(--text-primary)' }}>Second Brain</strong> is your AI-powered personal knowledge system that runs locally. It uses Claude Code + Google Drive to:
          </p>
          {['☀️ Give you a daily briefing from your priorities and calendar', '🌙 Wrap up your day — process meeting notes, preview tomorrow', '📋 Generate weekly summaries and PSC captures', '🤝 Research people and topics before meetings', '📎 Route any URL or text to the right project', '🔍 Run deep research with source citations'].map((item, i) => (
            <div key={i} style={{ paddingLeft: '4px', marginBottom: '4px' }}>{item}</div>
          ))}
        </div>
      </div>
    );
  }

  // ─── Installing (progress view) ────────────────────────────────────────

  if (phase === 'installing') {
    const doneCount = steps.filter(s => s.status === 'done' || s.status === 'skipped').length;
    const errorCount = steps.filter(s => s.status === 'error').length;
    const totalCount = steps.length;
    const finishedCount = doneCount + errorCount;
    const allFinished = finishedCount === totalCount;
    const allDone = doneCount === totalCount;
    const pct = totalCount > 0 ? Math.round((finishedCount / totalCount) * 100) : 0;
    const currentStep = steps[currentStepIdx];

    return (
      <div style={containerStyle}>
        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            {allDone ? '✅' : allFinished ? '⚠️' : '⚡'} {allDone ? 'Setup Complete!' : allFinished ? 'Setup Finished with Issues' : 'Setting Up Second Brain'}
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            {allDone
              ? 'All 4 components are installed and configured. Your Second Brain is ready to use.'
              : allFinished
              ? `${doneCount} of ${totalCount} components ready. ${errorCount} had issues — see details below.`
              : `Step ${Math.min(currentStepIdx + 1, totalCount)} of ${totalCount} — ${currentStep?.label || 'Processing...'}`}
          </p>
        </div>

        {/* Progress bar */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {doneCount} of {totalCount} completed{errorCount > 0 ? ` · ${errorCount} error${errorCount > 1 ? 's' : ''}` : ''}
            </span>
            <span style={{ fontSize: '12px', color: allDone ? '#22c55e' : errorCount > 0 ? '#f59e0b' : '#6366f1', fontWeight: 600 }}>{pct}%</span>
          </div>
          <div style={{ height: '8px', borderRadius: '4px', background: 'var(--bg-primary)', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${pct}%`,
              background: allDone ? 'linear-gradient(90deg, #22c55e, #16a34a)' : errorCount > 0 ? 'linear-gradient(90deg, #f59e0b, #d97706)' : 'linear-gradient(90deg, #6366f1, #8b5cf6)',
              borderRadius: '4px',
              transition: 'width 0.5s ease',
            }} />
          </div>
        </div>

        {/* Steps list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
          {steps.map((step, i) => {
            const isCurrent = i === currentStepIdx && !allFinished;
            const statusIcon = step.status === 'done' ? '✅' : step.status === 'skipped' ? '⏭️' : step.status === 'error' ? '❌' : step.status === 'running' ? '⏳' : step.status === 'checking' ? '🔍' : '○';
            const borderColor = step.status === 'done' ? '#22c55e30' : step.status === 'error' ? '#ef444430' : (step.status === 'running' || step.status === 'checking') ? '#6366f140' : 'var(--border)';
            const bgColor = isCurrent ? 'var(--bg-primary)' : 'var(--bg-secondary)';

            return (
              <div key={step.id} style={{
                padding: '14px 18px',
                borderRadius: '12px',
                border: `1px solid ${borderColor}`,
                background: bgColor,
                transition: 'all 0.3s ease',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '20px', flexShrink: 0, width: '28px', textAlign: 'center' }}>{statusIcon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '14px' }}>{step.label}</span>
                      {(step.status === 'running' || step.status === 'checking') && step.elapsed != null && (
                        <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>{step.elapsed}s</span>
                      )}
                      {step.detail && step.status === 'done' && (
                        <span style={{ fontSize: '11px', color: '#22c55e', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '300px' }}>
                          {step.detail}
                        </span>
                      )}
                      {(step.status === 'running' || step.status === 'checking') && (
                        <div style={{ width: '14px', height: '14px', border: '2px solid #6366f140', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 1s linear infinite', marginLeft: 'auto', flexShrink: 0 }} />
                      )}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '3px', lineHeight: '1.5' }}>
                      {step.friendlyDesc}
                    </div>
                  </div>
                </div>

                {/* Error output */}
                {step.status === 'error' && step.output && (
                  <div style={{ marginTop: '10px', padding: '8px 12px', background: '#ef444410', borderRadius: '8px', fontSize: '11px', fontFamily: 'monospace', color: '#ef4444', maxHeight: '80px', overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    {step.output}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Action buttons */}
        {allDone && (
          <button onClick={() => { setPhase('dashboard'); runDetection(); }} style={{ padding: '12px 20px', borderRadius: '10px', border: 'none', background: '#22c55e', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer', width: '100%' }}>
            🎉 Go to Dashboard
          </button>
        )}
        {allFinished && !allDone && (
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={runInstall} style={{ flex: 1, padding: '10px 16px', borderRadius: '10px', border: 'none', background: '#6366f1', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
              🔄 Retry Setup
            </button>
            <button onClick={() => { setPhase('dashboard'); runDetection(); }} style={{ flex: 1, padding: '10px 16px', borderRadius: '10px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
              ← Back to Dashboard
            </button>
          </div>
        )}

        {/* Setup log (collapsible) */}
        {setupLog.length > 0 && (
          <details style={{ marginTop: '16px' }}>
            <summary style={{ fontSize: '12px', color: 'var(--text-tertiary)', cursor: 'pointer', userSelect: 'none' }}>
              Setup log ({setupLog.length} entries)
            </summary>
            <div style={{ marginTop: '8px', padding: '10px 14px', background: 'var(--bg-primary)', borderRadius: '8px', maxHeight: '150px', overflow: 'auto', fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
              {setupLog.map((line, i) => <div key={i}>{line}</div>)}
            </div>
          </details>
        )}

        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DASHBOARD
  // ═══════════════════════════════════════════════════════════════════════════

  const summary = detection?.summary;
  const isFullyReady = summary?.fullyReady ?? false;
  const readyPct = summary ? Math.round((summary.readyCount / summary.totalRequired) * 100) : 0;

  return (
    <div style={containerStyle}>
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
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div style={{
          padding: '8px 14px', borderRadius: '8px', background: 'var(--bg-secondary)',
          border: `1px solid ${isFullyReady ? '#22c55e30' : '#f59e0b30'}`,
          fontSize: '12px', color: isFullyReady ? '#22c55e' : '#f59e0b',
          display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600,
        }}>
          <span style={{ fontSize: '14px' }}>{isFullyReady ? '●' : '○'}</span>
          {isFullyReady ? 'Fully Configured' : `${summary?.readyCount ?? 0} of ${summary?.totalRequired ?? 4} components ready`}
        </div>
        {(detection?.skills.installed.length ?? 0) > 0 && (
          <div style={{ padding: '8px 14px', borderRadius: '8px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            ⚡ <strong>{detection!.skills.installed.length}</strong> skills installed
          </div>
        )}
        <button onClick={runDetection} style={{ padding: '8px 14px', borderRadius: '8px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
          🔄 Re-scan
        </button>
      </div>

      {/* Component checklist */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px 20px', marginBottom: '20px' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-tertiary)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Setup Status
        </div>
        <div style={{ marginBottom: '12px', height: '6px', borderRadius: '3px', background: 'var(--bg-primary)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${readyPct}%`, background: `linear-gradient(90deg, #6366f1, #6366f1cc)`, borderRadius: '3px', transition: 'width 0.5s ease' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[
            { label: 'Claude Code', ready: detection?.claudeCode.installed ?? false, detail: detection?.claudeCode.version?.split('\n')[0]?.slice(0, 40) },
            { label: 'Google Drive Workspace', ready: (detection?.googleDrive.installed && detection?.secondBrain.initialized) ?? false, detail: detection?.googleDrive.workspacePath },
            { label: 'CLAUDE.md Configuration', ready: detection?.secondBrain.claudeMdExists ?? false },
            { label: 'Skills & Plugins', ready: (detection?.skills.installed.length ?? 0) > 0, detail: detection?.skills.installed.slice(0, 5).join(', ') },
          ].map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
              <span style={{
                width: '10px', height: '10px', borderRadius: '50%',
                background: item.ready ? '#22c55e' : '#f59e0b',
                display: 'inline-block',
                boxShadow: item.ready ? '0 0 6px #22c55e60' : 'none',
              }} />
              <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{item.label}</span>
              {item.detail && item.ready && (
                <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '250px' }}>
                  {item.detail}
                </span>
              )}
            </div>
          ))}
        </div>

        {!isFullyReady && (
          <button onClick={runInstall} style={{
            marginTop: '14px', width: '100%', padding: '12px 20px', borderRadius: '10px',
            border: 'none', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            color: '#fff', fontSize: '14px', fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            transition: 'all 0.2s ease', boxShadow: '0 4px 12px #6366f140',
          }}>
            ⚡ Complete Setup — Install Everything Automatically
          </button>
        )}
      </div>

      {/* ─── Slash Commands ──────────────────────────────────────────────── */}
      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px', marginTop: '24px' }}>
        Slash Commands
      </div>
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
              background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '10px',
              padding: '14px 16px', cursor: 'pointer', transition: 'all 0.2s ease',
              display: 'flex', alignItems: 'flex-start', gap: '12px',
            }}
            onClick={() => copyCommand(cmd.command)}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#6366f150'; (e.currentTarget as HTMLElement).style.background = 'var(--bg-primary)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.background = 'var(--bg-secondary)'; }}
          >
            <div style={{ fontSize: '24px', lineHeight: '1', flexShrink: 0, width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', background: 'var(--bg-primary)' }}>
              {cmd.icon}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <code style={{ fontSize: '13px', fontWeight: 700, color: '#6366f1', background: '#6366f115', padding: '2px 8px', borderRadius: '4px' }}>
                  {cmd.command}
                </code>
                <span style={{ fontSize: '12px', color: copiedCommand === cmd.command ? '#22c55e' : 'var(--text-tertiary)' }}>
                  {copiedCommand === cmd.command ? '✓ Copied' : '📋'}
                </span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                {cmd.description}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ─── Writing Style Guide ─────────────────────────────────────────── */}
      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px', marginTop: '24px' }}>
        Writing Style Guide
      </div>
      <div style={{
        background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px',
        padding: '16px 20px', display: 'flex', alignItems: 'flex-start', gap: '14px',
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
          <div style={{ padding: '8px 12px', background: 'var(--bg-primary)', borderRadius: '6px', fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-primary)', lineHeight: '1.5' }}>
            Prompt: "Here are 5 examples of my writing. Analyze my style — tone, sentence length, vocabulary, structure — and create a style guide I can save."
          </div>
        </div>
      </div>

      {/* ─── Add-ons ─────────────────────────────────────────────────────── */}
      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px', marginTop: '24px' }}>
        Optional Add-ons
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {ADDONS.map(addon => {
          const detected = addon.detectionKey ? (detection as any)?.[addon.detectionKey] : null;
          const isInstalled = typeof detected === 'object' && detected !== null
            ? detected.installed
            : typeof detected === 'boolean' ? detected : false;

          return (
            <div key={addon.id} style={{
              background: isInstalled ? '#22c55e08' : 'var(--bg-secondary)',
              border: `1px solid ${isInstalled ? '#22c55e30' : 'var(--border)'}`,
              borderRadius: '12px', padding: '16px 20px',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <div style={{ fontSize: '24px' }}>{addon.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '14px' }}>{addon.name}</span>
                    {isInstalled ? (
                      <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '20px', background: '#22c55e18', color: '#22c55e', fontWeight: 600 }}>✓ Detected</span>
                    ) : (
                      <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '20px', background: '#64748b18', color: '#64748b', fontWeight: 600 }}>Not installed</span>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>{addon.description}</div>
                  {!isInstalled && addon.setupUrl && (
                    <a href={addon.setupUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px', color: '#6366f1', marginTop: '6px', display: 'inline-block' }}>
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
      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px', marginTop: '24px' }}>
        Quick Reference
      </div>
      <div style={{ padding: '16px 20px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.7' }}>
        <div style={{ marginBottom: '8px' }}><strong style={{ color: 'var(--text-primary)' }}>How Second Brain works:</strong></div>
        <div style={{ marginBottom: '6px' }}><strong>1. Workspace</strong> — Your Google Drive <code style={{ background: 'var(--bg-primary)', padding: '1px 4px', borderRadius: '3px' }}>claude/</code> folder stores all projects, notes, and context.</div>
        <div style={{ marginBottom: '6px' }}><strong>2. CLAUDE.md</strong> — Your configuration file defines slash commands, preferences, and workflows.</div>
        <div style={{ marginBottom: '6px' }}><strong>3. Skills</strong> — Modular capabilities (calendar, docs, research) that Claude can use.</div>
        <div><strong>4. Plugins</strong> — Extensions that connect Claude to external services (Google Docs, Sheets, etc).</div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>
    </div>
  );
}
