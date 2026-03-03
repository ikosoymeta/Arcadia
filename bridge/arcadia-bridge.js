#!/usr/bin/env node
/**
 * ArcadIA Bridge — Local proxy that connects ArcadIA web app to Claude Code
 * 
 * This bridge runs on localhost:8087 and forwards requests from the ArcadIA
 * web app to Claude Code CLI, which handles Meta internal authentication.
 * 
 * Key: Uses `claude -p "prompt"` (not stdin pipe) because Meta's Claude Code
 * requires the -p flag for non-interactive mode.
 */

const http = require('http');
const { spawn } = require('child_process');

const PORT = 8087;
const HOST = '127.0.0.1';

// ─── CORS Headers ────────────────────────────────────────────────────────────
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, anthropic-version, anthropic-dangerous-direct-browser-access');
  res.setHeader('Access-Control-Expose-Headers', '*');
  res.setHeader('Access-Control-Max-Age', '86400');
}

// ─── Health check endpoint ───────────────────────────────────────────────────
function handleHealthCheck(res) {
  setCorsHeaders(res);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'ok',
    bridge: 'arcadia-bridge',
    version: '1.1.0',
    claude_code: true,
    meta_internal: true,
    timestamp: new Date().toISOString(),
  }));
}

// ─── Build prompt text from messages array ──────────────────────────────────
function buildPrompt(messages, systemPrompt) {
  let parts = [];

  if (systemPrompt) {
    parts.push(`[System Instructions: ${systemPrompt}]`);
  }

  // For multi-turn, include conversation history
  if (messages.length > 1) {
    const history = messages.slice(0, -1);
    for (const m of history) {
      const role = m.role === 'user' ? 'Human' : 'Assistant';
      const text = extractText(m.content);
      if (text) parts.push(`${role}: ${text}`);
    }
  }

  // Add the last user message
  const lastUserMsg = messages.filter(m => m.role === 'user').pop();
  if (!lastUserMsg) return null;

  const userText = extractText(lastUserMsg.content);
  if (messages.length > 1) {
    parts.push(`Human: ${userText}`);
  } else {
    parts.push(userText);
  }

  return parts.join('\n\n');
}

// ─── Extract text from message content (string or array) ────────────────────
function extractText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('\n');
  }
  return '';
}

// ─── Send message via Claude Code CLI ────────────────────────────────────────
function handleMessages(req, res, body) {
  setCorsHeaders(res);

  let payload;
  try {
    payload = JSON.parse(body);
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON body' }));
    return;
  }

  const messages = payload.messages || [];
  const model = payload.model || 'claude-sonnet-4-20250514';
  const maxTokens = payload.max_tokens || 4096;
  const systemPrompt = payload.system || '';
  const stream = payload.stream === true;

  const fullPrompt = buildPrompt(messages, systemPrompt);
  if (!fullPrompt) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'No user message found' }));
    return;
  }

  // Use `claude -p "prompt"` — the ONLY way that works at Meta
  // Do NOT use --print with stdin, it hangs/exits immediately
  const args = ['-p', fullPrompt, '--output-format', 'text'];

  // Note: --model and --max-tokens may not be supported by Meta's Claude Code
  // Only add them if they're likely to work
  // args.push('--model', model);

  console.log(`[${new Date().toISOString()}] → Request: model=${model}, tokens=${maxTokens}, stream=${stream}`);
  console.log(`[${new Date().toISOString()}]   Prompt: ${fullPrompt.slice(0, 120)}${fullPrompt.length > 120 ? '...' : ''}`);

  const claude = spawn('claude', args, {
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],  // stdin=ignore (not needed with -p flag)
    shell: false,
  });

  let output = '';
  let errorOutput = '';
  const startTime = Date.now();
  let firstChunk = true;

  if (stream) {
    // ─── Streaming mode (SSE) ──────────────────────────────────────────
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    // Send message_start event
    const msgId = `msg_${Date.now()}`;
    res.write(`event: message_start\ndata: ${JSON.stringify({
      type: 'message_start',
      message: {
        id: msgId,
        type: 'message',
        role: 'assistant',
        content: [],
        model: model,
        stop_reason: null,
        usage: { input_tokens: 0, output_tokens: 0 },
      },
    })}\n\n`);

    // Send content_block_start
    res.write(`event: content_block_start\ndata: ${JSON.stringify({
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: '' },
    })}\n\n`);

    let totalChars = 0;

    claude.stdout.on('data', (data) => {
      let text = data.toString();

      // Skip the "Claude Code at Meta" header line on first chunk
      if (firstChunk) {
        firstChunk = false;
        const lines = text.split('\n');
        // Only remove header lines from the very beginning
        let headerEnd = 0;
        for (let i = 0; i < Math.min(lines.length, 5); i++) {
          if (
            lines[i].includes('Claude Code at Meta') ||
            lines[i].includes('fburl.com') ||
            lines[i].includes('claude.ai') ||
            (lines[i].trim() === '' && i < 3)
          ) {
            headerEnd = i + 1;
          } else {
            break;
          }
        }
        if (headerEnd > 0) {
          lines.splice(0, headerEnd);
        }
        text = lines.join('\n');
        // Even if text is empty after header removal, don't skip — 
        // more data chunks will follow
      }

      if (!text) return; // Skip empty chunks

      totalChars += text.length;
      output += text;

      // Send as content_block_delta
      res.write(`event: content_block_delta\ndata: ${JSON.stringify({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: text },
      })}\n\n`);
    });

    claude.stderr.on('data', (data) => {
      const errText = data.toString();
      // Ignore the Meta header from stderr too
      if (!errText.includes('Claude Code at Meta') && !errText.includes('fburl.com')) {
        errorOutput += errText;
      }
    });

    claude.on('close', (code) => {
      const elapsed = Date.now() - startTime;

      if ((code !== 0 && code !== null) && !output) {
        res.write(`event: content_block_delta\ndata: ${JSON.stringify({
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: `\n\n[Bridge Error: Claude Code exited with code ${code}. ${errorOutput.slice(0, 200)}]` },
        })}\n\n`);
      }

      // Send content_block_stop
      res.write(`event: content_block_stop\ndata: ${JSON.stringify({ type: 'content_block_stop', index: 0 })}\n\n`);

      // Send message_delta with usage
      const estimatedInputTokens = Math.ceil(fullPrompt.length / 4);
      const estimatedOutputTokens = Math.ceil(totalChars / 4);
      res.write(`event: message_delta\ndata: ${JSON.stringify({
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: { output_tokens: estimatedOutputTokens },
      })}\n\n`);

      // Send message_stop
      res.write(`event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`);
      res.end();

      console.log(`[${new Date().toISOString()}] ← Response: ${totalChars} chars in ${elapsed}ms (code=${code})`);
    });

    claude.on('error', (err) => {
      console.error(`[${new Date().toISOString()}] ✗ Spawn error: ${err.message}`);
      res.write(`event: content_block_delta\ndata: ${JSON.stringify({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: `\n\n[Bridge Error: Could not start Claude Code. Is it installed? Error: ${err.message}]` },
      })}\n\n`);
      res.write(`event: content_block_stop\ndata: ${JSON.stringify({ type: 'content_block_stop', index: 0 })}\n\n`);
      res.write(`event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`);
      res.end();
    });

    // Handle client disconnect
    req.on('close', () => {
      claude.kill('SIGTERM');
    });

  } else {
    // ─── Non-streaming mode ────────────────────────────────────────────
    claude.stdout.on('data', (data) => {
      let text = data.toString();

      // Skip header on first chunk
      if (firstChunk) {
        firstChunk = false;
        const lines = text.split('\n');
        let headerEnd = 0;
        for (let i = 0; i < Math.min(lines.length, 5); i++) {
          if (
            lines[i].includes('Claude Code at Meta') ||
            lines[i].includes('fburl.com') ||
            lines[i].includes('claude.ai') ||
            (lines[i].trim() === '' && i < 3)
          ) {
            headerEnd = i + 1;
          } else {
            break;
          }
        }
        if (headerEnd > 0) {
          lines.splice(0, headerEnd);
        }
        text = lines.join('\n');
      }

      output += text;
    });

    claude.stderr.on('data', (data) => {
      const errText = data.toString();
      if (!errText.includes('Claude Code at Meta') && !errText.includes('fburl.com')) {
        errorOutput += errText;
      }
    });

    claude.on('close', (code) => {
      const elapsed = Date.now() - startTime;

      if ((code !== 0 && code !== null) && !output) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: {
            type: 'bridge_error',
            message: `Claude Code exited with code ${code}: ${errorOutput.slice(0, 500)}`,
          },
        }));
        console.log(`[${new Date().toISOString()}] ✗ Error: code=${code} ${errorOutput.slice(0, 100)}`);
        return;
      }

      const trimmedOutput = output.trim();
      const estimatedInputTokens = Math.ceil(fullPrompt.length / 4);
      const estimatedOutputTokens = Math.ceil(trimmedOutput.length / 4);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id: `msg_${Date.now()}`,
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: trimmedOutput }],
        model: model,
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: {
          input_tokens: estimatedInputTokens,
          output_tokens: estimatedOutputTokens,
        },
      }));
      console.log(`[${new Date().toISOString()}] ← Response: ${trimmedOutput.length} chars in ${elapsed}ms`);
    });

    claude.on('error', (err) => {
      console.error(`[${new Date().toISOString()}] ✗ Spawn error: ${err.message}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: {
          type: 'bridge_error',
          message: `Could not start Claude Code: ${err.message}`,
        },
      }));
    });
  }
}

// ─── HTTP Server ─────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    setCorsHeaders(res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
    handleHealthCheck(res);
    return;
  }

  if (req.method === 'POST' && req.url === '/v1/messages') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => handleMessages(req, res, body));
    return;
  }

  setCorsHeaders(res);
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found. Use POST /v1/messages' }));
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════════════════╗');
  console.log('  ║                                                          ║');
  console.log('  ║   ⚡ ArcadIA Bridge v1.1.0                              ║');
  console.log('  ║                                                          ║');
  console.log(`  ║   Running on http://${HOST}:${PORT}                    ║`);
  console.log('  ║   Forwarding requests to Claude Code (via -p flag)       ║');
  console.log('  ║   Auth: Meta internal (via meta@Meta plugin)             ║');
  console.log('  ║                                                          ║');
  console.log('  ║   Open ArcadIA: https://ikosoymeta.github.io/Arcadia/    ║');
  console.log('  ║                                                          ║');
  console.log('  ╚══════════════════════════════════════════════════════════╝');
  console.log('');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  ✗ Port ${PORT} is already in use. Another bridge may be running.\n`);
  } else {
    console.error(`\n  ✗ Server error: ${err.message}\n`);
  }
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('\n  Bridge stopped.\n');
  server.close();
  process.exit(0);
});
process.on('SIGTERM', () => {
  server.close();
  process.exit(0);
});
