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

// ─── Context Window Management ───────────────────────────────────────────────
// Rough token estimation: ~4 chars per token for English text
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function estimateMessageTokens(msg: Message): number {
  let tokens = estimateTokens(msg.content);
  if (msg.contentBlocks) {
    for (const block of msg.contentBlocks) {
      if ('text' in block && typeof block.text === 'string') {
        tokens += estimateTokens(block.text);
      }
      if ('input' in block && block.input) {
        tokens += estimateTokens(JSON.stringify(block.input));
      }
    }
  }
  if (msg.thinkingText) tokens += estimateTokens(msg.thinkingText);
  return tokens;
}

// Model context window sizes (input token limits)
const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  'claude-sonnet-4-20250514': 200000,
  'claude-opus-4-20250514': 200000,
  'claude-3-5-sonnet-20241022': 200000,
  'claude-3-5-haiku-20241022': 200000,
  'claude-3-haiku-20240307': 200000,
  'claude-3-opus-20240229': 200000,
};

function getContextLimit(model: string): number {
  // Check exact match first, then prefix match
  if (MODEL_CONTEXT_LIMITS[model]) return MODEL_CONTEXT_LIMITS[model];
  for (const [key, limit] of Object.entries(MODEL_CONTEXT_LIMITS)) {
    if (model.startsWith(key.split('-').slice(0, 3).join('-'))) return limit;
  }
  return 200000; // Default to 200k
}

/**
 * Trim messages to fit within the model's context window.
 * Strategy:
 * - Always keep the system prompt + first user message + last N messages
 * - For trimmed middle messages, insert a summary placeholder
 * - Reserve 20% of context for the response
 */
export function trimMessagesForContext(
  messages: Message[],
  model: string,
  systemPromptTokens: number = 0
): Message[] {
  const contextLimit = getContextLimit(model);
  const responseReserve = Math.min(contextLimit * 0.2, 8192); // Reserve 20% or 8k for response
  const availableTokens = contextLimit - responseReserve - systemPromptTokens;

  // Calculate total tokens
  let totalTokens = 0;
  const tokenCounts = messages.map(m => {
    const t = estimateMessageTokens(m);
    totalTokens += t;
    return t;
  });

  // If we're within limits, return as-is
  if (totalTokens <= availableTokens) return messages;

  // Strategy: keep first message + as many recent messages as possible
  const result: Message[] = [];
  let usedTokens = 0;

  // Always keep the first user message for context
  if (messages.length > 0) {
    result.push(messages[0]);
    usedTokens += tokenCounts[0];
  }

  // Add a summary placeholder for trimmed messages
  const summaryMsg: Message = {
    id: 'context-summary',
    role: 'user' as const,
    content: '[Earlier messages were trimmed to fit the context window. The conversation continues below.]',
    timestamp: Date.now(),
  };
  const summaryTokens = estimateMessageTokens(summaryMsg);
  usedTokens += summaryTokens;

  // Fill from the end (most recent messages first)
  const recentMessages: Message[] = [];
  for (let i = messages.length - 1; i >= 1; i--) {
    if (usedTokens + tokenCounts[i] > availableTokens) break;
    recentMessages.unshift(messages[i]);
    usedTokens += tokenCounts[i];
  }

  // Only add summary if we actually trimmed something
  if (recentMessages.length < messages.length - 1) {
    result.push(summaryMsg);
    // Ensure alternating user/assistant roles
    if (recentMessages.length > 0 && recentMessages[0].role === 'user' && result[result.length - 1].role === 'user') {
      result.push({
        id: 'context-bridge',
        role: 'assistant' as const,
        content: 'Understood. Continuing from the recent conversation.',
        timestamp: Date.now(),
      });
    }
  }

  result.push(...recentMessages);

  addLog({
    direction: 'request',
    data: {
      originalMessages: messages.length,
      trimmedTo: result.length,
      originalTokens: totalTokens,
      trimmedTokens: usedTokens,
      contextLimit,
    },
    label: `Context trimmed: ${messages.length} → ${result.length} messages`,
  });

  return result;
}

// ─── Error Detection & User-Friendly Messages ──────────────────────────────

interface DetectedError {
  type: 'api_error' | 'bridge_error' | 'rate_limit' | 'content_policy' | 'timeout' | 'server_error' | 'cli_error';
  statusCode?: number;
  title: string;
  message: string;
  suggestion: string;
}

export function detectErrorInContent(content: string): DetectedError | null {
  const c = content.trim();

  // HTTP 451 — Content policy / legal restriction
  const match451 = c.match(/(?:API Error|Error):?\s*451\s*(?:status code)?/i);
  if (match451) {
    return {
      type: 'content_policy',
      statusCode: 451,
      title: 'Content Policy Restriction (HTTP 451)',
      message: 'Meta\'s content policy system flagged this request. This can happen with certain topics, long prompts, or prompts that trigger automated safety filters — even when the content is benign.',
      suggestion: 'Try rephrasing your request, breaking it into smaller parts, or using a different prompt. This is a Meta infrastructure restriction, not an ArcadIA issue.',
    };
  }

  // HTTP 429 — Rate limiting
  const match429 = c.match(/(?:API Error|Error):?\s*429/i) || c.match(/rate.?limit/i) || c.match(/too many requests/i);
  if (match429) {
    return {
      type: 'rate_limit',
      statusCode: 429,
      title: 'Rate Limited (HTTP 429)',
      message: 'You\'ve hit the API rate limit. Claude Code at Meta has usage quotas that reset periodically.',
      suggestion: 'Wait a minute and try again. If this persists, check your Claude Code usage quota.',
    };
  }

  // HTTP 5xx — Server errors
  const match5xx = c.match(/(?:API Error|Error):?\s*(5\d{2})\s*(?:status code)?/i);
  if (match5xx) {
    return {
      type: 'server_error',
      statusCode: parseInt(match5xx[1]),
      title: `Server Error (HTTP ${match5xx[1]})`,
      message: 'The Claude Code API server returned an error. This is typically a temporary issue with Meta\'s infrastructure.',
      suggestion: 'Wait a moment and retry. If the issue persists, check the Claude Code at Meta status page.',
    };
  }

  // Generic API Error with status code
  const matchApi = c.match(/API Error:?\s*(\d{3})\s*status code/i);
  if (matchApi) {
    const code = parseInt(matchApi[1]);
    return {
      type: 'api_error',
      statusCode: code,
      title: `API Error (HTTP ${code})`,
      message: `Claude Code returned HTTP ${code}. This may indicate a temporary service issue or a problem with the request.`,
      suggestion: 'Try again with a simpler prompt. If the error persists, restart the bridge and try again.',
    };
  }

  // Bridge errors
  const matchBridge = c.match(/\[Bridge Error:(.+?)\]/s);
  if (matchBridge) {
    const detail = matchBridge[1].trim();
    if (detail.includes('timed out')) {
      return {
        type: 'timeout',
        title: 'Request Timed Out',
        message: 'Claude Code took too long to respond. Complex prompts or heavy server load can cause timeouts.',
        suggestion: 'Try a shorter or simpler prompt. If this keeps happening, the Claude Code service may be under heavy load.',
      };
    }
    return {
      type: 'bridge_error',
      title: 'Bridge Error',
      message: `The ArcadIA bridge encountered an issue: ${detail}`,
      suggestion: 'Check that the bridge is running and restart it if needed: pkill -f arcadia-bridge && node bridge/arcadia-bridge.js',
    };
  }

  // CLI not found
  if (c.includes('command not found') && c.includes('claude')) {
    return {
      type: 'cli_error',
      title: 'Claude Code Not Found',
      message: 'The Claude Code CLI is not installed or not in the system PATH.',
      suggestion: 'Install Claude Code at Meta: https://fburl.com/claude.code.users',
    };
  }

  return null;
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
  pipelineTimings?: {
    fetchLatency: number;
    firstSSELatency: number;
    streamDuration: number;
  };
}

export async function sendMessage(opts: SendMessageOptions): Promise<SendMessageResult> {
  const { connection, messages, systemPrompt, tools, enableThinking, thinkingBudget, onToken, onThinking, onToolCall, signal } = opts;

  const endpoint = buildEndpoint(connection);
  const headers = buildHeaders(connection);
  const startTime = Date.now();
  const perfStart = performance.now();
  let ttft: number | undefined;
  let fetchResponseTime: number | undefined;

  // Performance marks for Chrome DevTools profiling (namespaced per request for concurrency)
  const reqId = crypto.randomUUID().slice(0, 8);
  performance.mark(`arcadia:send-start:${reqId}`);

  // Build system prompt with folder instructions if any
  const systemParts: string[] = [];
  if (systemPrompt) systemParts.push(systemPrompt);
  const system = systemParts.join('\n\n') || undefined;

  // Context window management: trim messages if they exceed the model's limit
  const systemTokens = system ? estimateTokens(system) : 0;
  const trimmedMessages = trimMessagesForContext(messages, connection.model, systemTokens);

  // Build request body
  const body: Record<string, unknown> = {
    model: connection.model,
    max_tokens: connection.maxTokens || 4096,
    messages: convertMessages(trimmedMessages),
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

  // No auth token needed — bridge uses CORS-based security

  // Retry with exponential backoff for 429/5xx errors
  const MAX_RETRIES = 3;
  const BASE_DELAY_MS = 1000;
  let lastError: Error | null = null;
  let res: Response | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
      });

      if (res.ok) break; // Success

      // Check if retryable
      const isRetryable = res.status === 429 || res.status >= 500;
      if (!isRetryable || attempt === MAX_RETRIES) {
        const errBody = await res.json().catch(() => ({}));
        const errMsg = (errBody as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`;
        addLog({ direction: 'error', data: errBody, label: `Error: ${res.status}` });
        throw new Error(errMsg);
      }

      // Exponential backoff: 1s, 2s, 4s
      const delay = BASE_DELAY_MS * Math.pow(2, attempt);
      const jitter = Math.random() * 500;
      addLog({ direction: 'error', data: { status: res.status, attempt: attempt + 1, retryIn: delay }, label: `Retry ${attempt + 1}/${MAX_RETRIES} after ${res.status}` });
      await new Promise(resolve => setTimeout(resolve, delay + jitter));
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err;
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt === MAX_RETRIES) throw lastError;
      const delay = BASE_DELAY_MS * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  if (!res || !res.ok) {
    throw lastError || new Error('Request failed after retries');
  }

  // Mark fetch response time for pipeline profiling
  performance.mark(`arcadia:fetch-response:${reqId}`);
  fetchResponseTime = performance.now();

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
  let rawBody = ''; // Collect raw response only for non-SSE fallback
  let eventCount = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    if (eventCount === 0) rawBody += chunk; // Only accumulate until we confirm SSE
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
          if (!ttft) {
            ttft = Date.now() - startTime;
            performance.mark(`arcadia:first-token:${reqId}`);
          }
          fullText += text;
          onToken?.(text);
        }

        if (delta.type === 'thinking_delta') {
          const thinking = delta.thinking as string;
          thinkingText += thinking;
          onThinking?.(thinking);
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
  if (eventCount === 0 && rawBody.length > 0) {
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
    console.error('[ArcadIA] Empty response. Events parsed:', eventCount, 'Raw body length:', rawBody.length);
    if (rawBody.length > 0) {
      console.error('[ArcadIA] Raw body start:', rawBody.slice(0, 300));
    }
  }

  const totalTime = Date.now() - startTime;
  const perfEnd = performance.now();
  const tokensPerSecond = outputTokens && totalTime > 0 ? Math.round(outputTokens / (totalTime / 1000)) : undefined;

  // Pipeline profiling: compute per-stage timings and emit DevTools measures
  performance.mark(`arcadia:stream-end:${reqId}`);
  let pipelineTimings: SendMessageResult['pipelineTimings'];
  try {
    performance.measure(`arcadia:fetch:${reqId}`, `arcadia:send-start:${reqId}`, `arcadia:fetch-response:${reqId}`);
    if (ttft) {
      performance.measure(`arcadia:model-wait:${reqId}`, `arcadia:fetch-response:${reqId}`, `arcadia:first-token:${reqId}`);
      performance.measure(`arcadia:streaming:${reqId}`, `arcadia:first-token:${reqId}`, `arcadia:stream-end:${reqId}`);
    }
    performance.measure(`arcadia:total:${reqId}`, `arcadia:send-start:${reqId}`, `arcadia:stream-end:${reqId}`);
  } catch { /* marks may be missing if request failed early */ }

  if (fetchResponseTime !== undefined) {
    const fetchLatency = Math.round(fetchResponseTime - perfStart);
    pipelineTimings = {
      fetchLatency,
      firstSSELatency: ttft ? Math.round(ttft - fetchLatency) : 0,
      streamDuration: ttft ? Math.round(perfEnd - perfStart - ttft) : Math.round(perfEnd - perfStart),
    };
  }

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
    pipelineTimings,
  };
}

// ─── Benchmark helper ─────────────────────────────────────────────────────────

export async function sendBenchmarkMessage(
  connection: Connection,
  prompt: string
): Promise<{ ttft: number; totalTime: number; tokensPerSecond: number; totalTokens: number; pipelineTimings?: SendMessageResult['pipelineTimings'] }> {
  const start = Date.now();
  let ttft = 0;
  let tokenCount = 0;

  const result = await sendMessage({
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
    pipelineTimings: result.pipelineTimings,
  };
}
