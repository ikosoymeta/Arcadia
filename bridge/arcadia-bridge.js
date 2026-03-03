#!/usr/bin/env node
/**
 * ArcadIA Bridge — Local proxy that connects ArcadIA web app to Claude Code
 * 
 * This bridge runs on localhost:8087 and forwards requests from the ArcadIA
 * web app to Claude Code CLI, which handles Meta internal authentication.
 * 
 * Usage:
 *   node arcadia-bridge.js
 *   # or
 *   npx arcadia-bridge
 * 
 * The bridge:
 *   1. Listens on localhost:8087
 *   2. Receives Anthropic API-compatible requests from the browser
 *   3. Pipes them through `claude` CLI (which handles Meta auth)
 *   4. Returns responses with CORS headers for browser compatibility
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
    version: '1.0.0',
    claude_code: true,
    meta_internal: true,
    timestamp: new Date().toISOString(),
  }));
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

  // Build the prompt from messages
  let prompt = '';
  if (systemPrompt) {
    prompt += `[System: ${systemPrompt}]\n\n`;
  }
  // Get the last user message for Claude CLI
  const lastUserMsg = messages.filter(m => m.role === 'user').pop();
  if (!lastUserMsg) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'No user message found' }));
    return;
  }

  // Extract text content (handle both string and array content)
  let userText = '';
  if (typeof lastUserMsg.content === 'string') {
    userText = lastUserMsg.content;
  } else if (Array.isArray(lastUserMsg.content)) {
    userText = lastUserMsg.content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('\n');
  }

  // Build conversation context for multi-turn
  let contextPrefix = '';
  if (messages.length > 1) {
    const history = messages.slice(0, -1);
    contextPrefix = history.map(m => {
      const role = m.role === 'user' ? 'Human' : 'Assistant';
      const text = typeof m.content === 'string' ? m.content :
        Array.isArray(m.content) ? m.content.filter(c => c.type === 'text').map(c => c.text).join('\n') : '';
      return `${role}: ${text}`;
    }).join('\n\n') + '\n\nHuman: ';
  }

  const fullPrompt = contextPrefix + userText;

  // Spawn claude CLI with --print flag (outputs response only, no interactive UI)
  const args = ['--print', '--model', model];
  if (maxTokens) {
    args.push('--max-tokens', String(maxTokens));
  }
  if (systemPrompt) {
    args.push('--system-prompt', systemPrompt);
  }

  console.log(`[${new Date().toISOString()}] → Request: model=${model}, tokens=${maxTokens}, stream=${stream}`);
  console.log(`[${new Date().toISOString()}]   Prompt: ${userText.slice(0, 100)}${userText.length > 100 ? '...' : ''}`);

  const claude = spawn('claude', args, {
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  // Send the prompt via stdin
  claude.stdin.write(fullPrompt);
  claude.stdin.end();

  let output = '';
  let errorOutput = '';
  const startTime = Date.now();

  if (stream) {
    // ─── Streaming mode (SSE) ──────────────────────────────────────────
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    // Send message_start event
    const msgStartEvent = {
      type: 'message_start',
      message: {
        id: `msg_${Date.now()}`,
        type: 'message',
        role: 'assistant',
        content: [],
        model: model,
        stop_reason: null,
        usage: { input_tokens: 0, output_tokens: 0 },
      },
    };
    res.write(`event: message_start\ndata: ${JSON.stringify(msgStartEvent)}\n\n`);

    // Send content_block_start
    res.write(`event: content_block_start\ndata: ${JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })}\n\n`);

    let chunkBuffer = '';
    let totalChars = 0;

    claude.stdout.on('data', (data) => {
      const text = data.toString();
      chunkBuffer += text;
      totalChars += text.length;

      // Send as content_block_delta events
      const delta = {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: text },
      };
      res.write(`event: content_block_delta\ndata: ${JSON.stringify(delta)}\n\n`);
    });

    claude.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    claude.on('close', (code) => {
      const elapsed = Date.now() - startTime;
      if (code !== 0 && !chunkBuffer) {
        // Error — send as a delta so the user sees it
        const errDelta = {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: `\n\n[Bridge Error: Claude Code exited with code ${code}. ${errorOutput.slice(0, 200)}]` },
        };
        res.write(`event: content_block_delta\ndata: ${JSON.stringify(errDelta)}\n\n`);
      }

      // Send content_block_stop
      res.write(`event: content_block_stop\ndata: ${JSON.stringify({ type: 'content_block_stop', index: 0 })}\n\n`);

      // Send message_delta with stop reason and usage
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

    // Handle client disconnect
    req.on('close', () => {
      claude.kill('SIGTERM');
    });

  } else {
    // ─── Non-streaming mode ────────────────────────────────────────────
    claude.stdout.on('data', (data) => {
      output += data.toString();
    });

    claude.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    claude.on('close', (code) => {
      const elapsed = Date.now() - startTime;

      if (code !== 0 && !output) {
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

      const estimatedInputTokens = Math.ceil(fullPrompt.length / 4);
      const estimatedOutputTokens = Math.ceil(output.length / 4);

      const response = {
        id: `msg_${Date.now()}`,
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: output.trim() }],
        model: model,
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: {
          input_tokens: estimatedInputTokens,
          output_tokens: estimatedOutputTokens,
        },
      };

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));
      console.log(`[${new Date().toISOString()}] ← Response: ${output.length} chars in ${elapsed}ms`);
    });
  }
}

// ─── HTTP Server ─────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    setCorsHeaders(res);
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
    handleHealthCheck(res);
    return;
  }

  // Messages endpoint (Anthropic API compatible)
  if (req.method === 'POST' && req.url === '/v1/messages') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => handleMessages(req, res, body));
    return;
  }

  // 404
  setCorsHeaders(res);
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found. Use POST /v1/messages' }));
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════════════════╗');
  console.log('  ║                                                          ║');
  console.log('  ║   ⚡ ArcadIA Bridge v1.0.0                              ║');
  console.log('  ║                                                          ║');
  console.log(`  ║   Running on http://${HOST}:${PORT}                    ║`);
  console.log('  ║   Forwarding requests to Claude Code CLI                 ║');
  console.log('  ║   Auth: Meta internal (via meta@Meta plugin)             ║');
  console.log('  ║                                                          ║');
  console.log('  ║   Open ArcadIA: https://ikosoymeta.github.io/Arcadia/    ║');
  console.log('  ║   The app will auto-connect to this bridge.              ║');
  console.log('  ║                                                          ║');
  console.log('  ║   Press Ctrl+C to stop                                   ║');
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

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n  Bridge stopped.\n');
  server.close();
  process.exit(0);
});
process.on('SIGTERM', () => {
  server.close();
  process.exit(0);
});
