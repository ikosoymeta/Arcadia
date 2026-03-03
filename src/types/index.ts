export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  tokens?: number;
  artifacts?: Artifact[];
}

export interface Artifact {
  id: string;
  type: 'code' | 'markdown' | 'html' | 'image' | 'file';
  language?: string;
  title?: string;
  content: string;
  filename?: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  model: string;
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
  ttft: number; // time to first token (ms)
  totalTime: number; // total response time (ms)
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

export type ViewMode = 'chat' | 'settings' | 'benchmarks' | 'code-workspace';

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
