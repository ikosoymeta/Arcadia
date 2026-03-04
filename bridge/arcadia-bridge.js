#!/usr/bin/env node
/**
 * ArcadIA Bridge v3.2.3 — Local proxy connecting ArcadIA web app to Claude Code
 * 
 * Runs on localhost:8087 and forwards requests from the ArcadIA web app
 * to Claude Code CLI, which handles Meta internal authentication.
 * 
 * v3.2.3:
 * - Pre-flight port kill: kills any existing process on PORT before listen()
 * - Graceful shutdown: properly closes server + kills child processes on SIGINT/SIGTERM
 * - Child process tracking: ensures orphaned claude processes are cleaned up
 * - macOS-compatible: handles multiple PIDs from lsof correctly
 *
 * v3.2.2:
 * - Robust Meta stderr noise filter (scribecat, glog, configerator, thrift)
 * - Clean error messages for content policy blocks
 *
 * v3.2.0:
 * - Simplified setup: one-line command, no .sh download needed
 * - Filtered scribecat/Meta internal stderr noise from console output
 * - Added Manus domain support (*.manus.computer, *.manus.space)
 *
 * v3.1.0:
 * - Removed auth token requirement (CORS is sufficient for localhost security)
 * - Fixed keepalive variable scoping crash in non-streaming/auto-fix paths
 *
 * v3.0.0:
 * - Security: CORS restricted to localhost + GitHub Pages origin
 * - Security: Command allowlist for /v1/validate endpoint
 * - Structured messages: Preserves conversation context with role markers
 * - Better prompt building: Includes system prompt, conversation history
 *
 * v2.1.0: /v1/validate, /v1/auto-fix endpoints
 * v2.0.0: SSE keepalive, warm-up, res.on('close') fix
 */

const http = require('http');
const crypto = require('crypto');
const { spawn, execSync } = require('child_process');
const os = require('os');

const PORT = 8087;
const HOST = '127.0.0.1';
const VERSION = '3.2.3';
const TIMEOUT_MS = 180000; // 3 minute timeout
const KEEPALIVE_INTERVAL_MS = 2000; // SSE keepalive every 2s

// ─── Child process tracking ──────────────────────────────────────────────
// Track all spawned claude processes so we can kill them on shutdown
const activeChildren = new Set();

// ─── Pre-flight: kill any existing process on our port ────────────────────
function killProcessOnPort(port) {
  try {
    // lsof may return multiple PIDs (one per line); kill each individually
    const raw = execSync(`lsof -ti :${port} 2>/dev/null || true`, { encoding: 'utf-8', shell: true }).trim();
    if (!raw) return false;
    const pids = raw.split(/\s+/).filter(p => p && p !== String(process.pid));
    if (pids.length === 0) return false;
    for (const pid of pids) {
      try {
        console.log(`  Killing old process on port ${port}: PID ${pid}`);
        execSync(`kill -9 ${pid} 2>/dev/null || true`, { shell: true });
      } catch { /* already dead */ }
    }
    // Give the OS a moment to release the port
    execSync('sleep 0.5', { shell: true });
    return true;
  } catch {
    return false;
  }
}

// Kill any leftover process on our port before we start
(function preflightPortCheck() {
  try {
    const raw = execSync(`lsof -ti :${PORT} 2>/dev/null || true`, { encoding: 'utf-8', shell: true }).trim();
    if (raw) {
      console.log(`\n  ⚠ Port ${PORT} is occupied. Cleaning up...`);
      killProcessOnPort(PORT);
      console.log(`  ✓ Port ${PORT} freed.\n`);
    }
  } catch { /* no-op */ }
})();

// ─── Security ─────────────────────────────────────────────────────────────
// Auth is handled by CORS (restricting which origins can call the bridge).
// No auth token needed since the bridge only runs on localhost.

// ─── Security: Allowed CORS origins ────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5175',
  'http://127.0.0.1:3000',
  'https://ikosoymeta.github.io',
  'null', // For file:// origins
];

// Dynamic CORS: also allow any *.manus.computer subdomain (for Manus-hosted deployments)
const MANUS_ORIGIN_REGEX = /^https:\/\/[a-z0-9-]+\.(?:us1\.)?manus\.computer$/;
const MANUS_SPACE_REGEX = /^https:\/\/[a-z0-9-]+\.manus\.space$/;

// ─── Security: Command allowlist for /v1/validate ──────────────────────────
const ALLOWED_COMMAND_PREFIXES = [
  'yarn lint', 'yarn typecheck', 'yarn test', 'yarn build', 'yarn check',
  'npm run lint', 'npm run typecheck', 'npm run test', 'npm run build', 'npm run check',
  'npx tsc', 'npx eslint', 'npx jest', 'npx vitest', 'npx prettier',
  'arc lint', 'arc unit', 'arc diff',
  'flow', 'flow check',
  'python -m pytest', 'python -m mypy', 'python -m flake8', 'python -m black',
  'cargo test', 'cargo check', 'cargo clippy', 'cargo build',
  'go test', 'go vet', 'go build',
  'make lint', 'make test', 'make check', 'make build',
];

function isCommandAllowed(cmd) {
  const trimmed = cmd.trim();
  return ALLOWED_COMMAND_PREFIXES.some(prefix => trimmed.startsWith(prefix));
}

// ─── Meta internal stderr noise filter ─────────────────────────────────────
// Filters out Meta-specific logging noise from Claude Code stderr output.
// These are harmless internal log lines (scribecat, glog, etc.) that confuse users.
function isMetaStderrNoise(text) {
  if (!text || !text.trim()) return true; // empty lines are noise
  const t = text.trim();
  // scribecat logger references
  if (t.includes('scribe_cat.go') || t.includes('scribecat:') || t.includes('scribecat ')) return true;
  // glog-format lines: F0304, I0304, W0304, E0304 (severity + date)
  if (/^[FIWED]\d{4}\s/.test(t)) return true;
  // Claude Code branding lines
  if (t.includes('Claude Code at Meta') || t.includes('fburl.com')) return true;
  // Meta internal tool noise
  if (t.includes('thrift') || t.includes('configerator') || t.includes('tupperware')) return true;
  // Node.js deprecation warnings
  if (t.startsWith('(node:') || t.includes('DeprecationWarning')) return true;
  return false;
}

// ─── Detect Claude Code path ───────────────────────────────────────────────
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

// ─── Verify Claude Code works ──────────────────────────────────────────────
let claudeVersion = 'unknown';
try {
  claudeVersion = execSync(`"${CLAUDE_PATH}" --version 2>&1`, { encoding: 'utf-8', shell: true, timeout: 5000 }).trim();
  console.log(`  Claude Code version: ${claudeVersion}`);
} catch (e) {
  // Don't block startup on version check — Meta's Claude Code can be slow to respond
  console.log(`  ℹ Skipping version check (will verify on first request)`);
}

// ─── Warm-up: pre-spawn claude to trigger auth/plugin loading ──────────────
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

// ─── Request tracking ──────────────────────────────────────────────────────
let totalRequests = 0;
let activeRequests = 0;
let avgResponseTime = 0;

// ─── CORS Headers (restricted) ─────────────────────────────────────────────
function setCorsHeaders(res, req) {
  const origin = req ? (req.headers.origin || '') : '';
  // Check if origin is in our allowlist
  if (ALLOWED_ORIGINS.includes(origin) || MANUS_ORIGIN_REGEX.test(origin) || MANUS_SPACE_REGEX.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    // No origin header (same-origin or non-browser request) — allow
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else {
    // Unknown origin — still set the header to the first allowed origin
    // The browser will reject the response if it doesn't match
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS[ALLOWED_ORIGINS.length - 2]); // GitHub Pages
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, x-bridge-token, anthropic-version, anthropic-dangerous-direct-browser-access');
  res.setHeader('Access-Control-Expose-Headers', 'x-bridge-version');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Vary', 'Origin');
  res.setHeader('x-bridge-version', VERSION);
}

// ─── Auth middleware ────────────────────────────────────────────────────────
// CORS-based: only allowed origins can make requests. No token needed.
function isAuthenticated(req) {
  // All requests are allowed — CORS headers restrict browser access
  return true;
}

// ─── Health check endpoint ─────────────────────────────────────────────────
function handleHealthCheck(res, req) {
  setCorsHeaders(res, req);
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
    auth_required: false,
    capabilities: {
      validate: true,
      auto_fix: true,
      streaming: true,
      structured_messages: true,
      context_management: true,
    },
    stats: {
      total_requests: totalRequests,
      active_requests: activeRequests,
      avg_response_time_ms: Math.round(avgResponseTime),
    },
    timestamp: new Date().toISOString(),
  }));
}

// ─── Build structured prompt from messages array ───────────────────────────
// Preserves conversation structure with clear role markers and handles
// multi-turn context properly for the claude -p CLI interface.
function buildPrompt(messages, systemPrompt) {
  let parts = [];

  // Include system prompt with clear delimiter
  if (systemPrompt) {
    parts.push(`<system>\n${systemPrompt}\n</system>`);
  }

  // For multi-turn conversations, include full history with role markers
  if (messages.length > 1) {
    parts.push('<conversation>');
    for (const m of messages) {
      const role = m.role === 'user' ? 'Human' : 'Assistant';
      const text = extractText(m.content);
      if (text) {
        parts.push(`<${role.toLowerCase()}>\n${text}\n</${role.toLowerCase()}>`);
      }
    }
    parts.push('</conversation>');
    parts.push('\nPlease respond to the latest human message above, taking the full conversation context into account.');
  } else {
    // Single message — just send it directly
    const lastUserMsg = messages.filter(m => m.role === 'user').pop();
    if (!lastUserMsg) return null;
    parts.push(extractText(lastUserMsg.content));
  }

  return parts.join('\n\n');
}

// ─── Context window management ─────────────────────────────────────────────
// Safety-net trim only. The frontend already trims to ~200K tokens.
// This just prevents accidentally sending absurdly large payloads to the CLI.
const MAX_PROMPT_CHARS = 600000; // ~150K tokens — above the frontend limit, only catches edge cases

function trimMessages(messages) {
  // Always keep the last user message
  if (messages.length <= 2) return messages;

  // Estimate total size
  let totalChars = 0;
  for (const m of messages) {
    totalChars += extractText(m.content).length;
  }

  // If within limits, keep everything
  if (totalChars <= MAX_PROMPT_CHARS) return messages;

  // Keep system-critical messages and trim from the beginning
  const lastMsg = messages[messages.length - 1];
  const trimmed = [messages[0]]; // Keep first message for context
  let currentChars = extractText(messages[0].content).length + extractText(lastMsg.content).length;

  // Add messages from the end (most recent) until we hit the limit
  const middleMessages = messages.slice(1, -1).reverse();
  const keptMiddle = [];
  for (const m of middleMessages) {
    const msgChars = extractText(m.content).length;
    if (currentChars + msgChars > MAX_PROMPT_CHARS) break;
    keptMiddle.unshift(m);
    currentChars += msgChars;
  }

  // If we trimmed messages, add a note
  const trimmedCount = messages.length - keptMiddle.length - 2;
  if (trimmedCount > 0) {
    trimmed.push({
      role: 'assistant',
      content: `[${trimmedCount} earlier messages trimmed for context window. Conversation continues below.]`,
    });
  }

  return [...trimmed, ...keptMiddle, lastMsg];
}

// ─── Extract text from message content (string or array) ──────────────────
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

// ─── Strip Claude Code header lines ────────────────────────────────────────
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

// ─── Send message via Claude Code CLI ──────────────────────────────────────
function handleMessages(req, res, body) {
  setCorsHeaders(res, req);

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

  // Apply context window management
  const trimmedMessages = trimMessages(messages);
  const fullPrompt = buildPrompt(trimmedMessages, systemPrompt);
  if (!fullPrompt) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'No user message found' }));
    return;
  }

  totalRequests++;
  activeRequests++;
  const reqNum = totalRequests;

  const trimNote = trimmedMessages.length < messages.length 
    ? ` (trimmed ${messages.length - trimmedMessages.length} old messages)` 
    : '';
  console.log(`[${new Date().toISOString()}] → #${reqNum} Request: model=${model}, tokens=${maxTokens}, stream=${stream}${trimNote}`);
  console.log(`[${new Date().toISOString()}]   Prompt: ${fullPrompt.slice(0, 120)}${fullPrompt.length > 120 ? '...' : ''}`);

  // Spawn claude directly and write prompt to stdin
  console.log(`[${new Date().toISOString()}]   Spawning: claude -p`);

  const claude = spawn(CLAUDE_PATH, ['-p'], {
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: false,
  });

  // Track child process for cleanup on shutdown
  activeChildren.add(claude);
  claude.on('exit', () => activeChildren.delete(claude));

  // Write the prompt to stdin and close it
  try {
    claude.stdin.write(fullPrompt);
    claude.stdin.end();
  } catch (e) {
    activeRequests--;
    activeChildren.delete(claude);
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
  let keepalive = null; // SSE keepalive interval (set in streaming mode)
  let headerFlushTimer = null; // Timeout to flush buffered header data

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
    if (keepalive) clearInterval(keepalive);
    if (headerFlushTimer) clearTimeout(headerFlushTimer);
    activeRequests--;
  }

  if (stream) {
    // ─── Streaming mode (SSE) ────────────────────────────────────────
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
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

    // ─── SSE Keepalive ───────────────────────────────────────────────
    keepalive = setInterval(() => {
      if (!responseFinished && !killed) {
        try {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
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
          if (headerFlushTimer) { clearTimeout(headerFlushTimer); headerFlushTimer = null; }
          text = stripped;
          output = stripped;
        } else {
          // Start a 200ms timer to flush if header detection takes too long
          if (!headerFlushTimer) {
            headerFlushTimer = setTimeout(() => {
              if (!headerStripped && output) {
                headerStripped = true;
                const flushed = stripHeader(output) || output;
                output = flushed;
                if (flushed) {
                  totalChars += flushed.length;
                  try {
                    res.write(`event: content_block_delta\ndata: ${JSON.stringify({
                      type: 'content_block_delta',
                      index: 0,
                      delta: { type: 'text_delta', text: flushed },
                    })}\n\n`);
                  } catch (e) { /* Connection closed */ }
                }
              }
            }, 200);
          }
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
      // Filter out known noise: Meta internal scribecat/glog, Claude Code branding
      if (!isMetaStderrNoise(errText)) {
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

      // Clean errorOutput: remove any remaining Meta noise that slipped through
      const cleanError = errorOutput.split('\n').filter(line => !isMetaStderrNoise(line)).join('\n').trim();

      if (totalChars === 0 && (code !== 0 || cleanError)) {
        const errMsg = killed
          ? `Request timed out after ${TIMEOUT_MS / 1000}s`
          : cleanError
            ? `Claude Code exited with code ${code}. ${cleanError.slice(0, 500)}`
            : `Claude Code exited with code ${code}. The request may have been blocked by content policy. Try rephrasing your prompt.`;
        
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
        : (avgResponseTime * 0.8 + elapsed * 0.2);

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

    // Handle client disconnect
    res.on('close', () => {
      if (!responseFinished && !killed) {
        killed = true;
        console.log(`[${new Date().toISOString()}]   #${reqNum} Client disconnected, killing claude process`);
        claude.kill('SIGTERM');
      }
      cleanup();
    });

  } else {
    // ─── Non-streaming mode ──────────────────────────────────────────

    claude.stdout.on('data', (data) => {
      output += data.toString();
    });

    claude.stderr.on('data', (data) => {
      const errText = data.toString();
      stderrLines.push(errText);
      // Filter out known noise: Meta internal scribecat/glog, Claude Code branding
      if (!isMetaStderrNoise(errText)) {
        errorOutput += errText;
        console.log(`[${new Date().toISOString()}]   stderr: ${errText.trim()}`);
      }
    });

    claude.on('close', (code, signal) => {
      cleanup();
      const elapsed = Date.now() - startTime;

      const strippedOutput = stripHeader(output).trim();
      const cleanError = errorOutput.split('\n').filter(line => !isMetaStderrNoise(line)).join('\n').trim();

      if ((code !== 0 && code !== null) && !strippedOutput) {
        const errMsg = killed
          ? `Request timed out after ${TIMEOUT_MS / 1000}s`
          : cleanError
            ? `Claude Code exited with code ${code}. ${cleanError.slice(0, 500)}`
            : `Claude Code exited with code ${code}. The request may have been blocked by content policy. Try rephrasing your prompt.`;
        
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

// ─── Validation endpoint: run lint/typecheck/test commands ─────────────────

const VALIDATE_TIMEOUT_MS = 60000;

function handleValidate(req, res, body) {
  setCorsHeaders(res, req);

  let payload;
  try {
    payload = JSON.parse(body);
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON body' }));
    return;
  }

  const commands = payload.commands || [];
  const cwd = payload.cwd || process.env.HOME || os.homedir();

  if (!commands.length) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'No commands provided. Send { "commands": ["yarn lint", "yarn typecheck"] }' }));
    return;
  }

  // Validate commands against allowlist
  const blockedCommands = commands.filter(cmd => !isCommandAllowed(cmd));
  if (blockedCommands.length > 0) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: `Blocked commands: ${blockedCommands.join(', ')}. Only lint/typecheck/test/build commands are allowed.`,
      allowed_prefixes: ALLOWED_COMMAND_PREFIXES,
    }));
    console.log(`[${new Date().toISOString()}] 🚫 Blocked commands: ${blockedCommands.join(', ')}`);
    return;
  }

  console.log(`[${new Date().toISOString()}] 🔍 Validate: ${commands.length} commands in ${cwd}`);

  const results = [];
  let commandIndex = 0;

  function runNext() {
    if (commandIndex >= commands.length) {
      const allPassed = results.every(r => r.passed);
      const summary = {
        passed: allPassed,
        total: results.length,
        passed_count: results.filter(r => r.passed).length,
        failed_count: results.filter(r => !r.passed).length,
        results: results,
        timestamp: new Date().toISOString(),
      };

      console.log(`[${new Date().toISOString()}] 🔍 Validate result: ${summary.passed_count}/${summary.total} passed`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(summary));
      return;
    }

    const cmd = commands[commandIndex];
    const startTime = Date.now();
    console.log(`[${new Date().toISOString()}]   Running: ${cmd}`);

    const proc = spawn('sh', ['-c', cmd], {
      cwd: cwd,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    const timeout = setTimeout(() => {
      proc.kill('SIGTERM');
      stderr += '\n[Timed out after 60s]';
    }, VALIDATE_TIMEOUT_MS);

    proc.on('close', (code) => {
      clearTimeout(timeout);
      const elapsed = Date.now() - startTime;
      const passed = code === 0;

      results.push({
        command: cmd,
        passed: passed,
        exit_code: code,
        stdout: stdout.slice(-5000),
        stderr: stderr.slice(-5000),
        duration_ms: elapsed,
      });

      console.log(`[${new Date().toISOString()}]   ${passed ? '✓' : '✗'} ${cmd} (${(elapsed / 1000).toFixed(1)}s, exit=${code})`);

      commandIndex++;
      runNext();
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      results.push({
        command: cmd,
        passed: false,
        exit_code: -1,
        stdout: '',
        stderr: `Failed to run command: ${err.message}`,
        duration_ms: Date.now() - startTime,
      });
      commandIndex++;
      runNext();
    });
  }

  runNext();
}

// ─── Auto-fix endpoint: send errors to Claude for fixing ──────────────────

function handleAutoFix(req, res, body) {
  setCorsHeaders(res, req);

  let payload;
  try {
    payload = JSON.parse(body);
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON body' }));
    return;
  }

  const errors = payload.errors || '';
  const originalPrompt = payload.original_prompt || '';
  const code = payload.code || '';

  if (!errors) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'No errors provided' }));
    return;
  }

  const fixPrompt = [
    'The following code was generated but failed validation. Please fix the errors.',
    '',
    '--- ORIGINAL REQUEST ---',
    originalPrompt,
    '',
    '--- GENERATED CODE ---',
    code.slice(0, 10000),
    '',
    '--- VALIDATION ERRORS ---',
    errors.slice(0, 5000),
    '',
    '--- INSTRUCTIONS ---',
    'Fix the validation errors above. Output ONLY the corrected code, no explanations.',
    'Preserve the original functionality and intent.',
  ].join('\n');

  console.log(`[${new Date().toISOString()}] 🔧 Auto-fix: ${errors.slice(0, 100)}...`);

  const syntheticBody = JSON.stringify({
    model: payload.model || 'claude-sonnet-4-20250514',
    max_tokens: payload.max_tokens || 8192,
    stream: payload.stream !== false,
    messages: [{ role: 'user', content: fixPrompt }],
  });

  handleMessages(req, res, syntheticBody);
}

// ─── HTTP Server ───────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    setCorsHeaders(res, req);
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
    handleHealthCheck(res, req);
    return;
  }

  // Auth check for all other endpoints
  if (!isAuthenticated(req)) {
    setCorsHeaders(res, req);
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: 'Unauthorized. Include x-bridge-token header with the token shown in the bridge startup banner.',
      hint: 'The token is displayed when you start the bridge. Copy it from the terminal.',
    }));
    return;
  }

  if (req.method === 'POST' && req.url === '/v1/messages') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => handleMessages(req, res, body));
    return;
  }

  if (req.method === 'POST' && req.url === '/v1/validate') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => handleValidate(req, res, body));
    return;
  }

  if (req.method === 'POST' && req.url === '/v1/auto-fix') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => handleAutoFix(req, res, body));
    return;
  }

  setCorsHeaders(res, req);
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found. Use POST /v1/messages' }));
});

function printBanner() {
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
  console.log('  🔒 Security: CORS-restricted to localhost + GitHub Pages + Manus');
  console.log('');
}

server.listen(PORT, HOST, () => {
  printBanner();
  warmUp();
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    // Pre-flight should have handled this, but try once more
    console.log(`\n  ⚠ Port ${PORT} still in use after pre-flight. Retrying...`);
    const killed = killProcessOnPort(PORT);
    if (killed) {
      setTimeout(() => {
        const retryServer = http.createServer(server.listeners('request')[0]);
        retryServer.listen(PORT, HOST, () => {
          console.log(`  ✓ Took over port ${PORT} successfully!\n`);
          printBanner();
          warmUp();
        });
        retryServer.on('error', (retryErr) => {
          console.error(`  ✗ Still cannot bind port ${PORT}: ${retryErr.message}`);
          console.error(`  Try manually: lsof -ti :${PORT} | xargs kill -9\n`);
          process.exit(1);
        });
      }, 500);
    } else {
      console.error(`  ✗ Port ${PORT} is in use but could not identify the process.`);
      console.error(`  Try manually: lsof -ti :${PORT} | xargs kill -9\n`);
      process.exit(1);
    }
  } else {
    console.error(`\n  ✗ Server error: ${err.message}\n`);
    process.exit(1);
  }
});

// ─── Graceful shutdown ────────────────────────────────────────────────────
function gracefulShutdown(signal) {
  console.log(`\n  Received ${signal}. Shutting down gracefully...`);
  
  // Kill all active child processes
  for (const child of activeChildren) {
    try {
      child.kill('SIGTERM');
    } catch { /* already dead */ }
  }
  activeChildren.clear();
  
  // Close the HTTP server
  server.close(() => {
    console.log('  ✓ Server closed. Bridge stopped.\n');
    process.exit(0);
  });
  
  // Force exit after 3 seconds if server.close() hangs
  setTimeout(() => {
    console.log('  Force exit after timeout.\n');
    process.exit(0);
  }, 3000);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
