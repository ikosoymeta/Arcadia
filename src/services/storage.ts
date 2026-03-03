import { Conversation, Connection, BenchmarkSuite } from '../types';

const KEYS = {
  conversations: 'claude-editor-conversations',
  connections: 'claude-editor-connections',
  activeConnection: 'claude-editor-active-connection',
  benchmarks: 'claude-editor-benchmarks',
  settings: 'claude-editor-settings',
} as const;

export const storage = {
  getConversations(): Conversation[] {
    try {
      const data = localStorage.getItem(KEYS.conversations);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  saveConversations(conversations: Conversation[]): void {
    localStorage.setItem(KEYS.conversations, JSON.stringify(conversations));
  },

  getConnections(): Connection[] {
    try {
      const data = localStorage.getItem(KEYS.connections);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  saveConnections(connections: Connection[]): void {
    localStorage.setItem(KEYS.connections, JSON.stringify(connections));
  },

  getActiveConnectionId(): string | null {
    return localStorage.getItem(KEYS.activeConnection);
  },

  setActiveConnectionId(id: string): void {
    localStorage.setItem(KEYS.activeConnection, id);
  },

  getBenchmarks(): BenchmarkSuite[] {
    try {
      const data = localStorage.getItem(KEYS.benchmarks);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  saveBenchmarks(benchmarks: BenchmarkSuite[]): void {
    localStorage.setItem(KEYS.benchmarks, JSON.stringify(benchmarks));
  },
};
