export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  tokens?: number;
  artifacts?: Artifact[];
  authorId?: string;
  authorName?: string;
}

export interface Artifact {
  id: string;
  type: 'code' | 'markdown' | 'html' | 'image' | 'file';
  language?: string;
  title?: string;
  content: string;
  filename?: string;
}

export interface Checkpoint {
  id: string;
  label: string;
  messageIndex: number;
  timestamp: number;
  createdBy: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  model: string;
  folderId: string | null;
  isPinned: boolean;
  visibility: 'private' | 'team' | 'public';
  ownerId: string;
  ownerName: string;
  shareUrl?: string;
  collaborators: Collaborator[];
  checkpoints: Checkpoint[];
  threadId?: string; // for multi-threaded branching
  parentThreadId?: string;
  tags: string[];
}

export interface Collaborator {
  userId: string;
  name: string;
  role: 'owner' | 'editor' | 'viewer';
  joinedAt: number;
  isOnline?: boolean;
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
  color?: string;
  icon?: string;
  isExpanded?: boolean;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  prompt: string;
  category: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  createdBy: string;
  sourceConversationId?: string;
  usageCount: number;
  isPublic: boolean;
}

export interface TeamPod {
  id: string;
  name: string;
  description: string;
  members: PodMember[];
  createdAt: number;
  ownerId: string;
}

export interface PodMember {
  userId: string;
  name: string;
  role: 'admin' | 'member';
  joinedAt: number;
  isAiAgent?: boolean;
  agentType?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  isAuthenticated: boolean;
  teams: string[];
}

export interface Connection {
  id: string;
  label: string;
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
  isActive: boolean;
  status: 'connected' | 'disconnected' | 'error';
  lastUsed?: number;
}

export interface BenchmarkResult {
  id: string;
  name: string;
  prompt: string;
  ttft: number;
  totalTime: number;
  tokensPerSecond: number;
  renderTime: number;
  totalTokens: number;
  timestamp: number;
  status: 'pass' | 'slow' | 'fail';
}

export interface BenchmarkSuite {
  id: string;
  results: BenchmarkResult[];
  webVitals: WebVitalsResult;
  timestamp: number;
}

export interface WebVitalsResult {
  lcp?: number;
  fid?: number;
  cls?: number;
  ttfb?: number;
  inp?: number;
}

export type ViewMode = 'chat' | 'settings' | 'benchmarks' | 'code-workspace' | 'skills' | 'team' | 'help';

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
  content?: string;
  language?: string;
}

export interface TerminalEntry {
  id: string;
  command: string;
  output: string;
  timestamp: number;
  status: 'running' | 'success' | 'error';
}
