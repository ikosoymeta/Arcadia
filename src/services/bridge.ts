/**
 * Shared Bridge URL utility.
 * 
 * By default, the bridge runs locally at http://127.0.0.1:8087.
 * Users with Second Brain on a remote server (e.g., OnDemand devserver)
 * can configure a remote bridge URL in Settings.
 * 
 * localStorage key: 'arcadia-remote-bridge'
 * Format: { enabled: boolean, url: string }
 */

const LOCAL_BRIDGE = 'http://127.0.0.1:8087';
const STORAGE_KEY = 'arcadia-remote-bridge';

export interface RemoteBridgeConfig {
  enabled: boolean;
  url: string;
}

/** Get the current remote bridge config from localStorage */
export function getRemoteBridgeConfig(): RemoteBridgeConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        enabled: !!parsed.enabled,
        url: typeof parsed.url === 'string' ? parsed.url : '',
      };
    }
  } catch { /* ignore parse errors */ }
  return { enabled: false, url: '' };
}

/** Save remote bridge config to localStorage */
export function setRemoteBridgeConfig(config: RemoteBridgeConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  // Dispatch a custom event so other components can react
  window.dispatchEvent(new CustomEvent('bridge-config-changed', { detail: config }));
}

/** 
 * Get the effective bridge URL.
 * Returns the remote URL if enabled and non-empty, otherwise localhost.
 */
export function getBridgeUrl(): string {
  const config = getRemoteBridgeConfig();
  if (config.enabled && config.url.trim()) {
    // Normalize: remove trailing slash
    return config.url.trim().replace(/\/+$/, '');
  }
  return LOCAL_BRIDGE;
}

/** Check if the current bridge is a remote connection */
export function isRemoteBridge(): boolean {
  const config = getRemoteBridgeConfig();
  return config.enabled && !!config.url.trim();
}

/** Test bridge connectivity */
export async function testBridgeConnection(url?: string): Promise<{ ok: boolean; latency: number; error?: string }> {
  const target = url || getBridgeUrl();
  const start = performance.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${target}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    const latency = Math.round(performance.now() - start);
    if (response.ok) {
      return { ok: true, latency };
    }
    return { ok: false, latency, error: `HTTP ${response.status}` };
  } catch (e: any) {
    const latency = Math.round(performance.now() - start);
    if (e.name === 'AbortError') {
      return { ok: false, latency, error: 'Connection timed out (5s)' };
    }
    return { ok: false, latency, error: e.message || 'Connection failed' };
  }
}
