// ─── Claude Models ────────────────────────────────────────────────────────────

export const CLAUDE_MODELS = [
  {
    id: 'claude-opus-4-6',
    label: 'Claude Opus 4.6',
    desc: 'Most powerful — complex reasoning, long tasks, multi-agent',
    badge: '🧠 Most Powerful',
    supportsThinking: true,
    supportsVision: true,
    contextWindow: 200000,
    tier: 'opus' as const,
  },
  {
    id: 'claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
    desc: 'Best balance of intelligence and speed',
    badge: '⭐ Recommended',
    supportsThinking: true,
    supportsVision: true,
    contextWindow: 200000,
    tier: 'sonnet' as const,
  },
  {
    id: 'claude-sonnet-4-5',
    label: 'Claude Sonnet 4.5',
    desc: 'Best coding model — great for complex agents',
    badge: '💻 Best for Code',
    supportsThinking: true,
    supportsVision: true,
    contextWindow: 200000,
    tier: 'sonnet' as const,
  },
  {
    id: 'claude-haiku-4-5-20251001',
    label: 'Claude Haiku 4.5',
    desc: 'Fastest responses — great for quick questions',
    badge: '⚡ Fastest',
    supportsThinking: false,
    supportsVision: true,
    contextWindow: 200000,
    tier: 'haiku' as const,
  },
  {
    id: 'claude-sonnet-4-20250514',
    label: 'Claude Sonnet 4',
    desc: 'Stable Sonnet 4 release',
    badge: '',
    supportsThinking: true,
    supportsVision: true,
    contextWindow: 200000,
    tier: 'sonnet' as const,
  },
  {
    id: 'claude-opus-4-20250514',
    label: 'Claude Opus 4',
    desc: 'Stable Opus 4 release',
    badge: '',
    supportsThinking: true,
    supportsVision: true,
    contextWindow: 200000,
    tier: 'opus' as const,
  },
  {
    id: 'claude-haiku-35-20241022',
    label: 'Claude 3.5 Haiku',
    desc: 'Fast and affordable',
    badge: '',
    supportsThinking: false,
    supportsVision: true,
    contextWindow: 200000,
    tier: 'haiku' as const,
  },
];

export type ClaudeModelId = string;

export function getModelInfo(id: string) {
  return CLAUDE_MODELS.find(m => m.id === id) ?? null;
}

// ─── Content Blocks ───────────────────────────────────────────────────────────

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ThinkingBlock {
  type: 'thinking';
  thinking: string;
}

export interface ImageBlock {
  type: 'image';
  source: {
    type: 'base64';
    media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
    data: string;
  };
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type ContentBlock = TextBlock | ThinkingBlock | ImageBlock | ToolUseBlock | ToolResultBlock;

// ─── Tool Definition ──────────────────────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
    required?: string[];
  };
}

// ─── API Debug Log ────────────────────────────────────────────────────────────

export interface ApiLogEntry {
  id: string;
  timestamp: number;
  direction: 'request' | 'response' | 'stream_token' | 'error' | 'tool_call' | 'thinking';
  data: unknown;
  model?: string;
  ttft?: number;
  totalTime?: number;
  tokensPerSecond?: number;
  inputTokens?: number;
  outputTokens?: number;
  label?: string;
}

// ─── Core Types ───────────────────────────────────────────────────────────────

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  contentBlocks?: ContentBlock[];
  timestamp: number;
  tokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  artifacts?: Artifact[];
  authorId?: string;
  authorName?: string;
  thinkingText?: string;
  toolCalls?: ToolUseBlock[];
  model?: string;
  ttft?: number;
  totalTime?: number;
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
  threadId?: string;
  parentThreadId?: string;
  tags: string[];
  systemPrompt?: string;
  enableThinking?: boolean;
  thinkingBudget?: number;
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
  instructions?: string;
}

export type ChatMode = 'chat' | 'cowork';
export type InterfaceMode = 'simple' | 'engineer';

export interface CoworkTask {
  id: string;
  title: string;
  status: 'planning' | 'in_progress' | 'awaiting_permission' | 'paused' | 'completed' | 'error';
  steps: CoworkStep[];
  createdAt: number;
  completedAt?: number;
  conversationId: string;
}

export interface CoworkStep {
  id: string;
  label: string;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped' | 'error';
  detail?: string;
  startedAt?: number;
  completedAt?: number;
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
  baseUrl?: string;
  enableThinking?: boolean;
  thinkingBudget?: number;
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

// ─── Image Attachment ─────────────────────────────────────────────────────────

export interface ImageAttachment {
  id: string;
  name: string;
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  data: string; // base64
  previewUrl: string;
}
