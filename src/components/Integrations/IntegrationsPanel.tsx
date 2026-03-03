import { useState, useEffect } from 'react';
import type { ToolDefinition } from '../../types';

// ─── Tool Definitions for Claude API ─────────────────────────────────────────
// These are passed to Claude as `tools` in the API request.
// Claude will call these tools during conversations when relevant.

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
};

// ─── IntegrationsPanel Component ─────────────────────────────────────────────

export function IntegrationsPanel() {
  const [config, setConfig] = useState<IntegrationConfig>(() => loadIntegrations());
  const [githubToken, setGithubToken] = useState(config.github?.token ?? '');
  const [showGithubToken, setShowGithubToken] = useState(false);
  const [saved, setSaved] = useState(false);
  const [expandedGuide, setExpandedGuide] = useState<string | null>(null);

  useEffect(() => {
    saveIntegrations(config);
  }, [config]);

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

  const handleSaveGitHub = () => {
    if (!githubToken.trim()) return;
    setConfig(prev => ({
      ...prev,
      github: { token: githubToken.trim(), username: 'github-user' },
    }));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const toggleGuide = (id: string) => {
    setExpandedGuide(prev => prev === id ? null : id);
  };

  // ─── Integration definitions with detailed setup guides ─────────────────

  const integrations = [
    {
      id: 'github',
      icon: '🐙',
      name: 'GitHub',
      desc: 'Read repos, files, issues, and PRs. Create issues. Search code across repositories.',
      tools: GITHUB_TOOLS,
      color: '#6366f1',
      difficulty: 'Easy',
      setupTime: '2 min',
      requiresToken: true,
      setup: (
        <div style={styles.setupBox}>
          <div style={styles.setupTitle}>
            <span>🔧</span> Setup Guide
            <span style={styles.badge('#6366f120', '#6366f1')}>2 min setup</span>
            {config.github?.token && <span style={styles.badge('#22c55e20', '#22c55e')}>Connected</span>}
          </div>

          {/* Step-by-step guide */}
          <div style={styles.stepRow}>
            <span style={styles.stepNumber('#6366f1')}>1</span>
            <div style={styles.stepText}>
              <strong>Create a Personal Access Token</strong> on GitHub.{' '}
              <a
                href="https://github.com/settings/tokens/new?scopes=repo&description=ArcadIA%20Editor%20-%20Claude%20Integration"
                target="_blank"
                rel="noreferrer"
                style={styles.link('#6366f1')}
              >
                Click here to open the token creation page
              </a>
            </div>
          </div>

          <div style={styles.stepRow}>
            <span style={styles.stepNumber('#6366f1')}>2</span>
            <div style={styles.stepText}>
              On the GitHub page, you'll see the token settings pre-filled:
              <ul style={{ margin: '6px 0 0 0', paddingLeft: '16px', fontSize: '12px' }}>
                <li><strong>Note:</strong> "ArcadIA Editor" (pre-filled)</li>
                <li><strong>Expiration:</strong> Choose 90 days or "No expiration"</li>
                <li><strong>Scopes:</strong> <code style={{ background: 'var(--bg-tertiary)', padding: '1px 4px', borderRadius: '3px' }}>repo</code> should be checked (pre-selected)</li>
              </ul>
            </div>
          </div>

          <div style={styles.stepRow}>
            <span style={styles.stepNumber('#6366f1')}>3</span>
            <div style={styles.stepText}>
              Click <strong>"Generate token"</strong> at the bottom of the page. Copy the token that starts with <code style={{ background: 'var(--bg-tertiary)', padding: '1px 4px', borderRadius: '3px' }}>ghp_</code>
            </div>
          </div>

          <div style={styles.stepRow}>
            <span style={styles.stepNumber('#6366f1')}>4</span>
            <div style={styles.stepText}>
              <strong>Paste your token below</strong> and click Save:
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
                style={styles.input}
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
              disabled={!githubToken.trim()}
              style={{
                ...styles.btn(saved ? '#22c55e' : githubToken.trim() ? '#6366f1' : '#6366f166'),
                cursor: githubToken.trim() ? 'pointer' : 'not-allowed',
              }}
            >{saved ? '✓ Saved!' : 'Save'}</button>
          </div>

          <div style={{ marginLeft: '32px', marginTop: '8px', fontSize: '11px', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            🔒 Your token is stored locally in your browser only. It never leaves your machine.
          </div>

          {/* Example prompts */}
          <div style={styles.examplePrompt}>
            <strong>Try saying:</strong> "List my GitHub repos" or "Show open PRs in owner/repo" or "Create an issue for the login bug in my-app"
          </div>
        </div>
      ),
    },
    {
      id: 'gdrive',
      icon: '📁',
      name: 'Google Drive',
      desc: 'List, read, and create Google Docs and Drive files directly from conversations.',
      tools: GOOGLE_DRIVE_TOOLS,
      color: '#22c55e',
      difficulty: 'Easy',
      setupTime: '1 min',
      requiresToken: false,
      setup: (
        <div style={styles.setupBox}>
          <div style={styles.setupTitle}>
            <span>🔧</span> Setup Guide
            <span style={styles.badge('#22c55e20', '#22c55e')}>1 min setup</span>
            {config.gdrive?.connected && <span style={styles.badge('#22c55e20', '#22c55e')}>Connected</span>}
          </div>

          <div style={styles.stepRow}>
            <span style={styles.stepNumber('#22c55e')}>1</span>
            <div style={styles.stepText}>
              <strong>Click the button below</strong> to connect your Google account. A popup will open asking you to sign in and grant access.
            </div>
          </div>

          <div style={styles.stepRow}>
            <span style={styles.stepNumber('#22c55e')}>2</span>
            <div style={styles.stepText}>
              <strong>Select your Google account</strong> and click "Allow" to grant ArcadIA read/write access to your Drive files.
            </div>
          </div>

          <div style={styles.stepRow}>
            <span style={styles.stepNumber('#22c55e')}>3</span>
            <div style={styles.stepText}>
              That's it! The popup will close automatically and you'll see a green "Connected" badge above.
            </div>
          </div>

          <div style={{ marginTop: '4px', marginLeft: '32px' }}>
            <button
              onClick={() => {
                const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
                if (!clientId) {
                  alert('Google OAuth is not configured yet.\n\nTo enable this:\n1. Go to https://console.cloud.google.com/apis/credentials\n2. Create an OAuth 2.0 Client ID\n3. Add VITE_GOOGLE_CLIENT_ID to your .env file\n\nContact your admin for help.');
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

          <div style={styles.infoBox('#22c55e')}>
            <strong>What permissions are granted?</strong> ArcadIA can only access files you explicitly open or create through conversations. It cannot access your entire Drive.
          </div>

          <div style={styles.examplePrompt}>
            <strong>Try saying:</strong> "List my recent Google Drive files" or "Create a Google Doc titled Q1 Report with this content..."
          </div>
        </div>
      ),
    },
    {
      id: 'web',
      icon: '🌐',
      name: 'Web Search & Fetch',
      desc: 'Search the web for current information, news, and research. Fetch and read any URL.',
      tools: WEB_TOOLS,
      color: '#f59e0b',
      difficulty: 'None',
      setupTime: 'Instant',
      requiresToken: false,
      setup: (
        <div style={styles.setupBox}>
          <div style={styles.setupTitle}>
            <span>✨</span> No Setup Required
            <span style={styles.badge('#f59e0b20', '#f59e0b')}>Ready to use</span>
          </div>

          <div style={styles.stepRow}>
            <span style={styles.stepNumber('#f59e0b')}>✓</span>
            <div style={styles.stepText}>
              <strong>Just enable the toggle above</strong> and Claude will automatically search the web when your question needs current information.
            </div>
          </div>

          <div style={styles.infoBox('#f59e0b')}>
            <strong>How it works:</strong> When you ask about current events, prices, or anything that needs up-to-date info, Claude will search the web and include the results in its response. Web search goes through the ArcadIA bridge on your machine, so no data leaves your network except the search query itself.
          </div>

          <div style={styles.examplePrompt}>
            <strong>Try saying:</strong> "What's the latest news about React 19?" or "Fetch the content from https://example.com/api-docs"
          </div>
        </div>
      ),
    },
    {
      id: 'code',
      icon: '⚡',
      name: 'Code Execution',
      desc: 'Run Python, JavaScript, and shell commands. See live output and results.',
      tools: CODE_TOOLS,
      color: '#8b5cf6',
      difficulty: 'None',
      setupTime: 'Instant',
      requiresToken: false,
      setup: (
        <div style={styles.setupBox}>
          <div style={styles.setupTitle}>
            <span>✨</span> No Setup Required
            <span style={styles.badge('#8b5cf620', '#8b5cf6')}>Ready to use</span>
          </div>

          <div style={styles.stepRow}>
            <span style={styles.stepNumber('#8b5cf6')}>✓</span>
            <div style={styles.stepText}>
              <strong>Just enable the toggle above.</strong> Claude will execute code in a sandboxed environment when needed — great for data analysis, calculations, and testing.
            </div>
          </div>

          <div style={styles.infoBox('#8b5cf6')}>
            <strong>Supported languages:</strong> Python 3, JavaScript (Node.js), and Bash shell commands. Code runs locally through Claude Code on your machine, so your data stays private.
          </div>

          <div style={styles.examplePrompt}>
            <strong>Try saying:</strong> "Run a Python script to analyze this CSV data" or "Write and test a sorting algorithm" or "Check if port 3000 is in use"
          </div>
        </div>
      ),
    },
    {
      id: 'memory',
      icon: '🧠',
      name: 'Long-term Memory',
      desc: 'Claude remembers important information across conversations for personalized assistance.',
      tools: MEMORY_TOOLS,
      color: '#ec4899',
      difficulty: 'None',
      setupTime: 'Instant',
      requiresToken: false,
      setup: (
        <div style={styles.setupBox}>
          <div style={styles.setupTitle}>
            <span>✨</span> No Setup Required
            <span style={styles.badge('#ec489920', '#ec4899')}>Ready to use</span>
          </div>

          <div style={styles.stepRow}>
            <span style={styles.stepNumber('#ec4899')}>✓</span>
            <div style={styles.stepText}>
              <strong>Just enable the toggle above.</strong> Claude will automatically save important information when you ask it to remember something, and recall it in future conversations.
            </div>
          </div>

          <div style={styles.infoBox('#ec4899')}>
            <strong>What gets saved?</strong> Only things you explicitly ask Claude to remember. Memories are stored locally in your browser and are never sent to any server. You can ask Claude to "forget" something at any time.
          </div>

          <div style={styles.examplePrompt}>
            <strong>Try saying:</strong> "Remember that my project uses React 18 with TypeScript" or "What do you remember about my preferences?" or "Forget my API key"
          </div>
        </div>
      ),
    },
  ];

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          🔌 Integrations
        </h2>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.6', margin: 0 }}>
          Connect external tools and services to supercharge Claude. Enable a tool, follow the setup steps, and start using it in your conversations.
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
          <span style={{ color: '#22c55e', fontSize: '14px' }}>●</span>
          <strong>{(config.enabledTools ?? []).length}</strong> integrations active
        </div>
        <div style={{
          padding: '8px 14px', borderRadius: '8px', background: 'var(--bg-secondary)',
          border: '1px solid var(--border)', fontSize: '12px', color: 'var(--text-secondary)',
          display: 'flex', alignItems: 'center', gap: '6px',
        }}>
          🔧 <strong>{getEnabledTools(config).length}</strong> tools available to Claude
        </div>
      </div>

      {/* Integration cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {integrations.map(integration => {
          const enabled = isEnabled(integration.id);
          const guideOpen = expandedGuide === integration.id;

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
                      {integration.requiresToken && !enabled && (
                        <span style={styles.badge('#f59e0b18', '#f59e0b')}>Requires token</span>
                      )}
                      {!integration.requiresToken && !enabled && (
                        <span style={styles.badge('#22c55e18', '#22c55e')}>No setup needed</span>
                      )}
                      {enabled && config.github?.token && integration.id === 'github' && (
                        <span style={styles.badge('#22c55e18', '#22c55e')}>Connected</span>
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

                  {/* Description */}
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>{integration.desc}</div>

                  {/* Tool pills */}
                  <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                    {integration.tools.map(t => (
                      <span key={t.name} style={styles.toolPill(integration.color, enabled)}>{t.name}</span>
                    ))}
                    {enabled && (
                      <button
                        onClick={() => toggleGuide(integration.id)}
                        style={{
                          fontSize: '11px', padding: '2px 10px', borderRadius: '20px',
                          background: 'transparent', color: integration.color,
                          border: `1px dashed ${integration.color}50`, cursor: 'pointer',
                          fontWeight: 600,
                        }}
                      >
                        {guideOpen ? 'Hide guide ▲' : 'Setup guide ▼'}
                      </button>
                    )}
                  </div>

                  {/* Setup section — shown when enabled AND guide is expanded, or always for items needing setup */}
                  {enabled && (guideOpen || (integration.requiresToken && !config.github?.token && integration.id === 'github')) && integration.setup}

                  {/* Auto-expand setup for GitHub if no token yet */}
                  {enabled && !guideOpen && integration.id === 'github' && config.github?.token && (
                    <div style={{ ...styles.examplePrompt, marginTop: '10px' }}>
                      <strong>Try saying:</strong> "List my GitHub repos" or "Show open PRs in owner/repo"
                    </div>
                  )}

                  {/* Quick example for non-token integrations when enabled */}
                  {enabled && !guideOpen && !integration.requiresToken && (
                    <div style={{ ...styles.examplePrompt, marginTop: '10px' }}>
                      <strong>Try saying:</strong>{' '}
                      {integration.id === 'web' && '"What\'s the latest news about React 19?"'}
                      {integration.id === 'code' && '"Run a Python script to calculate fibonacci numbers"'}
                      {integration.id === 'memory' && '"Remember that my project uses TypeScript"'}
                      {integration.id === 'gdrive' && '"List my recent Google Drive files"'}
                    </div>
                  )}
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
            <strong>1. Enable</strong> — Toggle on the integrations you want. Some need a quick setup (like pasting a token), others work instantly.
          </div>
          <div style={{ marginBottom: '8px' }}>
            <strong>2. Chat naturally</strong> — Just ask Claude what you need. For example, "List my GitHub repos" or "Search the web for React best practices."
          </div>
          <div>
            <strong>3. Claude handles the rest</strong> — Claude automatically detects which tool to use, calls it, and incorporates the results into its response. No commands or syntax to learn.
          </div>
        </div>
      </div>
    </div>
  );
}
