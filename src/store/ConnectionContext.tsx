import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { Connection } from '../types';
import { storage } from '../services/storage';

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
  const [connections, setConnections] = useState<Connection[]>(() => storage.getConnections());

  useEffect(() => {
    storage.saveConnections(connections);
  }, [connections]);

  const activeConnection = connections.find(c => c.isActive) || null;

  const addConnection = useCallback((conn: Omit<Connection, 'id' | 'status' | 'isActive'>) => {
    const newConn: Connection = {
      ...conn,
      id: crypto.randomUUID(),
      status: 'disconnected',
      isActive: connections.length === 0,
    };
    setConnections(prev => [...prev, newConn]);
  }, [connections.length]);

  const updateConnection = useCallback((id: string, updates: Partial<Connection>) => {
    setConnections(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  }, []);

  const deleteConnection = useCallback((id: string) => {
    setConnections(prev => prev.filter(c => c.id !== id));
  }, []);

  const setActiveConnection = useCallback((id: string) => {
    setConnections(prev => prev.map(c => ({ ...c, isActive: c.id === id })));
    storage.setActiveConnectionId(id);
  }, []);

  const testConnection = useCallback(async (id: string): Promise<boolean> => {
    const conn = connections.find(c => c.id === id);
    if (!conn) return false;

    try {
      const response = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: conn.model,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Hi' }],
          apiKey: conn.apiKey,
        }),
      });

      const success = response.ok;
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
