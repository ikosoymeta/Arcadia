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

type StepStatus = 'waiting' | 'running' | 'done' | 'error' | 'needs-action';

interface SetupStep {
  id: string;
  label: string;
  friendlyDesc: string;
  status: StepStatus;
  elapsed?: number;
  output?: string;
  /** If needs-action, show this dialog */
  dialog?: {
    title: string;
    message: string;
    actionLabel: string;
    actionUrl?: string;
    confirmLabel: string;
  };
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
  const [dialogVisible, setDialogVisible] = useState(false);
  const detectRan = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
          i === currentStepIdx && s.status === 'running'
            ? { ...s, elapsed: (s.elapsed || 0) + 1 }
            : s
        ));
      }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase, currentStepIdx]);

  // ─── Build install plan ─────────────────────────────────────────────────

  const buildSteps = useCallback((det: DetectionResult): SetupStep[] => {
    const plan: SetupStep[] = [];

    if (!det.claudeCode.installed) {
      plan.push({
        id: 'claude-code',
        label: 'Install Claude Code',
        friendlyDesc: 'Claude Code is the AI engine that powers Second Brain. It needs to be installed on your computer.',
        status: 'waiting',
        dialog: {
          title: 'Install Claude Code',
          message: 'Claude Code needs to be installed on your computer. Click the button below to open the setup guide — it takes about 5 minutes. Come back here when you\'re done.',
          actionLabel: 'Open Setup Guide',
          actionUrl: 'https://secondbrain-setup.manus.space',
          confirmLabel: 'I\'ve installed Claude Code — continue',
        },
      });
    }

    if (!det.googleDrive.installed) {
      plan.push({
        id: 'google-drive',
        label: 'Set up Google Drive workspace',
        friendlyDesc: 'Creating your Second Brain workspace folder in Google Drive where all your projects and notes will live.',
        status: 'waiting',
        dialog: {
          title: 'Google Drive Not Found',
          message: 'Google Drive for Desktop needs to be installed and signed in so your Second Brain can store files. If you already have it, make sure it\'s running.',
          actionLabel: 'Download Google Drive',
          actionUrl: 'https://www.google.com/drive/download/',
          confirmLabel: 'Google Drive is running — continue',
        },
      });
    } else if (!det.secondBrain.claudeMdExists) {
      // Drive exists but no workspace folder — we can create it automatically
      plan.push({
        id: 'create-workspace',
        label: 'Create workspace folders',
        friendlyDesc: 'Setting up your Second Brain folder structure in Google Drive (projects, notes, research, templates)...',
        status: 'waiting',
      });
    }

    if (!det.claudeTemplates.installed) {
      plan.push({
        id: 'claude-templates',
        label: 'Install template manager',
        friendlyDesc: 'Installing the tool that manages Second Brain skills and plugins. This takes about 30 seconds.',
        status: 'waiting',
      });
    }

    if (det.skills.installed.length === 0) {
      plan.push({
        id: 'install-skills',
        label: 'Install skills',
        friendlyDesc: 'Adding capabilities: tasks, deep-research, Google Docs, Sheets, Slides, Calendar, and more. This may take 1-2 minutes.',
        status: 'waiting',
      });
    }

    if (det.skills.installed.length === 0) {
      plan.push({
        id: 'install-plugins',
        label: 'Install plugins',
        friendlyDesc: 'Connecting Claude to your Google Workspace apps (Docs, Sheets, Slides, Calendar). This may take 1-2 minutes.',
        status: 'waiting',
      });
    }

    if (!det.secondBrain.claudeMdExists) {
      plan.push({
        id: 'init-claudemd',
        label: 'Configure slash commands',
        friendlyDesc: 'Creating your CLAUDE.md configuration file with all 6 slash commands pre-configured and ready to use.',
        status: 'waiting',
      });
    }

    return plan;
  }, []);

  // ─── Run install ────────────────────────────────────────────────────────

  const runInstall = useCallback(async () => {
    if (!detection) return;
    const plan = buildSteps(detection);
    if (plan.length === 0) return;

    setSteps(plan);
    setCurrentStepIdx(0);
    setPhase('installing');
    setDialogVisible(false);

    for (let i = 0; i < plan.length; i++) {
      setCurrentStepIdx(i);
      const step = plan[i];

      // If step needs user action, show dialog and wait
      if (step.dialog) {
        setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, status: 'needs-action' } : s));
        setDialogVisible(true);

        // Wait for user to confirm
        await new Promise<void>(resolve => {
          const check = setInterval(async () => {
            // Re-detect to see if the component is now installed
            const freshDetect = await detect();
            if (!freshDetect) return;

            let resolved = false;
            if (step.id === 'claude-code' && freshDetect.claudeCode.installed) resolved = true;
            if (step.id === 'google-drive' && freshDetect.googleDrive.installed) resolved = true;

            if (resolved) {
              clearInterval(check);
              setDetection(freshDetect);
              setDialogVisible(false);
              resolve();
            }
          }, 5000);

          // Also allow manual "I've done this" click
          const handler = () => {
            clearInterval(check);
            setDialogVisible(false);
            resolve();
            window.removeEventListener('sb-dialog-confirm', handler);
          };
          window.addEventListener('sb-dialog-confirm', handler);
        });

        setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, status: 'done', elapsed: 0 } : s));
        continue;
      }

      // Automated step
      setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, status: 'running', elapsed: 0 } : s));

      try {
        let result: any;

        switch (step.id) {
          case 'create-workspace':
            result = await setupAction('create-workspace');
            if (!result.success && result.error === 'google-drive-not-found') {
              // Google Drive disappeared — show dialog
              setSteps(prev => prev.map((s, idx) => idx === i ? {
                ...s,
                status: 'needs-action',
                dialog: {
                  title: 'Google Drive Not Found',
                  message: 'Google Drive for Desktop needs to be installed and running. Please install it and sign in with your Meta account.',
                  actionLabel: 'Download Google Drive',
                  actionUrl: 'https://www.google.com/drive/download/',
                  confirmLabel: 'Google Drive is running — retry',
                },
              } : s));
              setDialogVisible(true);
              await new Promise<void>(resolve => {
                const handler = () => { setDialogVisible(false); resolve(); window.removeEventListener('sb-dialog-confirm', handler); };
                window.addEventListener('sb-dialog-confirm', handler);
              });
              // Retry
              result = await setupAction('create-workspace');
            }
            break;

          case 'claude-templates':
            result = await setupAction('install-claude-templates');
            break;

          case 'install-skills':
            result = await setupAction('install-skills');
            break;

          case 'install-plugins':
            result = await setupAction('install-plugins');
            break;

          case 'init-claudemd':
            result = await setupAction('init-claudemd');
            break;

          default:
            result = { success: true };
        }

        setSteps(prev => prev.map((s, idx) =>
          idx === i ? {
            ...s,
            status: result.success ? 'done' : 'error',
            output: result.error || result.stderr || result.stdout,
          } : s
        ));
      } catch (e: any) {
        setSteps(prev => prev.map((s, idx) =>
          idx === i ? { ...s, status: 'error', output: e.message } : s
        ));
      }
    }

    // Re-detect after all steps
    setTimeout(() => runDetection(), 2000);
  }, [detection, buildSteps, runDetection]);

  // ─── Dialog confirm handler ─────────────────────────────────────────────

  const confirmDialog = useCallback(() => {
    window.dispatchEvent(new Event('sb-dialog-confirm'));
  }, []);

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

  // ─── Installing ─────────────────────────────────────────────────────────

  if (phase === 'installing') {
    const doneCount = steps.filter(s => s.status === 'done').length;
    const totalCount = steps.length;
    const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
    const currentStep = steps[currentStepIdx];
    const allDone = doneCount === totalCount;
    const hasError = steps.some(s => s.status === 'error');

    return (
      <div style={containerStyle}>
        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            {allDone ? '✅' : '⚡'} {allDone ? 'Setup Complete!' : 'Setting Up Second Brain'}
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            {allDone
              ? 'Your Second Brain is ready to use. All components have been installed and configured.'
              : `Step ${Math.min(currentStepIdx + 1, totalCount)} of ${totalCount} — ${currentStep?.label || 'Finishing up...'}`}
          </p>
        </div>

        {/* Progress bar */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {doneCount} of {totalCount} completed
            </span>
            <span style={{ fontSize: '12px', color: allDone ? '#22c55e' : '#6366f1', fontWeight: 600 }}>{pct}%</span>
          </div>
          <div style={{ height: '8px', borderRadius: '4px', background: 'var(--bg-primary)', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${pct}%`,
              background: allDone ? 'linear-gradient(90deg, #22c55e, #16a34a)' : 'linear-gradient(90deg, #6366f1, #8b5cf6)',
              borderRadius: '4px',
              transition: 'width 0.5s ease',
            }} />
          </div>
        </div>

        {/* Steps list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
          {steps.map((step, i) => {
            const isCurrent = i === currentStepIdx && !allDone;
            const statusIcon = step.status === 'done' ? '✅' : step.status === 'error' ? '❌' : step.status === 'running' ? '⏳' : step.status === 'needs-action' ? '👆' : '○';
            const borderColor = step.status === 'done' ? '#22c55e30' : step.status === 'error' ? '#ef444430' : step.status === 'running' ? '#6366f140' : step.status === 'needs-action' ? '#f59e0b40' : 'var(--border)';
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
                      {step.status === 'running' && step.elapsed != null && (
                        <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>{step.elapsed}s</span>
                      )}
                      {step.status === 'running' && (
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
                  <div style={{ marginTop: '10px', padding: '8px 12px', background: '#ef444410', borderRadius: '8px', fontSize: '11px', fontFamily: 'monospace', color: '#ef4444', maxHeight: '80px', overflow: 'auto' }}>
                    {step.output}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Action buttons */}
        {allDone && (
          <button onClick={() => { setPhase('dashboard'); runDetection(); }} style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: '#22c55e', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer', width: '100%' }}>
            🎉 Go to Dashboard
          </button>
        )}
        {hasError && !allDone && (
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={runInstall} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#6366f1', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
              🔄 Retry Setup
            </button>
            <button onClick={() => setPhase('dashboard')} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
              ← Back to Dashboard
            </button>
          </div>
        )}

        {/* ─── User Action Dialog (modal overlay) ─────────────────────────── */}
        {dialogVisible && currentStep?.dialog && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
            backdropFilter: 'blur(4px)',
          }}>
            <div style={{
              background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '16px',
              padding: '28px 32px', maxWidth: '440px', width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
            }}>
              <div style={{ fontSize: '32px', textAlign: 'center', marginBottom: '16px' }}>
                {currentStep.id === 'claude-code' ? '⚡' : '📁'}
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center', marginBottom: '10px' }}>
                {currentStep.dialog.title}
              </h3>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', textAlign: 'center', lineHeight: '1.6', marginBottom: '24px' }}>
                {currentStep.dialog.message}
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {currentStep.dialog.actionUrl && (
                  <a
                    href={currentStep.dialog.actionUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      padding: '12px 20px', borderRadius: '10px', background: '#6366f1', color: '#fff',
                      fontSize: '14px', fontWeight: 600, textAlign: 'center', textDecoration: 'none',
                      display: 'block', transition: 'background 0.2s',
                    }}
                  >
                    {currentStep.dialog.actionLabel} ↗
                  </a>
                )}
                <button
                  onClick={confirmDialog}
                  style={{
                    padding: '12px 20px', borderRadius: '10px', border: '1px solid var(--border)',
                    background: 'var(--bg-primary)', color: 'var(--text-primary)',
                    fontSize: '14px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
                  }}
                >
                  {currentStep.dialog.confirmLabel}
                </button>
              </div>

              <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', textAlign: 'center', marginTop: '14px' }}>
                We'll automatically detect when you're done. You can also click the button above to continue manually.
              </p>
            </div>
          </div>
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
            { label: 'Claude Code', ready: detection?.claudeCode.installed ?? false, detail: detection?.claudeCode.version?.split('\n')[0]?.slice(0, 40), link: 'https://secondbrain-setup.manus.space' },
            { label: 'Google Drive Workspace', ready: detection?.googleDrive.installed ?? false, detail: detection?.googleDrive.workspacePath },
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
              {item.detail && (
                <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '250px' }}>
                  {item.detail}
                </span>
              )}
              {!item.ready && item.link && (
                <a href={item.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: '11px', color: '#6366f1', marginLeft: 'auto' }}>Install →</a>
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
              opacity: isFullyReady ? 1 : 0.6,
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
