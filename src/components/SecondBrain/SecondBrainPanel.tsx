import React, { useState, useEffect, useRef, useCallback } from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────

interface DetectionResult {
  claudeCode: { installed: boolean; version: string | null; path: string | null };
  googleDrive: { installed: boolean; workspacePath: string | null };
  secondBrain: { initialized: boolean; claudeMdExists: boolean };
  claudeTemplates: { installed: boolean };
  skills: { installed: string[] };
  obsidian: { installed: boolean };
  wisprFlow: { installed: boolean };
  platform: string;
  summary: {
    readyCount: number;
    totalRequired: number;
    fullyReady: boolean;
    components: { name: string; ready: boolean }[];
  };
}

type StepStatus = 'waiting' | 'checking' | 'running' | 'done' | 'skipped' | 'error';

interface SetupStep {
  id: string;
  label: string;
  friendlyDesc: string;
  status: StepStatus;
  elapsed?: number;
  output?: string;
  detail?: string;
}

type Phase = 'detecting' | 'dashboard' | 'installing';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ─── Slash Commands ─────────────────────────────────────────────────────────

const SLASH_COMMANDS = [
  { command: '/daily-brief', label: 'Daily Brief', icon: '☀️', description: 'Morning briefing from your priorities + calendar. Get a summary of what needs your attention today.' },
  { command: '/eod', label: 'End of Day', icon: '🌙', description: 'End-of-day wrap-up: processes meeting notes, captures decisions, and previews tomorrow.' },
  { command: '/eow', label: 'End of Week', icon: '📋', description: 'Weekly wrap-up and PSC capture. Reviews the week, highlights wins, and sets next week priorities.' },
  { command: '/prepare-meeting', label: 'Prepare Meeting', icon: '🤝', description: 'Research a person or topic and generate a meeting agenda with talking points.' },
  { command: '/add-context', label: 'Add Context', icon: '📎', description: 'Paste any URL or text and it routes to the right project in your workspace.' },
  { command: '/deep-research', label: 'Deep Research', icon: '🔍', description: 'In-depth research on a topic with source citations and structured findings.' },
];

// ─── Add-ons ────────────────────────────────────────────────────────────────

const ADDONS = [
  { id: 'wispr-flow', name: 'Wispr Flow / SuperWhisper', icon: '🎙️', description: 'Voice-to-text that\'s 3x faster than typing. Speak naturally and it transcribes into any app.', setupUrl: 'https://www.wispr.com/', detectionKey: 'wisprFlow' as const },
  { id: 'gclaude', name: 'GClaude', icon: '💬', description: 'Chat with your Second Brain via Google Chat. Send messages to the Bunny "gclaude" bot.', setupUrl: null, detectionKey: null },
  { id: 'obsidian', name: 'Obsidian', icon: '📓', description: 'Local knowledge management app that syncs with your Second Brain for offline access.', setupUrl: 'https://obsidian.md/', detectionKey: 'obsidian' as const },
];

// ─── The 4 fixed setup steps ────────────────────────────────────────────────

const SETUP_STEPS: Omit<SetupStep, 'status'>[] = [
  { id: 'claude-code', label: 'Claude Code', friendlyDesc: 'Checking if Claude Code CLI is installed on your computer...' },
  { id: 'google-drive-workspace', label: 'Google Drive Workspace', friendlyDesc: 'Checking Google Drive and creating workspace folders if needed...' },
  { id: 'claudemd-config', label: 'CLAUDE.md Configuration', friendlyDesc: 'Checking for CLAUDE.md and creating it with slash commands if needed...' },
  { id: 'skills-plugins', label: 'Skills & Plugins', friendlyDesc: 'Checking installed skills and installing missing ones...' },
];

// ─── Bridge API ─────────────────────────────────────────────────────────────

const BRIDGE = 'http://127.0.0.1:8087';

async function detect(): Promise<DetectionResult | null> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 30000); // 30s — claude --version can take 10-15s on Meta machines
    console.log('[SecondBrain] Fetching detect from', `${BRIDGE}/v1/secondbrain/detect`);
    const r = await fetch(`${BRIDGE}/v1/secondbrain/detect`, { signal: c.signal });
    clearTimeout(t);
    if (!r.ok) {
      console.error('[SecondBrain] detect response not ok:', r.status, r.statusText);
      return null;
    }
    const data = await r.json();
    console.log('[SecondBrain] detect result:', JSON.stringify(data?.summary));
    console.log('[SecondBrain] full detect:', JSON.stringify(data));
    return data;
  } catch (e: any) {
    console.error('[SecondBrain] detect error:', e.message);
    return null;
  }
}

async function setupAction(action: string, command?: string): Promise<any> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 180000);
    const r = await fetch(`${BRIDGE}/v1/secondbrain/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, command }),
      signal: c.signal,
    });
    clearTimeout(t);
    return await r.json();
  } catch (e: any) { return { success: false, error: e.message }; }
}

async function checkBridge(): Promise<boolean> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 3000);
    const r = await fetch(`${BRIDGE}/health`, { signal: c.signal });
    clearTimeout(t);
    return r.ok;
  } catch { return false; }
}

// ─── Download helpers ───────────────────────────────────────────────────────

function downloadFile(content: string, filename: string, mimeType: string = 'text/plain') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function detectContentType(content: string): { type: 'html' | 'markdown' | 'code' | 'text'; ext: string; mime: string; label: string } {
  const trimmed = content.trim();
  // Full HTML document
  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') || (trimmed.includes('<head') && trimmed.includes('<body'))) {
    return { type: 'html', ext: '.html', mime: 'text/html', label: 'HTML' };
  }
  // HTML fragment with significant tags
  if (/<(div|table|style|script|canvas|svg|section|article|main|header|footer)[\s>]/i.test(trimmed) && trimmed.split('<').length > 5) {
    return { type: 'html', ext: '.html', mime: 'text/html', label: 'HTML' };
  }
  // Markdown with headers, lists, or code blocks
  if (/^#{1,3}\s/m.test(trimmed) || /^[\-\*]\s/m.test(trimmed) || /^```/m.test(trimmed)) {
    return { type: 'markdown', ext: '.md', mime: 'text/markdown', label: 'Markdown' };
  }
  return { type: 'text', ext: '.txt', mime: 'text/plain', label: 'Text' };
}

function extractHtmlBlocks(content: string): string[] {
  const blocks: string[] = [];
  const htmlBlockRegex = /```html\n([\s\S]*?)```/g;
  let match;
  while ((match = htmlBlockRegex.exec(content)) !== null) {
    blocks.push(match[1].trim());
  }
  return blocks;
}

function generateFilename(command: string | null, ext: string): string {
  const base = command ? command.replace(/^\//,'').replace(/\s+/g, '-') : 'output';
  const date = new Date().toISOString().slice(0, 10);
  return `${base}-${date}${ext}`;
}

// ─── Download Menu Component ──────────────────────────────────────────────

function DownloadMenu({ messages, activeCommand }: { messages: ChatMessage[]; activeCommand: string | null }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Gather all assistant content
  const assistantContent = messages.filter(m => m.role === 'assistant').map(m => m.content).join('\n\n');
  if (!assistantContent.trim()) return null;

  const contentInfo = detectContentType(assistantContent);
  const htmlBlocks = extractHtmlBlocks(assistantContent);
  const hasHtmlBlocks = htmlBlocks.length > 0;

  const downloadOptions: { label: string; icon: string; action: () => void }[] = [];

  // Always offer markdown download
  downloadOptions.push({
    label: `Download as Markdown`,
    icon: '📄',
    action: () => {
      downloadFile(assistantContent, generateFilename(activeCommand, '.md'), 'text/markdown');
      setOpen(false);
    },
  });

  // If content IS HTML or contains HTML blocks, offer HTML download
  if (contentInfo.type === 'html') {
    downloadOptions.push({
      label: 'Download as HTML',
      icon: '🌐',
      action: () => {
        downloadFile(assistantContent, generateFilename(activeCommand, '.html'), 'text/html');
        setOpen(false);
      },
    });
  }
  if (hasHtmlBlocks) {
    htmlBlocks.forEach((block, i) => {
      const suffix = htmlBlocks.length > 1 ? `-${i + 1}` : '';
      downloadOptions.push({
        label: `Download HTML artifact${suffix}`,
        icon: '📊',
        action: () => {
          // Wrap in a full HTML document if it's a fragment
          const fullHtml = block.includes('<html') ? block : `<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>${activeCommand || 'Artifact'}</title><style>body{font-family:system-ui,-apple-system,sans-serif;margin:20px;background:#fff;color:#1a1a1a}</style></head><body>\n${block}\n</body></html>`;
          downloadFile(fullHtml, generateFilename(activeCommand, `${suffix}.html`), 'text/html');
          setOpen(false);
        },
      });
    });
  }

  // Plain text fallback
  downloadOptions.push({
    label: 'Download as Plain Text',
    icon: '📝',
    action: () => {
      downloadFile(assistantContent, generateFilename(activeCommand, '.txt'), 'text/plain');
      setOpen(false);
    },
  });

  // If only one real option (markdown), just show a simple button
  if (downloadOptions.length <= 2) {
    return (
      <button
        onClick={downloadOptions[0].action}
        title="Download output"
        style={{ fontSize: '11px', color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}
      >
        ⬇ Download
      </button>
    );
  }

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        title="Download output"
        style={{ fontSize: '11px', color: 'var(--text-tertiary)', background: open ? 'var(--bg-secondary)' : 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}
      >
        ⬇ Download
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: '4px',
          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          borderRadius: '8px', padding: '4px', minWidth: '200px', zIndex: 100,
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
        }}>
          {downloadOptions.map((opt, i) => (
            <button
              key={i}
              onClick={opt.action}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
                padding: '8px 12px', fontSize: '12px', color: 'var(--text-primary)',
                background: 'none', border: 'none', cursor: 'pointer', borderRadius: '6px',
                textAlign: 'left',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-primary)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <span>{opt.icon}</span>
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Simple markdown-ish rendering ──────────────────────────────────────────

function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBuffer: string[] = [];
  let codeLang = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('```')) {
      if (inCodeBlock) {
        elements.push(
          <pre key={`code-${i}`} style={{ background: '#1e1e2e', border: '1px solid #313244', borderRadius: '8px', padding: '12px 16px', fontSize: '12px', fontFamily: 'monospace', color: '#cdd6f4', overflow: 'auto', margin: '8px 0', lineHeight: '1.5' }}>
            <code>{codeBuffer.join('\n')}</code>
          </pre>
        );
        codeBuffer = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
        codeLang = line.slice(3).trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    if (line.startsWith('### ')) {
      elements.push(<h4 key={i} style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: '14px 0 6px' }}>{line.slice(4)}</h4>);
    } else if (line.startsWith('## ')) {
      elements.push(<h3 key={i} style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: '16px 0 8px' }}>{line.slice(3)}</h3>);
    } else if (line.startsWith('# ')) {
      elements.push(<h2 key={i} style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)', margin: '18px 0 8px' }}>{line.slice(2)}</h2>);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(<div key={i} style={{ paddingLeft: '16px', position: 'relative', margin: '3px 0', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6' }}><span style={{ position: 'absolute', left: '4px' }}>•</span>{renderInline(line.slice(2))}</div>);
    } else if (/^\d+\.\s/.test(line)) {
      const match = line.match(/^(\d+)\.\s(.*)$/);
      if (match) {
        elements.push(<div key={i} style={{ paddingLeft: '20px', position: 'relative', margin: '3px 0', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6' }}><span style={{ position: 'absolute', left: '2px', fontWeight: 600 }}>{match[1]}.</span>{renderInline(match[2])}</div>);
      }
    } else if (line.startsWith('> ')) {
      elements.push(<blockquote key={i} style={{ borderLeft: '3px solid #6366f1', paddingLeft: '12px', margin: '8px 0', fontSize: '13px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>{renderInline(line.slice(2))}</blockquote>);
    } else if (line.trim() === '') {
      elements.push(<div key={i} style={{ height: '8px' }} />);
    } else {
      elements.push(<p key={i} style={{ margin: '4px 0', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>{renderInline(line)}</p>);
    }
  }

  // Flush unclosed code block
  if (inCodeBlock && codeBuffer.length > 0) {
    elements.push(
      <pre key="code-end" style={{ background: '#1e1e2e', border: '1px solid #313244', borderRadius: '8px', padding: '12px 16px', fontSize: '12px', fontFamily: 'monospace', color: '#cdd6f4', overflow: 'auto', margin: '8px 0', lineHeight: '1.5' }}>
        <code>{codeBuffer.join('\n')}</code>
      </pre>
    );
  }

  return elements;
}

function renderInline(text: string): React.ReactNode {
  // Bold, inline code, italic
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Bold
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    const codeMatch = remaining.match(/`([^`]+)`/);

    const candidates: { idx: number; len: number; node: React.ReactNode }[] = [];

    if (boldMatch && boldMatch.index !== undefined) {
      candidates.push({ idx: boldMatch.index, len: boldMatch[0].length, node: <strong key={`b${key++}`} style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{boldMatch[1]}</strong> });
    }
    if (codeMatch && codeMatch.index !== undefined) {
      candidates.push({ idx: codeMatch.index, len: codeMatch[0].length, node: <code key={`c${key++}`} style={{ background: 'var(--bg-primary)', padding: '1px 5px', borderRadius: '3px', fontSize: '12px' }}>{codeMatch[1]}</code> });
    }

    candidates.sort((a, b) => a.idx - b.idx);
    const firstMatch = candidates[0] || null;

    if (firstMatch) {
      if (firstMatch.idx > 0) parts.push(remaining.slice(0, firstMatch.idx));
      parts.push(firstMatch.node);
      remaining = remaining.slice(firstMatch.idx + firstMatch.len);
    } else {
      parts.push(remaining);
      break;
    }
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function SecondBrainPanel() {
  const [phase, setPhase] = useState<Phase>('detecting');
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [bridgeConnected, setBridgeConnected] = useState(false);
  const [steps, setSteps] = useState<SetupStep[]>([]);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);
  const [setupLog, setSetupLog] = useState<string[]>([]);
  const detectRan = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Preview panel state ────────────────────────────────────────────────
  const [previewMessages, setPreviewMessages] = useState<ChatMessage[]>([]);
  const [previewStreaming, setPreviewStreaming] = useState(false);
  const [previewInput, setPreviewInput] = useState('');
  const [activeCommand, setActiveCommand] = useState<string | null>(null);
  const [previewPhase, setPreviewPhase] = useState<string>(''); // connecting, authenticating, streaming
  const [previewElapsed, setPreviewElapsed] = useState(0);
  const previewEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Style Guide state ──────────────────────────────────────────────────
  const [styleGuideOpen, setStyleGuideOpen] = useState(false);
  const [styleGuideInput, setStyleGuideInput] = useState('');
  const [styleGuideResult, setStyleGuideResult] = useState<string | null>(null);
  const [styleGuideAnalyzing, setStyleGuideAnalyzing] = useState(false);
  const [styleGuideSaved, setStyleGuideSaved] = useState(false);
  const [styleGuideError, setStyleGuideError] = useState<string | null>(null);

  // ─── Add-on install state ───────────────────────────────────────────────
  const [addonInstalling, setAddonInstalling] = useState<string | null>(null);
  const [addonError, setAddonError] = useState<Record<string, string>>({});

  // ─── Helper: add log line ────────────────────────────────────────────────

  const addLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString();
    console.log(`[SecondBrain] ${msg}`);
    setSetupLog(prev => [...prev.slice(-50), `[${ts}] ${msg}`]);
  }, []);

  // ─── Detection ──────────────────────────────────────────────────────────

  const runDetection = useCallback(async () => {
    console.log('[SecondBrain] runDetection started');
    setPhase('detecting');
    const connected = await checkBridge();
    console.log('[SecondBrain] bridge connected:', connected);
    setBridgeConnected(connected);
    if (!connected) { setPhase('dashboard'); return; }
    const result = await detect();
    console.log('[SecondBrain] detection result summary:', result?.summary);
    console.log('[SecondBrain] claudeCode:', result?.claudeCode);
    console.log('[SecondBrain] googleDrive:', result?.googleDrive);
    console.log('[SecondBrain] secondBrain:', result?.secondBrain);
    console.log('[SecondBrain] skills:', result?.skills);
    setDetection(result);
    setBridgeConnected(true);
    setPhase('dashboard');
  }, []);

  // Soft re-detect: refresh data in background without switching phase
  const softDetect = useCallback(async () => {
    const connected = await checkBridge();
    setBridgeConnected(connected);
    if (connected) {
      const result = await detect();
      if (result) setDetection(result);
    }
  }, []);

  useEffect(() => {
    if (!detectRan.current) { detectRan.current = true; runDetection(); }
  }, [runDetection]);

  // ─── Elapsed timer ──────────────────────────────────────────────────────

  useEffect(() => {
    if (phase === 'installing') {
      timerRef.current = setInterval(() => {
        setSteps(prev => prev.map((s, i) =>
          i === currentStepIdx && (s.status === 'running' || s.status === 'checking')
            ? { ...s, elapsed: (s.elapsed || 0) + 1 }
            : s
        ));
      }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase, currentStepIdx]);

  // ─── Auto-scroll preview ───────────────────────────────────────────────

  useEffect(() => {
    previewEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [previewMessages, previewStreaming]);

  // ─── Send message to bridge (SSE streaming) ────────────────────────────

  const sendToBridge = useCallback(async (messages: ChatMessage[]) => {
    // Abort any existing stream
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setPreviewStreaming(true);
    setPreviewPhase('connecting');
    setPreviewElapsed(0);
    // Start elapsed timer
    if (previewTimerRef.current) clearInterval(previewTimerRef.current);
    previewTimerRef.current = setInterval(() => setPreviewElapsed(prev => prev + 1), 1000);

    // Add empty assistant message that we'll stream into
    setPreviewMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    try {
      const response = await fetch(`${BRIDGE}/v1/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messages.map(m => ({ role: m.role, content: m.content })),
          stream: true,
          max_tokens: 4096,
          system: 'You are a Second Brain assistant. The user is running slash commands from their ArcadIA Second Brain panel. Execute the command and return helpful, structured results. Use markdown formatting.',
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = await response.text();
        setPreviewMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: `**Error:** ${err || response.statusText}` };
          return updated;
        });
        setPreviewStreaming(false);
        setPreviewPhase('');
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader available');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          // Parse SSE keepalive for phase info
          if (line.startsWith(': keepalive')) {
            const phaseMatch = line.match(/phase=(\w+)/);
            if (phaseMatch) setPreviewPhase(phaseMatch[1]);
            continue;
          }

          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6);
          try {
            const event = JSON.parse(jsonStr);
            if (event.type === 'content_block_delta' && event.delta?.text) {
              setPreviewPhase('streaming');
              setPreviewMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === 'assistant') {
                  updated[updated.length - 1] = { ...last, content: last.content + event.delta.text };
                }
                return updated;
              });
            }
          } catch { /* skip non-JSON lines */ }
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        setPreviewMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === 'assistant' && !last.content) {
            updated[updated.length - 1] = { role: 'assistant', content: `**Connection error:** ${e.message}. Make sure the bridge is running.` };
          }
          return updated;
        });
      }
    } finally {
      setPreviewStreaming(false);
      setPreviewPhase('');
      if (previewTimerRef.current) { clearInterval(previewTimerRef.current); previewTimerRef.current = null; }
      abortRef.current = null;
    }
  }, []);

  // ─── Analyze Writing Style Guide ────────────────────────────────────────

  const analyzeStyleGuide = useCallback(async () => {
    if (!styleGuideInput.trim() || styleGuideInput.trim().length < 50) {
      setStyleGuideError('Please paste at least one substantial writing sample (50+ characters).');
      return;
    }
    setStyleGuideAnalyzing(true);
    setStyleGuideError(null);
    setStyleGuideResult(null);
    setStyleGuideSaved(false);

    const systemPrompt = `You are a writing style analyst. The user will provide examples of their writing. Analyze the writing style thoroughly and produce a detailed style guide in Markdown format that can be used by an AI assistant to match this person's writing style in future outputs.

The style guide should cover:
- **Tone & Voice**: formal/informal, direct/conversational, etc.
- **Sentence Structure**: average length, complexity, use of fragments
- **Vocabulary Level**: technical jargon, simple words, domain-specific terms
- **Formatting Preferences**: bullet points vs paragraphs, headers, emphasis
- **Common Patterns**: recurring phrases, transitions, opening/closing styles
- **Punctuation & Grammar**: Oxford comma, em dashes, semicolons, etc.
- **Perspective**: first person, third person, passive/active voice
- **Emotional Register**: enthusiastic, measured, analytical, casual

Output ONLY the style guide in clean Markdown. Start with a title "# Writing Style Guide" and organize into clear sections.`;

    try {
      const response = await fetch(`${BRIDGE}/v1/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: `Here are examples of my writing. Please analyze my style and create a comprehensive style guide:\n\n${styleGuideInput}` }],
          system: systemPrompt,
          stream: true,
        }),
      });

      if (!response.ok) throw new Error(`Bridge returned ${response.status}`);
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');
      const decoder = new TextDecoder();
      let fullText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'content_block_delta' && event.delta?.text) {
              fullText += event.delta.text;
              setStyleGuideResult(fullText); // live update
            }
          } catch { /* skip non-JSON lines */ }
        }
      }

      if (!fullText) throw new Error('Empty response from Claude');
      setStyleGuideResult(fullText);
    } catch (e: any) {
      setStyleGuideError(e.message || 'Failed to analyze writing style');
    } finally {
      setStyleGuideAnalyzing(false);
    }
  }, [styleGuideInput]);

  const saveStyleGuide = useCallback(async () => {
    if (!styleGuideResult) return;
    try {
      const response = await fetch(`${BRIDGE}/v1/secondbrain/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save-to-workspace', filename: 'STYLE_GUIDE.md', content: styleGuideResult }),
      });
      const data = await response.json();
      if (data.success) {
        setStyleGuideSaved(true);
      } else {
        setStyleGuideError(`Failed to save: ${data.error}`);
      }
    } catch (e: any) {
      setStyleGuideError(`Failed to save: ${e.message}`);
    }
  }, [styleGuideResult]);

  // ─── Install Add-on ──────────────────────────────────────────────────────

  const installAddon = useCallback(async (addonId: string) => {
    setAddonInstalling(addonId);
    setAddonError(prev => ({ ...prev, [addonId]: '' }));
    try {
      const response = await fetch(`${BRIDGE}/v1/secondbrain/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'install-addon', addon: addonId }),
      });
      const data = await response.json();
      if (data.success) {
        // Re-detect to update status
        softDetect();
      } else {
        setAddonError(prev => ({ ...prev, [addonId]: data.stderr || data.error || 'Install failed' }));
      }
    } catch (e: any) {
      setAddonError(prev => ({ ...prev, [addonId]: e.message }));
    } finally {
      setAddonInstalling(null);
    }
  }, [softDetect]);

  // ─── Execute slash command ─────────────────────────────────────────────

  const executeCommand = useCallback((command: string) => {
    const userMsg: ChatMessage = { role: 'user', content: command };
    setPreviewMessages([userMsg]);
    setActiveCommand(command);
    sendToBridge([userMsg]);
  }, [sendToBridge]);

  // ─── Send follow-up ───────────────────────────────────────────────────

  const sendFollowUp = useCallback(() => {
    const text = previewInput.trim();
    if (!text || previewStreaming) return;

    const userMsg: ChatMessage = { role: 'user', content: text };
    const allMessages = [...previewMessages, userMsg];
    setPreviewMessages(allMessages);
    setPreviewInput('');
    sendToBridge(allMessages);
  }, [previewInput, previewStreaming, previewMessages, sendToBridge]);

  // ─── Copy command ───────────────────────────────────────────────────────

  const copyCommand = useCallback((cmd: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(cmd);
    setCopiedCommand(cmd);
    setTimeout(() => setCopiedCommand(null), 2000);
  }, []);

  // ─── Run full automated install ─────────────────────────────────────────

  const runInstall = useCallback(async () => {
    addLog('Starting automated setup...');
    const initialSteps: SetupStep[] = SETUP_STEPS.map(s => ({ ...s, status: 'waiting' as StepStatus }));
    setSteps(initialSteps);
    setCurrentStepIdx(0);
    setPhase('installing');

    const setStep = (idx: number, updates: Partial<SetupStep>) => {
      setSteps(prev => prev.map((s, i) => i === idx ? { ...s, ...updates } : s));
    };

    // Step 1: Claude Code
    setCurrentStepIdx(0);
    setStep(0, { status: 'checking', elapsed: 0, friendlyDesc: 'Checking if Claude Code CLI is installed...' });
    addLog('Step 1/4: Checking Claude Code...');
    try {
      const det = await detect();
      if (det?.claudeCode.installed) {
        const ver = det.claudeCode.version?.split('\n')[0]?.slice(0, 60) || 'installed';
        setStep(0, { status: 'done', detail: ver, friendlyDesc: `Claude Code is installed (${ver})` });
        addLog(`Claude Code: found (${ver})`);
      } else {
        const health = await checkBridge();
        if (health) {
          setStep(0, { status: 'done', detail: 'Detected via bridge', friendlyDesc: 'Claude Code is installed (detected via bridge connection)' });
          addLog('Claude Code: detected via bridge');
        } else {
          setStep(0, { status: 'error', friendlyDesc: 'Claude Code not found. Install from https://fburl.com/claude.code.users and re-run.', output: 'Claude Code CLI not detected.' });
          addLog('Claude Code: NOT FOUND');
        }
      }
    } catch (e: any) {
      setStep(0, { status: 'error', output: e.message, friendlyDesc: 'Failed to check Claude Code status' });
    }
    await new Promise(r => setTimeout(r, 300));

    // Step 2: Google Drive Workspace
    setCurrentStepIdx(1);
    setStep(1, { status: 'checking', elapsed: 0, friendlyDesc: 'Checking Google Drive and workspace folder...' });
    addLog('Step 2/4: Checking Google Drive Workspace...');
    try {
      const det = await detect();
      if (det?.googleDrive.installed && det?.secondBrain.initialized) {
        setStep(1, { status: 'done', detail: det.googleDrive.workspacePath || '', friendlyDesc: `Workspace found at ${det.googleDrive.workspacePath || 'Google Drive'}` });
        addLog(`Workspace: found at ${det.googleDrive.workspacePath}`);
      } else if (det?.googleDrive.installed) {
        setStep(1, { status: 'running', elapsed: 0, friendlyDesc: 'Google Drive found. Creating workspace folders...' });
        addLog('Creating workspace...');
        const result = await setupAction('create-workspace');
        if (result.success) {
          setStep(1, { status: 'done', detail: result.workspacePath, friendlyDesc: `Workspace created at ${result.workspacePath}` });
          addLog(`Workspace created at ${result.workspacePath}`);
        } else {
          setStep(1, { status: 'error', output: result.error || result.message, friendlyDesc: 'Failed to create workspace folders' });
        }
      } else {
        setStep(1, { status: 'running', elapsed: 0, friendlyDesc: 'Attempting to create workspace...' });
        const result = await setupAction('create-workspace');
        if (result.success) {
          setStep(1, { status: 'done', detail: result.workspacePath, friendlyDesc: `Workspace created at ${result.workspacePath}` });
        } else {
          setStep(1, { status: 'error', output: result.message || result.error, friendlyDesc: 'Google Drive not found. Install from google.com/drive/download and re-run.' });
        }
      }
    } catch (e: any) {
      setStep(1, { status: 'error', output: e.message, friendlyDesc: 'Failed to check Google Drive workspace' });
    }
    await new Promise(r => setTimeout(r, 300));

    // Step 3: CLAUDE.md Configuration
    setCurrentStepIdx(2);
    setStep(2, { status: 'checking', elapsed: 0, friendlyDesc: 'Checking for CLAUDE.md configuration file...' });
    addLog('Step 3/4: Checking CLAUDE.md...');
    try {
      const det = await detect();
      if (det?.secondBrain.claudeMdExists) {
        setStep(2, { status: 'done', friendlyDesc: 'CLAUDE.md configuration file found with slash commands' });
        addLog('CLAUDE.md: found');
      } else {
        setStep(2, { status: 'running', elapsed: 0, friendlyDesc: 'Creating CLAUDE.md with 6 pre-configured slash commands...' });
        const result = await setupAction('init-claudemd');
        if (result.success) {
          setStep(2, { status: 'done', detail: result.path || '', friendlyDesc: `CLAUDE.md created with all slash commands` });
          addLog(`CLAUDE.md created at ${result.path}`);
        } else {
          setStep(2, { status: 'error', output: result.error || result.message, friendlyDesc: `Failed to create CLAUDE.md. Ensure workspace exists first.` });
        }
      }
    } catch (e: any) {
      setStep(2, { status: 'error', output: e.message, friendlyDesc: 'Failed to check CLAUDE.md' });
    }
    await new Promise(r => setTimeout(r, 300));

    // Step 4: Skills & Plugins (with sub-step progress)
    setCurrentStepIdx(3);
    setStep(3, { status: 'checking', elapsed: 0, friendlyDesc: 'Checking installed skills and plugins...' });
    addLog('Step 4/4: Checking Skills & Plugins...');
    try {
      const det = await detect();
      if (det && det.skills.installed.length > 0) {
        setStep(3, { status: 'done', detail: `${det.skills.installed.length} skills`, friendlyDesc: `${det.skills.installed.length} skills installed: ${det.skills.installed.slice(0, 5).join(', ')}${det.skills.installed.length > 5 ? '...' : ''}` });
        addLog(`Skills: ${det.skills.installed.length} found`);
      } else {
        // Sub-step 4a: Install claude-templates
        setStep(3, { status: 'running', elapsed: 0, friendlyDesc: '(1/3) Installing template manager (claude-templates)... ~30s' });
        addLog('Installing claude-templates...');
        const tmplResult = await setupAction('install-claude-templates');

        if (tmplResult.success) {
          // Sub-step 4b: Install skills
          setStep(3, { status: 'running', friendlyDesc: '(2/3) Installing skills (tasks, deep-research, google-docs, calendar)... ~60s' });
          addLog('Installing skills...');
          const skillsResult = await setupAction('install-skills');

          if (skillsResult.success) {
            // Sub-step 4c: Install plugins
            setStep(3, { status: 'running', friendlyDesc: '(3/3) Installing plugins (Google Docs, Sheets, Slides, Calendar connectors)... ~60s' });
            addLog('Installing plugins...');
            const pluginsResult = await setupAction('install-plugins');

            if (pluginsResult.success) {
              setStep(3, { status: 'done', friendlyDesc: 'All skills and plugins installed successfully' });
              addLog('All skills & plugins installed');
            } else {
              setStep(3, { status: 'done', detail: 'Skills OK, plugins had issues', friendlyDesc: 'Skills installed. Some plugins may need manual setup.' });
              addLog(`Plugins issue: ${pluginsResult.error || pluginsResult.stderr}`);
            }
          } else {
            setStep(3, { status: 'error', output: skillsResult.error || skillsResult.stderr, friendlyDesc: 'Failed to install skills.' });
          }
        } else {
          addLog(`claude-templates failed: ${tmplResult.error}. Trying skills directly...`);
          setStep(3, { status: 'running', friendlyDesc: 'Template manager had issues. Trying skills directly...' });
          const skillsResult = await setupAction('install-skills');
          if (skillsResult.success) {
            setStep(3, { status: 'done', friendlyDesc: 'Skills installed (template manager may need manual setup)' });
          } else {
            setStep(3, { status: 'error', output: `${tmplResult.error}\n${skillsResult.error}`, friendlyDesc: 'Could not install skills. Run "npm install -g claude-templates" manually.' });
          }
        }
      }
    } catch (e: any) {
      setStep(3, { status: 'error', output: e.message, friendlyDesc: 'Failed to check or install skills' });
    }

    // Done — soft re-detect in background (FIX #1: don't block on re-detect)
    addLog('Setup complete. Refreshing status...');
    softDetect();
    addLog('Done.');
  }, [addLog, softDetect]);

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    height: '100%',
    fontFamily: 'var(--font-sans, -apple-system, BlinkMacSystemFont, sans-serif)',
    overflow: 'hidden',
  };

  // ─── Preview Panel (right side) ────────────────────────────────────────

  const renderPreview = () => {
    const hasMessages = previewMessages.length > 0;

    return (
      <div style={{
        flex: '0 0 420px',
        borderLeft: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-primary)',
        height: '100%',
      }}>
        {/* Preview header */}
        <div style={{
          padding: '14px 18px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '16px' }}>💬</span>
            <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>Preview</span>
            {activeCommand && (
              <code style={{ fontSize: '11px', color: '#6366f1', background: '#6366f115', padding: '2px 6px', borderRadius: '4px' }}>
                {activeCommand}
              </code>
            )}
          </div>
          {hasMessages && !previewStreaming && (
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <DownloadMenu messages={previewMessages} activeCommand={activeCommand} />
              <button
                onClick={() => { setPreviewMessages([]); setActiveCommand(null); if (abortRef.current) abortRef.current.abort(); }}
                style={{ fontSize: '11px', color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}
              >
                Clear
              </button>
            </div>
          )}
        </div>

        {/* Messages area */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 18px' }}>
          {!hasMessages ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-tertiary)' }}>
              <div style={{ fontSize: '40px', marginBottom: '12px', opacity: 0.5 }}>🧠</div>
              <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '6px', color: 'var(--text-secondary)' }}>
                Click a slash command to run it
              </div>
              <div style={{ fontSize: '12px', lineHeight: '1.6' }}>
                Results will appear here. You can ask follow-up questions to refine the output.
              </div>
            </div>
          ) : (
            previewMessages.map((msg, i) => (
              <div key={i} style={{ marginBottom: '16px' }}>
                {msg.role === 'user' ? (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: '#6366f120', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', flexShrink: 0, marginTop: '2px' }}>👤</div>
                    <div style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500, lineHeight: '1.5', padding: '6px 12px', background: 'var(--bg-secondary)', borderRadius: '10px', maxWidth: '100%' }}>
                      {msg.content}
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: '#8b5cf620', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', flexShrink: 0, marginTop: '2px' }}>🧠</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {msg.content ? (
                        <div style={{ lineHeight: '1.6' }}>{renderMarkdown(msg.content)}</div>
                      ) : previewStreaming ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0' }}>
                          <div style={{ width: '14px', height: '14px', border: '2px solid #6366f140', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                              {previewPhase === 'connecting' ? 'Connecting to Claude...'
                                : previewPhase === 'authenticating' ? 'Authenticating...'
                                : previewPhase === 'waiting' ? 'Waiting for response...'
                                : previewPhase === 'streaming' ? 'Streaming...'
                                : 'Processing...'}
                              {previewElapsed > 0 && ` (${Math.floor(previewElapsed / 60)}:${(previewElapsed % 60).toString().padStart(2, '0')})`}
                            </span>
                            {previewElapsed > 10 && previewPhase !== 'streaming' && (
                              <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', opacity: 0.7 }}>
                                Slash commands can take 2–5 min while Claude reads your workspace
                              </span>
                            )}
                          </div>
                          <button
                            onClick={() => { if (abortRef.current) abortRef.current.abort(); }}
                            style={{ fontSize: '11px', color: '#ef4444', background: 'none', border: '1px solid #ef444440', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer', marginLeft: '8px' }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
          <div ref={previewEndRef} />
        </div>

        {/* Follow-up input */}
        {hasMessages && (
          <div style={{
            padding: '12px 16px',
            borderTop: '1px solid var(--border)',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={previewInput}
                onChange={e => setPreviewInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendFollowUp(); } }}
                placeholder={previewStreaming ? 'Waiting for response...' : 'Ask a follow-up question...'}
                disabled={previewStreaming}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  outline: 'none',
                  opacity: previewStreaming ? 0.5 : 1,
                }}
              />
              <button
                onClick={sendFollowUp}
                disabled={previewStreaming || !previewInput.trim()}
                style={{
                  padding: '10px 16px',
                  borderRadius: '10px',
                  border: 'none',
                  background: previewStreaming || !previewInput.trim() ? '#6366f140' : '#6366f1',
                  color: '#fff',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: previewStreaming || !previewInput.trim() ? 'not-allowed' : 'pointer',
                  flexShrink: 0,
                }}
              >
                Send
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ─── Detecting ──────────────────────────────────────────────────────────

  if (phase === 'detecting') {
    return (
      <div style={{ ...containerStyle, justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ textAlign: 'center', padding: '80px 0' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px', animation: 'pulse 2s ease-in-out infinite' }}>🧠</div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>Scanning your computer...</h2>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Checking for Claude Code, Google Drive, skills, and plugins</p>
          <div style={{ width: '200px', margin: '20px auto 0', height: '4px', borderRadius: '2px', background: 'var(--bg-secondary)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: '60%', background: 'linear-gradient(90deg, #6366f1, #8b5cf6)', borderRadius: '2px', animation: 'slideRight 1.5s ease-in-out infinite' }} />
          </div>
        </div>
        <style>{`
          @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.7; transform: scale(1.05); } }
          @keyframes slideRight { 0% { transform: translateX(-100%); } 100% { transform: translateX(250%); } }
        `}</style>
      </div>
    );
  }

  // ─── No bridge ──────────────────────────────────────────────────────────

  if (!bridgeConnected && phase !== 'installing') {
    return (
      <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '10px' }}>🧠 Second Brain</h2>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>Your AI-powered personal knowledge system — powered by Claude Code and Google Drive.</p>
        </div>
        <div style={{ padding: '20px 24px', borderRadius: '12px', background: '#ef444410', border: '1px solid #ef444430', marginBottom: '20px' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#ef4444', marginBottom: '8px' }}>Bridge Not Connected</div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6', margin: '0 0 12px' }}>
            The ArcadIA Bridge needs to be running on your computer to detect and set up Second Brain.
          </p>
          <div style={{ padding: '10px 14px', background: 'var(--bg-primary)', borderRadius: '8px', fontFamily: 'monospace', fontSize: '12px', color: 'var(--text-primary)' }}>
            cd ~/Arcadia && node bridge/arcadia-bridge.js
          </div>
          <button onClick={runDetection} style={{ marginTop: '12px', padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#6366f1', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            🔄 Retry Connection
          </button>
        </div>
      </div>
    );
  }

  // ─── Installing (progress view) ────────────────────────────────────────

  if (phase === 'installing') {
    const doneCount = steps.filter(s => s.status === 'done' || s.status === 'skipped').length;
    const errorCount = steps.filter(s => s.status === 'error').length;
    const totalCount = steps.length;
    const finishedCount = doneCount + errorCount;
    const allFinished = finishedCount === totalCount;
    const allDone = doneCount === totalCount;
    const pct = totalCount > 0 ? Math.round((finishedCount / totalCount) * 100) : 0;
    const currentStep = steps[currentStepIdx];

    return (
      <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            {allDone ? '✅' : allFinished ? '⚠️' : '⚡'} {allDone ? 'Setup Complete!' : allFinished ? 'Setup Finished with Issues' : 'Setting Up Second Brain'}
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            {allDone ? 'All 4 components are installed and configured.' : allFinished ? `${doneCount}/${totalCount} ready. ${errorCount} had issues.` : `Step ${Math.min(currentStepIdx + 1, totalCount)}/${totalCount} — ${currentStep?.label || '...'}`}
          </p>
        </div>

        {/* Progress bar */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{doneCount}/{totalCount} completed{errorCount > 0 ? ` · ${errorCount} error${errorCount > 1 ? 's' : ''}` : ''}</span>
            <span style={{ fontSize: '12px', color: allDone ? '#22c55e' : errorCount > 0 ? '#f59e0b' : '#6366f1', fontWeight: 600 }}>{pct}%</span>
          </div>
          <div style={{ height: '8px', borderRadius: '4px', background: 'var(--bg-primary)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: allDone ? 'linear-gradient(90deg, #22c55e, #16a34a)' : errorCount > 0 ? 'linear-gradient(90deg, #f59e0b, #d97706)' : 'linear-gradient(90deg, #6366f1, #8b5cf6)', borderRadius: '4px', transition: 'width 0.5s ease' }} />
          </div>
        </div>

        {/* Steps */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
          {steps.map((step, i) => {
            const isCurrent = i === currentStepIdx && !allFinished;
            const statusIcon = step.status === 'done' ? '✅' : step.status === 'error' ? '❌' : (step.status === 'running' || step.status === 'checking') ? '⏳' : '○';
            const borderColor = step.status === 'done' ? '#22c55e30' : step.status === 'error' ? '#ef444430' : isCurrent ? '#6366f140' : 'var(--border)';
            return (
              <div key={step.id} style={{ padding: '14px 18px', borderRadius: '12px', border: `1px solid ${borderColor}`, background: isCurrent ? 'var(--bg-primary)' : 'var(--bg-secondary)', transition: 'all 0.3s ease' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '20px', flexShrink: 0, width: '28px', textAlign: 'center' }}>{statusIcon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '14px' }}>{step.label}</span>
                      {(step.status === 'running' || step.status === 'checking') && step.elapsed != null && (
                        <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>{step.elapsed}s</span>
                      )}
                      {step.detail && step.status === 'done' && (
                        <span style={{ fontSize: '11px', color: '#22c55e', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '300px' }}>{step.detail}</span>
                      )}
                      {(step.status === 'running' || step.status === 'checking') && (
                        <div style={{ width: '14px', height: '14px', border: '2px solid #6366f140', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 1s linear infinite', marginLeft: 'auto', flexShrink: 0 }} />
                      )}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '3px', lineHeight: '1.5' }}>{step.friendlyDesc}</div>
                  </div>
                </div>
                {step.status === 'error' && step.output && (
                  <div style={{ marginTop: '10px', padding: '8px 12px', background: '#ef444410', borderRadius: '8px', fontSize: '11px', fontFamily: 'monospace', color: '#ef4444', maxHeight: '80px', overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{step.output}</div>
                )}
              </div>
            );
          })}
        </div>

        {/* FIX #1: Go to Dashboard uses cached state, soft re-detect in background */}
        {allDone && (
          <button onClick={() => { setPhase('dashboard'); setBridgeConnected(true); softDetect(); }} style={{ padding: '12px 20px', borderRadius: '10px', border: 'none', background: '#22c55e', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer', width: '100%' }}>
            🎉 Go to Dashboard
          </button>
        )}
        {allFinished && !allDone && (
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={runInstall} style={{ flex: 1, padding: '10px 16px', borderRadius: '10px', border: 'none', background: '#6366f1', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>🔄 Retry Setup</button>
            <button onClick={() => { setPhase('dashboard'); setBridgeConnected(true); softDetect(); }} style={{ flex: 1, padding: '10px 16px', borderRadius: '10px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>← Back to Dashboard</button>
          </div>
        )}

        {setupLog.length > 0 && (
          <details style={{ marginTop: '16px' }}>
            <summary style={{ fontSize: '12px', color: 'var(--text-tertiary)', cursor: 'pointer', userSelect: 'none' }}>Setup log ({setupLog.length} entries)</summary>
            <div style={{ marginTop: '8px', padding: '10px 14px', background: 'var(--bg-primary)', borderRadius: '8px', maxHeight: '150px', overflow: 'auto', fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
              {setupLog.map((line, i) => <div key={i}>{line}</div>)}
            </div>
          </details>
        )}

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DASHBOARD (2-column: left = dashboard, right = preview)
  // ═══════════════════════════════════════════════════════════════════════════

  const summary = detection?.summary;
  const isFullyReady = summary?.fullyReady ?? false;
  const readyPct = summary ? Math.round((summary.readyCount / summary.totalRequired) * 100) : 0;

  return (
    <div style={containerStyle}>
      {/* Left column: Dashboard */}
      <div style={{ flex: 1, overflow: 'auto', padding: '24px', minWidth: 0 }}>
        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '10px' }}>🧠 Second Brain</h2>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>Your AI-powered personal knowledge system — powered by Claude Code and Google Drive.</p>
        </div>

        {/* Status overview */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <div style={{ padding: '8px 14px', borderRadius: '8px', background: 'var(--bg-secondary)', border: `1px solid ${isFullyReady ? '#22c55e30' : '#f59e0b30'}`, fontSize: '12px', color: isFullyReady ? '#22c55e' : '#f59e0b', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
            <span style={{ fontSize: '14px' }}>{isFullyReady ? '●' : '○'}</span>
            {isFullyReady ? 'Fully Configured' : `${summary?.readyCount ?? 0} of ${summary?.totalRequired ?? 4} components ready`}
          </div>
          <button onClick={runDetection} style={{ padding: '8px 14px', borderRadius: '8px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>🔄 Re-scan</button>
        </div>

        {/* Component checklist */}
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px 20px', marginBottom: '20px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-tertiary)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Setup Status</div>
          <div style={{ marginBottom: '12px', height: '6px', borderRadius: '3px', background: 'var(--bg-primary)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${readyPct}%`, background: 'linear-gradient(90deg, #6366f1, #6366f1cc)', borderRadius: '3px', transition: 'width 0.5s ease' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {[
              { label: 'Claude Code', ready: detection?.claudeCode.installed ?? false, detail: detection?.claudeCode.version?.split('\n')[0]?.slice(0, 40) },
              { label: 'Google Drive Workspace', ready: (detection?.googleDrive.installed && detection?.secondBrain.initialized) ?? false, detail: detection?.googleDrive.workspacePath },
              { label: 'CLAUDE.md Configuration', ready: detection?.secondBrain.claudeMdExists ?? false },
              { label: 'Skills & Plugins', ready: (detection?.skills.installed.length ?? 0) > 0, detail: detection?.skills.installed.slice(0, 5).join(', ') },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: item.ready ? '#22c55e' : '#f59e0b', display: 'inline-block', boxShadow: item.ready ? '0 0 6px #22c55e60' : 'none' }} />
                <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{item.label}</span>
                {item.detail && item.ready && (
                  <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '250px' }}>{item.detail}</span>
                )}
              </div>
            ))}
          </div>
          {!isFullyReady && (
            <button onClick={runInstall} style={{ marginTop: '14px', width: '100%', padding: '12px 20px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', fontSize: '14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: '0 4px 12px #6366f140' }}>
              ⚡ Complete Setup — Install Everything Automatically
            </button>
          )}
        </div>

        {/* Slash Commands — click to EXECUTE, small copy button */}
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px', marginTop: '24px' }}>Slash Commands</div>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px', marginTop: '-6px', lineHeight: '1.5' }}>
          {isFullyReady ? 'Click a command to run it. Results appear in the Preview panel.' : 'Setup required before running commands. Click to preview what each does.'}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {SLASH_COMMANDS.map(cmd => (
            <div
              key={cmd.command}
              style={{
                background: activeCommand === cmd.command ? '#6366f110' : 'var(--bg-secondary)',
                border: `1px solid ${activeCommand === cmd.command ? '#6366f140' : 'var(--border)'}`,
                borderRadius: '10px', padding: '12px 14px', cursor: 'pointer', transition: 'all 0.2s ease',
                display: 'flex', alignItems: 'center', gap: '12px',
              }}
              onClick={() => executeCommand(cmd.command)}
              onMouseEnter={e => { if (activeCommand !== cmd.command) { (e.currentTarget as HTMLElement).style.borderColor = '#6366f130'; (e.currentTarget as HTMLElement).style.background = 'var(--bg-primary)'; } }}
              onMouseLeave={e => { if (activeCommand !== cmd.command) { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.background = 'var(--bg-secondary)'; } }}
            >
              <div style={{ fontSize: '22px', lineHeight: '1', flexShrink: 0, width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', background: 'var(--bg-primary)' }}>
                {cmd.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <code style={{ fontSize: '13px', fontWeight: 700, color: '#6366f1' }}>{cmd.command}</code>
                  {activeCommand === cmd.command && previewStreaming && (
                    <div style={{ width: '10px', height: '10px', border: '2px solid #6366f140', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                  )}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px', lineHeight: '1.4' }}>{cmd.description}</div>
              </div>
              <button
                onClick={(e) => copyCommand(cmd.command, e)}
                title="Copy command"
                style={{ flexShrink: 0, width: '28px', height: '28px', borderRadius: '6px', border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: copiedCommand === cmd.command ? '#22c55e' : 'var(--text-tertiary)' }}
              >
                {copiedCommand === cmd.command ? '✓' : '📋'}
              </button>
            </div>
          ))}
        </div>

        {/* Writing Style Guide */}
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px', marginTop: '24px' }}>Writing Style Guide</div>
        <div style={{ background: 'var(--bg-secondary)', border: `1px solid ${styleGuideSaved ? '#22c55e30' : 'var(--border)'}`, borderRadius: '12px', padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
            <div style={{ fontSize: '28px' }}>✍️</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '14px', marginBottom: '4px' }}>Personalize Your Writing Style</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '10px' }}>
                Paste 3–5 examples of your writing below. Claude will analyze your style and create a personalized guide that Second Brain uses to match your tone in all future output.
              </div>
              {!styleGuideOpen && !styleGuideResult && (
                <button
                  onClick={() => setStyleGuideOpen(true)}
                  style={{ fontSize: '12px', color: '#fff', background: '#6366f1', border: 'none', borderRadius: '6px', padding: '6px 14px', cursor: 'pointer', fontWeight: 600 }}
                >
                  Create Style Guide
                </button>
              )}
              {styleGuideSaved && (
                <div style={{ fontSize: '12px', color: '#22c55e', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>✓</span> Style guide saved to your workspace (STYLE_GUIDE.md)
                </div>
              )}
            </div>
          </div>

          {/* Expandable input area */}
          {styleGuideOpen && !styleGuideResult && (
            <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border)' }}>
              <textarea
                value={styleGuideInput}
                onChange={e => setStyleGuideInput(e.target.value)}
                placeholder={'Paste your writing samples here. Include 3–5 examples from emails, docs, Workplace posts, or any writing that represents your style.\n\nExample 1:\n"Hey team, quick update on the project..."\n\nExample 2:\n"Following up on our discussion yesterday..."'}
                style={{
                  width: '100%',
                  minHeight: '180px',
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                  lineHeight: '1.6',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px' }}>
                <button
                  onClick={analyzeStyleGuide}
                  disabled={styleGuideAnalyzing || styleGuideInput.trim().length < 50}
                  style={{
                    fontSize: '12px',
                    color: '#fff',
                    background: styleGuideAnalyzing || styleGuideInput.trim().length < 50 ? '#64748b' : '#6366f1',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '8px 18px',
                    cursor: styleGuideAnalyzing ? 'wait' : 'pointer',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  {styleGuideAnalyzing && <div style={{ width: '12px', height: '12px', border: '2px solid #fff4', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />}
                  {styleGuideAnalyzing ? 'Analyzing... (this may take 2–3 min)' : 'Analyze My Style'}
                </button>
                <button
                  onClick={() => { setStyleGuideOpen(false); setStyleGuideInput(''); setStyleGuideError(null); }}
                  style={{ fontSize: '12px', color: 'var(--text-secondary)', background: 'none', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 14px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                  {styleGuideInput.trim().length < 50 ? `${50 - styleGuideInput.trim().length} more characters needed` : `${styleGuideInput.trim().length} characters`}
                </span>
              </div>
              {styleGuideError && (
                <div style={{ fontSize: '11px', color: '#ef4444', marginTop: '8px', padding: '6px 10px', background: '#ef44440a', borderRadius: '6px' }}>{styleGuideError}</div>
              )}
            </div>
          )}

          {/* Result display */}
          {styleGuideResult && (
            <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>Generated Style Guide</span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {!styleGuideSaved && (
                    <button
                      onClick={saveStyleGuide}
                      style={{ fontSize: '11px', color: '#fff', background: '#22c55e', border: 'none', borderRadius: '5px', padding: '4px 12px', cursor: 'pointer', fontWeight: 600 }}
                    >
                      Save to Workspace
                    </button>
                  )}
                  <button
                    onClick={() => { setStyleGuideResult(null); setStyleGuideOpen(true); setStyleGuideSaved(false); }}
                    style={{ fontSize: '11px', color: 'var(--text-secondary)', background: 'none', border: '1px solid var(--border)', borderRadius: '5px', padding: '4px 12px', cursor: 'pointer' }}
                  >
                    Redo
                  </button>
                </div>
              </div>
              <div style={{
                maxHeight: '300px',
                overflowY: 'auto',
                padding: '12px',
                background: 'var(--bg-primary)',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                fontSize: '12px',
                lineHeight: '1.7',
                color: 'var(--text-primary)',
              }}>
                {renderMarkdown(styleGuideResult)}
              </div>
              {styleGuideError && (
                <div style={{ fontSize: '11px', color: '#ef4444', marginTop: '8px' }}>{styleGuideError}</div>
              )}
            </div>
          )}
        </div>

        {/* Add-ons */}
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px', marginTop: '24px' }}>Optional Add-ons</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {ADDONS.map(addon => {
            const detected = addon.detectionKey ? (detection as any)?.[addon.detectionKey] : null;
            const isInstalled = typeof detected === 'object' && detected !== null ? detected.installed : typeof detected === 'boolean' ? detected : false;
            const isThisInstalling = addonInstalling === addon.id;
            const thisError = addonError[addon.id];
            return (
              <div key={addon.id} style={{ background: isInstalled ? '#22c55e08' : 'var(--bg-secondary)', border: `1px solid ${isInstalled ? '#22c55e30' : 'var(--border)'}`, borderRadius: '12px', padding: '14px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{ fontSize: '22px' }}>{addon.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '13px' }}>{addon.name}</span>
                      <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '20px', background: isInstalled ? '#22c55e18' : '#64748b18', color: isInstalled ? '#22c55e' : '#64748b', fontWeight: 600 }}>{isInstalled ? '✓ Detected' : 'Not installed'}</span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>{addon.description}</div>
                    {!isInstalled && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                        <button
                          onClick={() => installAddon(addon.id)}
                          disabled={isThisInstalling || addonInstalling !== null}
                          style={{
                            fontSize: '11px',
                            color: '#fff',
                            background: isThisInstalling ? '#64748b' : '#6366f1',
                            border: 'none',
                            borderRadius: '5px',
                            padding: '4px 12px',
                            cursor: isThisInstalling ? 'wait' : 'pointer',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                          }}
                        >
                          {isThisInstalling && <div style={{ width: '10px', height: '10px', border: '2px solid #fff4', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />}
                          {isThisInstalling ? 'Installing...' : 'Install Automatically'}
                        </button>
                        {addon.setupUrl && (
                          <a href={addon.setupUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>or install manually →</a>
                        )}
                      </div>
                    )}
                    {thisError && (
                      <div style={{ fontSize: '11px', color: '#ef4444', marginTop: '4px', padding: '4px 8px', background: '#ef44440a', borderRadius: '4px' }}>{thisError}</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Quick Reference */}
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px', marginTop: '24px' }}>Quick Reference</div>
        <div style={{ padding: '16px 20px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.7', marginBottom: '24px' }}>
          <div style={{ marginBottom: '8px' }}><strong style={{ color: 'var(--text-primary)' }}>How Second Brain works:</strong></div>
          <div style={{ marginBottom: '6px' }}><strong>1. Workspace</strong> — Your Google Drive <code style={{ background: 'var(--bg-primary)', padding: '1px 4px', borderRadius: '3px' }}>claude/</code> folder stores all projects, notes, and context.</div>
          <div style={{ marginBottom: '6px' }}><strong>2. CLAUDE.md</strong> — Your configuration file defines slash commands, preferences, and workflows.</div>
          <div style={{ marginBottom: '6px' }}><strong>3. Skills</strong> — Modular capabilities (calendar, docs, research) that Claude can use.</div>
          <div><strong>4. Plugins</strong> — Extensions that connect Claude to external services (Google Docs, Sheets, etc).</div>
        </div>
      </div>

      {/* Right column: Preview */}
      {renderPreview()}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>
    </div>
  );
}
