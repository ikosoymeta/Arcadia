import type { Conversation, Connection, BenchmarkSuite, Folder, Skill, TeamPod } from '../types';

const KEYS = {
  conversations: 'arcadia-conversations',
  connections: 'arcadia-connections',
  activeConnection: 'arcadia-active-connection',
  benchmarks: 'arcadia-benchmarks',
  folders: 'arcadia-folders',
  skills: 'arcadia-skills',
  teams: 'arcadia-teams',
} as const;

function load<T>(key: string, fallback: T): T {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, data: unknown): void {
  localStorage.setItem(key, JSON.stringify(data));
}

// ─── Debounced save for high-frequency writes (streaming) ──────────────────
const debounceTimers: Record<string, ReturnType<typeof setTimeout>> = {};
const pendingData: Record<string, unknown> = {};

function debouncedSave(key: string, data: unknown, delayMs = 500): void {
  pendingData[key] = data;
  if (debounceTimers[key]) {
    clearTimeout(debounceTimers[key]);
  }
  debounceTimers[key] = setTimeout(() => {
    save(key, data);
    delete debounceTimers[key];
    delete pendingData[key];
  }, delayMs);
}

// Flush all pending debounced writes immediately (call on page unload)
function flushPendingSaves(): void {
  for (const key of Object.keys(debounceTimers)) {
    clearTimeout(debounceTimers[key]);
    delete debounceTimers[key];
  }
  for (const [key, data] of Object.entries(pendingData)) {
    save(key, data);
    delete pendingData[key];
  }
}

// Flush on page unload to prevent data loss
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    flushPendingSaves();
  });
}

export const storage = {
  getConversations: (): Conversation[] => load(KEYS.conversations, []),
  saveConversations: (c: Conversation[]) => save(KEYS.conversations, c),
  debouncedSaveConversations: (c: Conversation[]) => debouncedSave(KEYS.conversations, c, 500),

  getConnections: (): Connection[] => load(KEYS.connections, []),
  saveConnections: (c: Connection[]) => save(KEYS.connections, c),

  getActiveConnectionId: (): string | null => localStorage.getItem(KEYS.activeConnection),
  setActiveConnectionId: (id: string) => localStorage.setItem(KEYS.activeConnection, id),

  getBenchmarks: (): BenchmarkSuite[] => load(KEYS.benchmarks, []),
  saveBenchmarks: (b: BenchmarkSuite[]) => save(KEYS.benchmarks, b),

  getFolders: (): Folder[] => load(KEYS.folders, []),
  saveFolders: (f: Folder[]) => save(KEYS.folders, f),

  getSkills: (): Skill[] => load(KEYS.skills, []),
  saveSkills: (s: Skill[]) => save(KEYS.skills, s),

  getTeams: (): TeamPod[] => load(KEYS.teams, []),
  saveTeams: (t: TeamPod[]) => save(KEYS.teams, t),
};
