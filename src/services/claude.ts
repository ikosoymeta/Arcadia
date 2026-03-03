import type { Artifact, Message } from '../types';

interface StreamCallbacks {
  onToken: (text: string) => void;
  onArtifact: (artifact: Artifact) => void;
  onComplete: (message: Message) => void;
  onError: (error: string) => void;
}

let abortController: AbortController | null = null;

export function abortStream(): void {
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
}

export async function sendMessage(
  messages: { role: 'user' | 'assistant'; content: string }[],
  apiKey: string,
  model: string,
  maxTokens: number,
  temperature: number,
  callbacks: StreamCallbacks
): Promise<void> {
  abortController = new AbortController();

  const startTime = performance.now();
  let firstTokenTime = 0;
  let fullText = '';
  let totalTokens = 0;

  try {
    const response = await fetch('/api/claude', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature,
        messages,
        stream: true,
        apiKey,
      }),
      signal: abortController.signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(errorData.error?.message || errorData.error || `API error: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response stream');

    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

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
    callbacks.onError(err.message || 'Unknown error');
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
): Promise<{ ttft: number; totalTime: number; tokensPerSecond: number; totalTokens: number; response: string }> {
  const startTime = performance.now();
  let firstTokenTime = 0;
  let totalTokens = 0;
  let fullText = '';

  const response = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
      apiKey,
    }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No stream');
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');
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
