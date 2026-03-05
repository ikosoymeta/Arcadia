#!/usr/bin/env node
/**
 * ArcadIA Bridge v3.4.2 — Local proxy connecting ArcadIA web app to Claude Code
 * 
 * Runs on localhost:8087 and forwards requests from the ArcadIA web app
 * to Claude Code CLI, which handles Meta internal authentication.
 * 
 * v3.4.2:
 * - Dynamic Google Drive path discovery: scans ~/Library/CloudStorage/ for any GoogleDrive-* folder
 * - Improved skills detection: checks multiple locations + claude-templates list
 * - Detailed logging in detect endpoint for debugging
 *
 * v3.4.0:
 * - Process pool of 2: keeps TWO standby processes for back-to-back requests
 * - Optimized CLI flags: --model, --no-session-persistence, reduced overhead
 * - Better readiness detection: waits for auth completion, not just 2s timer
 * - Instant replacement: 0ms delay when taking a standby
 * - Warm-up spawns pool immediately (parallel with warm-up, not after)
 *
 * v3.3.0:
 * - Process pre-spawning: keeps a standby claude process ready for instant dispatch
 * - Phase-aware keepalive: sends phase info (spawning/loading/waiting) to frontend
 *
 * v3.2.3: Pre-flight port kill, graceful shutdown, child process tracking
 * v3.2.2: Robust Meta stderr noise filter, clean error messages
 * v3.2.0: Simplified setup, Manus domain support
 * v3.1.0: Removed auth token, fixed keepalive scoping
 * v3.0.0: CORS security, command allowlist, structured messages
 * v2.1.0: /v1/validate, /v1/auto-fix endpoints
 * v2.0.0: SSE keepalive, warm-up
 */

const http = require('http');
const crypto = require('crypto');
const { spawn, execSync } = require('child_process');
const os = require('os');

const PORT = 8087;
const HOST = '127.0.0.1';
const VERSION = '3.4.2';
const IS_WIN = process.platform === 'win32';
const TIMEOUT_MS = 180000; // 3 minute timeout for regular messages
const SLASH_CMD_TIMEOUT_MS = 600000; // 10 minute timeout for slash commands
const KEEPALIVE_INTERVAL_MS = 2000; // SSE keepalive every 2s

// ─── Child process tracking ──────────────────────────────────────────────
// Track all spawned claude processes so we can kill them on shutdown
const activeChildren = new Set();

// ─── Pre-flight: kill any existing process on our port ────────────────────
function killProcessOnPort(port) {
  try {
    let pids = [];
    if (IS_WIN) {
      // Windows: use netstat to find PIDs on the port
      const raw = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, { encoding: 'utf-8', shell: true }).trim();
      if (!raw) return false;
      // Each line ends with the PID; extract unique PIDs
      const seen = new Set();
      for (const line of raw.split('\n')) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== '0' && pid !== String(process.pid) && !seen.has(pid)) {
          seen.add(pid);
          pids.push(pid);
        }
      }
    } else {
      // macOS/Linux: use lsof
      const raw = execSync(`lsof -ti :${port} 2>/dev/null || true`, { encoding: 'utf-8', shell: true }).trim();
      if (!raw) return false;
      pids = raw.split(/\s+/).filter(p => p && p !== String(process.pid));
    }
    if (pids.length === 0) return false;
    for (const pid of pids) {
      try {
        console.log(`  Killing old process on port ${port}: PID ${pid}`);
        if (IS_WIN) {
          execSync(`taskkill /PID ${pid} /F 2>nul`, { shell: true });
        } else {
          execSync(`kill -9 ${pid} 2>/dev/null || true`, { shell: true });
        }
      } catch { /* already dead */ }
    }
    // Give the OS a moment to release the port
    if (IS_WIN) {
      execSync('ping -n 2 127.0.0.1 >nul', { shell: true }); // ~1s delay on Windows
    } else {
      execSync('sleep 0.5', { shell: true });
    }
    return true;
  } catch {
    return false;
  }
}

// Kill any leftover process on our port before we start
(function preflightPortCheck() {
  try {
    let occupied = false;
    if (IS_WIN) {
      const raw = execSync(`netstat -ano | findstr :${PORT} | findstr LISTENING`, { encoding: 'utf-8', shell: true }).trim();
      occupied = !!raw;
    } else {
      const raw = execSync(`lsof -ti :${PORT} 2>/dev/null || true`, { encoding: 'utf-8', shell: true }).trim();
      occupied = !!raw;
    }
    if (occupied) {
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
  const findCmd = IS_WIN ? 'where claude 2>nul' : 'which claude 2>/dev/null';
  const which = execSync(findCmd, { encoding: 'utf-8', shell: true }).trim();
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
  const versionRedirect = IS_WIN ? '2>&1' : '2>&1';
  claudeVersion = execSync(`"${CLAUDE_PATH}" --version ${versionRedirect}`, { encoding: 'utf-8', shell: true, timeout: 5000 }).trim();
  console.log(`  Claude Code version: ${claudeVersion}`);
} catch (e) {
  // Don't block startup on version check — Meta's Claude Code can be slow to respond
  console.log(`  ℹ Skipping version check (will verify on first request)`);
}

// ─── Process Pool: pre-spawn multiple claude processes for instant dispatch ──
// The biggest bottleneck is Meta auth plugin loading (~40-50s per process).
// We maintain a POOL of pre-spawned processes so requests get instant dispatch.
// Pool size of 2 handles back-to-back requests without waiting.

let warmedUp = false;
let warmupTime = 0;
const POOL_SIZE = 2;  // Number of standby processes to maintain
const STANDBY_MAX_AGE_MS = 300000; // Recycle after 5 minutes to avoid stale auth

// Pool: array of { proc, ready, spawnTime, stderrBuffer }
const pool = [];

// Build CLI args for standby processes (optimized for speed)
function getClaudeArgs(model) {
  const args = ['-p', '--no-session-persistence'];
  // Disable tools for simple chat (reduces plugin loading)
  // Note: auto-fix still spawns fresh processes with tools enabled
  if (model) args.push('--model', model);
  return args;
}

function spawnPoolProcess(slot) {
  const spawnTime = Date.now();
  const args = getClaudeArgs();
  console.log(`[${new Date().toISOString()}] 🔄 Pool[${slot}]: Spawning standby (${CLAUDE_PATH} ${args.join(' ')})...`);
  
  const proc = spawn(CLAUDE_PATH, args, {
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: false,
  });
  
  activeChildren.add(proc);
  
  const entry = { proc, ready: false, spawnTime, stderrBuffer: '' };
  pool[slot] = entry;
  
  let hasErrored = false;
  let stderrQuietTimer = null;
  let stderrLineCount = 0;
  
  proc.on('error', (err) => {
    hasErrored = true;
    entry.ready = false;
    activeChildren.delete(proc);
    console.log(`[${new Date().toISOString()}] ⚠ Pool[${slot}]: Process error: ${err.message}`);
    // Respawn after delay
    setTimeout(() => fillPool(), 3000);
  });
  
  proc.on('exit', (code) => {
    activeChildren.delete(proc);
    if (pool[slot] && pool[slot].proc === proc) {
      pool[slot] = null;
      if (code !== 0 && code !== null && !hasErrored) {
        console.log(`[${new Date().toISOString()}] ⚠ Pool[${slot}]: Exited with code ${code}, will respawn...`);
        setTimeout(() => fillPool(), 2000);
      }
    }
  });
  
  // Readiness detection: Meta auth produces a burst of stderr output during loading.
  // When stderr goes quiet for 3s after at least some output, auth is likely done.
  // Fallback: mark ready after 5s regardless (process is at least spawned and loading).
  proc.stderr.on('data', (data) => {
    const text = data.toString();
    entry.stderrBuffer += text;
    stderrLineCount++;
    
    if (!entry.ready && !hasErrored) {
      // Reset quiet timer on each stderr output
      if (stderrQuietTimer) clearTimeout(stderrQuietTimer);
      stderrQuietTimer = setTimeout(() => {
        if (!hasErrored && pool[slot] && pool[slot].proc === proc && !entry.ready) {
          entry.ready = true;
          const elapsed = ((Date.now() - spawnTime) / 1000).toFixed(1);
          console.log(`[${new Date().toISOString()}] ✓ Pool[${slot}]: Ready after ${elapsed}s (${stderrLineCount} stderr lines, auth settled)`);
        }
      }, 3000); // 3s quiet = auth done
    }
  });
  
  // Fallback: mark ready after 5s even if no stderr
  setTimeout(() => {
    if (!hasErrored && pool[slot] && pool[slot].proc === proc && !entry.ready) {
      entry.ready = true;
      const elapsed = ((Date.now() - spawnTime) / 1000).toFixed(1);
      console.log(`[${new Date().toISOString()}] ✓ Pool[${slot}]: Ready after ${elapsed}s (timer fallback)`);
    }
  }, 5000);
}

function fillPool() {
  for (let i = 0; i < POOL_SIZE; i++) {
    if (!pool[i] || !pool[i].proc) {
      spawnPoolProcess(i);
    }
  }
}

function takeFromPool() {
  // Find the oldest ready process (most likely to have completed auth)
  let bestIdx = -1;
  let bestAge = 0;
  
  for (let i = 0; i < pool.length; i++) {
    const entry = pool[i];
    if (!entry || !entry.ready) continue;
    
    // Check if too old
    const age = Date.now() - entry.spawnTime;
    if (age > STANDBY_MAX_AGE_MS) {
      console.log(`[${new Date().toISOString()}] ♻ Pool[${i}]: Too old (${(age / 1000).toFixed(0)}s), recycling...`);
      try { entry.proc.kill('SIGTERM'); } catch {}
      pool[i] = null;
      continue;
    }
    
    if (age > bestAge) {
      bestAge = age;
      bestIdx = i;
    }
  }
  
  if (bestIdx === -1) return null;
  
  const entry = pool[bestIdx];
  const proc = entry.proc;
  pool[bestIdx] = null;
  
  // Immediately start refilling the pool (0ms delay)
  setImmediate(() => fillPool());
  
  const age = ((Date.now() - entry.spawnTime) / 1000).toFixed(1);
  console.log(`[${new Date().toISOString()}]   ⚡ Took Pool[${bestIdx}] (age: ${age}s, auth settled)`);
  return proc;
}

// Recycle stale pool processes periodically
setInterval(() => {
  for (let i = 0; i < pool.length; i++) {
    const entry = pool[i];
    if (entry && entry.ready && Date.now() - entry.spawnTime > STANDBY_MAX_AGE_MS) {
      console.log(`[${new Date().toISOString()}] ♻ Pool[${i}]: Recycling stale process...`);
      try { entry.proc.kill('SIGTERM'); } catch {}
      pool[i] = null;
    }
  }
  fillPool();
}, 60000);

function warmUp() {
  console.log('  ⏳ Warming up Claude Code (pre-loading auth & plugins)...');
  console.log(`  📦 Pool size: ${POOL_SIZE} standby processes`);
  const start = Date.now();
  
  // Start filling the pool IMMEDIATELY (in parallel with warm-up)
  // Don't wait for warm-up to finish — every second counts
  fillPool();
  
  // Also run a quick warm-up probe to verify Claude Code works
  const warmup = spawn(CLAUDE_PATH, ['-p', '--no-session-persistence'], {
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: false,
  });
  activeChildren.add(warmup);
  warmup.stdin.write('hi');
  warmup.stdin.end();
  warmup.on('close', (code) => {
    warmupTime = Date.now() - start;
    warmedUp = true;
    activeChildren.delete(warmup);
    console.log(`  ✓ Warm-up complete in ${(warmupTime / 1000).toFixed(1)}s (exit code: ${code})`);
    // Ensure pool is full after warm-up
    fillPool();
  });
  warmup.on('error', () => {
    warmedUp = true;
    activeChildren.delete(warmup);
    console.log('  ⚠ Warm-up failed, pool processes should still be spawning...');
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, x-bridge-token, anthropic-version, anthropic-dangerous-direct-browser-access, Access-Control-Request-Private-Network');
  res.setHeader('Access-Control-Expose-Headers', 'x-bridge-version');
  res.setHeader('Access-Control-Max-Age', '86400');
  // Chrome Private Network Access: allow public websites to reach localhost
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
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
    platform: process.platform,
    claude_code: true,
    meta_internal: true,
    claude_path: CLAUDE_PATH,
    claude_version: claudeVersion,
    warmed_up: warmedUp,
    warmup_time_ms: warmupTime,
    pool_size: POOL_SIZE,
    pool_status: pool.map((entry, i) => entry ? {
      slot: i,
      ready: entry.ready,
      age_ms: Date.now() - entry.spawnTime,
    } : { slot: i, ready: false, age_ms: 0 }),
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

  // Detect slash commands — they need special handling (longer timeout, --cwd to workspace)
  const lastUserMsg = messages.filter(m => m.role === "user").pop();
  const lastUserText = lastUserMsg ? extractText(lastUserMsg.content).trim() : "";
  const isSlashCommand = /^\/(daily-brief|eod|eow|prepare-meeting|add-context|deep-research)/.test(lastUserText);

// For slash commands, inject CLAUDE.md content and workspace context into the prompt
  let enrichedSystemPrompt = systemPrompt;
  let slashCmdWorkspacePath = null;
  if (isSlashCommand) {
    const home = process.env.HOME || '/Users/' + process.env.USER;
    const username = process.env.USER || require('os').userInfo().username;
    const gDrivePaths = findGoogleDrivePaths(home, username, 'claude');
    for (const p of gDrivePaths) {
      try { if (require('fs').existsSync(p)) { slashCmdWorkspacePath = p; break; } } catch {}
    }

    // Read CLAUDE.md if it exists
    let claudeMdContent = '';
    if (slashCmdWorkspacePath) {
      try {
        const claudeMdPath = `${slashCmdWorkspacePath}/CLAUDE.md`;
        if (require('fs').existsSync(claudeMdPath)) {
          claudeMdContent = require('fs').readFileSync(claudeMdPath, 'utf8');
          console.log(`[${new Date().toISOString()}]   📄 Loaded CLAUDE.md (${claudeMdContent.length} chars)`);
        }
      } catch (e) {
        console.log(`[${new Date().toISOString()}]   ⚠ Could not read CLAUDE.md: ${e.message}`);
      }
    }

    // List workspace files (2 levels deep)
    let workspaceFiles = '';
    if (slashCmdWorkspacePath) {
      try {
        const listDir = (dir, prefix = '', depth = 0) => {
          if (depth > 2) return '';
          let result = '';
          const entries = require('fs').readdirSync(dir, { withFileTypes: true });
          for (const entry of entries.slice(0, 50)) {
            if (entry.name.startsWith('.')) continue;
            result += `${prefix}${entry.isDirectory() ? '[DIR]' : '[FILE]'} ${entry.name}\n`;
            if (entry.isDirectory() && depth < 2) {
              result += listDir(`${dir}/${entry.name}`, prefix + '  ', depth + 1);
            }
          }
          return result;
        };
        workspaceFiles = listDir(slashCmdWorkspacePath);
        console.log(`[${new Date().toISOString()}]   📂 Workspace files listed`);
      } catch (e) {
        console.log(`[${new Date().toISOString()}]   ⚠ Could not list workspace: ${e.message}`);
      }
    }

    // Read style guide if it exists
    let styleGuide = '';
    if (slashCmdWorkspacePath) {
      try {
        const sgPath = `${slashCmdWorkspacePath}/STYLE_GUIDE.md`;
        if (require('fs').existsSync(sgPath)) {
          styleGuide = require('fs').readFileSync(sgPath, 'utf8');
          console.log(`[${new Date().toISOString()}]   ✍️ Loaded STYLE_GUIDE.md`);
        }
      } catch {}
    }

    // Read priorities/tasks if they exist
    let priorities = '';
    if (slashCmdWorkspacePath) {
      for (const fname of ['priorities.md', 'tasks.md', 'TODO.md', 'notes/priorities.md']) {
        try {
          const fpath = `${slashCmdWorkspacePath}/${fname}`;
          if (require('fs').existsSync(fpath)) {
            priorities += `\n--- ${fname} ---\n` + require('fs').readFileSync(fpath, 'utf8');
          }
        } catch {}
      }
      if (priorities) console.log(`[${new Date().toISOString()}]   📋 Loaded priorities/tasks`);
    }

    // Build enriched system prompt with all context
    const contextParts = [];
    if (claudeMdContent) contextParts.push(`<claude_md>\n${claudeMdContent}\n</claude_md>`);
    if (slashCmdWorkspacePath) contextParts.push(`<workspace_path>${slashCmdWorkspacePath}</workspace_path>`);
    if (workspaceFiles) contextParts.push(`<workspace_files>\n${workspaceFiles}\n</workspace_files>`);
    if (styleGuide) contextParts.push(`<style_guide>\n${styleGuide}\n</style_guide>`);
    if (priorities) contextParts.push(`<priorities_and_tasks>\n${priorities}\n</priorities_and_tasks>`);
    
    // Pre-read recent notes and project files for richer context
    let recentNotes = '';
    if (slashCmdWorkspacePath) {
      const fs = require('fs');
      const path = require('path');
      // Read files from common subdirectories
      const dirsToScan = ['notes', 'projects', 'daily', 'weekly', 'logs', ''];
      const readFiles = [];
      for (const subdir of dirsToScan) {
        try {
          const dir = subdir ? `${slashCmdWorkspacePath}/${subdir}` : slashCmdWorkspacePath;
          if (!fs.existsSync(dir)) continue;
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isFile() && /\.(md|txt|json)$/i.test(entry.name) && !entry.name.startsWith('.')) {
              const fullPath = path.join(dir, entry.name);
              try {
                const stat = fs.statSync(fullPath);
                readFiles.push({ path: fullPath, name: subdir ? `${subdir}/${entry.name}` : entry.name, mtime: stat.mtimeMs, size: stat.size });
              } catch {}
            }
          }
        } catch {}
      }
      // Sort by most recently modified, take top 10, skip files > 20KB
      readFiles.sort((a, b) => b.mtime - a.mtime);
      const topFiles = readFiles.filter(f => f.size < 20000).slice(0, 10);
      for (const f of topFiles) {
        try {
          const content = fs.readFileSync(f.path, 'utf8');
          recentNotes += `\n--- ${f.name} (${new Date(f.mtime).toLocaleDateString()}) ---\n${content}\n`;
        } catch {}
      }
      if (recentNotes) console.log(`[${new Date().toISOString()}]   📝 Pre-read ${topFiles.length} recent workspace files`);
    }
    if (recentNotes) contextParts.push(`<recent_workspace_files>\n${recentNotes}\n</recent_workspace_files>`);

    contextParts.push(`<instructions>
You are the user's Second Brain assistant. All the context you need is provided above — do NOT try to read files or use tools.
The user's workspace is at ${slashCmdWorkspacePath || 'unknown path'}. Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.

Based ONLY on the workspace content provided above, respond to the slash command:
- /daily-brief: Give a concise morning briefing. Summarize priorities, upcoming tasks, and recent activity from the workspace files above. Be specific — reference actual file names and content.
- /eod: End-of-day wrap-up. Summarize what was worked on today based on recent files, capture key decisions, preview tomorrow.
- /eow: Weekly summary. Compile this week's accomplishments, PSC-worthy items, and next week priorities from the files above.
- /prepare-meeting: Create a structured meeting agenda with talking points based on available context.
- /add-context: Acknowledge the information and suggest which project folder it belongs in.
- /deep-research: Provide a thorough analysis with structured findings based on available context.

Rules:
- Be concise and actionable. Use markdown formatting.
- Reference specific files and content from the workspace.
- Match the user's writing style if a style guide is provided above.
- Do NOT attempt to read files, access calendar, or use any tools. Everything you need is in the context above.
- Respond in under 500 words unless the command requires more detail.
</instructions>`);

    if (systemPrompt) contextParts.push(`<additional_context>\n${systemPrompt}\n</additional_context>`);
    
    enrichedSystemPrompt = contextParts.join('\n\n');
    console.log(`[${new Date().toISOString()}]   🧠 Enriched prompt: ${enrichedSystemPrompt.length} chars of context injected`);
  }

  // Apply context window management
  const trimmedMessages = trimMessages(messages);
  const fullPrompt = buildPrompt(trimmedMessages, enrichedSystemPrompt);
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

  // For slash commands, spawn a fresh process with --cwd pointing to workspace
  // so Claude reads the CLAUDE.md and has access to skills/plugins
  let claude;
  const effectiveTimeout = isSlashCommand ? SLASH_CMD_TIMEOUT_MS : TIMEOUT_MS;

  if (isSlashCommand) {
    // Do NOT use --cwd — all context is already injected into the prompt
    // Use --allowedTools '' to prevent Claude from trying to read files (which is slow)
    const args = ['-p', '--no-session-persistence', '--allowedTools', ''];
    if (model) args.push('--model', model);
    console.log(`[${new Date().toISOString()}]   🧠 Slash command detected: ${lastUserText.slice(0, 40)}`);
    console.log(`[${new Date().toISOString()}]   Spawning WITHOUT --cwd, tools disabled (timeout: ${effectiveTimeout / 1000}s)`);
    claude = spawn(CLAUDE_PATH, args, {
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    });
    activeChildren.add(claude);
  } else {
    // Regular messages: use pool for speed
    const poolProc = takeFromPool();
    if (poolProc) {
      claude = poolProc;
    } else {
      // No pool process available — spawn fresh with optimized flags
      const args = getClaudeArgs(model);
      console.log(`[${new Date().toISOString()}]   Spawning: ${CLAUDE_PATH} ${args.join(' ')} (no pool process available)`);
      claude = spawn(CLAUDE_PATH, args, {
        env: { ...process.env },
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
      });
      activeChildren.add(claude);
    }
  }

  // Track child process for cleanup on shutdown
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

  // Set timeout (longer for slash commands)
  const timeout = setTimeout(() => {
    if (!killed) {
      killed = true;
      claude.kill('SIGTERM');
      console.error(`[${new Date().toISOString()}] ✗ #${reqNum} Request timed out after ${effectiveTimeout / 1000}s${isSlashCommand ? ' (slash command)' : ''}`);
    }
  }, effectiveTimeout);

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

    // ─── SSE Keepalive with phase info ────────────────────────────────
    keepalive = setInterval(() => {
      if (!responseFinished && !killed) {
        try {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
          // Send phase-aware keepalive so frontend can show meaningful progress
          const phase = firstTokenReceived ? 'streaming' 
            : elapsed < 3 ? 'connecting'
            : elapsed < 15 ? 'authenticating'
            : 'waiting';
          res.write(`: keepalive ${elapsed}s phase=${phase}\n\n`);
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

// ─── Google Drive path discovery (dynamic scan) ──────────────────────────

function findGoogleDrivePaths(home, username, suffix) {
  // suffix: 'claude' for workspace, '' for My Drive root
  const fs = require('fs');
  const paths = [];

  if (IS_WIN) {
    const sep = '\\';
    const bases = [
      `${home}${sep}Google Drive${sep}My Drive`,
      `G:${sep}My Drive`,
      `${home}${sep}GoogleDrive${sep}My Drive`,
    ];
    for (const b of bases) {
      paths.push(suffix ? `${b}${sep}${suffix}` : b);
    }
  } else {
    // Dynamically scan ~/Library/CloudStorage/ for any GoogleDrive-* folder
    const cloudStorageDir = `${home}/Library/CloudStorage`;
    try {
      if (fs.existsSync(cloudStorageDir)) {
        const entries = fs.readdirSync(cloudStorageDir);
        for (const entry of entries) {
          if (entry.startsWith('GoogleDrive-')) {
            const myDrive = `${cloudStorageDir}/${entry}/My Drive`;
            paths.push(suffix ? `${myDrive}/${suffix}` : myDrive);
          }
        }
      }
    } catch { /* scan failed, fall through to hardcoded paths */ }

    // Fallback hardcoded paths
    const hardcoded = [
      `${home}/Library/CloudStorage/GoogleDrive-${username}@meta.com/My Drive`,
      `${home}/Library/CloudStorage/GoogleDrive-${username}@fb.com/My Drive`,
      `${home}/Google Drive/My Drive`,
      `${home}/gdrive`,
    ];
    for (const h of hardcoded) {
      const full = suffix ? `${h}/${suffix}` : h;
      if (!paths.includes(full)) paths.push(full);
    }
  }

  return paths;
}

// ─── Second Brain detection endpoint ──────────────────────────────────────

function handleSecondBrainDetect(req, res) {
  setCorsHeaders(res, req);
  
  const checks = {
    claudeCode: { installed: false, version: null, path: null },
    googleDrive: { installed: false, workspacePath: null },
    secondBrain: { initialized: false, claudeMdExists: false },
    claudeTemplates: { installed: false },
    skills: { installed: [] },
    obsidian: { installed: false },
    wisprFlow: { installed: false },
    platform: process.platform,
  };

  const promises = [];

  // 1. Check Claude Code (skip slow `claude --version` — scribe_cat adds 10-15s on Meta machines)
  promises.push(new Promise(resolve => {
    try {
      const cmd = IS_WIN ? 'where claude' : 'which claude';
      const claudePath = execSync(cmd, { encoding: 'utf-8', timeout: 5000 }).trim().split('\n')[0];
      checks.claudeCode.path = claudePath;
      checks.claudeCode.installed = true;
      // Use cached version if available, otherwise just mark as installed
      checks.claudeCode.version = claudeVersion || 'installed';
    } catch { /* claude not found */ }
    resolve();
  }));

  // 2. Check Google Drive workspace
  promises.push(new Promise(resolve => {
    try {
      const home = process.env.HOME || os.homedir();
      const username = process.env.USER || os.userInfo().username;
      const drivePaths = findGoogleDrivePaths(home, username, 'claude');
      const fs = require('fs');
      console.log(`[${new Date().toISOString()}] 🧠 Detect: scanning ${drivePaths.length} Google Drive paths...`);
      let found = false;
      for (const p of drivePaths) {
        const exists = fs.existsSync(p);
        console.log(`[${new Date().toISOString()}]   ${exists ? '✓' : '✗'} ${p}`);
        if (exists && !found) {
          found = true;
          checks.googleDrive.installed = true;
          checks.googleDrive.workspacePath = p;
          // Check for CLAUDE.md
          const hasClaude = fs.existsSync(`${p}/CLAUDE.md`);
          const hasClaudeAlt = fs.existsSync(`${p}/.claude/CLAUDE.md`);
          console.log(`[${new Date().toISOString()}]   CLAUDE.md: ${hasClaude ? 'found' : 'not found'} | .claude/CLAUDE.md: ${hasClaudeAlt ? 'found' : 'not found'}`);
          if (hasClaude || hasClaudeAlt) {
            checks.secondBrain.initialized = true;
            checks.secondBrain.claudeMdExists = true;
          } else {
            // Also mark as initialized if workspace has subfolders (projects, notes, etc.)
            try {
              const contents = fs.readdirSync(p);
              if (contents.includes('projects') || contents.includes('notes')) {
                checks.secondBrain.initialized = true;
                console.log(`[${new Date().toISOString()}]   Workspace has subfolders, marking as initialized`);
              }
            } catch { /* ignore */ }
          }
        }
      }
      if (!found) {
        console.log(`[${new Date().toISOString()}]   ⚠ No Google Drive workspace found in any scanned path`);
      }
    } catch (e) {
      console.log(`[${new Date().toISOString()}]   ⚠ Drive check error: ${e.message}`);
    }
    resolve();
  }));

  // 3. Check claude-templates
  promises.push(new Promise(resolve => {
    try {
      const cmd = IS_WIN ? 'where claude-templates' : 'which claude-templates';
      execSync(cmd, { encoding: 'utf-8', timeout: 5000 });
      checks.claudeTemplates.installed = true;
    } catch { /* not found */ }
    resolve();
  }));

  // 4. Check installed skills
  promises.push(new Promise(resolve => {
    try {
      const home = process.env.HOME || os.homedir();
      const fs = require('fs');
      // Check multiple possible skills locations
      const skillsDirs = [
        `${home}/.claude/skills`,
        `${home}/.claude-code/skills`,
        `${home}/.config/claude/skills`,
      ];
      let allSkills = [];
      for (const skillsDir of skillsDirs) {
        if (fs.existsSync(skillsDir)) {
          const dirs = fs.readdirSync(skillsDir).filter(d => {
            try { return fs.statSync(`${skillsDir}/${d}`).isDirectory(); } catch { return false; }
          });
          console.log(`[${new Date().toISOString()}]   Skills in ${skillsDir}: ${dirs.length > 0 ? dirs.join(', ') : 'none'}`);
          allSkills = allSkills.concat(dirs);
        } else {
          console.log(`[${new Date().toISOString()}]   Skills dir not found: ${skillsDir}`);
        }
      }
      // Also check if claude-templates is installed (counts as having skills infrastructure)
      if (allSkills.length === 0 && checks.claudeTemplates.installed) {
        try {
          const result = execSync('claude-templates skill list 2>/dev/null', { encoding: 'utf-8', timeout: 10000 }).trim();
          if (result) {
            const lines = result.split('\n').filter(l => l.trim() && !l.startsWith('─') && !l.toLowerCase().includes('name'));
            if (lines.length > 0) {
              allSkills = lines.map(l => l.trim().split(/\s+/)[0]).filter(Boolean);
              console.log(`[${new Date().toISOString()}]   Skills from claude-templates: ${allSkills.join(', ')}`);
            }
          }
        } catch { /* claude-templates list failed */ }
      }
      checks.skills.installed = [...new Set(allSkills)];
    } catch (e) {
      console.log(`[${new Date().toISOString()}]   ⚠ Skills check error: ${e.message}`);
    }
    resolve();
  }));

  // 5. Check Obsidian
  promises.push(new Promise(resolve => {
    try {
      if (IS_WIN) {
        execSync('where obsidian', { encoding: 'utf-8', timeout: 5000 });
        checks.obsidian.installed = true;
      } else {
        const fs = require('fs');
        checks.obsidian.installed = fs.existsSync('/Applications/Obsidian.app') ||
          fs.existsSync(`${process.env.HOME}/Applications/Obsidian.app`);
      }
    } catch { /* not found */ }
    resolve();
  }));

  // 6. Check Wispr Flow / SuperWhisper
  promises.push(new Promise(resolve => {
    try {
      const fs = require('fs');
      if (IS_WIN) {
        // Check common Windows install paths for Wispr Flow
        const localAppData = process.env.LOCALAPPDATA || `${process.env.USERPROFILE}\\AppData\\Local`;
        const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
        const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
        checks.wisprFlow.installed =
          fs.existsSync(`${localAppData}\\Programs\\wispr-flow\\Wispr Flow.exe`) ||
          fs.existsSync(`${localAppData}\\WisprFlow\\Wispr Flow.exe`) ||
          fs.existsSync(`${programFiles}\\Wispr Flow\\Wispr Flow.exe`) ||
          fs.existsSync(`${programFilesX86}\\Wispr Flow\\Wispr Flow.exe`) ||
          fs.existsSync(`${localAppData}\\Programs\\superwhisper\\SuperWhisper.exe`) ||
          (() => { try { execSync('where wispr-flow 2>nul', { encoding: 'utf-8', timeout: 3000 }); return true; } catch { return false; } })();
      } else {
        checks.wisprFlow.installed = 
          fs.existsSync('/Applications/Wispr Flow.app') ||
          fs.existsSync('/Applications/SuperWhisper.app') ||
          fs.existsSync(`${process.env.HOME}/Applications/Wispr Flow.app`) ||
          fs.existsSync(`${process.env.HOME}/Applications/SuperWhisper.app`);
      }
    } catch { /* not found */ }
    resolve();
  }));

  Promise.all(promises).then(() => {
    // Calculate overall readiness
    // Note: "Google Drive" = drive is installed, "Second Brain Workspace" = claude/ folder exists with content
    // For dashboard display, we combine these: if workspace exists, Drive is implicitly installed
    const hasWorkspace = checks.googleDrive.installed;
    const hasConfig = checks.secondBrain.claudeMdExists || checks.secondBrain.initialized;
    const components = [
      { name: 'Claude Code', ready: checks.claudeCode.installed },
      { name: 'Google Drive Workspace', ready: hasWorkspace && hasConfig },
      { name: 'CLAUDE.md Configuration', ready: checks.secondBrain.claudeMdExists },
      { name: 'Skills & Plugins', ready: checks.skills.installed.length > 0 },
    ];
    console.log(`[${new Date().toISOString()}] 🧠 Detect results: Claude=${checks.claudeCode.installed}, Drive=${hasWorkspace}, Workspace=${hasConfig}, CLAUDE.md=${checks.secondBrain.claudeMdExists}, Skills=${checks.skills.installed.length}`);
    const readyCount = components.filter(c => c.ready).length;
    const totalRequired = components.length;

    const result = {
      ...checks,
      summary: {
        readyCount,
        totalRequired,
        fullyReady: readyCount === totalRequired,
        components,
      },
      timestamp: new Date().toISOString(),
    };

    console.log(`[${new Date().toISOString()}] 🧠 Second Brain detect: ${readyCount}/${totalRequired} ready`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  });
}

// ─── Second Brain setup endpoint ─────────────────────────────────────────

const SB_ALLOWED_COMMANDS = [
  'claude-templates skill',
  'claude-templates plugin',
  'claude --version',
  'brew install',
  'brew install --cask',
  'node --version',
  'npm --version',
  'npm install -g',
  'mkdir -p',
  'open ',
];

// Default CLAUDE.md content for Second Brain initialization
const DEFAULT_CLAUDE_MD = `# Second Brain Configuration

## Slash Commands

### /daily-brief
Give me my morning briefing. Check my priorities, calendar for today, and any pending tasks. Summarize what I should focus on.

### /eod
End of day wrap-up. Process any meeting notes from today, update task statuses, and preview what's on for tomorrow.

### /eow
End of week summary. Compile what was accomplished this week, capture any PSC-worthy items, and outline priorities for next week.

### /prepare-meeting <person or topic>
Research the person or topic and generate a meeting agenda. Include relevant context from my projects and recent interactions.

### /add-context <url or text>
Process this information and route it to the appropriate project or knowledge area in my workspace.

### /deep-research <topic>
Conduct thorough research on this topic. Find multiple sources, cross-reference information, and provide a comprehensive summary with citations.

## Preferences
- Keep responses concise and actionable
- Use bullet points for lists
- Always include next steps when relevant
- Match my writing style (see style guide if available)

## Workspace Structure
- projects/ — Active project folders
- notes/ — Meeting notes and quick captures  
- research/ — Deep research outputs
- templates/ — Reusable templates
- archive/ — Completed items
`;

function handleSecondBrainSetup(req, res, body) {
  setCorsHeaders(res, req);

  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON body' }));
    return;
  }

  const { action, command } = payload;
  const fs = require('fs');
  const home = process.env.HOME || os.homedir();
  const username = process.env.USER || os.userInfo().username;

  // ─── Create workspace folder ───────────────────────────────────────
  if (action === 'create-workspace') {
    console.log(`[${new Date().toISOString()}] 🧠 Second Brain: Creating workspace...`);
    try {
      // Try to find Google Drive mount
      const drivePaths = findGoogleDrivePaths(home, username, '');

      let driveRoot = null;
      for (const p of drivePaths) {
        if (fs.existsSync(p)) {
          driveRoot = p;
          break;
        }
      }

      if (!driveRoot) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          action: 'create-workspace',
          error: 'google-drive-not-found',
          message: 'Google Drive is not mounted on this computer. Please install and sign into Google Drive for Desktop first.',
          searchedPaths: drivePaths,
        }));
        return;
      }

      const sep = IS_WIN ? '\\' : '/';
      const workspacePath = `${driveRoot}${sep}claude`;
      const subfolders = ['projects', 'notes', 'research', 'templates', 'archive'];

      // Create main workspace
      if (!fs.existsSync(workspacePath)) {
        fs.mkdirSync(workspacePath, { recursive: true });
      }

      // Create subfolders
      for (const sub of subfolders) {
        const subPath = `${workspacePath}${sep}${sub}`;
        if (!fs.existsSync(subPath)) {
          fs.mkdirSync(subPath, { recursive: true });
        }
      }

      console.log(`[${new Date().toISOString()}] 🧠 Workspace created at: ${workspacePath}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        action: 'create-workspace',
        workspacePath,
        subfolders,
      }));
    } catch (err) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        action: 'create-workspace',
        error: err.message,
      }));
    }
    return;
  }

  // ─── Initialize CLAUDE.md ──────────────────────────────────────────
  if (action === 'init-claudemd') {
    console.log(`[${new Date().toISOString()}] 🧠 Second Brain: Initializing CLAUDE.md...`);
    try {
      // Find the workspace
      let workspacePath = null;
      const drivePaths = findGoogleDrivePaths(home, username, 'claude');

      for (const p of drivePaths) {
        if (fs.existsSync(p)) {
          workspacePath = p;
          break;
        }
      }

      if (!workspacePath) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          action: 'init-claudemd',
          error: 'workspace-not-found',
          message: 'Workspace folder not found. Please create the workspace first.',
        }));
        return;
      }

      const sep = IS_WIN ? '\\' : '/';
      const claudeMdPath = `${workspacePath}${sep}CLAUDE.md`;

      // Don't overwrite existing CLAUDE.md
      if (fs.existsSync(claudeMdPath)) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          action: 'init-claudemd',
          alreadyExists: true,
          path: claudeMdPath,
        }));
        return;
      }

      fs.writeFileSync(claudeMdPath, DEFAULT_CLAUDE_MD, 'utf-8');
      console.log(`[${new Date().toISOString()}] 🧠 CLAUDE.md created at: ${claudeMdPath}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        action: 'init-claudemd',
        path: claudeMdPath,
        alreadyExists: false,
      }));
    } catch (err) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        action: 'init-claudemd',
        error: err.message,
      }));
    }
    return;
  }

  // ─── Check Homebrew availability ───────────────────────────────────
  if (action === 'check-homebrew') {
    try {
      const brewPath = execSync('which brew', { encoding: 'utf-8', timeout: 5000 }).trim();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, action: 'check-homebrew', path: brewPath }));
    } catch {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, action: 'check-homebrew' }));
    }
    return;
  }

  // ─── Install claude-templates via npm ──────────────────────────────
  if (action === 'install-claude-templates') {
    console.log(`[${new Date().toISOString()}] 🧠 Second Brain: Installing claude-templates...`);
    const cmd = IS_WIN
      ? 'npm install -g claude-templates'
      : 'npm install -g claude-templates 2>&1 || sudo npm install -g claude-templates 2>&1';

    const proc = spawn(cmd, [], {
      cwd: home,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });

    const timeout = setTimeout(() => proc.kill('SIGTERM'), 120000);

    proc.on('close', code => {
      clearTimeout(timeout);
      console.log(`[${new Date().toISOString()}] 🧠 claude-templates install: code=${code}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: code === 0,
        action: 'install-claude-templates',
        stdout: stdout.slice(-3000),
        stderr: stderr.slice(-3000),
        exitCode: code,
      }));
    });

    proc.on('error', err => {
      clearTimeout(timeout);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    });
    return;
  }

  if (action === 'install-skills') {
    const cmd = 'claude-templates skill tasks,deep-research,google-docs,google-docs-fast-reader,google-sheets,google-slides-presentation,calendar,create-wiki,gchat install';
    console.log(`[${new Date().toISOString()}] 🧠 Second Brain: Installing skills...`);

    const proc = spawn(cmd, [], {
      cwd: process.env.HOME || os.homedir(),
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });

    const timeout = setTimeout(() => proc.kill('SIGTERM'), 120000);

    proc.on('close', code => {
      clearTimeout(timeout);
      console.log(`[${new Date().toISOString()}] 🧠 Skills install: code=${code}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: code === 0,
        action: 'install-skills',
        stdout: stdout.slice(-3000),
        stderr: stderr.slice(-3000),
        exitCode: code,
      }));
    });

    proc.on('error', err => {
      clearTimeout(timeout);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    });
    return;
  }

  if (action === 'install-plugins') {
    const cmd = 'claude-templates plugin tasks,deep-research,google-docs,google-docs-fast-reader,google-sheets,google-slides-presentation,calendar,create-wiki,gchat install';
    console.log(`[${new Date().toISOString()}] 🧠 Second Brain: Installing plugins...`);

    const proc = spawn(cmd, [], {
      cwd: process.env.HOME || os.homedir(),
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });

    const timeout = setTimeout(() => proc.kill('SIGTERM'), 120000);

    proc.on('close', code => {
      clearTimeout(timeout);
      console.log(`[${new Date().toISOString()}] 🧠 Plugins install: code=${code}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: code === 0,
        action: 'install-plugins',
        stdout: stdout.slice(-3000),
        stderr: stderr.slice(-3000),
        exitCode: code,
      }));
    });

    proc.on('error', err => {
      clearTimeout(timeout);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    });
    return;
  }

  // ─── Install add-ons ──────────────────────────────────────────────
  if (action === 'install-addon') {
    const addon = payload.addon;
    console.log(`[${new Date().toISOString()}] 🧠 Second Brain: Installing add-on: ${addon}`);

    let cmd;
    let description;
    switch (addon) {
      case 'wispr-flow':
        cmd = IS_WIN
          ? 'winget install --id WisprAI.WisprFlow --accept-package-agreements --accept-source-agreements 2>&1'
          : 'brew install --cask wispr-flow 2>&1';
        description = 'Wispr Flow (voice-to-text)';
        break;
      case 'obsidian':
        cmd = IS_WIN
          ? 'winget install --id Obsidian.Obsidian --accept-package-agreements --accept-source-agreements 2>&1'
          : 'brew install --cask obsidian 2>&1';
        description = 'Obsidian (knowledge management)';
        break;
      case 'gclaude':
        cmd = 'npm install -g gclaude 2>&1 || pip3 install gclaude 2>&1';
        description = 'GClaude (Google Chat integration)';
        break;
      default:
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Unknown add-on: ${addon}. Use: wispr-flow, obsidian, gclaude` }));
        return;
    }

    const proc = spawn(cmd, [], {
      cwd: home,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });

    const timeout = setTimeout(() => proc.kill('SIGTERM'), 300000); // 5 min for brew installs

    proc.on('close', code => {
      clearTimeout(timeout);
      console.log(`[${new Date().toISOString()}] 🧠 Add-on ${addon} install: code=${code}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: code === 0,
        action: 'install-addon',
        addon,
        description,
        stdout: stdout.slice(-3000),
        stderr: stderr.slice(-3000),
        exitCode: code,
      }));
    });

    proc.on('error', err => {
      clearTimeout(timeout);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    });
    return;
  }

  // ─── Save file to workspace ───────────────────────────────────────
  if (action === 'save-to-workspace') {
    const filename = payload.filename;
    const content = payload.content;
    console.log(`[${new Date().toISOString()}] 🧠 Second Brain: Saving ${filename} to workspace...`);

    if (!filename || !content) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing filename or content' }));
      return;
    }

    // Sanitize filename (no path traversal)
    const safeName = filename.replace(/[\/\\]/g, '_').replace(/\.\./g, '');

    try {
      let workspacePath = null;
      const drivePaths = findGoogleDrivePaths(home, username, 'claude');
      for (const p of drivePaths) {
        if (fs.existsSync(p)) { workspacePath = p; break; }
      }

      if (!workspacePath) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Workspace not found. Run setup first.' }));
        return;
      }

      const filePath = `${workspacePath}/${safeName}`;
      fs.writeFileSync(filePath, content, 'utf-8');
      console.log(`[${new Date().toISOString()}] 🧠 Saved: ${filePath}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, action: 'save-to-workspace', path: filePath }));
    } catch (err) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  if (action === 'run-command' && command) {
    // Only allow safe commands
    const allowed = SB_ALLOWED_COMMANDS.some(prefix => command.trim().startsWith(prefix));
    if (!allowed) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Command not allowed: ${command}` }));
      return;
    }

    const proc = spawn(command, [], {
      cwd: process.env.HOME || os.homedir(),
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });

    const timeout = setTimeout(() => proc.kill('SIGTERM'), 60000);

    proc.on('close', code => {
      clearTimeout(timeout);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: code === 0,
        action: 'run-command',
        command,
        stdout: stdout.slice(-3000),
        stderr: stderr.slice(-3000),
        exitCode: code,
      }));
    });

    proc.on('error', err => {
      clearTimeout(timeout);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    });
    return;
  }

  res.writeHead(400, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ 
    error: 'Unknown action. Use: install-skills, install-plugins, or run-command',
  }));
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

    // Cross-platform: use shell: true instead of sh -c / cmd /c
    const proc = spawn(cmd, [], {
      cwd: cwd,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
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

  if (req.method === 'GET' && req.url === '/v1/secondbrain/detect') {
    handleSecondBrainDetect(req, res);
    return;
  }

  if (req.method === 'POST' && req.url === '/v1/secondbrain/setup') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => handleSecondBrainSetup(req, res, body));
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
  console.log(`  ║   ⚡ ArcadIA Bridge v${VERSION}                             ║`);
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
  
  // Kill all pool processes first
  for (const entry of pool) {
    if (entry && entry.proc) {
      try { entry.proc.kill('SIGTERM'); } catch {}
    }
  }
  pool.length = 0;
  
  // Kill all other active child processes
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
