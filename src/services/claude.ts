import type { Connection, Message, Artifact, ContentBlock, ToolDefinition, ApiLogEntry, ToolUseBlock } from '../types';

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

// ─── Connection type detection ────────────────────────────────────────────────

function isMetaLdar(conn: Connection): boolean {
  return !!(conn.baseUrl?.includes('localhost:8087'));
}

function isMetaGen(conn: Connection): boolean {
  return !!(conn.apiKey?.startsWith('mg-api-') || conn.baseUrl?.includes('metagen.meta.com'));
}

// ─── Build Request ────────────────────────────────────────────────────────────

function buildEndpoint(conn: Connection): string {
  if (conn.baseUrl) {
    // Normalize: strip trailing /v1/messages if already included
    const base = conn.baseUrl.replace(/\/v1\/messages$/, '');
    return `${base}/v1/messages`;
  }
  if (import.meta.env.DEV) return '/api/claude';
  return 'https://api.anthropic.com/v1/messages';
}

function buildHeaders(conn: Connection): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
  };

  if (isMetaLdar(conn)) {
    // Meta LDAR proxy — proxy handles auth, no API key header needed
  } else if (isMetaGen(conn)) {
    // MetaGen — use mg-api-... key as x-api-key
    headers['x-api-key'] = conn.apiKey;
  } else if (import.meta.env.DEV) {
    // Dev proxy handles key injection
  } else {
    // Direct Anthropic API — requires key + CORS header
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

// ─── Test Connection ──────────────────────────────────────────────────────────

export async function testConnection(apiKey: string, model: string): Promise<boolean> {
  try {
    const isMetaGenKey = apiKey.startsWith('mg-api-');
    const endpoint = isMetaGenKey
      ? 'https://metagen.meta.com/v1/messages'
      : 'https://api.anthropic.com/v1/messages';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': apiKey,
    };
    if (!isMetaGenKey) {
      headers['anthropic-dangerous-direct-browser-access'] = 'true';
    }
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        max_tokens: 16,
        messages: [{ role: 'user', content: 'Say ok' }],
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Send Message (streaming) ─────────────────────────────────────────────────

export interface SendMessageOptions {
  connection: Connection;
  messages: Message[];
  systemPrompt?: string;
  tools?: ToolDefinition[];
  enableThinking?: boolean;
  thinkingBudget?: number;
  onToken?: (text: string) => void;
  onThinking?: (text: string) => void;
  onToolCall?: (tool: ToolUseBlock) => void;
  signal?: AbortSignal;
}

export interface SendMessageResult {
  content: string;
  thinkingText?: string;
  artifacts: Artifact[];
  toolCalls?: ToolUseBlock[];
  inputTokens?: number;
  outputTokens?: number;
  ttft?: number;
  totalTime?: number;
}

export async function sendMessage(opts: SendMessageOptions): Promise<SendMessageResult> {
  const { connection, messages, systemPrompt, tools, enableThinking, thinkingBudget, onToken, onThinking, onToolCall, signal } = opts;

  const endpoint = buildEndpoint(connection);
  const headers = buildHeaders(connection);
  const startTime = Date.now();
  let ttft: number | undefined;

  // Build system prompt with folder instructions if any
  const systemParts: string[] = [];
  if (systemPrompt) systemParts.push(systemPrompt);
  const system = systemParts.join('\n\n') || undefined;

  // Build request body
  const body: Record<string, unknown> = {
    model: connection.model,
    max_tokens: connection.maxTokens || 4096,
    messages: convertMessages(messages),
    stream: true,
  };

  if (system) body.system = system;
  if (tools && tools.length > 0) body.tools = tools;

  const useThinking = enableThinking ?? connection.enableThinking;
  if (useThinking) {
    body.thinking = {
      type: 'enabled',
      budget_tokens: thinkingBudget ?? connection.thinkingBudget ?? 8000,
    };
  }

  addLog({ direction: 'request', data: body, model: connection.model, label: 'API Request' });

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const errMsg = (errBody as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`;
    addLog({ direction: 'error', data: errBody, label: `Error: ${res.status}` });
    throw new Error(errMsg);
  }

  // ── Stream parsing ────────────────────────────────────────────────────────
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let thinkingText = '';
  const toolCalls: ToolUseBlock[] = [];
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  let currentToolCall: Partial<ToolUseBlock> | null = null;
  let currentToolInputStr = '';
  let rawChunks: string[] = []; // Debug: collect raw chunks
  let eventCount = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    rawChunks.push(chunk);
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmedLine = line.trim();
      // Skip empty lines and event: prefix lines
      if (!trimmedLine || trimmedLine.startsWith('event:')) continue;
      // Extract data payload
      let data: string;
      if (trimmedLine.startsWith('data: ')) {
        data = trimmedLine.slice(6).trim();
      } else if (trimmedLine.startsWith('data:')) {
        data = trimmedLine.slice(5).trim();
      } else {
        // Not an SSE data line — could be raw text from a non-SSE response
        // Collect it as potential fallback content
        continue;
      }
      if (!data || data === '[DONE]') continue;

      let event: Record<string, unknown>;
      try {
        event = JSON.parse(data);
        eventCount++;
      } catch {
        // If JSON parse fails, the data line might contain raw text
        console.warn('[ArcadIA] SSE parse warning: non-JSON data line:', data.slice(0, 100));
        continue;
      }

      const type = event.type as string;

      if (type === 'message_start') {
        const usage = (event.message as Record<string, unknown>)?.usage as Record<string, number> | undefined;
        if (usage) inputTokens = usage.input_tokens;
      }

      if (type === 'content_block_start') {
        const block = event.content_block as Record<string, unknown>;
        if (block?.type === 'tool_use') {
          currentToolCall = {
            type: 'tool_use',
            id: block.id as string,
            name: block.name as string,
            input: {},
          };
          currentToolInputStr = '';
        }
      }

      if (type === 'content_block_delta') {
        const delta = event.delta as Record<string, unknown>;
        if (!delta) continue;

        if (delta.type === 'text_delta') {
          const text = delta.text as string;
          if (!ttft) ttft = Date.now() - startTime;
          fullText += text;
          onToken?.(text);
          addLog({ direction: 'stream_token', data: text, label: 'Token' });
        }

        if (delta.type === 'thinking_delta') {
          const thinking = delta.thinking as string;
          thinkingText += thinking;
          onThinking?.(thinking);
          addLog({ direction: 'thinking', data: thinking, label: 'Thinking' });
        }

        if (delta.type === 'input_json_delta' && currentToolCall) {
          currentToolInputStr += delta.partial_json as string;
        }
      }

      if (type === 'content_block_stop' && currentToolCall) {
        try {
          currentToolCall.input = JSON.parse(currentToolInputStr || '{}');
        } catch {
          currentToolCall.input = {};
        }
        const tc = currentToolCall as ToolUseBlock;
        toolCalls.push(tc);
        onToolCall?.(tc);
        addLog({ direction: 'tool_call', data: tc, label: `Tool: ${tc.name}` });
        currentToolCall = null;
        currentToolInputStr = '';
      }

      if (type === 'message_delta') {
        const usage = (event.usage as Record<string, number> | undefined);
        if (usage) outputTokens = usage.output_tokens;
      }
    }
  }

  // Process any remaining buffer content
  if (buffer.trim()) {
    const trimmedLine = buffer.trim();
    if (trimmedLine.startsWith('data: ') || trimmedLine.startsWith('data:')) {
      const data = trimmedLine.startsWith('data: ') ? trimmedLine.slice(6).trim() : trimmedLine.slice(5).trim();
      if (data && data !== '[DONE]') {
        try {
          const event = JSON.parse(data);
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            const text = event.delta.text as string;
            if (!ttft) ttft = Date.now() - startTime;
            fullText += text;
            onToken?.(text);
          }
        } catch { /* ignore */ }
      }
    }
  }

  // Fallback: if no SSE events were parsed, try to interpret the raw response
  if (eventCount === 0 && rawChunks.length > 0) {
    const rawBody = rawChunks.join('');
    console.warn('[ArcadIA] No SSE events parsed. Raw response:', rawBody.slice(0, 500));
    try {
      // Maybe the response is a plain JSON message (non-streaming)
      const jsonResponse = JSON.parse(rawBody);
      if (jsonResponse.content && Array.isArray(jsonResponse.content)) {
        for (const block of jsonResponse.content) {
          if (block.type === 'text' && block.text) {
            fullText += block.text;
            onToken?.(block.text);
          }
        }
        if (jsonResponse.usage) {
          inputTokens = jsonResponse.usage.input_tokens;
          outputTokens = jsonResponse.usage.output_tokens;
        }
      } else if (typeof jsonResponse.content === 'string') {
        fullText = jsonResponse.content;
        onToken?.(jsonResponse.content);
      }
    } catch {
      // Not JSON either — treat raw text as the response
      if (rawBody.trim() && !rawBody.includes('event:') && !rawBody.includes('data:')) {
        fullText = rawBody.trim();
        onToken?.(fullText);
      }
    }
  }

  // Debug log
  if (!fullText) {
    console.error('[ArcadIA] Empty response. Events parsed:', eventCount, 'Raw chunks:', rawChunks.length);
    if (rawChunks.length > 0) {
      console.error('[ArcadIA] First raw chunk:', rawChunks[0].slice(0, 300));
    }
  }

  const totalTime = Date.now() - startTime;
  const tokensPerSecond = outputTokens && totalTime > 0 ? Math.round(outputTokens / (totalTime / 1000)) : undefined;

  addLog({
    direction: 'response',
    data: { content: fullText, toolCalls, inputTokens, outputTokens },
    model: connection.model,
    ttft,
    totalTime,
    tokensPerSecond,
    inputTokens,
    outputTokens,
    label: 'Response Complete',
  });

  const artifacts = extractArtifacts(fullText);

  return {
    content: fullText,
    thinkingText: thinkingText || undefined,
    artifacts,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    inputTokens,
    outputTokens,
    ttft,
    totalTime,
  };
}

// ─── Benchmark helper ─────────────────────────────────────────────────────────

export async function sendBenchmarkMessage(
  connection: Connection,
  prompt: string
): Promise<{ ttft: number; totalTime: number; tokensPerSecond: number; totalTokens: number }> {
  const start = Date.now();
  let ttft = 0;
  let tokenCount = 0;

  await sendMessage({
    connection,
    messages: [{ id: 'bench', role: 'user', content: prompt, timestamp: Date.now() }],
    onToken: () => {
      tokenCount++;
      if (!ttft) ttft = Date.now() - start;
    },
  });

  const totalTime = Date.now() - start;
  return {
    ttft,
    totalTime,
    tokensPerSecond: totalTime > 0 ? Math.round(tokenCount / (totalTime / 1000)) : 0,
    totalTokens: tokenCount,
  };
}
