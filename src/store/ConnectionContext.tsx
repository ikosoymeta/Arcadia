import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { Connection } from '../types';
import { storage } from '../services/storage';
import { testConnection as testApiConnection } from '../services/claude';

interface ConnectionContextType {
  connections: Connection[];
  activeConnection: Connection | null;
  addConnection: (conn: Omit<Connection, 'id' | 'isActive' | 'status'> & { status?: Connection['status'] }) => void;
  updateConnection: (id: string, updates: Partial<Connection>) => void;
  deleteConnection: (id: string) => void;
  setActiveConnection: (id: string) => void;
  testConnection: (id: string) => Promise<boolean>;
  isMetaProxy: boolean;
}

const ConnectionContext = createContext<ConnectionContextType | null>(null);

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  const [connections, setConnections] = useState<Connection[]>(() => {
    return storage.getConnections();
  });

  useEffect(() => {
    storage.saveConnections(connections);
  }, [connections]);

  const activeConnection = connections.find(c => c.isActive) ?? null;

  // True when the active connection is the Meta corporate proxy
  const isMetaProxy = !!(
    activeConnection?.baseUrl?.includes('localhost:8087') ||
    activeConnection?.label?.toLowerCase().includes('meta')
  );

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

    // For Meta proxy connections, probe the proxy endpoint directly
    if (conn.baseUrl?.includes('localhost:8087')) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 2000);
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

    // Standard API key test
    try {
      const success = await testApiConnection(conn.apiKey, conn.model);
      updateConnection(id, { status: success ? 'connected' : 'error', lastUsed: Date.now() });
      return success;
    } catch {
      updateConnection(id, { status: 'error' });
      return false;
    }
  }, [connections, updateConnection]);

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
