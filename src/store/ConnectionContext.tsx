import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { Connection } from '../types';
import { storage } from '../services/storage';
import { testConnection as testApiConnection } from '../services/claude';

interface ConnectionContextType {
  connections: Connection[];
  activeConnection: Connection | null;
  addConnection: (conn: Omit<Connection, 'id' | 'status' | 'isActive'>) => void;
  updateConnection: (id: string, updates: Partial<Connection>) => void;
  deleteConnection: (id: string) => void;
  setActiveConnection: (id: string) => void;
  testConnection: (id: string) => Promise<boolean>;
}

const ConnectionContext = createContext<ConnectionContextType | null>(null);

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  const [connections, setConnections] = useState<Connection[]>(() => {
    const stored = storage.getConnections();
    // Filter out any legacy Meta proxy connections that point to localhost:8087
    return stored.filter(c => !c.baseUrl?.includes('localhost:8087'));
  });

  useEffect(() => {
    storage.saveConnections(connections);
  }, [connections]);

  const activeConnection = connections.find(c => c.isActive) ?? null;

  const addConnection = useCallback((conn: Omit<Connection, 'id' | 'status' | 'isActive'>) => {
    const newConn: Connection = {
      ...conn,
      id: crypto.randomUUID(),
      status: 'disconnected',
      isActive: connections.length === 0,
    };
    setConnections(prev => {
      // If this is the first connection, make it active
      if (prev.length === 0) {
        storage.setActiveConnectionId(newConn.id);
        return [{ ...newConn, isActive: true }];
      }
      return [...prev, newConn];
    });
  }, [connections.length]);

  const updateConnection = useCallback((id: string, updates: Partial<Connection>) => {
    setConnections(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  }, []);

  const deleteConnection = useCallback((id: string) => {
    setConnections(prev => {
      const remaining = prev.filter(c => c.id !== id);
      // If deleted was active, activate the first remaining
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
