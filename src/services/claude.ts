import type { Artifact, Message } from '../types';

interface StreamCallbacks {
  onToken: (text: string) => void;
  onArtifact: (artifact: Artifact) => void;
  onComplete: (message: Message) => void;
  onError: (error: string) => void;
}

let abortController: AbortController | null = null;

const IS_DEV = import.meta.env.DEV;
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

// Detect if running on Meta internal infrastructure
const IS_META_INTERNAL = typeof window !== 'undefined' && (
  window.location.hostname.includes('.intern.facebook.com') ||
  window.location.hostname.includes('.internalfb.com') ||
  window.location.hostname.includes('.thefacebook.com')
);

export function abortStream(): void {
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
}

/**
 * Build the fetch request depending on environment and connection config:
 * - Custom baseUrl (Meta proxy): call baseUrl/v1/messages directly, no API key header
 * - Development (no baseUrl): use Vite proxy at /api/claude
 * - Production (no baseUrl): call Anthropic API directly with browser-access header
 */
function buildRequest(
  apiKey: string,
  payload: Record<string, unknown>,
  signal: AbortSignal,
  baseUrl?: string,
): { url: string; init: RequestInit } {
  // Custom endpoint (e.g. Meta LDAR proxy at localhost:8087)
  if (baseUrl) {
    const url = baseUrl.replace(/\/+$/, '');
    return {
      url: `${url}/v1/messages`,
      init: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(payload),
        signal,
      },
    };
  }

  // Meta internal deployment: use co-located proxy (no API key needed)
  if (IS_META_INTERNAL) {
    return {
      url: '/v1/messages',
      init: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(payload),
        signal,
      },
    };
  }

  if (IS_DEV) {
    return {
      url: '/api/claude',
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, apiKey }),
        signal,
      },
    };
  }

  // Production: direct Anthropic API call
  return {
    url: ANTHROPIC_API_URL,
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(payload),
      signal,
    },
  };
}

export async function sendMessage(
  messages: { role: 'user' | 'assistant'; content: string }[],
  apiKey: string,
  model: string,
  maxTokens: number,
  temperature: number,
  callbacks: StreamCallbacks,
  systemPrompt?: string,
  baseUrl?: string,
): Promise<void> {
  abortController = new AbortController();

  const startTime = performance.now();
  let firstTokenTime = 0;
  let fullText = '';
  let totalTokens = 0;

  try {
    const payload: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      temperature,
      messages,
      stream: true,
      ...(systemPrompt ? { system: systemPrompt } : {}),
    };

    const { url, init } = buildRequest(apiKey, payload, abortController.signal, baseUrl);
    const response = await fetch(url, init);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(errorData.error?.message || errorData.error || `API error: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response stream');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // keep last (potentially incomplete) line

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') continue;

        try {
          const event = JSON.parse(data);

          if (event.type === 'content_block_delta' && event.delta?.text) {
            if (!firstTokenTime) firstTokenTime = performance.now();
            fullText += event.delta.text;
            totalTokens++;
            callbacks.onToken(event.delta.text);
          }

          if (event.type === 'message_delta' && event.usage) {
            totalTokens = event.usage.output_tokens || totalTokens;
          }
        } catch {
          // skip non-JSON lines
        }
      }
    }

    // Extract artifacts from the full text
    const artifacts = extractArtifacts(fullText);
    artifacts.forEach(a => callbacks.onArtifact(a));

    const endTime = performance.now();
    const message: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: fullText,
      timestamp: Date.now(),
      tokens: totalTokens,
      artifacts,
    };

    // Attach performance metrics
    (message as any)._perf = {
      ttft: firstTokenTime ? firstTokenTime - startTime : 0,
      totalTime: endTime - startTime,
      tokensPerSecond: totalTokens / ((endTime - startTime) / 1000),
    };

    callbacks.onComplete(message);
  } catch (err: any) {
    if (err.name === 'AbortError') return;
    // Provide actionable error messages
    if (err.message === 'Failed to fetch' || err.name === 'TypeError') {
      if (baseUrl) {
        callbacks.onError(
          `Cannot reach ${baseUrl}. ` +
          (baseUrl.includes('localhost:8087')
            ? 'Make sure LDAR is running on your devserver, or switch to API Key mode in Settings.'
            : 'Check that the proxy URL is correct in Settings.'),
        );
      } else if (!apiKey) {
        callbacks.onError('No API key configured. Go to Settings to add one.');
      } else {
        callbacks.onError('Network error. Check your internet connection and try again.');
      }
    } else {
      callbacks.onError(err.message || 'Unknown error');
    }
  }
}

function extractArtifacts(text: string): Artifact[] {
  const artifacts: Artifact[] = [];
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  let match;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    const language = match[1] || 'text';
    const content = match[2].trim();

    const isHtml = language === 'html' && (
      content.includes('<html') ||
      content.includes('<!DOCTYPE') ||
      content.includes('<body') ||
      (content.includes('<div') && content.includes('<style'))
    );

    artifacts.push({
      id: crypto.randomUUID(),
      type: isHtml ? 'html' : 'code',
      language,
      content,
      title: `${language} snippet`,
    });
  }

  return artifacts;
}

// Direct API call for benchmarking (non-streaming)
export async function sendBenchmarkMessage(
  prompt: string,
  apiKey: string,
  model: string,
  baseUrl?: string,
): Promise<{ ttft: number; totalTime: number; tokensPerSecond: number; totalTokens: number; response: string }> {
  const startTime = performance.now();
  let firstTokenTime = 0;
  let totalTokens = 0;
  let fullText = '';

  const payload: Record<string, unknown> = {
    model,
    max_tokens: 1024,
    temperature: 0,
    messages: [{ role: 'user', content: prompt }],
    stream: true,
  };

  const { url, init } = buildRequest(apiKey, payload, new AbortController().signal, baseUrl);
  const response = await fetch(url, init);

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No stream');
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);
      if (data === '[DONE]') continue;
      try {
        const event = JSON.parse(data);
        if (event.type === 'content_block_delta' && event.delta?.text) {
          if (!firstTokenTime) firstTokenTime = performance.now();
          fullText += event.delta.text;
          totalTokens++;
        }
        if (event.type === 'message_delta' && event.usage) {
          totalTokens = event.usage.output_tokens || totalTokens;
        }
      } catch { /* skip */ }
    }
  }

  const endTime = performance.now();
  return {
    ttft: firstTokenTime ? firstTokenTime - startTime : 0,
    totalTime: endTime - startTime,
    tokensPerSecond: totalTokens / ((endTime - startTime) / 1000),
    totalTokens,
    response: fullText,
  };
}

/**
 * Test an API connection. Used by onboarding and settings.
 * Works in both dev (proxy) and production (direct) modes.
 */
export async function testConnection(apiKey: string, model: string, baseUrl?: string): Promise<boolean> {
  const payload: Record<string, unknown> = {
    model,
    max_tokens: 10,
    messages: [{ role: 'user', content: 'Say "connected" in one word.' }],
  };

  try {
    const { url, init } = buildRequest(apiKey, payload, new AbortController().signal, baseUrl);
    const response = await fetch(url, init);
    return response.ok;
  } catch {
    return false;
  }
}
