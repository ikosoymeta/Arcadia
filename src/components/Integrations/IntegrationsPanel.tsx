import { useState, useEffect, useCallback } from 'react';
import type { ToolDefinition } from '../../types';
import { getBridgeUrl } from '../../services/bridge';
import {
  type OAuthProvider,
  isAuthorized,
  getUserId,
  getUserAuth,
  saveUserAuth,
  revokeAuth,
  getAuthorizedProviders,
  initiateGoogleOAuth,
  validateGitHubToken as validateGHToken,
  OAUTH_CONFIGS,
} from '../../services/oauth';

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

export const FBSOURCE_TOOLS: ToolDefinition[] = [
  {
    name: 'fbsource_search_code',
    description: 'Search for code across Meta\'s internal fbsource repository.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Code search query (e.g. function name, class, pattern)' },
        path_filter: { type: 'string', description: 'Optional path filter (e.g. "fbcode/ads/")' },
        language: { type: 'string', description: 'Optional language filter (e.g. python, hack, cpp)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'fbsource_read_file',
    description: 'Read a file from Meta\'s internal fbsource repository.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path in fbsource (e.g. "fbcode/ads/model/config.py")' },
        revision: { type: 'string', description: 'Optional revision/commit hash (default: latest)' },
      },
      required: ['path'],
    },
  },
  {
    name: 'fbsource_list_diffs',
    description: 'List recent diffs (code changes) by a user or in a directory.',
    input_schema: {
      type: 'object',
      properties: {
        author: { type: 'string', description: 'Author username (e.g. "ikosoy")' },
        path: { type: 'string', description: 'Optional path filter' },
        limit: { type: 'number', description: 'Max number of diffs to return (default 10)' },
      },
    },
  },
  {
    name: 'fbsource_read_diff',
    description: 'Read the details and changes of a specific diff (Phabricator revision).',
    input_schema: {
      type: 'object',
      properties: {
        diff_id: { type: 'string', description: 'Diff ID (e.g. "D12345678")' },
      },
      required: ['diff_id'],
    },
  },
];

export const GMAIL_TOOLS: ToolDefinition[] = [
  {
    name: 'gmail_search',
    description: 'Search emails in Gmail using natural language or Gmail search operators.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (e.g. "from:manager subject:review")' },
        limit: { type: 'number', description: 'Max number of emails to return (default 10)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'gmail_read',
    description: 'Read the full content of a specific email by ID.',
    input_schema: {
      type: 'object',
      properties: {
        email_id: { type: 'string', description: 'Email ID or thread ID' },
      },
      required: ['email_id'],
    },
  },
  {
    name: 'gmail_draft',
    description: 'Create a draft email with the specified content.',
    input_schema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email address(es), comma-separated' },
        subject: { type: 'string', description: 'Email subject' },
        body: { type: 'string', description: 'Email body (plain text or HTML)' },
        cc: { type: 'string', description: 'Optional CC recipients' },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'gmail_summarize',
    description: 'Summarize unread emails or emails matching a query.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Optional search query to filter emails' },
        period: { type: 'string', description: 'Time period: today, this_week, this_month (default: today)' },
      },
    },
  },
];

export const GCHAT_TOOLS: ToolDefinition[] = [
  {
    name: 'gchat_send_message',
    description: 'Send a message to a Google Chat space or direct message.',
    input_schema: {
      type: 'object',
      properties: {
        space: { type: 'string', description: 'Space name or DM recipient' },
        message: { type: 'string', description: 'Message content (supports Google Chat formatting)' },
        thread: { type: 'string', description: 'Optional thread ID to reply in a thread' },
      },
      required: ['space', 'message'],
    },
  },
  {
    name: 'gchat_list_spaces',
    description: 'List Google Chat spaces the user is a member of.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max number of spaces to return (default 20)' },
      },
    },
  },
  {
    name: 'gchat_read_messages',
    description: 'Read recent messages from a Google Chat space.',
    input_schema: {
      type: 'object',
      properties: {
        space: { type: 'string', description: 'Space name or ID' },
        limit: { type: 'number', description: 'Max number of messages to return (default 20)' },
      },
      required: ['space'],
    },
  },
];

export const GSHEETS_TOOLS: ToolDefinition[] = [
  {
    name: 'gsheets_read',
    description: 'Read data from a Google Sheets spreadsheet.',
    input_schema: {
      type: 'object',
      properties: {
        spreadsheet_id: { type: 'string', description: 'Spreadsheet ID or URL' },
        range: { type: 'string', description: 'Cell range (e.g. "Sheet1!A1:D10")' },
      },
      required: ['spreadsheet_id'],
    },
  },
  {
    name: 'gsheets_write',
    description: 'Write data to a Google Sheets spreadsheet.',
    input_schema: {
      type: 'object',
      properties: {
        spreadsheet_id: { type: 'string', description: 'Spreadsheet ID or URL' },
        range: { type: 'string', description: 'Cell range to write to (e.g. "Sheet1!A1")' },
        values: { type: 'string', description: 'JSON array of row arrays to write' },
      },
      required: ['spreadsheet_id', 'range', 'values'],
    },
  },
  {
    name: 'gsheets_create',
    description: 'Create a new Google Sheets spreadsheet.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Spreadsheet title' },
        sheets: { type: 'string', description: 'Comma-separated sheet names (default: "Sheet1")' },
      },
      required: ['title'],
    },
  },
  {
    name: 'gsheets_list',
    description: 'List sheets in a spreadsheet or list recent spreadsheets.',
    input_schema: {
      type: 'object',
      properties: {
        spreadsheet_id: { type: 'string', description: 'Optional spreadsheet ID to list sheets within' },
        query: { type: 'string', description: 'Optional search query for finding spreadsheets' },
      },
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
    fbsource: FBSOURCE_TOOLS,
    gmail: GMAIL_TOOLS,
    gchat: GCHAT_TOOLS,
    gsheets: GSHEETS_TOOLS,
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
  const [checkingGithub, _setCheckingGithub] = useState(false);
  const [gdriveChecking, setGdriveChecking] = useState(false);
  const [gdriveStatus, setGdriveStatus] = useState<{ connected: boolean; driveRoot?: string; workspacePath?: string } | null>(null);
  const [mcpServers, setMcpServers] = useState<Array<{ name: string; status: string; type: string }>>([]);
  const [mcpChecking, setMcpChecking] = useState(false);
  const [reconnectingServer, setReconnectingServer] = useState<string | null>(null);
  const [_reconnectAttempts, _setReconnectAttempts] = useState(0);
  const [lastBridgeDisconnect, setLastBridgeDisconnect] = useState<number | null>(null);
  const [bridgeReconnecting, setBridgeReconnecting] = useState(false);
  const [authorizedProviders, setAuthorizedProviders] = useState<OAuthProvider[]>(() => getAuthorizedProviders());
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [_oauthSuccess, setOauthSuccess] = useState<string | null>(null);
  const [githubProfile, setGithubProfile] = useState<{ login: string; name: string; avatar_url: string } | null>(null);

  useEffect(() => {
    saveIntegrations(config);
  }, [config]);

  // Check bridge connectivity with auto-reconnect and exponential backoff
  useEffect(() => {
    let backoffMs = 5000;
    let consecutiveFailures = 0;
    const maxBackoff = 60000;

    const checkBridge = async () => {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 3000);
        const res = await fetch(`${getBridgeUrl()}/health`, { signal: ctrl.signal });
        clearTimeout(timer);
        const wasDisconnected = !bridgeConnected;
        setBridgeConnected(res.ok);
        if (res.ok) {
          consecutiveFailures = 0;
          backoffMs = 5000;
          setBridgeReconnecting(false);
          if (wasDisconnected && lastBridgeDisconnect) {
            setLastBridgeDisconnect(null);
          }
        } else {
          throw new Error('not ok');
        }
      } catch {
        consecutiveFailures++;
        if (bridgeConnected) {
          setLastBridgeDisconnect(Date.now());
        }
        setBridgeConnected(false);
        if (consecutiveFailures > 1) {
          setBridgeReconnecting(true);
          backoffMs = Math.min(backoffMs * 1.5, maxBackoff);
        }
      }
    };
    checkBridge();
    const interval = setInterval(checkBridge, 15000);
    return () => clearInterval(interval);
  }, []);

  // Listen for OAuth changes
  useEffect(() => {
    const handleOAuthChange = () => {
      setAuthorizedProviders(getAuthorizedProviders());
    };
    window.addEventListener('oauth-changed', handleOAuthChange);
    return () => window.removeEventListener('oauth-changed', handleOAuthChange);
  }, []);

  // Auto-check bridge OAuth status for Google services when bridge connects
  // This detects existing gcloud SSO tokens saved on the bridge
  useEffect(() => {
    if (!bridgeConnected) return;
    const checkBridgeOAuth = async () => {
      const providers: OAuthProvider[] = ['gdrive', 'gmail', 'gchat', 'gsheets'];
      const bridgeUrl = getBridgeUrl();
      for (const provider of providers) {
        // Skip if already authorized locally
        if (isAuthorized(provider)) continue;
        try {
          const res = await fetch(`${bridgeUrl}/v1/oauth/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider, userId: getUserId() }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.authorized && data.token) {
              saveUserAuth(provider, {
                provider,
                token: {
                  accessToken: data.token.access_token,
                  tokenType: data.token.token_type || 'Bearer',
                  expiresAt: data.token.expires_at ? data.token.expires_at * 1000 : undefined,
                  scope: data.token.scope,
                },
                profile: data.profile || data.token.profile,
                authorizedAt: data.token.authorized_at ? data.token.authorized_at * 1000 : Date.now(),
                scopes: OAUTH_CONFIGS[provider].scopes,
              });
            }
          }
        } catch { /* bridge may not support OAuth yet */ }
      }
    };
    checkBridgeOAuth();
  }, [bridgeConnected]);

  // Handle GitHub OAuth — validate token and save with profile
  const handleGitHubAuthorize = useCallback(async (token: string) => {
    setOauthLoading('github');
    setOauthError(null);
    try {
      const result = await validateGHToken(token);
      if (result.valid && result.profile) {
        setGithubProfile(result.profile as any);
        saveUserAuth('github', {
          provider: 'github',
          token: { accessToken: token, tokenType: 'bearer' },
          profile: { email: result.profile.email, name: result.profile.name || result.profile.login, avatar: result.profile.avatar_url },
          authorizedAt: Date.now(),
          scopes: ['repo', 'read:user'],
        });
        setConfig(prev => ({ ...prev, github: { token, username: result.profile!.login } }));
        setGithubTokenValid(true);
        setOauthSuccess('github');
        setTimeout(() => setOauthSuccess(null), 3000);
      } else {
        setGithubTokenValid(false);
        setOauthError('Invalid token. Please check and try again.');
      }
    } catch {
      setOauthError('Failed to validate token.');
    }
    setOauthLoading(null);
  }, []);

  // Handle Google OAuth flow via bridge
  const handleGoogleAuthorize = useCallback(async (provider: OAuthProvider) => {
    setOauthLoading(provider);
    setOauthError(null);
    try {
      const result = await initiateGoogleOAuth(provider);
      if (result.success) {
        setOauthSuccess(provider);
        setTimeout(() => setOauthSuccess(null), 3000);
      } else {
        // Provide actionable error message
        const bridgeUrl = getBridgeUrl();
        const isLocal = bridgeUrl.includes('127.0.0.1') || bridgeUrl.includes('localhost');
        const errorMsg = result.error || 'Authorization failed.';
        if (errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError') || errorMsg.includes('Connection failed')) {
          if (isLocal) {
            setOauthError(`Cannot reach bridge at ${bridgeUrl}. Make sure the ArcadIA Bridge is running on your machine (node ~/arcadia-bridge.js), or configure a remote bridge URL in Settings if your bridge runs on a devserver.`);
          } else {
            setOauthError(`Cannot reach bridge at ${bridgeUrl}. Make sure the bridge is running on that server and the port is accessible. Try: ssh to your devserver and run "node ~/arcadia-bridge.js"`);
          }
        } else {
          setOauthError(errorMsg);
        }
      }
    } catch (e: any) {
      setOauthError(e.message || 'Authorization failed.');
    }
    setOauthLoading(null);
  }, []);

  // Revoke authorization for a provider
  const handleRevoke = useCallback((provider: OAuthProvider) => {
    revokeAuth(provider);
    if (provider === 'github') {
      setGithubProfile(null);
      setGithubTokenValid(null);
      setGithubToken('');
      setConfig(prev => ({ ...prev, github: undefined }));
    }
  }, []);

  // Load GitHub profile on mount if token exists
  useEffect(() => {
    const auth = getUserAuth('github');
    if (auth?.token.accessToken) {
      validateGHToken(auth.token.accessToken).then(result => {
        if (result.valid && result.profile) {
          setGithubProfile(result.profile as any);
        }
      });
    }
  }, []);

  // Check MCP server status via bridge
  const checkMcpStatus = useCallback(async () => {
    if (!bridgeConnected) return;
    setMcpChecking(true);
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(`${getBridgeUrl()}/v1/mcp/status`, { signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        setMcpServers(data.servers || []);
      }
    } catch { /* ignore */ }
    setMcpChecking(false);
  }, [bridgeConnected]);

  // Auto-check MCP status when bridge connects
  useEffect(() => {
    if (bridgeConnected) checkMcpStatus();
  }, [bridgeConnected, checkMcpStatus]);

  // Restart an MCP server
  const restartMcpServer = useCallback(async (serverName: string) => {
    setReconnectingServer(serverName);
    try {
      const res = await fetch(`${getBridgeUrl()}/v1/mcp/restart`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ server: serverName }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          // Refresh MCP status after restart
          setTimeout(() => checkMcpStatus(), 2000);
        }
      }
    } catch { /* ignore */ }
    setReconnectingServer(null);
  }, [checkMcpStatus]);

  // Check Google Drive status via bridge
  const checkGDriveStatus = useCallback(async () => {
    setGdriveChecking(true);
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(`${getBridgeUrl()}/v1/gdrive/status`, { signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        setGdriveStatus(data);
        if (data.connected) {
          setConfig(prev => ({ ...prev, gdrive: { connected: true, email: 'via bridge' } }));
        }
      } else {
        setGdriveStatus({ connected: false });
      }
    } catch {
      setGdriveStatus({ connected: false });
    }
    setGdriveChecking(false);
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
        if (config.gdrive?.connected && gdriveStatus?.connected) return 'ready';
        if (config.gdrive?.connected) return 'ready';
        return 'needs_setup';
      case 'web':
      case 'code':
        // These work through Claude Code which runs via the bridge
        return bridgeConnected ? 'ready' : 'needs_setup';
      case 'memory':
        // Memory is stored locally, always ready when enabled
        return 'ready';
      case 'fbsource': {
        const fbServer = mcpServers.find(s => s.type === 'fbsource');
        if (fbServer?.status === 'running') return 'ready';
        return bridgeConnected ? 'needs_setup' : 'needs_setup';
      }
      case 'gmail':
      case 'gchat':
        return bridgeConnected ? 'ready' : 'needs_setup';
      case 'gsheets':
        return bridgeConnected ? 'ready' : 'needs_setup';
      default:
        return 'ready';
    }
  }, [config, bridgeConnected, githubTokenValid, authorizedProviders]);

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
    // Use the OAuth-aware flow that validates and saves profile
    await handleGitHubAuthorize(githubToken.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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
      longDesc: 'Connect your GitHub account to let Claude browse your repositories, read files, create issues, list pull requests, and search code — all through natural conversation.',
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
          {/* Manus Connector-style header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={styles.setupTitle}>
              <span>🔗</span> Connect GitHub
            </div>
            {isAuthorized('github') ? (
              <span style={styles.badge('#22c55e20', '#22c55e')}>✓ Connected</span>
            ) : (
              <span style={styles.badge('#f59e0b18', '#f59e0b')}>Not connected</span>
            )}
          </div>

          {/* Connected state — profile card with disconnect */}
          {githubProfile && githubTokenValid === true ? (
            <div style={{ padding: '14px 16px', borderRadius: '10px', background: '#22c55e08', border: '1px solid #22c55e20' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <img src={githubProfile.avatar_url} alt="" style={{ width: '40px', height: '40px', borderRadius: '50%', border: '2px solid #22c55e40' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{githubProfile.name || githubProfile.login}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>@{githubProfile.login} · Authorized</div>
                </div>
                <button
                  onClick={() => handleRevoke('github')}
                  style={{ ...styles.btn('#ef444420'), color: '#ef4444', border: '1px solid #ef444440', background: 'transparent', fontSize: '12px', padding: '6px 14px' }}
                >
                  Disconnect
                </button>
              </div>
              <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--text-tertiary)' }}>
                🔒 Authorization saved for this user. Token stored locally in your browser.
              </div>
            </div>
          ) : (
            /* Not connected — one-click connect flow */
            <>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'stretch' }}>
                <button
                  onClick={() => window.open('https://github.com/settings/tokens/new?scopes=repo,read:user,read:org&description=ArcadIA%20Editor', '_blank')}
                  style={{ ...styles.btn('#6366f1'), flex: 'none', fontSize: '14px', padding: '12px 20px', borderRadius: '10px' }}
                >
                  🔗 Connect GitHub
                </button>
                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', lineHeight: '1.4' }}>
                  Opens GitHub's token page. Generate a token and paste it below.
                </div>
              </div>

              {/* Token input */}
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <input
                    type={showGithubToken ? 'text' : 'password'}
                    value={githubToken}
                    onChange={e => setGithubToken(e.target.value)}
                    placeholder="Paste your token here (ghp_...)"
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
                >{checkingGithub ? 'Verifying...' : saved ? '✓ Connected!' : 'Connect'}</button>
              </div>

              {githubTokenValid === false && config.github?.token && (
                <div style={{ marginTop: '8px', fontSize: '12px', color: '#ef4444' }}>
                  ✗ Token invalid. Please check it or generate a new one.
                </div>
              )}

              {oauthError && oauthLoading === null && (
                <div style={{ marginTop: '8px', fontSize: '12px', color: '#ef4444' }}>{oauthError}</div>
              )}
            </>
          )}
        </div>
      ),
    },
    {
      id: 'gdrive',
      icon: '📁',
      name: 'Google Drive',
      shortDesc: 'Browse, read, and create documents in your Google Drive.',
      longDesc: 'Access your Google Drive files through the ArcadIA Bridge. The bridge reads files directly from your locally-mounted Google Drive — no OAuth or cloud API setup needed. Just have Google Drive for Desktop installed and the bridge running.',
      whatYouCanDo: [
        '"List my recent Drive files" — browse your documents',
        '"Read my Q1 Report doc" — open and read any file',
        '"Create a doc titled Meeting Notes" — make new documents',
      ],
      tools: GOOGLE_DRIVE_TOOLS,
      color: '#22c55e',
      requiresSetup: true,
      requirements: [
        { label: 'ArcadIA Bridge running', met: bridgeConnected },
        { label: 'Google Drive for Desktop installed', met: !!gdriveStatus?.connected },
      ],
      setup: (
        <div style={styles.setupBox}>
          {/* Manus Connector-style header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={styles.setupTitle}>
              <span>🔗</span> Connect Google Drive
            </div>
            {gdriveStatus?.connected ? (
              <span style={styles.badge('#22c55e20', '#22c55e')}>✓ Connected</span>
            ) : (
              <span style={styles.badge('#f59e0b18', '#f59e0b')}>Not connected</span>
            )}
          </div>

          {/* Connected state */}
          {gdriveStatus?.connected ? (
            <div style={{ padding: '14px 16px', borderRadius: '10px', background: '#22c55e08', border: '1px solid #22c55e20' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#22c55e18', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', border: '2px solid #22c55e40' }}>📁</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>Google Drive Connected</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {gdriveStatus.driveRoot ? `Mount: ${gdriveStatus.driveRoot}` : 'Via ArcadIA Bridge'}
                  </div>
                </div>
                <button
                  onClick={checkGDriveStatus}
                  disabled={gdriveChecking}
                  style={{ ...styles.btn('#22c55e'), fontSize: '12px', padding: '6px 14px' }}
                >
                  {gdriveChecking ? 'Checking...' : '↻ Refresh'}
                </button>
              </div>
              {gdriveStatus?.workspacePath && (
                <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  📂 Second Brain workspace: <code style={{ background: 'var(--bg-primary)', padding: '1px 4px', borderRadius: '3px', fontSize: '11px' }}>{gdriveStatus.workspacePath}</code>
                </div>
              )}
              <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-tertiary)' }}>
                🔒 All file access happens locally through the bridge. No data sent to cloud APIs.
              </div>
            </div>
          ) : (
            /* Not connected — one-click connect flow */
            <>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <button
                  onClick={async () => {
                    if (bridgeConnected) {
                      // Try direct bridge detection first
                      checkGDriveStatus();
                    } else {
                      // Attempt OAuth flow via bridge anyway — bridge might be reachable but health check timing was off
                      handleGoogleAuthorize('gdrive');
                    }
                  }}
                  disabled={gdriveChecking || oauthLoading === 'gdrive'}
                  style={{ ...styles.btn('#22c55e'), flex: 'none', fontSize: '14px', padding: '12px 20px', borderRadius: '10px' }}
                >
                  {gdriveChecking || oauthLoading === 'gdrive' ? '⟳ Connecting...' : '🔗 Connect Google Drive'}
                </button>
                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', lineHeight: '1.4' }}>
                  {bridgeConnected ? 'Requires Google Drive for Desktop + ArcadIA Bridge' : 'Authorizes via Google Workspace SSO through the bridge'}
                </div>
              </div>

              {gdriveStatus && !gdriveStatus.connected && (
                <div style={{ marginTop: '12px', padding: '12px 14px', borderRadius: '8px', background: '#f59e0b08', border: '1px solid #f59e0b20' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#f59e0b', marginBottom: '8px' }}>⚠ Google Drive not detected</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                    <div style={{ marginBottom: '4px' }}>1. <a href="https://www.google.com/drive/download/" target="_blank" rel="noopener" style={{ color: '#22c55e', textDecoration: 'underline' }}>Install Google Drive for Desktop</a> and sign in</div>
                    <div style={{ marginBottom: '4px' }}>2. Make sure the ArcadIA Bridge is running</div>
                    <div>3. Click "Connect Google Drive" again</div>
                  </div>
                </div>
              )}
            </>
          )}
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
    {
      id: 'fbsource',
      icon: '🔷',
      name: 'fbsource (Meta Source Control)',
      shortDesc: 'Search code, read files, and review diffs in Meta\'s internal repository.',
      longDesc: 'Connect to Meta\'s internal source control (fbsource) through Claude Code\'s MCP server. Search across the entire codebase, read files, list recent diffs, and review Phabricator revisions — all through natural conversation. Requires the fbsource MCP server to be configured in Claude Code.',
      whatYouCanDo: [
        '"Search fbsource for AdAccountService" — find code across the monorepo',
        '"Read fbcode/ads/model/config.py" — view any file in fbsource',
        '"Show my recent diffs" — list your Phabricator revisions',
        '"Review diff D12345678" — read diff details and changes',
      ],
      tools: FBSOURCE_TOOLS,
      color: '#3b82f6',
      requiresSetup: true,
      requirements: [
        { label: 'ArcadIA Bridge running', met: bridgeConnected },
        { label: 'fbsource MCP server configured', met: mcpServers.some(s => s.type === 'fbsource' && s.status === 'running') },
      ],
      setup: (
        <div style={styles.setupBox}>
          <div style={styles.setupTitle}>
            <span>🔧</span> Setup Guide
            <span style={styles.badge('#3b82f620', '#3b82f6')}>MCP Server</span>
            {mcpServers.some(s => s.type === 'fbsource' && s.status === 'running') && (
              <span style={styles.badge('#22c55e20', '#22c55e')}>Connected</span>
            )}
          </div>

          <div style={styles.infoBox('#3b82f6')}>
            <strong>How does this work?</strong> fbsource access is provided through Claude Code\'s MCP (Model Context Protocol) server system. The fbsource MCP server connects Claude to Meta\'s internal source control, enabling code search, file reading, and diff review.
          </div>

          <div style={{ marginTop: '12px' }}>
            <div style={styles.stepRow}>
              <span style={styles.stepNumber('#3b82f6')}>1</span>
              <div style={styles.stepText}>
                <strong>Ensure Claude Code is installed</strong> on your devserver or local machine with Meta authentication configured.
              </div>
            </div>

            <div style={styles.stepRow}>
              <span style={styles.stepNumber('#3b82f6')}>2</span>
              <div style={styles.stepText}>
                <strong>Add the fbsource MCP server</strong> to Claude Code:
                <code style={{ display: 'block', marginTop: '6px', padding: '8px 12px', background: 'var(--bg-primary)', borderRadius: '6px', fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-primary)', whiteSpace: 'pre-wrap' as const }}>
                  claude mcp add fbsource
                </code>
              </div>
            </div>

            <div style={styles.stepRow}>
              <span style={styles.stepNumber('#3b82f6')}>3</span>
              <div style={styles.stepText}>
                <strong>Start the ArcadIA Bridge</strong> — the bridge will automatically detect the fbsource MCP server.
              </div>
            </div>
          </div>

          {/* MCP Server Status */}
          <div style={{ marginTop: '12px', marginLeft: '32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <button
                onClick={checkMcpStatus}
                disabled={mcpChecking || !bridgeConnected}
                style={styles.btn(mcpChecking ? '#3b82f688' : '#3b82f6')}
              >
                {mcpChecking ? 'Checking...' : '🔍 Check MCP Status'}
              </button>
              {mcpServers.some(s => s.type === 'fbsource') && (
                <button
                  onClick={() => {
                    const fb = mcpServers.find(s => s.type === 'fbsource');
                    if (fb) restartMcpServer(fb.name);
                  }}
                  disabled={reconnectingServer !== null}
                  style={{ ...styles.btn('#f59e0b'), fontSize: '12px', padding: '8px 12px' }}
                >
                  {reconnectingServer ? '⟳ Restarting...' : '⟳ Restart Server'}
                </button>
              )}
            </div>
            {mcpServers.some(s => s.type === 'fbsource') && (
              <div style={{ marginTop: '8px', fontSize: '12px', color: mcpServers.find(s => s.type === 'fbsource')?.status === 'running' ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
                {mcpServers.find(s => s.type === 'fbsource')?.status === 'running'
                  ? '✓ fbsource MCP server is running'
                  : '✗ fbsource MCP server is not running — click Restart to reconnect'}
              </div>
            )}
          </div>

          <div style={{ ...styles.infoBox('#3b82f6'), marginTop: '12px' }}>
            <strong>Auto-reconnect:</strong> If the fbsource server connection drops (the "Server connections interrupted" dialog), ArcadIA will automatically detect this and offer a one-click restart. The bridge monitors MCP server health every 30 seconds.
          </div>
        </div>
      ),
    },
    {
      id: 'gmail',
      icon: '📧',
      name: 'Gmail',
      shortDesc: 'Search, read, and draft emails through natural conversation.',
      longDesc: 'Access your Gmail through Claude Code\'s capabilities. Search emails, read message content, create drafts, and get daily email summaries — all by chatting naturally. Email access goes through the bridge on your machine, keeping your data private.',
      whatYouCanDo: [
        '"Show my unread emails from today" — quick inbox summary',
        '"Find emails from John about the Q1 report" — search by sender/subject',
        '"Draft a reply to the last email from my manager" — compose emails',
        '"Summarize this week\'s important emails" — weekly digest',
      ],
      tools: GMAIL_TOOLS,
      color: '#ea4335',
      requiresSetup: true,
      requirements: [
        { label: 'ArcadIA Bridge running', met: bridgeConnected },
        { label: 'Google Workspace account', met: true },
      ],
      setup: (
        <div style={styles.setupBox}>
          {/* Manus Connector-style header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={styles.setupTitle}>
              <span>🔗</span> Connect Gmail
            </div>
            {isAuthorized('gmail') ? (
              <span style={styles.badge('#22c55e20', '#22c55e')}>✓ Connected</span>
            ) : (
              <span style={styles.badge('#f59e0b18', '#f59e0b')}>Not connected</span>
            )}
          </div>

          {/* Connected state */}
          {isAuthorized('gmail') ? (
            <div style={{ padding: '14px 16px', borderRadius: '10px', background: '#22c55e08', border: '1px solid #22c55e20' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#ea433518', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', border: '2px solid #ea433540' }}>📧</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>Gmail Connected</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Via Google Workspace SSO · Authorized</div>
                </div>
                <button
                  onClick={() => handleRevoke('gmail')}
                  style={{ ...styles.btn('#ef444420'), color: '#ef4444', border: '1px solid #ef444440', background: 'transparent', fontSize: '12px', padding: '6px 14px' }}
                >
                  Disconnect
                </button>
              </div>
              <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-tertiary)' }}>
                🔒 Authorization saved for this user. Email access happens locally through the bridge.
              </div>
            </div>
          ) : (
            /* Not connected — one-click connect flow */
            <>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <button
                  onClick={() => handleGoogleAuthorize('gmail')}
                  disabled={oauthLoading === 'gmail'}
                  style={{ ...styles.btn(oauthLoading === 'gmail' ? '#ea433588' : '#ea4335'), flex: 'none', fontSize: '14px', padding: '12px 20px', borderRadius: '10px' }}
                >
                  {oauthLoading === 'gmail' ? '⟳ Connecting...' : '🔗 Connect Gmail'}
                </button>
                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', lineHeight: '1.4' }}>
                  Authorizes via Google Workspace SSO through the bridge
                </div>
              </div>

              {!bridgeConnected && (
                <div style={{ marginTop: '10px', padding: '10px 12px', borderRadius: '8px', background: '#f59e0b08', border: '1px solid #f59e0b20', fontSize: '12px', color: '#f59e0b', lineHeight: '1.5' }}>
                  ⚠ Bridge not detected. Make sure the ArcadIA Bridge is running, or <button onClick={() => { const settingsBtn = document.querySelector('[data-nav="settings"]') as HTMLElement; if (settingsBtn) settingsBtn.click(); }} style={{ color: '#3b82f6', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', padding: 0, font: 'inherit' }}>configure a remote bridge</button> in Settings. The Connect button will still attempt authorization.
                </div>
              )}

              {oauthError && oauthLoading === null && (
                <div style={{ marginTop: '10px', fontSize: '12px', color: '#ef4444' }}>{oauthError}</div>
              )}
            </>
          )}
        </div>
      ),
    },
    {
      id: 'gchat',
      icon: '💬',
      name: 'Google Chat',
      shortDesc: 'Send messages and read conversations in Google Chat spaces.',
      longDesc: 'Interact with Google Chat through Claude Code. Send messages to spaces, read recent conversations, and manage your Chat presence — all through natural conversation with Claude. Works through the bridge with your Google Workspace authentication.',
      whatYouCanDo: [
        '"Send a message to the LDAR team space" — post to Chat spaces',
        '"What\'s the latest in the engineering channel?" — read recent messages',
        '"List my Google Chat spaces" — see all your spaces',
      ],
      tools: GCHAT_TOOLS,
      color: '#00ac47',
      requiresSetup: true,
      requirements: [
        { label: 'ArcadIA Bridge running', met: bridgeConnected },
        { label: 'Google Workspace account', met: true },
      ],
      setup: (
        <div style={styles.setupBox}>
          {/* Manus Connector-style header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={styles.setupTitle}>
              <span>🔗</span> Connect Google Chat
            </div>
            {isAuthorized('gchat') ? (
              <span style={styles.badge('#22c55e20', '#22c55e')}>✓ Connected</span>
            ) : (
              <span style={styles.badge('#f59e0b18', '#f59e0b')}>Not connected</span>
            )}
          </div>

          {/* Connected state */}
          {isAuthorized('gchat') ? (
            <div style={{ padding: '14px 16px', borderRadius: '10px', background: '#22c55e08', border: '1px solid #22c55e20' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#00ac4718', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', border: '2px solid #00ac4740' }}>💬</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>Google Chat Connected</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Via Google Workspace SSO · Authorized</div>
                </div>
                <button
                  onClick={() => handleRevoke('gchat')}
                  style={{ ...styles.btn('#ef444420'), color: '#ef4444', border: '1px solid #ef444440', background: 'transparent', fontSize: '12px', padding: '6px 14px' }}
                >
                  Disconnect
                </button>
              </div>
              <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-tertiary)' }}>
                🔒 Authorization saved for this user. Chat access happens locally through the bridge.
              </div>
            </div>
          ) : (
            /* Not connected — one-click connect flow */
            <>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <button
                  onClick={() => handleGoogleAuthorize('gchat')}
                  disabled={oauthLoading === 'gchat'}
                  style={{ ...styles.btn(oauthLoading === 'gchat' ? '#00ac4788' : '#00ac47'), flex: 'none', fontSize: '14px', padding: '12px 20px', borderRadius: '10px' }}
                >
                  {oauthLoading === 'gchat' ? '⟳ Connecting...' : '🔗 Connect Google Chat'}
                </button>
                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', lineHeight: '1.4' }}>
                  Authorizes via Google Workspace SSO through the bridge
                </div>
              </div>

              {!bridgeConnected && (
                <div style={{ marginTop: '10px', padding: '10px 12px', borderRadius: '8px', background: '#f59e0b08', border: '1px solid #f59e0b20', fontSize: '12px', color: '#f59e0b', lineHeight: '1.5' }}>
                  ⚠ Bridge not detected. Make sure the ArcadIA Bridge is running, or configure a remote bridge in Settings. The Connect button will still attempt authorization.
                </div>
              )}

              {oauthError && oauthLoading === null && (
                <div style={{ marginTop: '10px', fontSize: '12px', color: '#ef4444' }}>{oauthError}</div>
              )}
            </>
          )}
        </div>
      ),
    },
    {
      id: 'gsheets',
      icon: '📊',
      name: 'Google Sheets',
      shortDesc: 'Read, write, and create spreadsheets through natural conversation.',
      longDesc: 'Access Google Sheets through Claude Code. Read spreadsheet data, write to cells, create new spreadsheets, and analyze data — all by chatting naturally. Works through the bridge with your Google Workspace authentication.',
      whatYouCanDo: [
        '"Read the data from my Q1 Budget spreadsheet" — fetch spreadsheet data',
        '"Create a new spreadsheet for project tracking" — create sheets',
        '"Update cell B5 with the new total" — write to specific cells',
        '"List my recent spreadsheets" — browse your sheets',
      ],
      tools: GSHEETS_TOOLS,
      color: '#0f9d58',
      requiresSetup: true,
      requirements: [
        { label: 'ArcadIA Bridge running', met: bridgeConnected },
        { label: 'Google Workspace account', met: true },
      ],
      setup: (
        <div style={styles.setupBox}>
          {/* Manus Connector-style header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={styles.setupTitle}>
              <span>🔗</span> Connect Google Sheets
            </div>
            {isAuthorized('gsheets') ? (
              <span style={styles.badge('#22c55e20', '#22c55e')}>✓ Connected</span>
            ) : (
              <span style={styles.badge('#f59e0b18', '#f59e0b')}>Not connected</span>
            )}
          </div>

          {/* Connected state */}
          {isAuthorized('gsheets') ? (
            <div style={{ padding: '14px 16px', borderRadius: '10px', background: '#22c55e08', border: '1px solid #22c55e20' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#0f9d5818', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', border: '2px solid #0f9d5840' }}>📊</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>Google Sheets Connected</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Via Google Workspace SSO · Authorized</div>
                </div>
                <button
                  onClick={() => handleRevoke('gsheets')}
                  style={{ ...styles.btn('#ef444420'), color: '#ef4444', border: '1px solid #ef444440', background: 'transparent', fontSize: '12px', padding: '6px 14px' }}
                >
                  Disconnect
                </button>
              </div>
              <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-tertiary)' }}>
                🔒 Authorization saved for this user. Spreadsheet access happens locally through the bridge.
              </div>
            </div>
          ) : (
            /* Not connected — one-click connect flow */
            <>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <button
                  onClick={() => handleGoogleAuthorize('gsheets')}
                  disabled={oauthLoading === 'gsheets'}
                  style={{ ...styles.btn(oauthLoading === 'gsheets' ? '#0f9d5888' : '#0f9d58'), flex: 'none', fontSize: '14px', padding: '12px 20px', borderRadius: '10px' }}
                >
                  {oauthLoading === 'gsheets' ? '⟳ Connecting...' : '🔗 Connect Google Sheets'}
                </button>
                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', lineHeight: '1.4' }}>
                  Authorizes via Google Workspace SSO through the bridge
                </div>
              </div>

              {!bridgeConnected && (
                <div style={{ marginTop: '10px', padding: '10px 12px', borderRadius: '8px', background: '#f59e0b08', border: '1px solid #f59e0b20', fontSize: '12px', color: '#f59e0b', lineHeight: '1.5' }}>
                  ⚠ Bridge not detected. Make sure the ArcadIA Bridge is running, or configure a remote bridge in Settings. The Connect button will still attempt authorization.
                </div>
              )}

              {oauthError && oauthLoading === null && (
                <div style={{ marginTop: '10px', fontSize: '12px', color: '#ef4444' }}>{oauthError}</div>
              )}
            </>
          )}
        </div>
      ),
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
          <strong style={{ color: '#ef4444' }}>Bridge not detected.</strong>
          {bridgeReconnecting && <span style={{ color: '#f59e0b', marginLeft: '8px' }}>⟳ Auto-reconnecting...</span>}
          {' '}Some integrations require the ArcadIA Bridge to be running on your machine. Start it with:
          <code style={{ display: 'block', marginTop: '8px', padding: '8px 12px', background: 'var(--bg-primary)', borderRadius: '6px', fontSize: '12px', fontFamily: 'monospace', color: 'var(--text-primary)' }}>
            node ~/arcadia-bridge.js
          </code>
          {lastBridgeDisconnect && (
            <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-tertiary)' }}>
              Last connected: {new Date(lastBridgeDisconnect).toLocaleTimeString()} · Auto-retry every 15s with backoff
            </div>
          )}
        </div>
      )}

      {/* MCP Server Health Monitor */}
      {bridgeConnected && mcpServers.length > 0 && (
        <div style={{
          marginBottom: '16px', padding: '12px 16px', borderRadius: '10px',
          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          fontSize: '13px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              🔌 MCP Server Connections
            </div>
            <button
              onClick={checkMcpStatus}
              disabled={mcpChecking}
              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', color: 'var(--text-secondary)', cursor: 'pointer' }}
            >
              {mcpChecking ? 'Checking...' : '↻ Refresh'}
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {mcpServers.map(server => (
              <div key={server.name} style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '4px 10px', borderRadius: '6px',
                background: server.status === 'running' ? '#22c55e10' : '#ef444410',
                border: `1px solid ${server.status === 'running' ? '#22c55e30' : '#ef444430'}`,
                fontSize: '12px',
              }}>
                <span style={{ color: server.status === 'running' ? '#22c55e' : '#ef4444', fontSize: '10px' }}>●</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{server.name}</span>
                <span style={{ color: 'var(--text-tertiary)' }}>{server.status}</span>
                {server.status !== 'running' && (
                  <button
                    onClick={() => restartMcpServer(server.name)}
                    disabled={reconnectingServer === server.name}
                    style={{ background: 'none', border: 'none', color: '#f59e0b', cursor: 'pointer', fontSize: '11px', fontWeight: 600, padding: '0 2px' }}
                  >
                    {reconnectingServer === server.name ? '...' : '↻ Restart'}
                  </button>
                )}
              </div>
            ))}
          </div>
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
            <strong>1. Connect</strong> — Click the Connect button on any integration. For GitHub, paste a token. For Google services, authorize via your Workspace SSO. Authorization is saved per-user for future sessions.
          </div>
          <div style={{ marginBottom: '8px' }}>
            <strong>2. Chat naturally</strong> — Just ask Claude what you need in plain English. No special commands or syntax required.
          </div>
          <div>
            <strong>3. Claude handles the rest</strong> — Claude figures out which tool to use, runs it, and gives you the results in its response. Your authorization decisions are remembered across sessions.
          </div>
        </div>
      </div>
    </div>
  );
}
