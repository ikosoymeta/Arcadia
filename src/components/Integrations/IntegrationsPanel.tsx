import { useState, useEffect, useCallback } from 'react';
import type { ToolDefinition } from '../../types';

// ─── Tool Definitions for Claude API ─────────────────────────────────────────

export const GITHUB_TOOLS: ToolDefinition[] = [
  {
    name: 'github_list_repos',
    description: 'List GitHub repositories for the authenticated user or a specific organization.',
    input_schema: {
      type: 'object',
      properties: {
        org: { type: 'string', description: 'Optional organization name. If omitted, lists user repos.' },
        limit: { type: 'number', description: 'Max number of repos to return (default 20)' },
      },
    },
  },
  {
    name: 'github_read_file',
    description: 'Read the contents of a file from a GitHub repository.',
    input_schema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'Repository name (e.g. "owner/repo")' },
        path: { type: 'string', description: 'File path within the repository' },
        branch: { type: 'string', description: 'Branch name (default: main)' },
      },
      required: ['repo', 'path'],
    },
  },
  {
    name: 'github_create_issue',
    description: 'Create a new issue in a GitHub repository.',
    input_schema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'Repository name (e.g. "owner/repo")' },
        title: { type: 'string', description: 'Issue title' },
        body: { type: 'string', description: 'Issue body (markdown supported)' },
        labels: { type: 'string', description: 'Comma-separated labels' },
      },
      required: ['repo', 'title'],
    },
  },
  {
    name: 'github_list_prs',
    description: 'List open pull requests in a GitHub repository.',
    input_schema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'Repository name (e.g. "owner/repo")' },
        state: { type: 'string', description: 'PR state: open, closed, or all (default: open)' },
      },
      required: ['repo'],
    },
  },
  {
    name: 'github_search_code',
    description: 'Search for code across GitHub repositories.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (e.g. "useState repo:facebook/react")' },
      },
      required: ['query'],
    },
  },
];

export const GOOGLE_DRIVE_TOOLS: ToolDefinition[] = [
  {
    name: 'gdrive_list_files',
    description: 'List files in Google Drive, optionally filtered by folder or type.',
    input_schema: {
      type: 'object',
      properties: {
        folder_id: { type: 'string', description: 'Optional folder ID to list files in' },
        query: { type: 'string', description: 'Optional search query (e.g. "name contains report")' },
        limit: { type: 'number', description: 'Max number of files to return (default 20)' },
      },
    },
  },
  {
    name: 'gdrive_read_file',
    description: 'Read the text content of a Google Drive file (Docs, Sheets, plain text).',
    input_schema: {
      type: 'object',
      properties: {
        file_id: { type: 'string', description: 'Google Drive file ID' },
      },
      required: ['file_id'],
    },
  },
  {
    name: 'gdrive_create_doc',
    description: 'Create a new Google Doc with the given content.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Document title' },
        content: { type: 'string', description: 'Document content (plain text or markdown)' },
        folder_id: { type: 'string', description: 'Optional folder ID to place the document in' },
      },
      required: ['title', 'content'],
    },
  },
];

export const WEB_TOOLS: ToolDefinition[] = [
  {
    name: 'web_search',
    description: 'Search the web for current information, news, or research.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        num_results: { type: 'number', description: 'Number of results to return (default 5)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'web_fetch',
    description: 'Fetch and read the content of a specific URL.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to fetch' },
      },
      required: ['url'],
    },
  },
];

export const CODE_TOOLS: ToolDefinition[] = [
  {
    name: 'code_execute',
    description: 'Execute Python, JavaScript, or shell code and return the output.',
    input_schema: {
      type: 'object',
      properties: {
        language: { type: 'string', description: 'Programming language: python, javascript, or bash' },
        code: { type: 'string', description: 'Code to execute' },
        timeout: { type: 'number', description: 'Execution timeout in seconds (default 30)' },
      },
      required: ['language', 'code'],
    },
  },
  {
    name: 'code_format',
    description: 'Format code according to language conventions.',
    input_schema: {
      type: 'object',
      properties: {
        language: { type: 'string', description: 'Programming language' },
        code: { type: 'string', description: 'Code to format' },
      },
      required: ['language', 'code'],
    },
  },
];

export const MEMORY_TOOLS: ToolDefinition[] = [
  {
    name: 'memory_save',
    description: 'Save a piece of information to long-term memory for future conversations.',
    input_schema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Memory key/label' },
        value: { type: 'string', description: 'Information to remember' },
      },
      required: ['key', 'value'],
    },
  },
  {
    name: 'memory_recall',
    description: 'Recall previously saved information from memory.',
    input_schema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Memory key to recall (or "all" to list all)' },
      },
      required: ['key'],
    },
  },
];

// ─── Integration Config Storage ───────────────────────────────────────────────

export interface IntegrationConfig {
  github?: { token: string; username: string };
  gdrive?: { connected: boolean; email: string };
  enabledTools: string[];
}

const STORAGE_KEY = 'arcadia-integrations';

export function loadIntegrations(): IntegrationConfig {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as IntegrationConfig;
  } catch {
    return { enabledTools: [] };
  }
}

export function saveIntegrations(config: IntegrationConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function getEnabledTools(config: IntegrationConfig): ToolDefinition[] {
  const all: Record<string, ToolDefinition[]> = {
    github: GITHUB_TOOLS,
    gdrive: GOOGLE_DRIVE_TOOLS,
    web: WEB_TOOLS,
    code: CODE_TOOLS,
    memory: MEMORY_TOOLS,
  };
  const tools: ToolDefinition[] = [];
  for (const group of config.enabledTools ?? []) {
    if (all[group]) tools.push(...all[group]);
  }
  return tools;
}

// ─── Status types ───────────────────────────────────────────────────────────

type IntegrationStatus = 'not_configured' | 'needs_setup' | 'ready' | 'checking' | 'error';

interface StatusInfo {
  status: IntegrationStatus;
  label: string;
  color: string;
  bgColor: string;
  icon: string;
}

function getStatusInfo(status: IntegrationStatus): StatusInfo {
  switch (status) {
    case 'ready':
      return { status, label: 'Ready', color: '#22c55e', bgColor: '#22c55e18', icon: '●' };
    case 'needs_setup':
      return { status, label: 'Needs Setup', color: '#f59e0b', bgColor: '#f59e0b18', icon: '◐' };
    case 'checking':
      return { status, label: 'Checking...', color: '#6366f1', bgColor: '#6366f118', icon: '◌' };
    case 'error':
      return { status, label: 'Error', color: '#ef4444', bgColor: '#ef444418', icon: '●' };
    case 'not_configured':
    default:
      return { status, label: 'Off', color: 'var(--text-tertiary)', bgColor: 'var(--bg-tertiary)', icon: '○' };
  }
}

// ─── Shared Styles ──────────────────────────────────────────────────────────

const styles = {
  container: {
    padding: '24px', maxWidth: '740px', margin: '0 auto',
  } as React.CSSProperties,
  card: (color: string, enabled: boolean) => ({
    background: 'var(--bg-secondary)',
    border: `1px solid ${enabled ? color + '44' : 'var(--border)'}`,
    borderRadius: '14px', padding: '20px 22px',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    boxShadow: enabled ? `0 0 0 1px ${color}11` : 'none',
  } as React.CSSProperties),
  iconBox: (color: string) => ({
    width: '48px', height: '48px', borderRadius: '12px',
    background: color + '18', border: `1px solid ${color}30`,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '24px', flexShrink: 0,
  } as React.CSSProperties),
  stepNumber: (color: string) => ({
    width: '22px', height: '22px', borderRadius: '50%',
    background: color + '20', color: color,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '11px', fontWeight: 700, flexShrink: 0,
  } as React.CSSProperties),
  stepRow: {
    display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '10px',
  } as React.CSSProperties,
  stepText: {
    fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5', paddingTop: '1px',
  } as React.CSSProperties,
  link: (color: string) => ({
    color: color, textDecoration: 'none', fontWeight: 600,
    borderBottom: `1px dashed ${color}66`,
  } as React.CSSProperties),
  setupBox: {
    marginTop: '14px', padding: '14px 16px',
    background: 'var(--bg-primary)', borderRadius: '10px',
    border: '1px solid var(--border)',
  } as React.CSSProperties,
  setupTitle: {
    fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)',
    marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px',
  } as React.CSSProperties,
  badge: (bg: string, fg: string) => ({
    fontSize: '10px', padding: '2px 8px', borderRadius: '20px',
    background: bg, color: fg, fontWeight: 600, textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  } as React.CSSProperties),
  infoBox: (color: string) => ({
    marginTop: '10px', padding: '10px 12px', borderRadius: '8px',
    background: color + '08', border: `1px solid ${color}20`,
    fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5',
  } as React.CSSProperties),
  toolPill: (color: string, enabled: boolean) => ({
    fontSize: '11px', padding: '2px 8px', borderRadius: '20px',
    background: enabled ? color + '15' : 'var(--bg-tertiary)',
    color: enabled ? color : 'var(--text-tertiary)',
    border: `1px solid ${enabled ? color + '30' : 'var(--border)'}`,
    fontFamily: 'monospace',
  } as React.CSSProperties),
  toggleTrack: (color: string, enabled: boolean) => ({
    width: '42px', height: '24px', borderRadius: '12px',
    background: enabled ? color : 'var(--bg-tertiary)',
    position: 'relative' as const, cursor: 'pointer', transition: 'background 0.2s',
    border: `1px solid ${enabled ? color : 'var(--border)'}`,
  } as React.CSSProperties),
  toggleThumb: (enabled: boolean) => ({
    position: 'absolute' as const, top: '3px',
    left: enabled ? '21px' : '3px',
    width: '16px', height: '16px', borderRadius: '50%',
    background: '#fff', transition: 'left 0.2s',
    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
  } as React.CSSProperties),
  input: {
    width: '100%', padding: '10px 40px 10px 12px', background: 'var(--bg-primary)',
    border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)',
    fontSize: '13px', fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box' as const,
  } as React.CSSProperties,
  btn: (bg: string) => ({
    padding: '10px 16px', background: bg, border: 'none', borderRadius: '8px',
    color: '#fff', fontSize: '13px', cursor: 'pointer', fontWeight: 600,
    whiteSpace: 'nowrap' as const, display: 'flex', alignItems: 'center', gap: '6px',
  } as React.CSSProperties),
  examplePrompt: {
    marginTop: '10px', padding: '8px 12px', borderRadius: '8px',
    background: 'var(--bg-tertiary)', border: '1px dashed var(--border)',
    fontSize: '12px', color: 'var(--text-secondary)', fontStyle: 'italic' as const,
    lineHeight: '1.5',
  } as React.CSSProperties,
  statusBadge: (si: StatusInfo) => ({
    fontSize: '11px', padding: '3px 10px', borderRadius: '20px',
    background: si.bgColor, color: si.color, fontWeight: 600,
    display: 'inline-flex', alignItems: 'center', gap: '5px',
    border: `1px solid ${si.color}30`,
  } as React.CSSProperties),
  requirementRow: {
    display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px',
    fontSize: '12px', color: 'var(--text-secondary)',
  } as React.CSSProperties,
};

// ─── IntegrationsPanel Component ─────────────────────────────────────────────

export function IntegrationsPanel() {
  const [config, setConfig] = useState<IntegrationConfig>(() => loadIntegrations());
  const [githubToken, setGithubToken] = useState(config.github?.token ?? '');
  const [showGithubToken, setShowGithubToken] = useState(false);
  const [saved, setSaved] = useState(false);
  const [expandedGuide, setExpandedGuide] = useState<string | null>(null);
  const [bridgeConnected, setBridgeConnected] = useState(false);
  const [githubTokenValid, setGithubTokenValid] = useState<boolean | null>(null);
  const [checkingGithub, setCheckingGithub] = useState(false);

  useEffect(() => {
    saveIntegrations(config);
  }, [config]);

  // Check bridge connectivity on mount
  useEffect(() => {
    const checkBridge = async () => {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 3000);
        const res = await fetch('http://127.0.0.1:8087/health', { signal: ctrl.signal });
        clearTimeout(timer);
        setBridgeConnected(res.ok);
      } catch {
        setBridgeConnected(false);
      }
    };
    checkBridge();
    const interval = setInterval(checkBridge, 30000);
    return () => clearInterval(interval);
  }, []);

  // Validate GitHub token when it changes
  const validateGithubToken = useCallback(async (token: string) => {
    if (!token || !token.startsWith('ghp_')) {
      setGithubTokenValid(null);
      return;
    }
    setCheckingGithub(true);
    try {
      const res = await fetch('https://api.github.com/user', {
        headers: { Authorization: `token ${token}` },
      });
      setGithubTokenValid(res.ok);
    } catch {
      setGithubTokenValid(false);
    }
    setCheckingGithub(false);
  }, []);

  // Determine actual status for each integration
  const getIntegrationStatus = useCallback((id: string): IntegrationStatus => {
    const enabled = (config.enabledTools ?? []).includes(id);
    if (!enabled) return 'not_configured';

    switch (id) {
      case 'github':
        if (!config.github?.token) return 'needs_setup';
        if (githubTokenValid === false) return 'error';
        if (githubTokenValid === true) return 'ready';
        return 'needs_setup';
      case 'gdrive':
        if (config.gdrive?.connected) return 'ready';
        return 'needs_setup';
      case 'web':
      case 'code':
        // These work through Claude Code which runs via the bridge
        return bridgeConnected ? 'ready' : 'needs_setup';
      case 'memory':
        // Memory is stored locally, always ready when enabled
        return 'ready';
      default:
        return 'ready';
    }
  }, [config, bridgeConnected, githubTokenValid]);

  const toggleTool = (group: string) => {
    setConfig(prev => {
      const enabled = prev.enabledTools ?? [];
      const next = enabled.includes(group)
        ? enabled.filter(t => t !== group)
        : [...enabled, group];
      return { ...prev, enabledTools: next };
    });
  };

  const isEnabled = (group: string) => (config.enabledTools ?? []).includes(group);

  const handleSaveGitHub = async () => {
    if (!githubToken.trim()) return;
    setConfig(prev => ({
      ...prev,
      github: { token: githubToken.trim(), username: 'github-user' },
    }));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    await validateGithubToken(githubToken.trim());
  };

  const toggleGuide = (id: string) => {
    setExpandedGuide(prev => prev === id ? null : id);
  };

  // ─── Integration definitions ─────────────────────────────────────────────

  const integrations = [
    {
      id: 'github',
      icon: '🐙',
      name: 'GitHub',
      shortDesc: 'Browse repos, read code, create issues, and review pull requests.',
      longDesc: 'Connect your GitHub account to let Claude browse your repositories, read files, create issues, list pull requests, and search code — all through natural conversation. You just need to provide a personal access token (a special password for apps).',
      whatYouCanDo: [
        '"List my GitHub repos" — see all your projects',
        '"Show the README from my-app" — read any file',
        '"Create an issue: fix login bug" — file issues by chatting',
        '"Show open PRs in my-project" — review pull requests',
      ],
      tools: GITHUB_TOOLS,
      color: '#6366f1',
      requiresSetup: true,
      requirements: [
        { label: 'GitHub account', met: true },
        { label: 'Personal access token', met: !!config.github?.token },
      ],
      setup: (
        <div style={styles.setupBox}>
          <div style={styles.setupTitle}>
            <span>🔧</span> Setup Guide
            <span style={styles.badge('#6366f120', '#6366f1')}>2 min setup</span>
            {config.github?.token && githubTokenValid === true && <span style={styles.badge('#22c55e20', '#22c55e')}>Token verified</span>}
            {config.github?.token && githubTokenValid === false && <span style={styles.badge('#ef444420', '#ef4444')}>Token invalid</span>}
          </div>

          <div style={styles.infoBox('#6366f1')}>
            <strong>What is a personal access token?</strong> It's like a special password that lets ArcadIA access your GitHub on your behalf. It stays on your computer and is never sent anywhere except directly to GitHub.
          </div>

          <div style={{ marginTop: '12px' }}>
            <div style={styles.stepRow}>
              <span style={styles.stepNumber('#6366f1')}>1</span>
              <div style={styles.stepText}>
                <strong>Open GitHub's token page</strong> — {' '}
                <a
                  href="https://github.com/settings/tokens/new?scopes=repo&description=ArcadIA%20Editor%20-%20Claude%20Integration"
                  target="_blank"
                  rel="noreferrer"
                  style={styles.link('#6366f1')}
                >
                  Click here to go there now
                </a>
                {' '}(opens in a new tab, you may need to log in)
              </div>
            </div>

            <div style={styles.stepRow}>
              <span style={styles.stepNumber('#6366f1')}>2</span>
              <div style={styles.stepText}>
                On that page, you'll see some settings. The important ones are already filled in for you:
                <ul style={{ margin: '6px 0 0 0', paddingLeft: '16px', fontSize: '12px' }}>
                  <li><strong>Note:</strong> "ArcadIA Editor" (already filled)</li>
                  <li><strong>Expiration:</strong> Pick "90 days" (you can always make a new one later)</li>
                  <li><strong>Scopes:</strong> Make sure <code style={{ background: 'var(--bg-tertiary)', padding: '1px 4px', borderRadius: '3px' }}>repo</code> is checked (it should be)</li>
                </ul>
              </div>
            </div>

            <div style={styles.stepRow}>
              <span style={styles.stepNumber('#6366f1')}>3</span>
              <div style={styles.stepText}>
                Scroll down and click the green <strong>"Generate token"</strong> button. You'll see a long code starting with <code style={{ background: 'var(--bg-tertiary)', padding: '1px 4px', borderRadius: '3px' }}>ghp_</code> — <strong>copy it</strong> (you won't be able to see it again!)
              </div>
            </div>

            <div style={styles.stepRow}>
              <span style={styles.stepNumber('#6366f1')}>4</span>
              <div style={styles.stepText}>
                <strong>Paste it below</strong> and click Save. We'll verify it works right away:
              </div>
            </div>
          </div>

          {/* Token input */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '4px', marginLeft: '32px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                type={showGithubToken ? 'text' : 'password'}
                value={githubToken}
                onChange={e => setGithubToken(e.target.value)}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                style={{
                  ...styles.input,
                  borderColor: githubTokenValid === true ? '#22c55e' : githubTokenValid === false ? '#ef4444' : 'var(--border)',
                }}
                onKeyDown={e => { if (e.key === 'Enter') handleSaveGitHub(); }}
              />
              <button
                onClick={() => setShowGithubToken(p => !p)}
                style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', opacity: 0.6 }}
                title={showGithubToken ? 'Hide token' : 'Show token'}
              >{showGithubToken ? '🙈' : '👁'}</button>
            </div>
            <button
              onClick={handleSaveGitHub}
              disabled={!githubToken.trim() || checkingGithub}
              style={{
                ...styles.btn(saved ? '#22c55e' : checkingGithub ? '#6366f188' : githubToken.trim() ? '#6366f1' : '#6366f166'),
                cursor: githubToken.trim() && !checkingGithub ? 'pointer' : 'not-allowed',
              }}
            >{checkingGithub ? 'Verifying...' : saved ? '✓ Saved!' : 'Save & Verify'}</button>
          </div>

          {githubTokenValid === false && config.github?.token && (
            <div style={{ marginLeft: '32px', marginTop: '8px', fontSize: '12px', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '6px' }}>
              ✗ This token doesn't seem to work. Please check that you copied it correctly, or generate a new one.
            </div>
          )}
          {githubTokenValid === true && (
            <div style={{ marginLeft: '32px', marginTop: '8px', fontSize: '12px', color: '#22c55e', display: 'flex', alignItems: 'center', gap: '6px' }}>
              ✓ Token verified! GitHub integration is ready to use.
            </div>
          )}

          <div style={{ marginLeft: '32px', marginTop: '8px', fontSize: '11px', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            🔒 Your token is stored only in this browser. It never leaves your machine except to authenticate with GitHub.
          </div>
        </div>
      ),
    },
    {
      id: 'gdrive',
      icon: '📁',
      name: 'Google Drive',
      shortDesc: 'Browse, read, and create documents in your Google Drive.',
      longDesc: 'Connect your Google account to let Claude list your Drive files, read Google Docs, and create new documents — all from the chat. Your files stay private and Claude only accesses what you ask about.',
      whatYouCanDo: [
        '"List my recent Drive files" — browse your documents',
        '"Read my Q1 Report doc" — open and read any file',
        '"Create a doc titled Meeting Notes" — make new documents',
      ],
      tools: GOOGLE_DRIVE_TOOLS,
      color: '#22c55e',
      requiresSetup: true,
      requirements: [
        { label: 'Google account', met: true },
        { label: 'OAuth connection', met: !!config.gdrive?.connected },
      ],
      setup: (
        <div style={styles.setupBox}>
          <div style={styles.setupTitle}>
            <span>🔧</span> Setup Guide
            <span style={styles.badge('#22c55e20', '#22c55e')}>1 min setup</span>
            {config.gdrive?.connected && <span style={styles.badge('#22c55e20', '#22c55e')}>Connected</span>}
          </div>

          <div style={styles.infoBox('#22c55e')}>
            <strong>How does this work?</strong> You'll sign in with your Google account in a popup window. ArcadIA can then access your Drive files on your behalf. You can revoke access anytime from your Google account settings.
          </div>

          <div style={{ marginTop: '12px' }}>
            <div style={styles.stepRow}>
              <span style={styles.stepNumber('#22c55e')}>1</span>
              <div style={styles.stepText}>
                <strong>Click "Connect Google Account"</strong> below. A popup will open.
              </div>
            </div>

            <div style={styles.stepRow}>
              <span style={styles.stepNumber('#22c55e')}>2</span>
              <div style={styles.stepText}>
                <strong>Sign in</strong> with your Google account and click "Allow" to grant access. The popup will close automatically.
              </div>
            </div>
          </div>

          <div style={{ marginTop: '4px', marginLeft: '32px' }}>
            <button
              onClick={() => {
                const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
                if (!clientId) {
                  alert('Google OAuth is not configured yet.\n\nThis feature requires a Google Cloud OAuth Client ID.\nContact your admin or check the setup documentation for details.');
                  return;
                }
                const params = new URLSearchParams({
                  client_id: clientId,
                  redirect_uri: `${window.location.origin}/auth/google/callback`,
                  response_type: 'token',
                  scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly',
                });
                window.open(`https://accounts.google.com/o/oauth2/auth?${params}`, '_blank', 'width=500,height=600');
              }}
              style={styles.btn('#4285f4')}
            >
              <span>🔗</span> Connect Google Account
            </button>
            {config.gdrive?.connected && (
              <div style={{ marginTop: '8px', fontSize: '12px', color: '#22c55e', fontWeight: 600 }}>
                ✓ Connected as {config.gdrive.email}
              </div>
            )}
          </div>

          <div style={{ ...styles.infoBox('#22c55e'), marginTop: '12px' }}>
            <strong>Privacy:</strong> ArcadIA can only access files you explicitly ask about in conversations. It cannot browse your entire Drive on its own.
          </div>
        </div>
      ),
    },
    {
      id: 'web',
      icon: '🌐',
      name: 'Web Search & Fetch',
      shortDesc: 'Search the internet and read web pages for up-to-date information.',
      longDesc: 'Let Claude search the web when you ask about current events, recent news, or anything that needs fresh information. Claude can also read the contents of any URL you share. All searches go through the bridge running on your machine.',
      whatYouCanDo: [
        '"What\'s the latest news about React 19?" — search for current info',
        '"Read this article: https://..." — fetch and summarize any URL',
        '"Compare pricing of AWS vs GCP" — research across the web',
      ],
      tools: WEB_TOOLS,
      color: '#f59e0b',
      requiresSetup: false,
      requirements: [
        { label: 'ArcadIA Bridge running', met: bridgeConnected },
      ],
      setup: null,
    },
    {
      id: 'code',
      icon: '⚡',
      name: 'Code Execution',
      shortDesc: 'Run Python, JavaScript, and shell commands with live results.',
      longDesc: 'Claude can write and run code for you — great for data analysis, calculations, testing scripts, or automating tasks. Code runs locally through Claude Code on your machine, so your data stays completely private.',
      whatYouCanDo: [
        '"Calculate compound interest on $10,000 at 5%" — quick math',
        '"Write a Python script to sort this data" — data processing',
        '"Check if port 3000 is in use" — system commands',
        '"Test this regex pattern" — quick experiments',
      ],
      tools: CODE_TOOLS,
      color: '#8b5cf6',
      requiresSetup: false,
      requirements: [
        { label: 'ArcadIA Bridge running', met: bridgeConnected },
      ],
      setup: null,
    },
    {
      id: 'memory',
      icon: '🧠',
      name: 'Long-term Memory',
      shortDesc: 'Claude remembers your preferences and context across conversations.',
      longDesc: 'Tell Claude to remember things — your tech stack, coding style, project details, or any preferences. This information is saved locally in your browser and recalled automatically in future conversations to give you more personalized help.',
      whatYouCanDo: [
        '"Remember that I use TypeScript and React" — save preferences',
        '"My API endpoint is api.example.com" — store project details',
        '"What do you remember about me?" — recall saved info',
        '"Forget my API key" — delete specific memories',
      ],
      tools: MEMORY_TOOLS,
      color: '#ec4899',
      requiresSetup: false,
      requirements: [],
      setup: null,
    },
  ];

  // Count truly ready integrations
  const readyCount = integrations.filter(i => getIntegrationStatus(i.id) === 'ready').length;
  const enabledCount = (config.enabledTools ?? []).length;

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          🔌 Integrations
        </h2>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.6', margin: 0 }}>
          Connect external tools to give Claude superpowers. Enable an integration, complete any required setup, and start using it by simply asking Claude in your conversations.
        </p>
      </div>

      {/* Quick status bar */}
      <div style={{
        display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap',
      }}>
        <div style={{
          padding: '8px 14px', borderRadius: '8px', background: 'var(--bg-secondary)',
          border: '1px solid var(--border)', fontSize: '12px', color: 'var(--text-secondary)',
          display: 'flex', alignItems: 'center', gap: '6px',
        }}>
          <span style={{ color: readyCount > 0 ? '#22c55e' : 'var(--text-tertiary)', fontSize: '14px' }}>●</span>
          <strong>{readyCount}</strong> of <strong>{enabledCount}</strong> integrations ready
        </div>
        <div style={{
          padding: '8px 14px', borderRadius: '8px', background: 'var(--bg-secondary)',
          border: '1px solid var(--border)', fontSize: '12px', color: 'var(--text-secondary)',
          display: 'flex', alignItems: 'center', gap: '6px',
        }}>
          🔧 <strong>{getEnabledTools(config).length}</strong> tools available to Claude
        </div>
        <div style={{
          padding: '8px 14px', borderRadius: '8px', background: 'var(--bg-secondary)',
          border: `1px solid ${bridgeConnected ? '#22c55e30' : '#ef444430'}`, fontSize: '12px',
          color: bridgeConnected ? '#22c55e' : '#ef4444',
          display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600,
        }}>
          <span style={{ fontSize: '14px' }}>{bridgeConnected ? '●' : '○'}</span>
          Bridge {bridgeConnected ? 'Connected' : 'Not Connected'}
        </div>
      </div>

      {/* Bridge warning if not connected */}
      {!bridgeConnected && (
        <div style={{
          marginBottom: '16px', padding: '12px 16px', borderRadius: '10px',
          background: '#ef444410', border: '1px solid #ef444430',
          fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6',
        }}>
          <strong style={{ color: '#ef4444' }}>Bridge not detected.</strong> Some integrations (Web Search, Code Execution) require the ArcadIA Bridge to be running on your machine. Start it with:
          <code style={{ display: 'block', marginTop: '8px', padding: '8px 12px', background: 'var(--bg-primary)', borderRadius: '6px', fontSize: '12px', fontFamily: 'monospace', color: 'var(--text-primary)' }}>
            cd ~/Arcadia && node bridge/arcadia-bridge.js
          </code>
        </div>
      )}

      {/* Integration cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {integrations.map(integration => {
          const enabled = isEnabled(integration.id);
          const guideOpen = expandedGuide === integration.id;
          const status = getIntegrationStatus(integration.id);
          const statusInfo = getStatusInfo(status);

          return (
            <div key={integration.id} style={styles.card(integration.color, enabled)}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                <div style={styles.iconBox(integration.color)}>
                  {integration.icon}
                </div>
                <div style={{ flex: 1 }}>
                  {/* Header row */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '16px' }}>{integration.name}</div>
                      {enabled && (
                        <span style={styles.statusBadge(statusInfo)}>
                          {statusInfo.icon} {statusInfo.label}
                        </span>
                      )}
                      {!enabled && integration.requiresSetup && (
                        <span style={styles.badge('#f59e0b18', '#f59e0b')}>Requires setup</span>
                      )}
                      {!enabled && !integration.requiresSetup && (
                        <span style={styles.badge('#22c55e18', '#22c55e')}>No setup needed</span>
                      )}
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <span style={{ fontSize: '12px', color: enabled ? integration.color : 'var(--text-tertiary)', fontWeight: 600 }}>
                        {enabled ? 'Enabled' : 'Disabled'}
                      </span>
                      <div onClick={() => toggleTool(integration.id)} style={styles.toggleTrack(integration.color, enabled)}>
                        <div style={styles.toggleThumb(enabled)} />
                      </div>
                    </label>
                  </div>

                  {/* Description — show short when collapsed, long when expanded */}
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                    {enabled ? integration.longDesc : integration.shortDesc}
                  </div>

                  {/* Requirements checklist when enabled */}
                  {enabled && integration.requirements.length > 0 && (
                    <div style={{ marginTop: '10px', padding: '8px 12px', borderRadius: '8px', background: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-tertiary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Requirements</div>
                      {integration.requirements.map((req, i) => (
                        <div key={i} style={styles.requirementRow}>
                          <span style={{ color: req.met ? '#22c55e' : '#f59e0b', fontSize: '14px' }}>
                            {req.met ? '✓' : '○'}
                          </span>
                          <span style={{ color: req.met ? '#22c55e' : 'var(--text-secondary)', fontWeight: req.met ? 600 : 400 }}>
                            {req.label}
                          </span>
                          {!req.met && <span style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 600 }}>— see setup guide below</span>}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* What you can do */}
                  {enabled && integration.whatYouCanDo && (
                    <div style={{ marginTop: '10px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-tertiary)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>What you can say</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        {integration.whatYouCanDo.map((example, i) => (
                          <div key={i} style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                            💬 <em>{example}</em>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tool pills */}
                  <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                    {integration.tools.map(t => (
                      <span key={t.name} style={styles.toolPill(integration.color, enabled)}>{t.name}</span>
                    ))}
                    {enabled && integration.setup && (
                      <button
                        onClick={() => toggleGuide(integration.id)}
                        style={{
                          fontSize: '11px', padding: '2px 10px', borderRadius: '20px',
                          background: status === 'needs_setup' ? integration.color + '20' : 'transparent',
                          color: integration.color,
                          border: `1px ${status === 'needs_setup' ? 'solid' : 'dashed'} ${integration.color}50`, cursor: 'pointer',
                          fontWeight: 600,
                          animation: status === 'needs_setup' && !guideOpen ? 'pulse 2s infinite' : 'none',
                        }}
                      >
                        {guideOpen ? 'Hide guide ▲' : status === 'needs_setup' ? 'Complete setup ▼' : 'Setup guide ▼'}
                      </button>
                    )}
                  </div>

                  {/* Setup section */}
                  {enabled && integration.setup && (guideOpen || (status === 'needs_setup' && integration.requiresSetup)) && integration.setup}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Active tools summary */}
      <div style={{
        marginTop: '24px', padding: '16px 20px', background: 'var(--bg-secondary)',
        border: '1px solid var(--border)', borderRadius: '12px',
      }}>
        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          🛠 Active Tools ({getEnabledTools(config).length})
        </div>
        {getEnabledTools(config).length === 0 ? (
          <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', lineHeight: '1.6' }}>
            No tools enabled yet. Enable integrations above to let Claude use them during conversations. Start with <strong>Web Search</strong> or <strong>Code Execution</strong> — they work instantly with no setup!
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {getEnabledTools(config).map(t => (
              <span
                key={t.name}
                style={{
                  fontSize: '11px', padding: '3px 10px', borderRadius: '20px',
                  background: 'var(--accent-dim)', color: 'var(--accent)',
                  border: '1px solid rgba(99,102,241,0.3)', fontFamily: 'monospace',
                }}
              >{t.name}</span>
            ))}
          </div>
        )}
      </div>

      {/* How it works */}
      <div style={{
        marginTop: '16px', padding: '16px 20px', background: 'var(--bg-secondary)',
        border: '1px solid var(--border)', borderRadius: '12px',
      }}>
        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px' }}>
          💡 How Integrations Work
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.7' }}>
          <div style={{ marginBottom: '8px' }}>
            <strong>1. Enable</strong> — Toggle on the integrations you want. Some need a quick setup (like pasting a token), others work right away.
          </div>
          <div style={{ marginBottom: '8px' }}>
            <strong>2. Chat naturally</strong> — Just ask Claude what you need in plain English. No special commands or syntax required.
          </div>
          <div>
            <strong>3. Claude handles the rest</strong> — Claude figures out which tool to use, runs it, and gives you the results in its response. It's like having a smart assistant that can actually do things.
          </div>
        </div>
      </div>
    </div>
  );
}
