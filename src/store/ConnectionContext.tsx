import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import type { Connection } from '../types';
import { storage } from '../services/storage';
import { testConnection as testApiConnection } from '../services/claude';

// ─── Auto-config status (shown as progress to user) ──────────────────────────
export interface ConfigStatus {
  phase: 'idle' | 'detecting' | 'connecting' | 'testing' | 'ready' | 'error';
  message: string;
  progress: number; // 0-100
  detail?: string;
}

interface ConnectionContextType {
  connections: Connection[];
  activeConnection: Connection | null;
  addConnection: (conn: Omit<Connection, 'id' | 'isActive' | 'status'> & { status?: Connection['status'] }) => void;
  updateConnection: (id: string, updates: Partial<Connection>) => void;
  deleteConnection: (id: string) => void;
  setActiveConnection: (id: string) => void;
  testConnection: (id: string) => Promise<boolean>;
  isMetaProxy: boolean;
  configStatus: ConfigStatus;
  retryAutoConnect: () => void;
}

const ConnectionContext = createContext<ConnectionContextType | null>(null);

// ─── Meta LDAR proxy URL ─────────────────────────────────────────────────────
const META_PROXY_URL = 'http://localhost:8087';
const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  const [connections, setConnections] = useState<Connection[]>(() => {
    return storage.getConnections();
  });
  const [configStatus, setConfigStatus] = useState<ConfigStatus>({
    phase: 'idle', message: '', progress: 0,
  });
  const autoConnectRan = useRef(false);

  useEffect(() => {
    storage.saveConnections(connections);
  }, [connections]);

  const activeConnection = connections.find(c => c.isActive) ?? null;

  const isMetaProxy = !!(
    activeConnection?.baseUrl?.includes('localhost:8087') ||
    activeConnection?.label?.toLowerCase().includes('meta')
  );

  // ─── Add connection (internal) ──────────────────────────────────────────────
  const addConnection = useCallback((conn: Omit<Connection, 'id' | 'isActive' | 'status'> & { status?: Connection['status'] }) => {
    const newConn: Connection = {
      ...conn,
      id: crypto.randomUUID(),
      status: conn.status ?? 'disconnected',
      isActive: false,
    };
    setConnections(prev => {
      const updated = [...prev, { ...newConn, isActive: prev.length === 0 }];
      if (prev.length === 0) {
        storage.setActiveConnectionId(newConn.id);
      }
      return updated;
    });
    return newConn.id;
  }, []);

  const updateConnection = useCallback((id: string, updates: Partial<Connection>) => {
    setConnections(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  }, []);

  const deleteConnection = useCallback((id: string) => {
    setConnections(prev => {
      const remaining = prev.filter(c => c.id !== id);
      if (prev.find(c => c.id === id)?.isActive && remaining.length > 0) {
        remaining[0].isActive = true;
        storage.setActiveConnectionId(remaining[0].id);
      }
      return remaining;
    });
  }, []);

  const setActiveConnection = useCallback((id: string) => {
    setConnections(prev => prev.map(c => ({ ...c, isActive: c.id === id })));
    storage.setActiveConnectionId(id);
  }, []);

  const testConnection = useCallback(async (id: string): Promise<boolean> => {
    const conn = connections.find(c => c.id === id);
    if (!conn) return false;

    if (conn.baseUrl?.includes('localhost:8087')) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(`${conn.baseUrl}/v1/messages`, {
          method: 'OPTIONS',
          signal: controller.signal,
        }).catch(() => null);
        clearTimeout(timer);
        const ok = res !== null;
        updateConnection(id, { status: ok ? 'connected' : 'error', lastUsed: Date.now() });
        return ok;
      } catch {
        updateConnection(id, { status: 'error' });
        return false;
      }
    }

    try {
      const success = await testApiConnection(conn.apiKey, conn.model);
      updateConnection(id, { status: success ? 'connected' : 'error', lastUsed: Date.now() });
      return success;
    } catch {
      updateConnection(id, { status: 'error' });
      return false;
    }
  }, [connections, updateConnection]);

  // ─── Silent auto-connect on startup ─────────────────────────────────────────
  const runAutoConnect = useCallback(async () => {
    // If we already have an active, connected connection, skip
    const existing = storage.getConnections();
    const hasActive = existing.find(c => c.isActive && c.status === 'connected');
    if (hasActive) {
      setConfigStatus({ phase: 'ready', message: 'Connected', progress: 100 });
      return;
    }

    // If we have any connection at all, try to reconnect it
    const anyConn = existing.find(c => c.isActive) ?? existing[0];

    // Step 1: Detecting infrastructure
    setConfigStatus({
      phase: 'detecting',
      message: 'Detecting Meta infrastructure...',
      progress: 15,
      detail: 'Checking LDAR proxy availability',
    });

    await new Promise(r => setTimeout(r, 400)); // Brief pause for UX

    // Step 2: Probe LDAR proxy
    setConfigStatus({
      phase: 'connecting',
      message: 'Connecting to Meta LDAR proxy...',
      progress: 35,
      detail: `Probing ${META_PROXY_URL}`,
    });

    let proxyReachable = false;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${META_PROXY_URL}/v1/messages`, {
        method: 'OPTIONS',
        signal: controller.signal,
      }).catch(() => null);
      clearTimeout(timer);
      proxyReachable = res !== null;
    } catch {
      proxyReachable = false;
    }

    if (proxyReachable) {
      // Step 3: Create/update connection
      setConfigStatus({
        phase: 'testing',
        message: 'Meta proxy detected — configuring...',
        progress: 70,
        detail: 'Setting up Claude connection via corporate proxy',
      });

      await new Promise(r => setTimeout(r, 300));

      if (anyConn) {
        // Update existing connection
        updateConnection(anyConn.id, {
          baseUrl: META_PROXY_URL,
          label: 'Meta Corporate (LDAR)',
          status: 'connected',
          lastUsed: Date.now(),
          isActive: true,
        });
      } else {
        // Create new connection
        const id = crypto.randomUUID();
        setConnections([{
          id,
          label: 'Meta Corporate (LDAR)',
          apiKey: '',
          model: DEFAULT_MODEL,
          maxTokens: 8192,
          temperature: 1,
          isActive: true,
          status: 'connected',
          baseUrl: META_PROXY_URL,
          lastUsed: Date.now(),
        }]);
        storage.setActiveConnectionId(id);
      }

      setConfigStatus({
        phase: 'ready',
        message: 'Connected via Meta corporate proxy',
        progress: 100,
      });
    } else if (anyConn) {
      // No proxy, but we have an existing connection — try to reconnect it
      setConfigStatus({
        phase: 'testing',
        message: 'Proxy not available — reconnecting existing session...',
        progress: 60,
        detail: `Testing connection: ${anyConn.label}`,
      });

      const ok = await testConnection(anyConn.id).catch(() => false);
      if (ok) {
        setConfigStatus({
          phase: 'ready',
          message: `Connected — ${anyConn.label}`,
          progress: 100,
        });
      } else {
        setConfigStatus({
          phase: 'error',
          message: 'Unable to connect — please check VPN or network',
          progress: 100,
          detail: 'Ensure you are on the Meta corporate network or VPN. The app will auto-retry when the network is available.',
        });
      }
    } else {
      // No proxy, no existing connection
      setConfigStatus({
        phase: 'error',
        message: 'Unable to connect — please check VPN or network',
        progress: 100,
        detail: 'Ensure you are on the Meta corporate network or VPN. The app will auto-retry when the network is available.',
      });
    }
  }, [testConnection, updateConnection]);

  // Run auto-connect once on mount
  useEffect(() => {
    if (autoConnectRan.current) return;
    autoConnectRan.current = true;
    runAutoConnect();
  }, [runAutoConnect]);

  // Auto-retry every 15 seconds if in error state
  useEffect(() => {
    if (configStatus.phase !== 'error') return;
    const timer = setInterval(() => {
      runAutoConnect();
    }, 15000);
    return () => clearInterval(timer);
  }, [configStatus.phase, runAutoConnect]);

  return (
    <ConnectionContext.Provider value={{
      connections,
      activeConnection,
      addConnection,
      updateConnection,
      deleteConnection,
      setActiveConnection,
      testConnection,
      isMetaProxy,
      configStatus,
      retryAutoConnect: runAutoConnect,
    }}>
      {children}
    </ConnectionContext.Provider>
  );
}

export function useConnection() {
  const ctx = useContext(ConnectionContext);
  if (!ctx) throw new Error('useConnection must be used within ConnectionProvider');
  return ctx;
}
