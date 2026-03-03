import type { Connection, Message, Artifact, ApiLogEntry, ToolDefinition, ContentBlock } from '../types';

// ─── API Log Store (in-memory, for engineer console) ─────────────────────────

const apiLogs: ApiLogEntry[] = [];
const logListeners: Array<(logs: ApiLogEntry[]) => void> = [];

export function getApiLogs(): ApiLogEntry[] {
  return [...apiLogs];
}

export function clearApiLogs(): void {
  apiLogs.length = 0;
  notifyLogListeners();
}

export function subscribeToApiLogs(fn: (logs: ApiLogEntry[]) => void): () => void {
  logListeners.push(fn);
  return () => {
    const i = logListeners.indexOf(fn);
    if (i >= 0) logListeners.splice(i, 1);
  };
}

function addLog(entry: Omit<ApiLogEntry, 'id' | 'timestamp'>): void {
  const log: ApiLogEntry = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    ...entry,
  };
  apiLogs.unshift(log);
  if (apiLogs.length > 200) apiLogs.splice(200);
  notifyLogListeners();
}

function notifyLogListeners(): void {
  const snapshot = [...apiLogs];
  logListeners.forEach(fn => fn(snapshot));
}

// ─── Build Request ────────────────────────────────────────────────────────────

function buildEndpoint(conn: Connection): string {
  if (conn.baseUrl) return `${conn.baseUrl}/v1/messages`;
  if (import.meta.env.DEV) return '/api/claude';
  return 'https://api.anthropic.com/v1/messages';
}

function buildHeaders(conn: Connection): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
  };
  if (conn.baseUrl) {
    // Proxy mode — no API key in headers
  } else if (import.meta.env.DEV) {
    // Dev proxy handles key injection
  } else {
    headers['x-api-key'] = conn.apiKey;
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
  }
  return headers;
}

// ─── Message Conversion ───────────────────────────────────────────────────────

interface ApiMessage {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

function convertMessages(messages: Message[]): ApiMessage[] {
  return messages.map(m => {
    if (m.contentBlocks && m.contentBlocks.length > 0) {
      return { role: m.role, content: m.contentBlocks };
    }
    return { role: m.role, content: m.content };
  });
}

// ─── Artifact Extraction ──────────────────────────────────────────────────────

export function extractArtifacts(text: string): Artifact[] {
  const artifacts: Artifact[] = [];
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  let match;
  while ((match = codeBlockRegex.exec(text)) !== null) {
    const language = match[1] || 'text';
    const content = match[2].trim();
    if (!content) continue;
    const type = language === 'html' ? 'html' : language === 'markdown' || language === 'md' ? 'markdown' : 'code';
    artifacts.push({
      id: crypto.randomUUID(),
      type,
      language,
      content,
      title: language === 'html' ? 'HTML Preview' : `${language.charAt(0).toUpperCase() + language.slice(1)} Code`,
    });
  }
  return artifacts;
}

// ─── Send Message (streaming) ─────────────────────────────────────────────────

export interface SendMessageOptions {
  connection: Connection;
  messages: Message[];
  systemPrompt?: string;
  tools?: ToolDefinition[];
  onToken: (text: string) => void;
  onThinking?: (text: string) => void;
  onToolCall?: (toolCall: { name: string; input: Record<string, unknown> }) => void;
  onLog?: (entry: ApiLogEntry) => void;
  signal?: AbortSignal;
}

export interface SendMessageResult {
  content: string;
  thinkingText?: string;
  inputTokens?: number;
  outputTokens?: number;
  artifacts: Artifact[];
  ttft?: number;
  totalTime?: number;
  tokensPerSecond?: number;
  toolCalls?: Array<{ id: string; name: string; input: Record<string, unknown> }>;
}

export async function sendMessage(opts: SendMessageOptions): Promise<SendMessageResult> {
  const { connection, messages, systemPrompt, tools, onToken, onThinking, onToolCall, signal } = opts;

  const endpoint = buildEndpoint(connection);
  const headers = buildHeaders(connection);

  const apiMessages = convertMessages(messages);

  // Build request body
  const body: Record<string, unknown> = {
    model: connection.model,
    max_tokens: connection.maxTokens ?? 4096,
    messages: apiMessages,
    stream: true,
  };

  if (connection.apiKey && import.meta.env.DEV) {
    (body as Record<string, unknown>).apiKey = connection.apiKey;
  }

  if (systemPrompt) {
    body.system = systemPrompt;
  }

  if (tools && tools.length > 0) {
    body.tools = tools;
  }

  // Extended thinking
  if (connection.enableThinking) {
    body.thinking = {
      type: 'enabled',
      budget_tokens: connection.thinkingBudget ?? 10000,
    };
    // Thinking requires temperature=1
    body.temperature = 1;
  } else {
    body.temperature = connection.temperature ?? 0.7;
  }

  // Log request
  addLog({
    direction: 'request',
    data: { ...body, messages: `[${apiMessages.length} messages]` },
    model: connection.model,
    label: `POST ${endpoint}`,
  });

  const startTime = performance.now();
  let ttft: number | undefined;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMsg: string;
    try {
      const errorJson = JSON.parse(errorText);
      errorMsg = errorJson.error?.message ?? errorText;
    } catch {
      errorMsg = errorText;
    }
    addLog({ direction: 'error', data: { status: response.status, error: errorMsg }, model: connection.model });
    throw new Error(`Claude API error ${response.status}: ${errorMsg}`);
  }

  // Stream SSE
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let thinkingText = '';
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  const toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
  let currentToolId = '';
  let currentToolName = '';
  let currentToolInputStr = '';
  // Track thinking block state (used for future tool-use interleaving)
  let _inThinkingBlock = false; void _inThinkingBlock;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;

      let event: Record<string, unknown>;
      try {
        event = JSON.parse(data);
      } catch {
        continue;
      }

      const type = event.type as string;

      if (type === 'content_block_start') {
        const block = event.content_block as Record<string, unknown>;
        if (block?.type === 'thinking') {
          _inThinkingBlock = true;
        } else if (block?.type === 'tool_use') {
          currentToolId = block.id as string;
          currentToolName = block.name as string;
          currentToolInputStr = '';
          _inThinkingBlock = false;
        } else {
          _inThinkingBlock = false;
        }
      }

      if (type === 'content_block_delta') {
        const delta = event.delta as Record<string, unknown>;
        if (!delta) continue;

        if (delta.type === 'thinking_delta') {
          const chunk = delta.thinking as string ?? '';
          thinkingText += chunk;
          if (onThinking) onThinking(chunk);
          addLog({ direction: 'thinking', data: chunk, label: 'thinking_delta' });
        } else if (delta.type === 'text_delta') {
          const chunk = delta.text as string ?? '';
          if (ttft === undefined) {
            ttft = performance.now() - startTime;
          }
          fullText += chunk;
          onToken(chunk);
        } else if (delta.type === 'input_json_delta') {
          currentToolInputStr += delta.partial_json as string ?? '';
        }
      }

      if (type === 'content_block_stop') {
        if (currentToolName) {
          let toolInput: Record<string, unknown> = {};
          try { toolInput = JSON.parse(currentToolInputStr); } catch { /* ignore */ }
          toolCalls.push({ id: currentToolId, name: currentToolName, input: toolInput });
          if (onToolCall) onToolCall({ name: currentToolName, input: toolInput });
          addLog({
            direction: 'tool_call',
            data: { id: currentToolId, name: currentToolName, input: toolInput },
            label: `tool_use: ${currentToolName}`,
          });
          currentToolName = '';
          currentToolId = '';
          currentToolInputStr = '';
        }
        _inThinkingBlock = false;
      }

      if (type === 'message_delta') {
        const usage = (event.usage as Record<string, unknown>) ?? {};
        if (usage.output_tokens) outputTokens = usage.output_tokens as number;
      }

      if (type === 'message_start') {
        const msg = event.message as Record<string, unknown>;
        const usage = (msg?.usage as Record<string, unknown>) ?? {};
        if (usage.input_tokens) inputTokens = usage.input_tokens as number;
      }
    }
  }

  const totalTime = performance.now() - startTime;
  const tokensPerSecond = outputTokens && totalTime > 0 ? (outputTokens / (totalTime / 1000)) : undefined;

  addLog({
    direction: 'response',
    data: { text: fullText.slice(0, 200) + (fullText.length > 200 ? '...' : ''), inputTokens, outputTokens },
    model: connection.model,
    ttft,
    totalTime,
    tokensPerSecond,
    inputTokens,
    outputTokens,
    label: `Response (${outputTokens ?? '?'} tokens)`,
  });

  const artifacts = extractArtifacts(fullText);

  return {
    content: fullText,
    thinkingText: thinkingText || undefined,
    inputTokens,
    outputTokens,
    artifacts,
    ttft,
    totalTime,
    tokensPerSecond,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
  };
}

// ─── Test Connection ──────────────────────────────────────────────────────────

export async function testConnection(apiKey: string, model: string): Promise<boolean> {
  const conn: Connection = {
    id: 'test',
    label: 'test',
    apiKey,
    model,
    maxTokens: 16,
    temperature: 0.5,
    isActive: false,
    status: 'disconnected',
  };

  try {
    let got = false;
    await sendMessage({
      connection: conn,
      messages: [{ id: 'test', role: 'user', content: 'Say "ok" in one word.', timestamp: Date.now() }],
      onToken: () => { got = true; },
    });
    return got;
  } catch {
    return false;
  }
}

// ─── Non-streaming single call (for benchmarks) ───────────────────────────────

export async function sendMessageSimple(
  connection: Connection,
  messages: Message[],
  systemPrompt?: string,
): Promise<{ content: string; inputTokens?: number; outputTokens?: number }> {
  let content = '';
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;

  const result = await sendMessage({
    connection,
    messages,
    systemPrompt,
    onToken: t => { content += t; },
  });

  content = result.content;
  inputTokens = result.inputTokens;
  outputTokens = result.outputTokens;

  return { content, inputTokens, outputTokens };
}

// ─── Benchmark helper (used by benchmark.ts) ──────────────────────────────────

export async function sendBenchmarkMessage(
  prompt: string,
  apiKey: string,
  model: string,
  baseUrl?: string,
): Promise<{ content: string; ttft: number; totalTime: number; tokensPerSecond: number; totalTokens: number }> {
  const conn: Connection = {
    id: 'benchmark',
    label: 'benchmark',
    apiKey,
    model,
    maxTokens: 2048,
    temperature: 0.7,
    isActive: false,
    status: 'disconnected',
    baseUrl,
  };

  let content = '';
  const result = await sendMessage({
    connection: conn,
    messages: [{ id: 'bm', role: 'user', content: prompt, timestamp: Date.now() }],
    onToken: t => { content += t; },
  });

  return {
    content: result.content,
    ttft: result.ttft ?? 0,
    totalTime: result.totalTime ?? 0,
    tokensPerSecond: result.tokensPerSecond ?? 0,
    totalTokens: (result.inputTokens ?? 0) + (result.outputTokens ?? 0),
  };
}
