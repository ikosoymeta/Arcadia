#!/usr/bin/env node
/**
 * ArcadIA Bridge v2.0.0 — Local proxy connecting ArcadIA web app to Claude Code
 * 
 * Runs on localhost:8087 and forwards requests from the ArcadIA web app
 * to Claude Code CLI, which handles Meta internal authentication.
 * 
 * v2.0.0 improvements:
 * - SSE keepalive pings every 2s so the browser doesn't time out
 * - Progress status events sent to frontend during long waits
 * - Warm-up spawn on startup to pre-authenticate Claude Code
 * - Fixed res.on('close') for proper client disconnect detection
 */

const http = require('http');
const { spawn, execSync } = require('child_process');
const os = require('os');

const PORT = 8087;
const HOST = '127.0.0.1';
const VERSION = '2.0.0';
const TIMEOUT_MS = 180000; // 3 minute timeout (increased for slow first requests)
const KEEPALIVE_INTERVAL_MS = 2000; // Send SSE comment every 2s to keep connection alive

// ─── Detect Claude Code path ────────────────────────────────────────────────
let CLAUDE_PATH = 'claude';
try {
  const which = execSync('which claude 2>/dev/null || where claude 2>/dev/null', { encoding: 'utf-8', shell: true }).trim();
  if (which) {
    CLAUDE_PATH = which.split('\n')[0].trim();
    console.log(`  Found Claude Code at: ${CLAUDE_PATH}`);
  }
} catch {
  console.log('  Using default "claude" command from PATH');
}

// ─── Verify Claude Code works ───────────────────────────────────────────────
let claudeVersion = 'unknown';
try {
  claudeVersion = execSync(`"${CLAUDE_PATH}" --version 2>&1`, { encoding: 'utf-8', shell: true, timeout: 10000 }).trim();
  console.log(`  Claude Code version: ${claudeVersion}`);
} catch (e) {
  console.warn(`  ⚠ Could not get Claude Code version: ${e.message}`);
}

// ─── Warm-up: pre-spawn claude to trigger auth/plugin loading ───────────────
let warmedUp = false;
let warmupTime = 0;

function warmUp() {
  console.log('  ⏳ Warming up Claude Code (pre-loading auth & plugins)...');
  const start = Date.now();
  const warmup = spawn(CLAUDE_PATH, ['-p'], {
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: false,
  });
  warmup.stdin.write('hi');
  warmup.stdin.end();
  warmup.on('close', (code) => {
    warmupTime = Date.now() - start;
    warmedUp = true;
    console.log(`  ✓ Warm-up complete in ${(warmupTime / 1000).toFixed(1)}s (exit code: ${code})`);
  });
  warmup.on('error', () => {
    warmedUp = true;
    console.log('  ⚠ Warm-up failed, first request may be slow');
  });
}

// ─── Request tracking ───────────────────────────────────────────────────────
let totalRequests = 0;
let activeRequests = 0;
let avgResponseTime = 0;

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
    version: VERSION,
    claude_code: true,
    meta_internal: true,
    claude_path: CLAUDE_PATH,
    claude_version: claudeVersion,
    warmed_up: warmedUp,
    warmup_time_ms: warmupTime,
    stats: {
      total_requests: totalRequests,
      active_requests: activeRequests,
      avg_response_time_ms: Math.round(avgResponseTime),
    },
    timestamp: new Date().toISOString(),
  }));
}

// ─── Build prompt text from messages array ──────────────────────────────────
function buildPrompt(messages, systemPrompt) {
  let parts = [];

  if (systemPrompt) {
    parts.push(`[System Instructions: ${systemPrompt}]`);
  }

  if (messages.length > 1) {
    const history = messages.slice(0, -1);
    for (const m of history) {
      const role = m.role === 'user' ? 'Human' : 'Assistant';
      const text = extractText(m.content);
      if (text) parts.push(`${role}: ${text}`);
    }
  }

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

// ─── Strip Claude Code header lines ─────────────────────────────────────────
function stripHeader(text) {
  const lines = text.split('\n');
  let headerEnd = 0;
  
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const line = lines[i];
    if (
      line.includes('Claude Code at Meta') ||
      line.includes('fburl.com') ||
      line.includes('claude.ai') ||
      line.includes('╭') || line.includes('╰') ||
      line.includes('│') ||
      (line.trim() === '' && i < 3 && headerEnd === i)
    ) {
      headerEnd = i + 1;
    } else {
      break;
    }
  }
  
  if (headerEnd > 0) {
    return lines.slice(headerEnd).join('\n');
  }
  return text;
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

  totalRequests++;
  activeRequests++;
  const reqNum = totalRequests;

  console.log(`[${new Date().toISOString()}] → #${reqNum} Request: model=${model}, tokens=${maxTokens}, stream=${stream}`);
  console.log(`[${new Date().toISOString()}]   Prompt: ${fullPrompt.slice(0, 120)}${fullPrompt.length > 120 ? '...' : ''}`);

  // Spawn claude directly and write prompt to stdin
  console.log(`[${new Date().toISOString()}]   Spawning: claude -p`);

  const claude = spawn(CLAUDE_PATH, ['-p'], {
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: false,
  });

  // Write the prompt to stdin and close it
  try {
    claude.stdin.write(fullPrompt);
    claude.stdin.end();
  } catch (e) {
    activeRequests--;
    console.error(`[${new Date().toISOString()}] ✗ Failed to write to stdin: ${e.message}`);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to send prompt to Claude Code' }));
    return;
  }

  let output = '';
  let errorOutput = '';
  let stderrLines = [];
  const startTime = Date.now();
  let headerStripped = false;
  let killed = false;
  let responseFinished = false;
  let firstTokenReceived = false;

  // Set timeout
  const timeout = setTimeout(() => {
    if (!killed) {
      killed = true;
      claude.kill('SIGTERM');
      console.error(`[${new Date().toISOString()}] ✗ #${reqNum} Request timed out after ${TIMEOUT_MS / 1000}s`);
    }
  }, TIMEOUT_MS);

  // Clean up on done
  function cleanup() {
    clearTimeout(timeout);
    clearInterval(keepalive);
    activeRequests--;
  }

  if (stream) {
    // ─── Streaming mode (SSE) ──────────────────────────────────────────
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering if behind proxy
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

    // ─── SSE Keepalive: send comment pings every 2s ──────────────────
    // This prevents the browser/proxy from timing out the connection
    // while waiting for Claude Code to load and respond.
    const keepalive = setInterval(() => {
      if (!responseFinished && !killed) {
        try {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
          // SSE comments (lines starting with :) are ignored by EventSource
          // but keep the connection alive
          res.write(`: keepalive ${elapsed}s\n\n`);
        } catch (e) {
          // Connection may have closed
        }
      }
    }, KEEPALIVE_INTERVAL_MS);

    claude.stdout.on('data', (data) => {
      let text = data.toString();

      if (!firstTokenReceived) {
        firstTokenReceived = true;
        const ttft = Date.now() - startTime;
        console.log(`[${new Date().toISOString()}]   First output in ${(ttft / 1000).toFixed(1)}s`);
      }

      // Strip header from first chunk(s)
      if (!headerStripped) {
        output += text;
        const stripped = stripHeader(output);
        if (stripped !== output || output.split('\n').length > 5) {
          headerStripped = true;
          text = stripped;
          output = stripped;
        } else {
          return;
        }
      } else {
        output += text;
      }

      if (!text) return;

      totalChars += text.length;

      // Send as content_block_delta
      try {
        res.write(`event: content_block_delta\ndata: ${JSON.stringify({
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: text },
        })}\n\n`);
      } catch (e) {
        // Connection closed
      }
    });

    claude.stderr.on('data', (data) => {
      const errText = data.toString();
      stderrLines.push(errText);
      if (!errText.includes('Claude Code at Meta') && !errText.includes('fburl.com')) {
        errorOutput += errText;
        console.log(`[${new Date().toISOString()}]   stderr: ${errText.trim()}`);
      }
    });

    claude.on('close', (code, signal) => {
      const elapsed = Date.now() - startTime;

      // If we buffered header data but never sent it, flush now
      if (!headerStripped && output) {
        const stripped = stripHeader(output);
        if (stripped) {
          totalChars = stripped.length;
          try {
            res.write(`event: content_block_delta\ndata: ${JSON.stringify({
              type: 'content_block_delta',
              index: 0,
              delta: { type: 'text_delta', text: stripped },
            })}\n\n`);
          } catch (e) { /* connection closed */ }
        }
      }

      if (totalChars === 0 && (code !== 0 || errorOutput)) {
        const errMsg = killed
          ? `Request timed out after ${TIMEOUT_MS / 1000}s`
          : `Claude Code exited with code ${code} (signal: ${signal}). ${errorOutput.slice(0, 500)}`;
        
        try {
          res.write(`event: content_block_delta\ndata: ${JSON.stringify({
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: `\n\n[Bridge Error: ${errMsg}]` },
          })}\n\n`);
        } catch (e) { /* connection closed */ }
      }

      try {
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
        responseFinished = true;
        res.end();
      } catch (e) {
        // Connection already closed
      }

      // Update stats
      avgResponseTime = avgResponseTime === 0 
        ? elapsed 
        : (avgResponseTime * 0.8 + elapsed * 0.2); // Exponential moving average

      cleanup();

      console.log(`[${new Date().toISOString()}] ← #${reqNum} Response: ${totalChars} chars in ${(elapsed / 1000).toFixed(1)}s (code=${code}, signal=${signal})`);
      if (totalChars === 0) {
        console.log(`[${new Date().toISOString()}]   ⚠ Empty response! stderr: ${stderrLines.join('').slice(0, 500)}`);
        console.log(`[${new Date().toISOString()}]   ⚠ Raw stdout was: ${output.slice(0, 500)}`);
      }
    });

    claude.on('error', (err) => {
      cleanup();
      console.error(`[${new Date().toISOString()}] ✗ Spawn error: ${err.message}`);
      try {
        res.write(`event: content_block_delta\ndata: ${JSON.stringify({
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: `\n\n[Bridge Error: Could not start Claude Code. Is it installed? Error: ${err.message}]` },
        })}\n\n`);
        res.write(`event: content_block_stop\ndata: ${JSON.stringify({ type: 'content_block_stop', index: 0 })}\n\n`);
        res.write(`event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`);
        res.end();
      } catch (e) { /* connection closed */ }
    });

    // Handle client disconnect — use res.on('close') instead of req.on('close')
    // req.on('close') fires when the request body stream ends (immediately after body is read),
    // but res.on('close') fires when the response connection is actually closed by the client.
    res.on('close', () => {
      if (!responseFinished && !killed) {
        killed = true;
        console.log(`[${new Date().toISOString()}]   #${reqNum} Client disconnected, killing claude process`);
        claude.kill('SIGTERM');
      }
      cleanup();
    });

  } else {
    // ─── Non-streaming mode ────────────────────────────────────────────
    const keepalive = null; // No keepalive needed for non-streaming

    claude.stdout.on('data', (data) => {
      output += data.toString();
    });

    claude.stderr.on('data', (data) => {
      const errText = data.toString();
      stderrLines.push(errText);
      if (!errText.includes('Claude Code at Meta') && !errText.includes('fburl.com')) {
        errorOutput += errText;
        console.log(`[${new Date().toISOString()}]   stderr: ${errText.trim()}`);
      }
    });

    claude.on('close', (code, signal) => {
      cleanup();
      const elapsed = Date.now() - startTime;

      const strippedOutput = stripHeader(output).trim();

      if ((code !== 0 && code !== null) && !strippedOutput) {
        const errMsg = killed
          ? `Request timed out after ${TIMEOUT_MS / 1000}s`
          : `Claude Code exited with code ${code} (signal: ${signal}): ${errorOutput.slice(0, 500)}`;
        
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: { type: 'bridge_error', message: errMsg },
        }));
        console.log(`[${new Date().toISOString()}] ✗ Error: code=${code} signal=${signal} ${errorOutput.slice(0, 100)}`);
        return;
      }

      const estimatedInputTokens = Math.ceil(fullPrompt.length / 4);
      const estimatedOutputTokens = Math.ceil(strippedOutput.length / 4);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id: `msg_${Date.now()}`,
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: strippedOutput || '[No response from Claude Code]' }],
        model: model,
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: {
          input_tokens: estimatedInputTokens,
          output_tokens: estimatedOutputTokens,
        },
      }));
      console.log(`[${new Date().toISOString()}] ← #${reqNum} Response: ${strippedOutput.length} chars in ${(elapsed / 1000).toFixed(1)}s (code=${code})`);
    });

    claude.on('error', (err) => {
      cleanup();
      console.error(`[${new Date().toISOString()}] ✗ Spawn error: ${err.message}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: { type: 'bridge_error', message: `Could not start Claude Code: ${err.message}` },
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
  console.log(`  ║   ⚡ ArcadIA Bridge v${VERSION}                              ║`);
  console.log('  ║                                                          ║');
  console.log(`  ║   Running on http://${HOST}:${PORT}                    ║`);
  console.log('  ║   Forwarding requests to Claude Code (via -p flag)       ║');
  console.log('  ║   Auth: Meta internal (via meta@Meta plugin)             ║');
  console.log('  ║                                                          ║');
  console.log('  ║   Open ArcadIA: https://ikosoymeta.github.io/Arcadia/    ║');
  console.log('  ║                                                          ║');
  console.log('  ╚══════════════════════════════════════════════════════════╝');
  console.log('');

  // Start warm-up after server is listening
  warmUp();
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
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n  Bridge stopped.\n');
  process.exit(0);
});
