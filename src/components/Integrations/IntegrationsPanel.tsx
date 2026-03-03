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

// ─── IntegrationsPanel Component ─────────────────────────────────────────────

export function IntegrationsPanel() {
  const [config, setConfig] = useState<IntegrationConfig>(() => loadIntegrations());
  const [githubToken, setGithubToken] = useState(config.github?.token ?? '');
  const [showGithubToken, setShowGithubToken] = useState(false);
  const [saved, setSaved] = useState(false);

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
    setConfig(prev => ({
      ...prev,
      github: { token: githubToken.trim(), username: 'github-user' },
    }));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const integrations = [
    {
      id: 'github',
      icon: '🐙',
      name: 'GitHub',
      desc: 'Read repos, files, issues, and PRs. Create issues. Search code.',
      tools: GITHUB_TOOLS,
      color: '#6366f1',
      setup: (
        <div style={{ marginTop: '12px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '6px' }}>
            Personal Access Token (needs <code>repo</code> scope)
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                type={showGithubToken ? 'text' : 'password'}
                value={githubToken}
                onChange={e => setGithubToken(e.target.value)}
                placeholder="ghp_..."
                style={{
                  width: '100%', padding: '8px 36px 8px 12px', background: 'var(--bg-primary)',
                  border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)',
                  fontSize: '12px', fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box',
                }}
              />
              <button
                onClick={() => setShowGithubToken(p => !p)}
                style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }}
              >{showGithubToken ? '🙈' : '👁'}</button>
            </div>
            <button
              onClick={handleSaveGitHub}
              style={{
                padding: '8px 14px', background: saved ? 'rgba(34,197,94,0.15)' : 'var(--accent)',
                border: 'none', borderRadius: '8px', color: saved ? '#22c55e' : '#fff',
                fontSize: '12px', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap',
              }}
            >{saved ? '✓ Saved' : 'Save'}</button>
          </div>
          <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-tertiary)' }}>
            🔒 Stored locally in your browser only.{' '}
            <a href="https://github.com/settings/tokens/new?scopes=repo&description=ArcadIA" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
              Create token →
            </a>
          </div>
        </div>
      ),
    },
    {
      id: 'gdrive',
      icon: '📁',
      name: 'Google Drive',
      desc: 'List, read, and create Google Docs and Drive files.',
      tools: GOOGLE_DRIVE_TOOLS,
      color: '#22c55e',
      setup: (
        <div style={{ marginTop: '12px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '8px' }}>
            Connect your Google account to allow Claude to read and create Drive files.
          </div>
          <button
            onClick={() => {
              // OAuth flow — opens Google consent screen
              const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
              if (!clientId) {
                alert('Google OAuth not configured. Set VITE_GOOGLE_CLIENT_ID in your .env file.');
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
            style={{
              padding: '8px 16px', background: '#4285f4', border: 'none', borderRadius: '8px',
              color: '#fff', fontSize: '12px', cursor: 'pointer', fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: '8px',
            }}
          >
            <span>🔗</span> Connect Google Account
          </button>
          {config.gdrive?.connected && (
            <div style={{ marginTop: '8px', fontSize: '12px', color: '#22c55e' }}>
              ✓ Connected as {config.gdrive.email}
            </div>
          )}
        </div>
      ),
    },
    {
      id: 'web',
      icon: '🌐',
      name: 'Web Search & Fetch',
      desc: 'Search the web for current information and fetch URL content.',
      tools: WEB_TOOLS,
      color: '#f59e0b',
      setup: (
        <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-tertiary)' }}>
          No setup required. Claude will search the web when needed.
          <br />
          <span style={{ color: '#f59e0b' }}>⚠ Note:</span> Web search requires a backend proxy to avoid CORS. Works fully in Claude Code / server environments.
        </div>
      ),
    },
    {
      id: 'code',
      icon: '⚡',
      name: 'Code Execution',
      desc: 'Run Python, JavaScript, and shell commands. See live output.',
      tools: CODE_TOOLS,
      color: '#8b5cf6',
      setup: (
        <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-tertiary)' }}>
          No setup required. Claude will execute code in a sandboxed environment.
          <br />
          <span style={{ color: '#8b5cf6' }}>⚡ Tip:</span> Enable this for data analysis, automation, and testing tasks.
        </div>
      ),
    },
    {
      id: 'memory',
      icon: '🧠',
      name: 'Long-term Memory',
      desc: 'Claude can save and recall information across conversations.',
      tools: MEMORY_TOOLS,
      color: '#ec4899',
      setup: (
        <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-tertiary)' }}>
          No setup required. Claude will automatically save important information when asked.
          <br />
          <span style={{ color: '#ec4899' }}>💡 Tip:</span> Say "Remember that..." to save anything for future conversations.
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px', maxWidth: '700px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '6px' }}>
          🔌 Integrations
        </h2>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
          Connect external tools and services. When enabled, Claude can use these tools automatically during conversations — no copy-pasting required.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {integrations.map(integration => (
          <div
            key={integration.id}
            style={{
              background: 'var(--bg-secondary)', border: `1px solid ${isEnabled(integration.id) ? integration.color + '44' : 'var(--border)'}`,
              borderRadius: '14px', padding: '18px 20px',
              transition: 'border-color 0.2s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
              <div style={{
                width: '44px', height: '44px', borderRadius: '12px',
                background: integration.color + '20', border: `1px solid ${integration.color}33`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', flexShrink: 0,
              }}>
                {integration.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '15px' }}>{integration.name}</div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <span style={{ fontSize: '12px', color: isEnabled(integration.id) ? integration.color : 'var(--text-tertiary)', fontWeight: 600 }}>
                      {isEnabled(integration.id) ? 'Enabled' : 'Disabled'}
                    </span>
                    <div
                      onClick={() => toggleTool(integration.id)}
                      style={{
                        width: '40px', height: '22px', borderRadius: '11px',
                        background: isEnabled(integration.id) ? integration.color : 'var(--bg-tertiary)',
                        position: 'relative', cursor: 'pointer', transition: 'background 0.2s',
                        border: `1px solid ${isEnabled(integration.id) ? integration.color : 'var(--border)'}`,
                      }}
                    >
                      <div style={{
                        position: 'absolute', top: '2px',
                        left: isEnabled(integration.id) ? '20px' : '2px',
                        width: '16px', height: '16px', borderRadius: '50%',
                        background: '#fff', transition: 'left 0.2s',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                      }} />
                    </div>
                  </label>
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>{integration.desc}</div>

                {/* Tool list */}
                <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {integration.tools.map(t => (
                    <span
                      key={t.name}
                      style={{
                        fontSize: '11px', padding: '2px 8px', borderRadius: '20px',
                        background: isEnabled(integration.id) ? integration.color + '15' : 'var(--bg-tertiary)',
                        color: isEnabled(integration.id) ? integration.color : 'var(--text-tertiary)',
                        border: `1px solid ${isEnabled(integration.id) ? integration.color + '30' : 'var(--border)'}`,
                        fontFamily: 'monospace',
                      }}
                    >{t.name}</span>
                  ))}
                </div>

                {/* Setup section */}
                {isEnabled(integration.id) && integration.setup}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Summary */}
      <div style={{
        marginTop: '24px', padding: '16px 20px', background: 'var(--bg-secondary)',
        border: '1px solid var(--border)', borderRadius: '12px',
      }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
          Active Tools ({getEnabledTools(config).length})
        </div>
        {getEnabledTools(config).length === 0 ? (
          <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
            No tools enabled. Enable integrations above to let Claude use them.
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

      <div style={{ marginTop: '16px', fontSize: '12px', color: 'var(--text-tertiary)', lineHeight: '1.6' }}>
        <strong style={{ color: 'var(--text-secondary)' }}>How it works:</strong> When you enable an integration, Claude receives the tool definitions and can call them during your conversation. Tool results are automatically fed back to Claude so it can continue the task — just like Claude Code's built-in tools.
      </div>
    </div>
  );
}
