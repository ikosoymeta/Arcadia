/**
 * OAuth Authorization Service for ArcadIA Integrations
 * 
 * Manages OAuth flows for GitHub, Google Drive, Google Sheets, and Google Chat.
 * Since ArcadIA is a static frontend, OAuth flows use:
 * 1. Popup-based authorization for GitHub (device flow / token)
 * 2. Bridge-mediated OAuth for Google services (bridge handles token exchange)
 * 3. Per-user persistence in localStorage with user ID keying
 * 
 * Auth decisions are saved per-user so they persist across sessions.
 */

import { getBridgeUrl } from './bridge';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface OAuthToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string;
  tokenType?: string;
}

export interface UserAuth {
  userId: string;
  provider: string;
  token: OAuthToken;
  profile?: {
    email?: string;
    name?: string;
    avatar?: string;
  };
  authorizedAt: number;
  lastUsed?: number;
  scopes: string[];
}

export type OAuthProvider = 'github' | 'gdrive' | 'gsheets' | 'gmail' | 'gchat';

export interface OAuthConfig {
  provider: OAuthProvider;
  clientId: string;
  authUrl: string;
  scopes: string[];
  redirectUri: string;
  label: string;
  icon: string;
}

// ─── OAuth Provider Configurations ───────────────────────────────────────────

// GitHub OAuth App — uses device flow for static apps
const GITHUB_OAUTH: OAuthConfig = {
  provider: 'github',
  clientId: '', // Will be populated from bridge config
  authUrl: 'https://github.com/login/oauth/authorize',
  scopes: ['repo', 'read:user', 'read:org'],
  redirectUri: '', // Dynamic based on current origin
  label: 'GitHub',
  icon: '🐙',
};

// Google OAuth — shared config for all Google services
const GOOGLE_BASE_AUTH = {
  clientId: '', // Will be populated from bridge config
  authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  redirectUri: '',
};

const GOOGLE_DRIVE_OAUTH: OAuthConfig = {
  ...GOOGLE_BASE_AUTH,
  provider: 'gdrive',
  scopes: ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/drive.file'],
  label: 'Google Drive',
  icon: '📁',
};

const GOOGLE_SHEETS_OAUTH: OAuthConfig = {
  ...GOOGLE_BASE_AUTH,
  provider: 'gsheets',
  scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.file'],
  label: 'Google Sheets',
  icon: '📊',
};

const GMAIL_OAUTH: OAuthConfig = {
  ...GOOGLE_BASE_AUTH,
  provider: 'gmail',
  scopes: ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.compose'],
  label: 'Gmail',
  icon: '📧',
};

const GCHAT_OAUTH: OAuthConfig = {
  ...GOOGLE_BASE_AUTH,
  provider: 'gchat',
  scopes: ['https://www.googleapis.com/auth/chat.messages', 'https://www.googleapis.com/auth/chat.spaces.readonly'],
  label: 'Google Chat',
  icon: '💬',
};

export const OAUTH_CONFIGS: Record<OAuthProvider, OAuthConfig> = {
  github: GITHUB_OAUTH,
  gdrive: GOOGLE_DRIVE_OAUTH,
  gsheets: GOOGLE_SHEETS_OAUTH,
  gmail: GMAIL_OAUTH,
  gchat: GCHAT_OAUTH,
};

// ─── Storage Keys ────────────────────────────────────────────────────────────

const AUTH_STORAGE_KEY = 'arcadia-oauth-tokens';
const USER_ID_KEY = 'arcadia-user-id';

/** Get or create a persistent user ID */
export function getUserId(): string {
  let userId = localStorage.getItem(USER_ID_KEY);
  if (!userId) {
    userId = `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(USER_ID_KEY, userId);
  }
  return userId;
}

// ─── Token Storage ───────────────────────────────────────────────────────────

interface AuthStore {
  [userId: string]: {
    [provider: string]: UserAuth;
  };
}

function loadAuthStore(): AuthStore {
  try {
    return JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function saveAuthStore(store: AuthStore): void {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(store));
}

/** Save an auth token for the current user */
export function saveUserAuth(provider: OAuthProvider, auth: Omit<UserAuth, 'userId'>): void {
  const userId = getUserId();
  const store = loadAuthStore();
  if (!store[userId]) store[userId] = {};
  store[userId][provider] = { ...auth, userId };
  saveAuthStore(store);
  window.dispatchEvent(new CustomEvent('oauth-changed', { detail: { provider, userId } }));
}

/** Get auth for the current user and provider */
export function getUserAuth(provider: OAuthProvider): UserAuth | null {
  const userId = getUserId();
  const store = loadAuthStore();
  const auth = store[userId]?.[provider];
  if (!auth) return null;
  
  // Check if token is expired (with 5 min buffer)
  if (auth.token.expiresAt && auth.token.expiresAt < Date.now() - 300000) {
    return { ...auth, token: { ...auth.token } }; // Return it but mark as potentially expired
  }
  return auth;
}

/** Check if the current user has authorized a provider */
export function isAuthorized(provider: OAuthProvider): boolean {
  const auth = getUserAuth(provider);
  if (!auth) return false;
  // If there's an expiry and it's passed, not authorized
  if (auth.token.expiresAt && auth.token.expiresAt < Date.now()) return false;
  return !!auth.token.accessToken;
}

/** Revoke authorization for a provider */
export function revokeAuth(provider: OAuthProvider): void {
  const userId = getUserId();
  const store = loadAuthStore();
  if (store[userId]) {
    delete store[userId][provider];
    saveAuthStore(store);
  }
  window.dispatchEvent(new CustomEvent('oauth-changed', { detail: { provider, userId } }));
}

/** Get all authorized providers for the current user */
export function getAuthorizedProviders(): OAuthProvider[] {
  const userId = getUserId();
  const store = loadAuthStore();
  const userAuths = store[userId];
  if (!userAuths) return [];
  return Object.keys(userAuths).filter(p => isAuthorized(p as OAuthProvider)) as OAuthProvider[];
}

/** Update last used timestamp */
export function touchAuth(provider: OAuthProvider): void {
  const userId = getUserId();
  const store = loadAuthStore();
  if (store[userId]?.[provider]) {
    store[userId][provider].lastUsed = Date.now();
    saveAuthStore(store);
  }
}

// ─── OAuth Flow Helpers ──────────────────────────────────────────────────────

/** 
 * Initiate GitHub OAuth via personal access token (PAT) flow.
 * Opens GitHub's token creation page with pre-filled scopes.
 * Returns the URL to open.
 */
export function getGitHubAuthUrl(): string {
  const scopes = GITHUB_OAUTH.scopes.join(',');
  return `https://github.com/settings/tokens/new?scopes=${scopes}&description=ArcadIA%20Editor%20-%20Claude%20Integration`;
}

/**
 * Initiate Google OAuth via bridge-mediated flow.
 * The bridge handles the server-side token exchange.
 * Returns a promise that resolves when auth is complete.
 */
export async function initiateGoogleOAuth(provider: OAuthProvider): Promise<{ success: boolean; error?: string }> {
  const bridgeUrl = getBridgeUrl();
  
  try {
    // Step 1: Ask bridge to generate an OAuth URL
    const response = await fetch(`${bridgeUrl}/v1/oauth/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider,
        scopes: OAUTH_CONFIGS[provider].scopes,
        userId: getUserId(),
      }),
    });
    
    if (!response.ok) {
      // Bridge doesn't support OAuth endpoint — fall back to manual flow
      return { success: false, error: 'Bridge OAuth not available. Using manual setup.' };
    }
    
    const data = await response.json();
    
    // If bridge used gcloud SSO and already has a valid token
    if (data.authorized && data.method === 'gcloud_sso') {
      saveUserAuth(provider, {
        provider,
        token: {
          accessToken: data.token.access_token,
          tokenType: data.token.token_type || 'Bearer',
          expiresAt: data.token.expires_at ? data.token.expires_at * 1000 : undefined,
          scope: data.token.scope,
        },
        profile: data.profile,
        authorizedAt: Date.now(),
        scopes: OAUTH_CONFIGS[provider].scopes,
      });
      return { success: true };
    }
    
    if (data.authUrl) {
      // Step 2: Open popup for user consent
      const popup = window.open(
        data.authUrl,
        `arcadia-oauth-${provider}`,
        'width=600,height=700,scrollbars=yes,resizable=yes'
      );
      
      if (!popup) {
        // Popup blocked — open in new tab instead
        window.open(data.authUrl, '_blank');
        return { success: false, error: 'Popup blocked. Authorization page opened in a new tab. Complete the flow there and return.' };
      }
      
      // Step 3: Poll for completion
      return new Promise((resolve) => {
        const pollInterval = setInterval(async () => {
          try {
            // Check if popup is closed
            if (popup.closed) {
              clearInterval(pollInterval);
              
              // Check if bridge received the token
              const statusRes = await fetch(`${bridgeUrl}/v1/oauth/status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider, userId: getUserId() }),
              });
              
              if (statusRes.ok) {
                const statusData = await statusRes.json();
                if (statusData.authorized && statusData.token) {
                  saveUserAuth(provider, {
                    provider,
                    token: {
                      accessToken: statusData.token.access_token,
                      refreshToken: statusData.token.refresh_token,
                      expiresAt: statusData.token.expires_at ? statusData.token.expires_at * 1000 : undefined,
                      scope: statusData.token.scope,
                      tokenType: statusData.token.token_type,
                    },
                    profile: statusData.profile,
                    authorizedAt: Date.now(),
                    scopes: OAUTH_CONFIGS[provider].scopes,
                  });
                  resolve({ success: true });
                  return;
                }
              }
              resolve({ success: false, error: 'Authorization was cancelled or failed.' });
            }
          } catch {
            // Continue polling
          }
        }, 1000);
        
        // Timeout after 5 minutes
        setTimeout(() => {
          clearInterval(pollInterval);
          resolve({ success: false, error: 'Authorization timed out. Please try again.' });
        }, 300000);
      });
    }
    
    return { success: false, error: 'No authorization URL received from bridge.' };
  } catch (e: any) {
    const msg = e.message || 'Failed to initiate OAuth flow.';
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('ERR_CONNECTION_REFUSED')) {
      return { success: false, error: `Cannot reach bridge at ${bridgeUrl}. The bridge may not be running or the URL may be incorrect.` };
    }
    return { success: false, error: msg };
  }
}

/**
 * Validate a GitHub personal access token.
 * Returns user profile info if valid.
 */
export async function validateGitHubToken(token: string): Promise<{ valid: boolean; profile?: { login: string; name: string; avatar_url: string; email: string } }> {
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: { Authorization: `token ${token}` },
    });
    if (res.ok) {
      const profile = await res.json();
      return { valid: true, profile };
    }
    return { valid: false };
  } catch {
    return { valid: false };
  }
}

/**
 * Validate a Google token via bridge.
 */
export async function validateGoogleToken(provider: OAuthProvider): Promise<{ valid: boolean; profile?: { email: string; name: string } }> {
  const auth = getUserAuth(provider);
  if (!auth?.token.accessToken) return { valid: false };
  
  const bridgeUrl = getBridgeUrl();
  try {
    const res = await fetch(`${bridgeUrl}/v1/oauth/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, token: auth.token.accessToken }),
    });
    if (res.ok) {
      const data = await res.json();
      return { valid: data.valid, profile: data.profile };
    }
    return { valid: false };
  } catch {
    return { valid: false };
  }
}

/**
 * Refresh an expired Google token via bridge.
 */
export async function refreshGoogleToken(provider: OAuthProvider): Promise<boolean> {
  const auth = getUserAuth(provider);
  if (!auth?.token.refreshToken) return false;
  
  const bridgeUrl = getBridgeUrl();
  try {
    const res = await fetch(`${bridgeUrl}/v1/oauth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider,
        refreshToken: auth.token.refreshToken,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.token) {
        saveUserAuth(provider, {
          ...auth,
          token: {
            ...auth.token,
            accessToken: data.token.access_token,
            expiresAt: data.token.expires_at ? data.token.expires_at * 1000 : undefined,
          },
        });
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}
