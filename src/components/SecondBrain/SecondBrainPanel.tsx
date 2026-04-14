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
  { command: '/sync-context', label: 'Sync Context', icon: '🔄', description: 'Sync your own Google Drive files and Workplace posts into your PARA workspace.' },
  { command: '/sync-context-all', label: 'Sync Context All', icon: '🌐', description: 'Sync everything: your Drive files, your Workplace posts, AND co-worker posts from tracked groups. Say "sync everything" or "what\'s new from my teams".' },
];

// ─── Add-ons ────────────────────────────────────────────────────────────────

const ADDONS = [
  { id: 'wispr-flow', name: 'Wispr Flow / SuperWhisper', icon: '🎙️', description: 'Voice-to-text that\'s 3x faster than typing. Speak naturally and it transcribes into any app.', setupUrl: 'https://www.wispr.com/', detectionKey: 'wisprFlow' as const, skillKey: null as string | null, installAction: 'install-addon' as const },
  { id: 'gclaude', name: 'GClaude', icon: '💬', description: 'Chat with your Second Brain via Google Chat. Send messages to the Bunny "gclaude" bot.', setupUrl: 'https://chat.google.com', detectionKey: null, skillKey: 'gchat' as string | null, installAction: 'install-gchat-skill' as const },
  { id: 'obsidian', name: 'Obsidian', icon: '📓', description: 'Local knowledge management app that syncs with your Second Brain for offline access.', setupUrl: 'https://obsidian.md/', detectionKey: 'obsidian' as const, skillKey: null as string | null, installAction: 'install-addon' as const },
];

// ─── The 4 fixed setup steps ────────────────────────────────────────────────

const SETUP_STEPS: Omit<SetupStep, 'status'>[] = [
  { id: 'claude-code', label: 'Claude Code', friendlyDesc: 'Checking if Claude Code CLI is installed on your computer...' },
  { id: 'google-drive-workspace', label: 'Google Drive Workspace', friendlyDesc: 'Checking Google Drive and creating workspace folders if needed...' },
  { id: 'claudemd-config', label: 'CLAUDE.md Configuration', friendlyDesc: 'Checking for CLAUDE.md and creating it with slash commands if needed...' },
  { id: 'skills-plugins', label: 'Skills & Plugins', friendlyDesc: 'Checking installed skills and installing missing ones...' },
];

// ─── Bridge API ─────────────────────────────────────────────────────────────

import { getBridgeUrl, isRemoteBridge, getRemoteBridgeConfig, setRemoteBridgeConfig, testBridgeConnection, normalizeBridgeUrl, DEFAULT_DEVSERVER, connectToDevserver } from '../../services/bridge';
import { detectPlatform } from '../../services/detectOS';
import { useConnection } from '../../store/ConnectionContext';
import { sendMessage as sendClaudeMessage } from '../../services/claude';
import { storage } from '../../services/storage';
import type { Message } from '../../types';
import ScheduleSkillDialog, { type SkillSchedule } from '../Skills/ScheduleSkillDialog';

// Dynamic bridge URL — reads from localStorage (remote) or defaults to localhost
function BRIDGE() { return getBridgeUrl(); }

async function detect(): Promise<DetectionResult | null> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 30000); // 30s — claude --version can take 10-15s on Meta machines
    console.log('[SecondBrain] Fetching detect from', `${BRIDGE()}/v1/secondbrain/detect`);
    const r = await fetch(`${BRIDGE()}/v1/secondbrain/detect`, { signal: c.signal });
    clearTimeout(t);
    if (!r.ok) {
      // Check if this is a "route not found" response from an older bridge
      let errorText = '';
      try { errorText = await r.text(); } catch { /* ignore */ }
      if (r.status === 404 || errorText.includes('Not found') || errorText.includes('/v1/messages')) {
        console.warn('[SecondBrain] Bridge does not support /v1/secondbrain/detect — bridge update needed');
      } else {
        console.error('[SecondBrain] detect response not ok:', r.status, r.statusText, errorText);
      }
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
    const r = await fetch(`${BRIDGE()}/v1/secondbrain/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, command }),
      signal: c.signal,
    });
    clearTimeout(t);
    if (!r.ok) {
      // Bridge doesn't support this route — likely an older version
      let errorText = '';
      try { errorText = await r.text(); } catch { /* ignore */ }
      const isRouteNotFound = r.status === 404 || errorText.includes('Not found') || errorText.includes('/v1/messages');
      if (isRouteNotFound) {
        return {
          success: false,
          error: 'Bridge update required',
          message: 'Your bridge does not support Second Brain setup. Please update your bridge to the latest version.',
          bridgeUpdateRequired: true,
        };
      }
      return { success: false, error: errorText || `HTTP ${r.status}` };
    }
    return await r.json();
  } catch (e: any) { return { success: false, error: e.message }; }
}

async function checkBridge(): Promise<boolean> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 3000);
    const r = await fetch(`${BRIDGE()}/health`, { signal: c.signal });
    clearTimeout(t);
    return r.ok;
  } catch { return false; }
}

async function checkBridgeVersion(): Promise<{ version: string; features: Record<string, boolean> } | null> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 3000);
    const r = await fetch(`${BRIDGE()}/v1/version`, { signal: c.signal });
    clearTimeout(t);
    if (r.ok) return await r.json();
    // Fallback: try health endpoint for version
    const h = await fetch(`${BRIDGE()}/health`, { signal: new AbortController().signal });
    if (h.ok) {
      const data = await h.json();
      return { version: data.version || 'unknown', features: data.capabilities || {} };
    }
    return null;
  } catch { return null; }
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

const MIN_BRIDGE_VERSION = '3.5.0';

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

  // Word document export
  downloadOptions.push({
    label: 'Download as Word (.docx)',
    icon: '📘',
    action: async () => {
      try {
        const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = await import('docx');
        const lines = assistantContent.split('\n');
        const children: InstanceType<typeof Paragraph>[] = [];

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) {
            children.push(new Paragraph({ text: '' }));
            continue;
          }
          // Headers
          if (trimmed.startsWith('### ')) {
            children.push(new Paragraph({ text: trimmed.replace(/^### /, ''), heading: HeadingLevel.HEADING_3 }));
          } else if (trimmed.startsWith('## ')) {
            children.push(new Paragraph({ text: trimmed.replace(/^## /, ''), heading: HeadingLevel.HEADING_2 }));
          } else if (trimmed.startsWith('# ')) {
            children.push(new Paragraph({ text: trimmed.replace(/^# /, ''), heading: HeadingLevel.HEADING_1 }));
          } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            children.push(new Paragraph({
              children: [new TextRun(trimmed.replace(/^[-*] /, ''))],
              bullet: { level: 0 },
            }));
          } else if (/^\d+\.\s/.test(trimmed)) {
            children.push(new Paragraph({
              children: [new TextRun(trimmed.replace(/^\d+\.\s/, ''))],
              numbering: { reference: 'default-numbering', level: 0 },
            }));
          } else if (trimmed.startsWith('**') && trimmed.endsWith('**')) {
            children.push(new Paragraph({
              children: [new TextRun({ text: trimmed.replace(/\*\*/g, ''), bold: true })],
            }));
          } else {
            children.push(new Paragraph({ children: [new TextRun(trimmed)] }));
          }
        }

        const doc = new Document({
          numbering: {
            config: [{
              reference: 'default-numbering',
              levels: [{ level: 0, format: 'decimal' as const, text: '%1.', alignment: AlignmentType.LEFT }],
            }],
          },
          sections: [{ children }],
        });

        const blob = await Packer.toBlob(doc);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = generateFilename(activeCommand, '.docx');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error('Word export failed:', err);
        // Fallback to plain text
        downloadFile(assistantContent, generateFilename(activeCommand, '.txt'), 'text/plain');
      }
      setOpen(false);
    },
  });

  // PDF export
  downloadOptions.push({
    label: 'Download as PDF',
    icon: '📕',
    action: async () => {
      try {
        const { jsPDF } = await import('jspdf');
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const pageWidth = pdf.internal.pageSize.getWidth();
        const margin = 20;
        const maxWidth = pageWidth - margin * 2;
        let y = margin;

        const lines = assistantContent.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();

          if (y > 270) {
            pdf.addPage();
            y = margin;
          }

          if (!trimmed) {
            y += 4;
            continue;
          }

          // Headers
          if (trimmed.startsWith('# ')) {
            pdf.setFontSize(18);
            pdf.setFont('helvetica', 'bold');
            const text = trimmed.replace(/^#+ /, '').replace(/\*\*/g, '');
            const split = pdf.splitTextToSize(text, maxWidth);
            pdf.text(split, margin, y);
            y += split.length * 8 + 4;
          } else if (trimmed.startsWith('## ')) {
            pdf.setFontSize(14);
            pdf.setFont('helvetica', 'bold');
            const text = trimmed.replace(/^#+ /, '').replace(/\*\*/g, '');
            const split = pdf.splitTextToSize(text, maxWidth);
            pdf.text(split, margin, y);
            y += split.length * 6 + 3;
          } else if (trimmed.startsWith('### ')) {
            pdf.setFontSize(12);
            pdf.setFont('helvetica', 'bold');
            const text = trimmed.replace(/^#+ /, '').replace(/\*\*/g, '');
            const split = pdf.splitTextToSize(text, maxWidth);
            pdf.text(split, margin, y);
            y += split.length * 5 + 2;
          } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            pdf.setFontSize(11);
            pdf.setFont('helvetica', 'normal');
            const text = '\u2022 ' + trimmed.replace(/^[-*] /, '').replace(/\*\*/g, '');
            const split = pdf.splitTextToSize(text, maxWidth - 5);
            pdf.text(split, margin + 5, y);
            y += split.length * 5 + 1;
          } else {
            pdf.setFontSize(11);
            pdf.setFont('helvetica', 'normal');
            const text = trimmed.replace(/\*\*/g, '');
            const split = pdf.splitTextToSize(text, maxWidth);
            pdf.text(split, margin, y);
            y += split.length * 5 + 1;
          }
        }

        pdf.save(generateFilename(activeCommand, '.pdf'));
      } catch (err) {
        console.error('PDF export failed:', err);
        downloadFile(assistantContent, generateFilename(activeCommand, '.txt'), 'text/plain');
      }
      setOpen(false);
    },
  });

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
            <code className={codeLang ? `language-${codeLang}` : ''}>{codeBuffer.join('\n')}</code>
          </pre>
        );
        codeBuffer = [];
        codeLang = '';
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

// ─── Bridge Not Connected ─────────────────────────────────────────────────

function BridgeNotConnected({ onRetry }: { onRetry: () => void }) {
  const [mode, setMode] = useState<'choose' | 'local' | 'remote' | 'devserver'>('choose');
  const [remoteUrl, setRemoteUrl] = useState('');
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; latency: number; version?: string; error?: string } | null>(null);
  const [copiedStep, setCopiedStep] = useState<number | null>(null);
  const [devserverAutoConnecting, setDevserverAutoConnecting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [localConnecting, setLocalConnecting] = useState(false);

  const handleConnect = async () => {
    const normalized = normalizeBridgeUrl(remoteUrl);
    if (!normalized) return;
    setTesting(true);
    setResult(null);
    const res = await testBridgeConnection(normalized);
    setResult(res);
    setTesting(false);
    if (res.ok) {
      setRemoteBridgeConfig({ enabled: true, url: normalized });
      setTimeout(onRetry, 500);
    }
  };

  // "Bridge is running — Connect" button handler: test local bridge first
  const handleLocalConnect = async () => {
    setLocalConnecting(true);
    setResult(null);
    const res = await testBridgeConnection('http://127.0.0.1:8087');
    setResult(res);
    setLocalConnecting(false);
    if (res.ok) {
      // Make sure we're using localhost (disable any remote config)
      setRemoteBridgeConfig({ enabled: false, url: '' });
      setTimeout(onRetry, 500);
    }
  };

  // Auto-connect to devserver
  const handleDevserverConnect = async () => {
    setDevserverAutoConnecting(true);
    setResult(null);
    const res = await testBridgeConnection(DEFAULT_DEVSERVER.url);
    setResult(res);
    setDevserverAutoConnecting(false);
    if (res.ok) {
      connectToDevserver();
      setTimeout(onRetry, 500);
    }
  };

  // Auto-detect bridge on mount — try whatever is configured (local or remote)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // First try the configured bridge URL (respects existing user config)
      const configuredUrl = getBridgeUrl();
      const res = await testBridgeConnection(configuredUrl);
      if (!cancelled && res.ok) {
        setTimeout(onRetry, 500);
        return;
      }
      // If configured URL failed and it was remote, also try localhost as fallback
      const config = getRemoteBridgeConfig();
      if (config.enabled && config.url.trim()) {
        const localRes = await testBridgeConnection('http://127.0.0.1:8087');
        if (!cancelled && localRes.ok) {
          // Local bridge is available — switch to it
          setRemoteBridgeConfig({ enabled: false, url: '' });
          setTimeout(onRetry, 500);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const BRIDGE_CDN = 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663326120815/fWRKXaZSkMJsFLJB.js';
  const SETUP_SH_URL = 'https://raw.githubusercontent.com/ikosoymeta/Arcadia/main/bridge/setup.sh';
  const SETUP_PS1_URL = 'https://raw.githubusercontent.com/ikosoymeta/Arcadia/main/bridge/setup.ps1';
  const platform = detectPlatform();
  const [remotePlatform, setRemotePlatform] = useState<'mac' | 'windows'>(detectPlatform);

  const copyText = (text: string, step: number) => {
    navigator.clipboard.writeText(text);
    setCopiedStep(step);
    setTimeout(() => setCopiedStep(null), 2000);
  };

  // Platform-specific one-liner setup commands (auto-install + auto-start)
  const setupOneLiner = platform === 'windows'
    ? `irm ${SETUP_PS1_URL} | iex`
    : `curl -sL ${SETUP_SH_URL} | bash`;
  // Fallback manual commands
  const downloadCmd = platform === 'windows'
    ? `Invoke-WebRequest -Uri "${BRIDGE_CDN}" -OutFile "$env:USERPROFILE\\arcadia-bridge.js"`
    : `curl -sL "${BRIDGE_CDN}" -o ~/arcadia-bridge.js`;
  const runCmd = platform === 'windows'
    ? 'node "$env:USERPROFILE\\arcadia-bridge.js"'
    : 'node ~/arcadia-bridge.js';
  const remoteDownloadCmd = remotePlatform === 'mac'
    ? `curl -sL "${BRIDGE_CDN}" -o ~/arcadia-bridge.js`
    : `Invoke-WebRequest -Uri "${BRIDGE_CDN}" -OutFile "$env:USERPROFILE\\arcadia-bridge.js"`;
  const remoteRunCmd = remotePlatform === 'mac'
    ? 'node ~/arcadia-bridge.js --host 0.0.0.0'
    : 'node "$env:USERPROFILE\\arcadia-bridge.js" --host 0.0.0.0';

  const stepBubble = (num: number) => (
    <span style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#6366f120', color: '#818cf8', fontSize: '14px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{num}</span>
  );

  const copyButton = (text: string, step: number) => (
    <button onClick={() => copyText(text, step)} style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: copiedStep === step ? '#22c55e18' : 'var(--bg-primary)', color: copiedStep === step ? '#22c55e' : 'var(--text-secondary)', cursor: 'pointer', fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap', transition: 'all 0.2s' }}>
      {copiedStep === step ? '✓ Copied!' : '📋 Copy'}
    </button>
  );

  const cmdBlock = (text: string, step: number) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
      <code style={{ flex: 1, padding: '10px 12px', background: 'var(--bg-primary)', borderRadius: '8px', fontFamily: 'monospace', fontSize: '12px', color: '#a78bfa', userSelect: 'all', wordBreak: 'break-all', lineHeight: '1.4' }}>{text}</code>
      {copyButton(text, step)}
    </div>
  );

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '10px' }}>🧠 Second Brain</h2>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>Your AI-powered personal knowledge system — powered by Claude Code and Google Drive.</p>
      </div>

      {/* ─── Choose mode ─── */}
      {mode === 'choose' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

          {/* Educational explainer */}
          <div style={{
            padding: '20px 24px', borderRadius: '14px',
            background: 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(139,92,246,0.06) 100%)',
            border: '1px solid rgba(99,102,241,0.2)', marginBottom: '4px',
          }}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
              💡 Think of it like a brilliant personal assistant
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 14px', maxWidth: '600px' }}>
              Your brain is great at having ideas but terrible at remembering everything.
              A Second Brain is like a smart, personal filing cabinet that lives in your digital tools.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px', marginBottom: '14px' }}>
              {[
                { icon: '📝', title: 'Capture', text: 'Save notes, articles, and ideas so you never lose them' },
                { icon: '📂', title: 'Organize', text: 'Sort everything into categories that make sense' },
                { icon: '🔍', title: 'Retrieve', text: 'Find anything you saved — even months ago — in seconds' },
                { icon: '🧩', title: 'Connect', text: 'Spot patterns between ideas you might have missed' },
              ].map((cap, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '10px 12px',
                  background: 'var(--bg-secondary)', borderRadius: '10px', border: '1px solid var(--border)',
                }}>
                  <span style={{ fontSize: '16px', flexShrink: 0, marginTop: '1px' }}>{cap.icon}</span>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '1px' }}>{cap.title}</div>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{cap.text}</span>
                  </div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', lineHeight: 1.6, margin: 0, fontStyle: 'italic' }}>
              It's like going from sticky notes scattered everywhere… to having a brilliant librarian who knows exactly where everything is.
            </p>
          </div>

          {/* Bridge setup prompt */}
          <div style={{ padding: '16px 20px', borderRadius: '12px', background: '#6366f108', border: '1px solid #6366f120', marginBottom: '4px' }}>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.6', margin: 0 }}>
              To get started, Second Brain needs a small helper program called the <strong style={{ color: 'var(--text-primary)' }}>ArcadIA Bridge</strong> running on your computer. It connects ArcadIA to Claude Code and your Google Drive files.
            </p>
          </div>

          {/* ★ RECOMMENDED: This Computer — one-command setup */}
          <div style={{
            padding: '20px', borderRadius: '12px',
            background: 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(79,70,229,0.04) 100%)',
            border: '2px solid rgba(99,102,241,0.35)',
            position: 'relative',
          }}>
            <div style={{
              position: 'absolute', top: '-10px', left: '16px',
              padding: '2px 10px', borderRadius: '6px',
              background: '#6366f1', color: '#fff',
              fontSize: '10px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase',
            }}>Recommended</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <span style={{ fontSize: '20px' }}>💻</span>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>This Computer</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {platform === 'windows' ? 'Windows' : 'macOS / Linux'} — one command, auto-starts on login
                </div>
              </div>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5', margin: '0 0 12px' }}>
              Run one command in {platform === 'windows' ? 'PowerShell' : 'Terminal'} to install and start the bridge. It auto-starts on every login.
            </p>
            <div style={{ marginBottom: '12px' }}>
              {cmdBlock(setupOneLiner, 50)}
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => setMode('local')} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>
                Manual setup steps
              </button>
              <button
                onClick={handleLocalConnect}
                disabled={localConnecting}
                style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: localConnecting ? '#6366f180' : '#6366f1', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: localConnecting ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {localConnecting ? (<><span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</span> Checking...</>) : 'Bridge is running — Connect'}
              </button>
            </div>
            {/* Show result inline */}
            {result && mode === 'choose' && (
              <div style={{
                marginTop: '10px', padding: '8px 12px', borderRadius: '8px',
                background: result.ok ? '#22c55e10' : '#ef444410',
                border: `1px solid ${result.ok ? '#22c55e30' : '#ef444430'}`,
                color: result.ok ? '#22c55e' : '#ef4444',
                fontSize: '12px', fontWeight: 500,
              }}>
                {result.ok
                  ? `✅ Connected! (${result.latency}ms) Loading Second Brain…`
                  : `Bridge not reachable — ${result.error || 'run the setup command above'}`}
              </div>
            )}
          </div>

          {/* Advanced options — collapsed by default */}
          <div style={{ marginTop: '4px' }}>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 0',
                background: 'transparent', border: 'none', color: 'var(--text-tertiary)',
                fontSize: '13px', fontWeight: 500, cursor: 'pointer',
              }}
            >
              <span style={{ transition: 'transform 0.2s', transform: showAdvanced ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block' }}>▶</span>
              Advanced options (devserver, remote machine)
            </button>

            {showAdvanced && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px', paddingLeft: '4px' }}>
                {/* Meta Devserver */}
                <div style={{ padding: '16px 20px', borderRadius: '12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '18px' }}>🖥️</span>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>Meta Devserver</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                        {DEFAULT_DEVSERVER.label} — {DEFAULT_DEVSERVER.specs}
                      </div>
                    </div>
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', lineHeight: '1.5', margin: '0 0 10px' }}>
                    Connect to a shared devserver with the bridge running 24/7. Requires Meta internal network access.
                  </p>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      onClick={handleDevserverConnect}
                      disabled={devserverAutoConnecting}
                      style={{
                        padding: '8px 20px', borderRadius: '8px', border: 'none',
                        background: devserverAutoConnecting ? '#22c55e80' : '#22c55e',
                        color: '#fff', fontSize: '13px', fontWeight: 600, cursor: devserverAutoConnecting ? 'wait' : 'pointer',
                        display: 'flex', alignItems: 'center', gap: '6px',
                      }}
                    >
                      {devserverAutoConnecting ? 'Connecting...' : 'One-Click Connect'}
                    </button>
                    <button
                      onClick={() => setMode('devserver')}
                      style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-tertiary)', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}
                    >
                      Setup Instructions
                    </button>
                  </div>
                </div>

                {/* Remote — another machine */}
                <div style={{ padding: '16px 20px', borderRadius: '12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '18px' }}>🌐</span>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>Custom Remote Machine</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Connect to a bridge on your own devserver or remote machine</div>
                    </div>
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', lineHeight: '1.5', margin: '0 0 10px' }}>
                    For advanced setups where Second Brain runs on a different machine.
                  </p>
                  <button onClick={() => setMode('remote')} style={{ padding: '8px 20px', borderRadius: '8px', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border)' }}>
                    Connect to Remote Machine
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Already running? */}
          <div style={{ textAlign: 'center', marginTop: '4px' }}>
            <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: '0 0 8px' }}>Already have the bridge running?</p>
            <button onClick={onRetry} style={{ padding: '8px 20px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: '#6366f1', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
              🔄 Retry Connection
            </button>
          </div>
        </div>
      )}

      {/* ─── Devserver setup instructions ─── */}
      {mode === 'devserver' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <button onClick={() => setMode('choose')} style={{ alignSelf: 'flex-start', padding: '4px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '12px' }}>
            ← Back
          </button>

          <div style={{
            padding: '16px 20px', borderRadius: '12px',
            background: 'linear-gradient(135deg, rgba(34,197,94,0.06) 0%, rgba(16,185,129,0.04) 100%)',
            border: '1px solid rgba(34,197,94,0.25)',
          }}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
              🖥️ Devserver Bridge Setup — {DEFAULT_DEVSERVER.hostname}
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6', margin: 0 }}>
              Run this one-liner on the devserver to install and start the bridge as a persistent 24/7 service.
              It uses tmux + cron to auto-restart on reboot and health-check every 30 minutes.
            </p>
          </div>

          {/* Step 1: SSH into devserver */}
          <div style={{ padding: '16px 20px', borderRadius: '12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              {stepBubble(1)}
              <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>SSH into the devserver</span>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6', margin: '0 0 4px' }}>
              Open your local terminal and connect:
            </p>
            {cmdBlock(`ssh ${DEFAULT_DEVSERVER.hostname}`, 20)}
          </div>

          {/* Step 2: Run setup script */}
          <div style={{ padding: '16px 20px', borderRadius: '12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              {stepBubble(2)}
              <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>Run the setup script</span>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6', margin: '0 0 4px' }}>
              This single command downloads, installs, and starts the bridge with auto-restart:
            </p>
            {cmdBlock(DEFAULT_DEVSERVER.setupCmd, 21)}
            <div style={{ marginTop: '10px', padding: '10px 14px', borderRadius: '8px', background: '#818cf808', border: '1px solid #818cf815', fontSize: '12px', color: 'var(--text-tertiary)', lineHeight: '1.6' }}>
              <strong style={{ color: 'var(--text-secondary)' }}>What this does:</strong>
              <div style={{ marginTop: '4px' }}>• Checks for Claude Code and Node.js</div>
              <div>• Downloads the latest bridge from GitHub</div>
              <div>• Starts the bridge in a tmux session (persists after SSH disconnect)</div>
              <div>• Sets up cron to auto-restart on reboot + health check every 30 min</div>
              <div>• Configures remote access (--host 0.0.0.0)</div>
            </div>
          </div>

          {/* Step 3: Connect */}
          <div style={{ padding: '16px 20px', borderRadius: '12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              {stepBubble(3)}
              <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>Connect from ArcadIA</span>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6', margin: '0 0 12px' }}>
              Once the script finishes, click below to connect:
            </p>
            <button
              onClick={handleDevserverConnect}
              disabled={devserverAutoConnecting}
              style={{
                padding: '12px 32px', borderRadius: '10px', border: 'none',
                background: devserverAutoConnecting ? '#22c55e80' : '#22c55e',
                color: '#fff', fontSize: '15px', fontWeight: 700, cursor: devserverAutoConnecting ? 'wait' : 'pointer',
              }}
            >
              {devserverAutoConnecting ? 'Connecting...' : `⚡ Connect to ${DEFAULT_DEVSERVER.hostname}`}
            </button>
          </div>

          {/* Result */}
          {result && (
            <div style={{
              padding: '12px 16px', borderRadius: '10px',
              background: result.ok ? '#22c55e10' : '#ef444410',
              border: `1px solid ${result.ok ? '#22c55e30' : '#ef444430'}`,
              color: result.ok ? '#22c55e' : '#ef4444',
              fontSize: '13px', fontWeight: 500,
            }}>
              {result.ok
                ? `✅ Connected! (${result.latency}ms) Loading Second Brain…`
                : `❌ ${result.error || 'Connection failed'} — make sure the setup script completed successfully`}
            </div>
          )}

          {/* Useful commands */}
          <div style={{ padding: '12px 16px', borderRadius: '10px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', fontSize: '12px', color: 'var(--text-tertiary)', lineHeight: '1.7' }}>
            <strong style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Useful devserver commands:</strong>
            <div><code style={{ color: '#a78bfa' }}>tmux attach -t arcadia-bridge</code> — view bridge output live</div>
            <div><code style={{ color: '#a78bfa' }}>tail -f ~/.arcadia-bridge/bridge.log</code> — view logs</div>
            <div><code style={{ color: '#a78bfa' }}>bash ~/.arcadia-bridge/setup-devserver.sh</code> — restart/update bridge</div>
            <div><code style={{ color: '#a78bfa' }}>tmux kill-session -t arcadia-bridge</code> — stop bridge</div>
          </div>
        </div>
      )}

      {/* ─── Local setup (step-by-step) ─── */}
      {mode === 'local' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <button onClick={() => setMode('choose')} style={{ alignSelf: 'flex-start', padding: '4px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '12px' }}>
            ← Back
          </button>

          <div style={{ padding: '14px 18px', borderRadius: '10px', background: 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(79,70,229,0.04) 100%)', border: '1px solid #818cf830', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            <strong style={{ color: 'var(--text-primary)' }}>Easiest way:</strong> Run this single command in {platform === 'windows' ? 'PowerShell' : 'Terminal'} to auto-install everything:
            {cmdBlock(setupOneLiner, 51)}
            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '8px' }}>
              This checks prerequisites, downloads the bridge, starts it, and sets up auto-start on login ({platform === 'windows' ? 'Task Scheduler' : 'LaunchAgent'}).
            </div>
          </div>

          <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', fontSize: '12px', color: 'var(--text-tertiary)', textAlign: 'center' }}>
            Or follow the manual steps below:
          </div>

          {/* Step 1: Open Terminal */}
          <div style={{ padding: '16px 20px', borderRadius: '12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              {stepBubble(1)}
              <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>Open {platform === 'windows' ? 'PowerShell' : 'Terminal'}</span>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6', margin: 0 }}>
              {platform === 'windows'
                ? <>Press <strong style={{ color: 'var(--text-primary)' }}>Windows key</strong>, type <strong style={{ color: 'var(--text-primary)' }}>PowerShell</strong>, and click to open it. <span style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>(Use PowerShell 7 if available — the blue "Windows PowerShell" works too.)</span></>
                : <>Press <strong style={{ color: 'var(--text-primary)' }}>Cmd + Space</strong>, type <strong style={{ color: 'var(--text-primary)' }}>Terminal</strong>, and press Enter.</>
              }
            </p>
          </div>

          {/* Step 2: Download */}
          <div style={{ padding: '16px 20px', borderRadius: '12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              {stepBubble(2)}
              <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>Download the bridge</span>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6', margin: '0 0 4px' }}>
              Copy this command and paste it into {platform === 'windows' ? 'PowerShell' : 'Terminal'}, then press <strong style={{ color: 'var(--text-primary)' }}>Enter</strong>:
            </p>
            {cmdBlock(downloadCmd, 2)}
            <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', margin: '8px 0 0' }}>
              This downloads a small file (~84KB) to your home folder. You only need to do this once.
            </p>
          </div>

          {/* Step 3: Start */}
          <div style={{ padding: '16px 20px', borderRadius: '12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              {stepBubble(3)}
              <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>Start the bridge</span>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6', margin: '0 0 4px' }}>
              Copy and paste this command, then press <strong style={{ color: 'var(--text-primary)' }}>Enter</strong>:
            </p>
            {cmdBlock(runCmd, 3)}
            <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', margin: '8px 0 0' }}>
              You should see a message like "ArcadIA Bridge running on port 8087". Keep this window open.
            </p>
          </div>

          {/* Retry */}
          <div style={{ textAlign: 'center', marginTop: '4px' }}>
            <button onClick={onRetry} style={{ padding: '12px 32px', borderRadius: '10px', border: 'none', background: '#22c55e', color: '#fff', fontSize: '15px', fontWeight: 700, cursor: 'pointer' }}>
              ✓ Done — Connect Now
            </button>
            <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', margin: '8px 0 0' }}>
              Make sure the bridge is running before clicking.
            </p>
          </div>

          {/* Prerequisite note */}
          <div style={{ padding: '12px 16px', borderRadius: '10px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', fontSize: '12px', color: 'var(--text-tertiary)', lineHeight: '1.6' }}>
            <strong style={{ color: 'var(--text-secondary)' }}>Prerequisite:</strong> Node.js must be installed.{' '}
            {platform === 'windows'
              ? <>If you see "'node' is not recognized", <a href="https://nodejs.org" target="_blank" rel="noopener" style={{ color: '#818cf8' }}>download Node.js here</a> and try again.</>
              : <>If you see "command not found: node", <a href="https://nodejs.org" target="_blank" rel="noopener" style={{ color: '#818cf8' }}>download Node.js here</a> and try again.</>
            }
          </div>
        </div>
      )}

      {/* ─── Remote setup ─── */}
      {mode === 'remote' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <button onClick={() => setMode('choose')} style={{ alignSelf: 'flex-start', padding: '4px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '12px' }}>
            ← Back
          </button>

          {/* Step 1 */}
          <div style={{ padding: '16px', borderRadius: '12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              {stepBubble(1)}
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Download & start the bridge on your remote machine</span>
            </div>

            {/* Platform tabs */}
            <div style={{ display: 'flex', gap: '4px', marginBottom: '10px' }}>
              {(['mac', 'windows'] as const).map(p => (
                <button key={p} onClick={() => setRemotePlatform(p)} style={{ padding: '4px 12px', borderRadius: '6px', border: remotePlatform === p ? '1px solid #818cf850' : '1px solid var(--border)', background: remotePlatform === p ? '#818cf818' : 'transparent', color: remotePlatform === p ? '#818cf8' : 'var(--text-tertiary)', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>
                  {p === 'mac' ? '🍎 Mac / Linux' : '🪟 Windows'}
                </button>
              ))}
            </div>

            {/* Direct download button */}
            <div style={{ marginBottom: '10px' }}>
              <a href={BRIDGE_CDN} download="arcadia-bridge.js" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', background: '#6366f1', color: '#fff', fontSize: '13px', fontWeight: 600, textDecoration: 'none', cursor: 'pointer' }}>
                ⬇ Download arcadia-bridge.js
              </a>
              <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginLeft: '8px' }}>Then transfer to your remote machine</span>
            </div>

            <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', lineHeight: '1.5', margin: '0 0 6px' }}>
              Or download via terminal on the remote machine:
            </p>
            {cmdBlock(remoteDownloadCmd, 10)}

            <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', lineHeight: '1.5', margin: '10px 0 6px' }}>
              Then start the bridge:
            </p>
            {cmdBlock(remoteRunCmd, 11)}
            <p style={{ fontSize: '10px', color: 'var(--text-tertiary)', margin: '8px 0 0' }}>
              💡 Single file (~84KB), zero dependencies. No npm install or repo clone needed.
            </p>
          </div>

          {/* Step 2 */}
          <div style={{ padding: '16px', borderRadius: '12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              {stepBubble(2)}
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Enter the remote machine's address</span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                value={remoteUrl}
                onChange={e => { setRemoteUrl(e.target.value); setResult(null); }}
                onKeyDown={e => e.key === 'Enter' && handleConnect()}
                placeholder="hostname or IP address"
                style={{ flex: 1, padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: '13px', outline: 'none' }}
              />
              <button
                onClick={handleConnect}
                disabled={testing || !remoteUrl.trim()}
                style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: testing ? '#6366f180' : '#6366f1', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: testing ? 'wait' : 'pointer', whiteSpace: 'nowrap', minWidth: '100px' }}
              >
                {testing ? 'Connecting…' : 'Connect'}
              </button>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', margin: '6px 0 0' }}>
              Just type the hostname or IP — we'll add http:// and port :8087 automatically.
            </p>
          </div>

          {/* Result */}
          {result && (
            <div style={{
              padding: '12px 16px',
              borderRadius: '10px',
              background: result.ok ? '#22c55e10' : '#ef444410',
              border: `1px solid ${result.ok ? '#22c55e30' : '#ef444430'}`,
              color: result.ok ? '#22c55e' : '#ef4444',
              fontSize: '13px',
              fontWeight: 500,
            }}>
              {result.ok
                ? `✅ Connected successfully! (${result.latency}ms) Redirecting to Second Brain…`
                : `❌ ${result.error || 'Connection failed'}`}
            </div>
          )}

          {/* Troubleshooting (on failure) */}
          {result && !result.ok && (
            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', lineHeight: '1.7', padding: '12px 16px', background: 'var(--bg-secondary)', borderRadius: '10px', border: '1px solid var(--border)' }}>
              <strong style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Troubleshooting:</strong>
              <div>• Make sure the bridge is running on the remote machine</div>
              <div>• Check that port 8087 is not blocked by a firewall</div>
              <div>• For OD devservers, ensure port forwarding is configured</div>
              <div>• Make sure the bridge was started with <code style={{ background: 'var(--bg-primary)', padding: '1px 4px', borderRadius: '3px' }}>--host 0.0.0.0</code></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ─── Component ──────────────────────────────────────────────────────────────

export function SecondBrainPanel() {
  const [phase, setPhase] = useState<Phase>('detecting');
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [bridgeConnected, setBridgeConnected] = useState(false);
  const [bridgeVersion, setBridgeVersion] = useState<string | null>(null);
  const [bridgeOutdated, setBridgeOutdated] = useState(false);
  const [bridgeSupportsSecondBrain, setBridgeSupportsSecondBrain] = useState<boolean | null>(null); // null = not checked yet
  const [updateCopiedStep, setUpdateCopiedStep] = useState<number | null>(null);
  const [steps, setSteps] = useState<SetupStep[]>([]);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
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

    // ─── Add-on install state ───────────────────────────────────────────
  const [addonInstalling, setAddonInstalling] = useState<string | null>(null);
  const [addonError, setAddonError] = useState<Record<string, string>>({});
  const [addonSuccess, setAddonSuccess] = useState<Record<string, string>>({});
  const [addonInstallLog, setAddonInstallLog] = useState<Record<string, string[]>>({});
  const [addonInstallElapsed, setAddonInstallElapsed] = useState(0);
  const addonLogEndRef = useRef<HTMLDivElement>(null);
  const addonTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Chat state (direct Claude + slash commands) ───────────────────────
  const { activeConnection } = useConnection();
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  // Model resolution: use the user's active connection model, with fallback chain
  const resolveModel = useCallback((): string => {
    // 1. Use the model from the user's active connection (what they selected in Settings)
    if (activeConnection?.model) return activeConnection.model;
    // 2. Fallback chain: try newer models first, then older ones
    const FALLBACK_MODELS = ['claude-sonnet-4-6', 'claude-sonnet-4-5', 'claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001', 'claude-haiku-35-20241022'];
    return FALLBACK_MODELS[0];
  }, [activeConnection]);

  const FAST_MODEL = resolveModel();

  // ─── Custom skill commands (loaded from localStorage) ─────────────────
  const [customSkillCommands, setCustomSkillCommands] = useState<typeof SLASH_COMMANDS>([]);
  const [pendingSkillTest, setPendingSkillTest] = useState<{ command: string; prompt: string; name: string; icon: string } | null>(null);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [scheduleDialogSkill, setScheduleDialogSkill] = useState<{ id: string; name: string; prompt: string; icon?: string } | null>(null);
  const [_scheduleRefreshKey, setScheduleRefreshKey] = useState(0);

  // ─── Session Startup Hook state ────────────────────────────────────────
  const [sessionHookEnabled, setSessionHookEnabled] = useState(() => localStorage.getItem('arcadia-session-hook') === 'true');
  const [sessionHookConfiguring, setSessionHookConfiguring] = useState(false);
  const [sessionHookStatus, setSessionHookStatus] = useState<'idle' | 'configuring' | 'success' | 'error'>('idle');
  const [sessionHookMessage, setSessionHookMessage] = useState('');

  // Convert user skills to slash command format
  const loadCustomSkillCommands = useCallback(() => {
    const skills = storage.getSkills();
    const userSkills = skills.filter(s => s.createdBy === 'You');
    const cmds = userSkills.map(s => {
      const slug = s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      return {
        command: `/skill-${slug}`,
        label: s.name,
        icon: s.icon || '🧩',
        description: s.description || s.prompt.slice(0, 80) + '...',
        isCustom: true,
        prompt: s.prompt,
        skillId: s.id,
      };
    });
    setCustomSkillCommands(cmds as any);
  }, []);

  // Load custom skills on mount and when skills change
  useEffect(() => {
    loadCustomSkillCommands();
    const handler = () => loadCustomSkillCommands();
    document.addEventListener('arcadia:skill-changed', handler);
    return () => document.removeEventListener('arcadia:skill-changed', handler);
  }, [loadCustomSkillCommands]);

  // Listen for skill test requests from SkillsPanel
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        setPendingSkillTest(detail);
      }
    };
    document.addEventListener('arcadia:skill-test', handler);
    return () => document.removeEventListener('arcadia:skill-test', handler);
  }, []);

  // Execute pending skill test when we're on the dashboard
  useEffect(() => {
    if (pendingSkillTest && phase === 'dashboard') {
      const { command, prompt, name: _name, icon: _icon } = pendingSkillTest;
      setPendingSkillTest(null);
      // Execute the skill as a custom command via Claude API
      executeCustomSkillCommand(command, prompt);
    }
  }, [pendingSkillTest, phase]);

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
    // Check bridge version
    const versionInfo = await checkBridgeVersion();
    if (versionInfo) {
      setBridgeVersion(versionInfo.version);
      const outdated = compareVersions(versionInfo.version, MIN_BRIDGE_VERSION) < 0;
      setBridgeOutdated(outdated);
      if (outdated) {
        console.log(`[SecondBrain] Bridge v${versionInfo.version} is outdated (need v${MIN_BRIDGE_VERSION}+)`);
      }
    }
    const result = await detect();
    console.log('[SecondBrain] detection result summary:', result?.summary);
    console.log('[SecondBrain] claudeCode:', result?.claudeCode);
    console.log('[SecondBrain] googleDrive:', result?.googleDrive);
    console.log('[SecondBrain] secondBrain:', result?.secondBrain);
    console.log('[SecondBrain] skills:', result?.skills);
    setDetection(result);
    // Track whether bridge supports Second Brain routes
    if (result !== null) {
      setBridgeSupportsSecondBrain(true);
    } else {
      // detect() returned null — bridge is connected but doesn't support /v1/secondbrain/detect
      setBridgeSupportsSecondBrain(false);
      console.log('[SecondBrain] Bridge does not support Second Brain routes — user needs to update bridge');
    }
    setBridgeConnected(true);
    setPhase('dashboard');
  }, []);

  // Soft re-detect: refresh data in background without switching phase
  const softDetect = useCallback(async () => {
    const connected = await checkBridge();
    setBridgeConnected(connected);
    if (connected) {
      const result = await detect();
      if (result) {
        setDetection(result);
        setBridgeSupportsSecondBrain(true);
      } else {
        setBridgeSupportsSecondBrain(false);
      }
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

  // ─── Auto-scroll preview ───────────────────────────────────────────────────

  useEffect(() => {
    previewEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [previewMessages, previewStreaming]);

  // ─── Auto-scroll addon install log ───────────────────────────────────────────

  useEffect(() => {
    addonLogEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [addonInstallLog]);

  // ──  // ─── Session Startup Hook ────────────────────────────────────────────────────
  const configureSessionHook = useCallback(async (enable: boolean) => {
    setSessionHookConfiguring(true);
    setSessionHookStatus('configuring');
    setSessionHookMessage(enable ? 'Configuring session startup hook...' : 'Removing session startup hook...');
    try {
      // Send the hook configuration command to the bridge
      const hookPrompt = enable
        ? 'Add a session startup hook to my CLAUDE.md that loads all Second Brain project context at the beginning of each session. The hook should: 1) Read the PARA workspace index, 2) Load active project CLAUDE.md files, 3) Summarize current priorities. Keep it lightweight (1-2 second delay). Add it as a "Session Hooks" section in the root CLAUDE.md.'
        : 'Remove the session startup hook from my CLAUDE.md. Delete the "Session Hooks" section that auto-loads project context.';
      const res = await fetch(`${BRIDGE()}/v1/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: resolveModel(),
          max_tokens: 2048,
          messages: [{ role: 'user', content: hookPrompt }],
          system: 'You are configuring a Claude Code session startup hook. Execute the requested changes to CLAUDE.md directly. Be concise in your response.',
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `Bridge returned ${res.status}`);
      }
      localStorage.setItem('arcadia-session-hook', enable ? 'true' : 'false');
      setSessionHookEnabled(enable);
      setSessionHookStatus('success');
      setSessionHookMessage(enable
        ? 'Session hook configured! Claude will now auto-load your project context at startup (adds ~1-2s).'
        : 'Session hook removed. Claude will no longer auto-load project context at startup.');
      setTimeout(() => { setSessionHookStatus('idle'); setSessionHookMessage(''); }, 5000);
    } catch (err: any) {
      // Check for bridge model errors
      const msg = err?.message || String(err);
      if (msg.includes('model') && (msg.includes('not exist') || msg.includes('not found'))) {
        setSessionHookMessage('Could not configure hook: your bridge model may need updating. Try changing your model in Settings.');
      } else {
        setSessionHookMessage(`Failed to ${enable ? 'configure' : 'remove'} hook: ${msg}`);
      }
      setSessionHookStatus('error');
      setTimeout(() => { setSessionHookStatus('idle'); setSessionHookMessage(''); }, 8000);
    } finally {
      setSessionHookConfiguring(false);
    }
  }, [resolveModel]);

  // ─── Send message to bridge (SSE streaming) ────────────────────

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
      // Send request to bridge — pass model from user's settings
      const response = await fetch(`${BRIDGE()}/v1/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: FAST_MODEL,
          messages: messages.map(m => ({ role: m.role, content: m.content })),
          stream: true,
          max_tokens: 4096,
          system: 'You are a Second Brain assistant. The user is running slash commands from their ArcadIA Second Brain panel. Execute the command and return helpful, structured results. Use markdown formatting.',
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errText = await response.text();
        const errLower = errText.toLowerCase();
        const isBridgeModelError = (errLower.includes('model') && (errLower.includes('not exist') || errLower.includes('not found') || errLower.includes('issue with'))) || errLower.includes('run --model');

        if (isBridgeModelError) {
          // Bridge-level model error — the bridge itself has an invalid model configured
          // Extract the bad model name if possible
          const modelMatch = errText.match(/model\s*\(([^)]+)\)/i) || errText.match(/model\s+([\w.-]+)/i);
          const badModel = modelMatch ? modelMatch[1] : 'unknown';

          setPreviewMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: 'assistant',
              content: [
                `**Model Not Available:** \`${badModel}\``,
                '',
                'Your Claude Code bridge has a model configured that isn\'t accessible. To fix this:',
                '',
                '**Option 1 — Change the bridge model:**',
                '```',
                'claude config set model claude-sonnet-4-6',
                '```',
                'Then restart your bridge.',
                '',
                '**Option 2 — Use a direct API key:**',
                'Go to **Settings** in ArcadIA and add your Anthropic API key directly. This bypasses the bridge for slash commands.',
                '',
                '**Available models:** claude-sonnet-4-6, claude-sonnet-4-5, claude-haiku-4-5, claude-opus-4-6',
              ].join('\n'),
            };
            return updated;
          });
        } else {
          setPreviewMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: 'assistant', content: `**Error:** ${errText || response.statusText}` };
            return updated;
          });
        }
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
      const response = await fetch(`${BRIDGE()}/v1/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: FAST_MODEL,
          messages: [{ role: 'user', content: `Here are examples of my writing. Please analyze my style and create a comprehensive style guide:\n\n${styleGuideInput}` }],
          system: systemPrompt,
          stream: true,
          max_tokens: 4096,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        const errLower = errText.toLowerCase();
        if ((errLower.includes('model') && (errLower.includes('not exist') || errLower.includes('not found'))) || errLower.includes('run --model')) {
          throw new Error('Your bridge has an invalid model configured. Run `claude config set model claude-sonnet-4-6` in your terminal and restart the bridge.');
        }
        throw new Error(`Bridge returned ${response.status}: ${errText.slice(0, 200)}`);
      }
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
      const response = await fetch(`${BRIDGE()}/v1/secondbrain/setup`, {
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

  // Known harmless warnings that can appear in stderr during addon installs
  const HARMLESS_WARNING_PATTERNS = [
    /Warning: Detected unsettled top-level await/i,
    /await program\.parseAsync/i,
    /ExperimentalWarning/i,
    /DeprecationWarning/i,
    /punycode/i,
  ];

  const filterHarmlessWarnings = (text: string): string => {
    return text.split('\n').filter(line => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      return !HARMLESS_WARNING_PATTERNS.some(p => p.test(trimmed));
    }).join('\n').trim();
  };

  const looksLikeSuccess = (stdout: string, stderr: string): boolean => {
    const combined = `${stdout} ${stderr}`.toLowerCase();
    return combined.includes('installed') || combined.includes('✔') || combined.includes('symlinked') || combined.includes('success');
  };

  // Helper: append a log line for an addon install
  const addAddonLog = useCallback((addonId: string, line: string) => {
    const ts = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setAddonInstallLog(prev => ({
      ...prev,
      [addonId]: [...(prev[addonId] || []).slice(-30), `[${ts}] ${line}`],
    }));
  }, []);

  // Helper: delay for simulated progress
  const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

  const installAddon = useCallback(async (addonId: string) => {
    setAddonInstalling(addonId);
    setAddonError(prev => ({ ...prev, [addonId]: '' }));
    setAddonSuccess(prev => ({ ...prev, [addonId]: '' }));
    setAddonInstallLog(prev => ({ ...prev, [addonId]: [] }));
    setAddonInstallElapsed(0);

    // Start elapsed timer
    if (addonTimerRef.current) clearInterval(addonTimerRef.current);
    addonTimerRef.current = setInterval(() => setAddonInstallElapsed(prev => prev + 1), 1000);

    try {
      const addon = ADDONS.find(a => a.id === addonId);
      const action = addon?.installAction || 'install-addon';
      const addonName = addon?.name || addonId;

      // Phase 1: Connecting to bridge
      addAddonLog(addonId, `Connecting to bridge...`);
      await wait(300);
      addAddonLog(addonId, `✓ Bridge connection established`);

      // Phase 2: Preparing install
      addAddonLog(addonId, `Preparing to install ${addonName}...`);
      await wait(400);

      // Determine install body
      const body = action === 'install-gchat-skill'
        ? { action: 'install-skills' }
        : { action: 'install-addon', addon: addonId };

      if (action === 'install-gchat-skill') {
        addAddonLog(addonId, `Installing skill package (includes gchat)...`);
      } else {
        addAddonLog(addonId, `Running install for ${addonId}...`);
      }

      // Phase 3: Execute the actual bridge call
      addAddonLog(addonId, `Sending install request to bridge...`);
      const response = await fetch(`${BRIDGE()}/v1/secondbrain/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json();

      const stdout = data.stdout || '';
      const stderr = data.stderr || '';
      const filteredStderr = filterHarmlessWarnings(stderr);

      // Phase 4: Parse stdout lines into log
      if (stdout) {
        const stdoutLines = stdout.split('\n').filter((l: string) => l.trim());
        for (const line of stdoutLines) {
          const filtered = filterHarmlessWarnings(line);
          if (filtered) {
            addAddonLog(addonId, filtered);
            await wait(100); // Small delay between lines for visual effect
          }
        }
      }

      // Phase 5: Determine result
      if (data.success) {
        addAddonLog(addonId, `✓ ${addonName} installed successfully`);
        setAddonSuccess(prev => ({ ...prev, [addonId]: `✓ ${addonName} installed successfully` }));
        addAddonLog(addonId, `Re-scanning environment...`);
        await softDetect();
        addAddonLog(addonId, `✓ Detection complete`);
      } else if (!data.success && looksLikeSuccess(stdout, stderr) && !filteredStderr) {
        addAddonLog(addonId, `✓ ${addonName} installed (warnings suppressed)`);
        setAddonSuccess(prev => ({ ...prev, [addonId]: `✓ ${addonName} installed successfully` }));
        addAddonLog(addonId, `Re-scanning environment...`);
        await softDetect();
        addAddonLog(addonId, `✓ Detection complete`);
      } else {
        // Show filtered stderr in log
        if (filteredStderr) {
          filteredStderr.split('\n').filter((l: string) => l.trim()).forEach((line: string) => {
            addAddonLog(addonId, `✘ ${line}`);
          });
        }
        const rawError = filteredStderr || data.error || 'Install failed';
        const friendlyError = rawError.includes('not found') || rawError.includes('command not found')
          ? `Could not install automatically. Please install manually${addon?.setupUrl ? ` from ${addon.setupUrl}` : ''}.`
          : rawError.length > 200 ? rawError.slice(-200) : rawError;
        addAddonLog(addonId, `✘ Installation failed`);
        setAddonError(prev => ({ ...prev, [addonId]: friendlyError }));
      }
    } catch (e: any) {
      addAddonLog(addonId, `✘ Connection error: ${e.message}`);
      setAddonError(prev => ({ ...prev, [addonId]: `Connection error: ${e.message}. Is the bridge running?` }));
    } finally {
      if (addonTimerRef.current) { clearInterval(addonTimerRef.current); addonTimerRef.current = null; }
      setAddonInstalling(null);
    }
  }, [softDetect, addAddonLog]);

  // ─── Execute slash command ─────────────────────────────────────────────

  const executeCommand = useCallback((command: string) => {
    // Check if this is a custom skill command
    const customCmd = customSkillCommands.find(c => c.command === command) as any;
    if (customCmd?.isCustom && customCmd?.prompt) {
      executeCustomSkillCommand(command, customCmd.prompt);
      return;
    }
    const userMsg: ChatMessage = { role: 'user', content: command };
    setPreviewMessages([userMsg]);
    setActiveCommand(command);
    sendToBridge([userMsg]);
  }, [sendToBridge, customSkillCommands]);

  // Execute a custom skill command via Claude API (not bridge)
  const executeCustomSkillCommand = useCallback((command: string, skillPrompt: string) => {
    const userMsg: ChatMessage = { role: 'user', content: `Running skill: ${command}` };
    setPreviewMessages([userMsg]);
    setActiveCommand(command);

    // Route through Claude API with the skill's prompt as the system message
    const allMessages: ChatMessage[] = [{ role: 'user', content: skillPrompt }];

    if (!activeConnection) {
      setPreviewMessages(prev => [...prev, { role: 'assistant', content: '**No API connection configured.** Go to Settings and add your Claude API key to test custom skills.' }]);
      return;
    }

    // Abort any existing stream
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setPreviewStreaming(true);
    setPreviewPhase('connecting');
    setPreviewElapsed(0);
    if (previewTimerRef.current) clearInterval(previewTimerRef.current);
    previewTimerRef.current = setInterval(() => setPreviewElapsed(prev => prev + 1), 1000);

    setPreviewMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    const apiMessages: Message[] = allMessages.map((m, i) => ({
      id: `skill-${i}`,
      role: m.role,
      content: m.content,
      timestamp: Date.now(),
    }));

    const fastConn = { ...activeConnection, model: FAST_MODEL };

    sendClaudeMessage({
      connection: fastConn,
      messages: apiMessages,
      systemPrompt: `You are executing a custom skill for the user. Follow the instructions precisely and provide structured, actionable output. Use markdown formatting.`,
      effort: 'medium',
      maxTokensOverride: 4096,
      temperatureOverride: 0.3,
      enableCaching: true,
      onToken: (text: string) => {
        setPreviewPhase('streaming');
        setPreviewMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === 'assistant') {
            updated[updated.length - 1] = { ...last, content: last.content + text };
          }
          return updated;
        });
      },
      signal: controller.signal,
    }).then(result => {
      if (result.content) {
        setPreviewMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === 'assistant' && !last.content) {
            updated[updated.length - 1] = { ...last, content: result.content };
          }
          return updated;
        });
      }
    }).catch((e: any) => {
      if (e.name !== 'AbortError') {
        const isModelErr = e.message?.toLowerCase().includes('model') || e.message?.toLowerCase().includes('not exist') || e.message?.toLowerCase().includes('not found');
        const hint = isModelErr ? '\n\nThe selected model may not be available. Try changing your model in Settings.' : '';
        setPreviewMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === 'assistant') {
            updated[updated.length - 1] = { role: 'assistant', content: `**Error:** ${e.message}${hint}` };
          }
          return updated;
        });
      }
    }).finally(() => {
      setPreviewStreaming(false);
      setPreviewPhase('');
      if (previewTimerRef.current) { clearInterval(previewTimerRef.current); previewTimerRef.current = null; }
      abortRef.current = null;
    });
  }, [activeConnection, FAST_MODEL]);

  // ─── Send direct to Claude API (natural conversation) ─────────────────

  const sendDirectToClaude = useCallback(async (allMessages: ChatMessage[]) => {
    if (!activeConnection) {
      setPreviewMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', content: '**No API connection configured.** Go to Settings and add your Claude API key or connect via Meta LDAR proxy to chat directly.' };
        return updated;
      });
      setPreviewStreaming(false);
      return;
    }

    // Abort any existing stream
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setPreviewStreaming(true);
    setPreviewPhase('connecting');
    setPreviewElapsed(0);
    if (previewTimerRef.current) clearInterval(previewTimerRef.current);
    previewTimerRef.current = setInterval(() => setPreviewElapsed(prev => prev + 1), 1000);

    // Add empty assistant message to stream into
    setPreviewMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    try {
      // Convert ChatMessage[] to Message[] for the claude service
      const apiMessages: Message[] = allMessages.map((m, i) => ({
        id: `sb-${i}`,
        role: m.role,
        content: m.content,
        timestamp: Date.now(),
      }));

      // Use a fast model connection override
      const fastConn = { ...activeConnection, model: FAST_MODEL };

      const result = await sendClaudeMessage({
        connection: fastConn,
        messages: apiMessages,
        systemPrompt: `You are a Second Brain assistant inside ArcadIA. You help the user organize thoughts, manage knowledge, and get things done. Be concise, structured, and actionable. Use markdown formatting. If the user asks about slash commands, explain that they can type / to see available commands like /daily-brief, /eod, /eow, /prepare-meeting, /add-context, /deep-research.`,
        effort: 'medium',
        maxTokensOverride: 4096,
        temperatureOverride: 0.3,
        enableCaching: true,
        onToken: (text: string) => {
          setPreviewPhase('streaming');
          setPreviewMessages(prev => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.role === 'assistant') {
              updated[updated.length - 1] = { ...last, content: last.content + text };
            }
            return updated;
          });
        },
        signal: controller.signal,
      });

      // If onToken didn't fire (non-streaming fallback), set the full content
      if (result.content) {
        setPreviewMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === 'assistant' && !last.content) {
            updated[updated.length - 1] = { ...last, content: result.content };
          }
          return updated;
        });
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        const isModelErr = e.message?.toLowerCase().includes('model') || e.message?.toLowerCase().includes('not exist') || e.message?.toLowerCase().includes('not found');
        const hint = isModelErr ? '\n\nThe selected model may not be available. Try changing your model in Settings.' : '';
        setPreviewMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === 'assistant') {
            const errMsg = `**Error:** ${e.message}${hint}`;
            updated[updated.length - 1] = { role: 'assistant', content: last.content || errMsg };
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
  }, [activeConnection, FAST_MODEL]);

  // ─── Unified send: routes slash commands to bridge, natural text to Claude API ─

  const sendChatMessage = useCallback(() => {
    const text = previewInput.trim();
    if (!text || previewStreaming) return;
    setShowSlashMenu(false);
    setSlashFilter('');

    const userMsg: ChatMessage = { role: 'user', content: text };
    const allMessages = [...previewMessages, userMsg];
    setPreviewMessages(allMessages);
    setPreviewInput('');

    if (text.startsWith('/')) {
      // Check if it's a custom skill command
      const customCmd = customSkillCommands.find(c => c.command === text) as any;
      if (customCmd?.isCustom && customCmd?.prompt) {
        // Custom skill → route through Claude API
        setActiveCommand(text);
        executeCustomSkillCommand(text, customCmd.prompt);
      } else {
        // Built-in slash command → route through bridge
        setActiveCommand(text);
        sendToBridge(allMessages);
      }
    } else {
      // Natural conversation → route through Claude API
      setActiveCommand(null);
      sendDirectToClaude(allMessages);
    }
  }, [previewInput, previewStreaming, previewMessages, sendToBridge, sendDirectToClaude, customSkillCommands, executeCustomSkillCommand]);

  // ─── Handle chat input changes (slash autocomplete) ───────────────────

  const handleChatInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setPreviewInput(val);

    // Show slash menu when input starts with /
    if (val.startsWith('/')) {
      setShowSlashMenu(true);
      setSlashFilter(val.slice(1).toLowerCase());
    } else {
      setShowSlashMenu(false);
      setSlashFilter('');
    }
  }, []);

  // ─── Select slash command from autocomplete ───────────────────────────

  const selectSlashCommand = useCallback((command: string) => {
    setPreviewInput(command + ' ');
    setShowSlashMenu(false);
    setSlashFilter('');
    chatInputRef.current?.focus();
  }, []);

  // ─── Filtered slash commands for autocomplete ─────────────────────────

  // Merge built-in and custom skill commands for autocomplete
  const allSlashCommands = [...SLASH_COMMANDS, ...customSkillCommands];
  const filteredSlashCommands = allSlashCommands.filter(cmd =>
    cmd.command.toLowerCase().includes(slashFilter) ||
    cmd.label.toLowerCase().includes(slashFilter)
  );

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

    // Helper: format user-friendly error from setupAction result
    const friendlyError = (result: any, fallbackDesc: string): string => {
      if (result.bridgeUpdateRequired) {
        return 'Bridge update required. Update your bridge to the latest version to enable this feature.';
      }
      return fallbackDesc;
    };

    const friendlyOutput = (result: any): string => {
      if (result.bridgeUpdateRequired) {
        return 'Your bridge version does not support Second Brain setup.\nUpdate: curl -sL https://raw.githubusercontent.com/ikosoymeta/Arcadia/main/bridge/setup.sh | bash';
      }
      const raw = result.error || result.message || '';
      // Filter out raw API error messages that confuse users
      if (raw.includes('Not found') && raw.includes('/v1/messages')) {
        return 'Bridge does not support this endpoint. Please update your bridge.';
      }
      return raw;
    };

    // Pre-check: does the bridge support Second Brain routes?
    let bridgeSupportsSecondBrain = true;
    const testDetect = await detect();
    if (testDetect === null) {
      // detect() returned null — could be bridge doesn't support the route, or bridge is down
      const bridgeAlive = await checkBridge();
      if (bridgeAlive) {
        // Bridge is alive but doesn't support /v1/secondbrain/detect
        bridgeSupportsSecondBrain = false;
        addLog('Warning: Bridge is connected but does not support Second Brain routes. Some steps may fail.');
      }
    }

    // Step 1: Claude Code
    setCurrentStepIdx(0);
    setStep(0, { status: 'checking', elapsed: 0, friendlyDesc: 'Checking if Claude Code CLI is installed...' });
    addLog('Step 1/4: Checking Claude Code...');
    try {
      if (testDetect?.claudeCode.installed) {
        const ver = testDetect.claudeCode.version?.split('\n')[0]?.slice(0, 60) || 'installed';
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
      if (!bridgeSupportsSecondBrain) {
        setStep(1, { status: 'error', output: 'Your bridge needs to be updated to support workspace setup.\nRun the setup command from the Chat page to update.', friendlyDesc: 'Bridge update required. Update your bridge to enable Google Drive workspace setup.' });
        addLog('Google Drive: skipped (bridge update needed)');
      } else if (testDetect?.googleDrive.installed && testDetect?.secondBrain.initialized) {
        setStep(1, { status: 'done', detail: testDetect.googleDrive.workspacePath || '', friendlyDesc: `Workspace found at ${testDetect.googleDrive.workspacePath || 'Google Drive'}` });
        addLog(`Workspace: found at ${testDetect.googleDrive.workspacePath}`);
      } else if (testDetect?.googleDrive.installed) {
        setStep(1, { status: 'running', elapsed: 0, friendlyDesc: 'Google Drive found. Creating workspace folders...' });
        addLog('Creating workspace...');
        const result = await setupAction('create-workspace');
        if (result.success) {
          setStep(1, { status: 'done', detail: result.workspacePath, friendlyDesc: `Workspace created at ${result.workspacePath}` });
          addLog(`Workspace created at ${result.workspacePath}`);
        } else {
          setStep(1, { status: 'error', output: friendlyOutput(result), friendlyDesc: friendlyError(result, 'Failed to create workspace folders') });
        }
      } else {
        setStep(1, { status: 'running', elapsed: 0, friendlyDesc: 'Attempting to create workspace...' });
        const result = await setupAction('create-workspace');
        if (result.success) {
          setStep(1, { status: 'done', detail: result.workspacePath, friendlyDesc: `Workspace created at ${result.workspacePath}` });
        } else {
          setStep(1, { status: 'error', output: friendlyOutput(result), friendlyDesc: friendlyError(result, 'Google Drive not found. Install from google.com/drive/download and re-run.') });
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
      if (!bridgeSupportsSecondBrain) {
        setStep(2, { status: 'error', output: 'Your bridge needs to be updated to support CLAUDE.md configuration.\nRun the setup command from the Chat page to update.', friendlyDesc: 'Bridge update required. Update your bridge to enable CLAUDE.md setup.' });
        addLog('CLAUDE.md: skipped (bridge update needed)');
      } else if (testDetect?.secondBrain.claudeMdExists) {
        setStep(2, { status: 'done', friendlyDesc: 'CLAUDE.md configuration file found with slash commands' });
        addLog('CLAUDE.md: found');
      } else {
        setStep(2, { status: 'running', elapsed: 0, friendlyDesc: 'Creating CLAUDE.md with 6 pre-configured slash commands...' });
        const result = await setupAction('init-claudemd');
        if (result.success) {
          setStep(2, { status: 'done', detail: result.path || '', friendlyDesc: `CLAUDE.md created with all slash commands` });
          addLog(`CLAUDE.md created at ${result.path}`);
        } else {
          setStep(2, { status: 'error', output: friendlyOutput(result), friendlyDesc: friendlyError(result, 'Failed to create CLAUDE.md. Ensure workspace exists first.') });
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
      if (!bridgeSupportsSecondBrain) {
        setStep(3, { status: 'error', output: 'Your bridge needs to be updated to support skill installation.\nRun the setup command from the Chat page to update.', friendlyDesc: 'Bridge update required. Update your bridge to enable skill installation.' });
        addLog('Skills: skipped (bridge update needed)');
      } else if (testDetect && testDetect.skills.installed.length > 0) {
        setStep(3, { status: 'done', detail: `${testDetect.skills.installed.length} skills`, friendlyDesc: `${testDetect.skills.installed.length} skills installed: ${testDetect.skills.installed.slice(0, 5).join(', ')}${testDetect.skills.installed.length > 5 ? '...' : ''}` });
        addLog(`Skills: ${testDetect.skills.installed.length} found`);
      } else {
        // Sub-step 4a: Install claude-templates
        setStep(3, { status: 'running', elapsed: 0, friendlyDesc: '(1/3) Installing template manager (claude-templates)... ~30s' });
        addLog('Installing claude-templates...');
        const tmplResult = await setupAction('install-claude-templates');

        if (tmplResult.bridgeUpdateRequired) {
          setStep(3, { status: 'error', output: friendlyOutput(tmplResult), friendlyDesc: 'Bridge update required. Update your bridge to enable skill installation.' });
        } else if (tmplResult.success) {
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
            setStep(3, { status: 'error', output: friendlyOutput(skillsResult), friendlyDesc: friendlyError(skillsResult, 'Failed to install skills.') });
          }
        } else {
          addLog(`claude-templates failed: ${tmplResult.error}. Trying skills directly...`);
          setStep(3, { status: 'running', friendlyDesc: 'Template manager had issues. Trying skills directly...' });
          const skillsResult = await setupAction('install-skills');
          if (skillsResult.success) {
            setStep(3, { status: 'done', friendlyDesc: 'Skills installed (template manager may need manual setup)' });
          } else {
            setStep(3, { status: 'error', output: friendlyOutput(skillsResult), friendlyDesc: friendlyError(skillsResult, 'Could not install skills. Try re-running the setup script from the Second Brain page.') });
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

  // ─── Chat Panel (right side) ─────────────────────────────────────────

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
        {/* Chat header */}
        <div style={{
          padding: '14px 18px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '16px' }}>🧠</span>
            <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>Chat</span>
            {activeCommand && (
              <code style={{ fontSize: '11px', color: '#6366f1', background: '#6366f115', padding: '2px 6px', borderRadius: '4px' }}>
                {activeCommand}
              </code>
            )}
            {!activeCommand && hasMessages && (
              <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: '4px' }}>
                {previewMessages.filter(m => m.role === 'user').length} messages
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            {hasMessages && !previewStreaming && (
              <>
                <DownloadMenu messages={previewMessages} activeCommand={activeCommand} />
                <button
                  onClick={() => { setPreviewMessages([]); setActiveCommand(null); if (abortRef.current) abortRef.current.abort(); }}
                  style={{ fontSize: '11px', color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}
                >
                  Clear
                </button>
              </>
            )}
          </div>
        </div>

        {/* Messages area */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 18px' }}>
          {!hasMessages ? (
            <div style={{ padding: '40px 20px', color: 'var(--text-tertiary)' }}>
              <div style={{ textAlign: 'center', marginBottom: '28px' }}>
                <div style={{ fontSize: '36px', marginBottom: '10px', opacity: 0.5 }}>🧠</div>
                <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px', color: 'var(--text-secondary)' }}>
                  Second Brain Chat
                </div>
                <div style={{ fontSize: '12px', lineHeight: '1.6' }}>
                  Ask anything or type <code style={{ background: 'var(--bg-secondary)', padding: '1px 4px', borderRadius: '3px', fontSize: '11px' }}>/</code> for slash commands
                </div>
              </div>
              {/* Quick slash command chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'center' }}>
                {SLASH_COMMANDS.slice(0, 4).map(cmd => (
                  <button
                    key={cmd.command}
                    onClick={() => executeCommand(cmd.command)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '5px',
                      padding: '6px 12px', borderRadius: '20px',
                      border: '1px solid var(--border)', background: 'var(--bg-secondary)',
                      color: 'var(--text-secondary)', fontSize: '12px',
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.color = '#6366f1'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                  >
                    <span>{cmd.icon}</span>
                    <span>{cmd.label}</span>
                  </button>
                ))}
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
                                {activeCommand ? 'Slash commands can take 2\u20135 min while Claude reads your workspace' : 'Waiting for Claude API response...'}
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

        {/* Always-visible chat input with slash autocomplete */}
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--border)',
          flexShrink: 0,
          position: 'relative',
        }}>
          {/* Slash command autocomplete dropdown */}
          {showSlashMenu && filteredSlashCommands.length > 0 && (
            <div style={{
              position: 'absolute', bottom: '100%', left: '16px', right: '16px',
              background: 'var(--bg-secondary)', border: '1px solid var(--border)',
              borderRadius: '10px', padding: '4px', marginBottom: '4px',
              boxShadow: '0 -8px 24px rgba(0,0,0,0.2)', maxHeight: '240px', overflow: 'auto',
              zIndex: 50,
            }}>
              <div style={{ padding: '6px 10px', fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
                Slash Commands
              </div>
              {filteredSlashCommands.map(cmd => {
                const isCustom = (cmd as any).isCustom;
                return (
                  <button
                    key={cmd.command}
                    onClick={() => selectSlashCommand(cmd.command)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px', width: '100%',
                      padding: '8px 10px', fontSize: '12px', color: 'var(--text-primary)',
                      background: 'none', border: 'none', cursor: 'pointer', borderRadius: '6px',
                      textAlign: 'left',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-primary)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                  >
                    <span style={{ fontSize: '16px', width: '24px', textAlign: 'center' }}>{cmd.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontWeight: 600, color: isCustom ? '#22c55e' : '#6366f1' }}>{cmd.command}</span>
                        {isCustom && <span style={{ fontSize: '9px', background: '#22c55e20', color: '#22c55e', padding: '1px 5px', borderRadius: '6px', fontWeight: 600 }}>skill</span>}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cmd.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
            <textarea
              ref={chatInputRef}
              value={previewInput}
              onChange={handleChatInputChange}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (showSlashMenu && filteredSlashCommands.length > 0) {
                    // Execute the matched slash command immediately
                    const matchedCmd = filteredSlashCommands[0];
                    const cmdText = matchedCmd.command;
                    setPreviewInput('');
                    setShowSlashMenu(false);
                    setSlashFilter('');
                    // Route through executeCommand which handles both custom and built-in
                    if (cmdText.trim() && !previewStreaming) {
                      executeCommand(cmdText);
                    }
                  } else {
                    sendChatMessage();
                  }
                }
                if (e.key === 'Escape') {
                  setShowSlashMenu(false);
                }
              }}
              placeholder={previewStreaming ? 'Waiting for response...' : 'Ask anything or type / for commands...'}
              disabled={previewStreaming}
              rows={1}
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
                resize: 'none',
                minHeight: '40px',
                maxHeight: '120px',
                lineHeight: '1.4',
                fontFamily: 'inherit',
              }}
            />
            <button
              onClick={sendChatMessage}
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
                height: '40px',
              }}
            >
              Send
            </button>
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', textAlign: 'center', padding: '4px 0 2px', opacity: 0.7 }}>
            {bridgeConnected ? (
              <span>{'\u2713'} Bridge connected {'\u00b7'} Slash commands route through bridge {'\u00b7'} Chat uses Claude API</span>
            ) : (
              <span>Chat uses Claude API directly {'\u00b7'} Connect bridge for slash commands</span>
            )}
          </div>
        </div>
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
    return (<BridgeNotConnected onRetry={runDetection} />);
  }

  // ─── Bridge outdated warning (shown as banner above dashboard) ────────
  const updatePlatform = detectPlatform();
  const BRIDGE_CDN_URL = 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663326120815/fWRKXaZSkMJsFLJB.js';
  const updateDownloadCmd = updatePlatform === 'windows'
    ? `Invoke-WebRequest -Uri "${BRIDGE_CDN_URL}" -OutFile "$env:USERPROFILE\\arcadia-bridge.js"`
    : `curl -sL "${BRIDGE_CDN_URL}" -o ~/arcadia-bridge.js`;
  const updateRunCmd = updatePlatform === 'windows'
    ? 'node "$env:USERPROFILE\\arcadia-bridge.js"'
    : 'node ~/arcadia-bridge.js';
  const copyUpdateCmd = (text: string, step: number) => {
    navigator.clipboard.writeText(text);
    setUpdateCopiedStep(step);
    setTimeout(() => setUpdateCopiedStep(null), 2000);
  };

  // Banner: bridge connected but doesn't support Second Brain routes
  const bridgeNoSecondBrainBanner = (bridgeSupportsSecondBrain === false && !bridgeOutdated) ? (
    <div style={{
      marginBottom: '16px', padding: '20px', borderRadius: '12px',
      background: '#ef444408', border: '1px solid #ef444425',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
        <span style={{ fontSize: '22px' }}>⚠️</span>
        <div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>Bridge Update Required</div>
          <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
            Your bridge is connected{bridgeVersion ? ` (v${bridgeVersion})` : ''} but does not support Second Brain features
          </div>
        </div>
      </div>

      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6', margin: '0 0 14px' }}>
        The Second Brain requires bridge v{MIN_BRIDGE_VERSION} or later with support for workspace detection, CLAUDE.md configuration, and skill installation. Update your bridge to unlock these features:
      </p>

      {/* Step 1: Stop */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '12px' }}>
        <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#ef444418', color: '#ef4444', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>1</span>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
          <strong style={{ color: 'var(--text-primary)' }}>Stop the bridge</strong> — go to the {updatePlatform === 'windows' ? 'PowerShell' : 'Terminal'} window where it's running and press <strong style={{ color: 'var(--text-primary)' }}>Ctrl+C</strong>
        </div>
      </div>

      {/* Step 2: Download new version */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '12px' }}>
        <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#ef444418', color: '#ef4444', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>2</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5', marginBottom: '6px' }}>
            <strong style={{ color: 'var(--text-primary)' }}>Download the update</strong> — paste this command and press Enter:
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <code style={{ flex: 1, padding: '8px 10px', background: 'var(--bg-primary)', borderRadius: '8px', fontFamily: 'monospace', fontSize: '11px', color: '#a78bfa', userSelect: 'all', wordBreak: 'break-all', lineHeight: '1.4' }}>{updateDownloadCmd}</code>
            <button onClick={() => copyUpdateCmd(updateDownloadCmd, 1)} style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: updateCopiedStep === 1 ? '#22c55e18' : 'var(--bg-primary)', color: updateCopiedStep === 1 ? '#22c55e' : 'var(--text-secondary)', cursor: 'pointer', fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap', transition: 'all 0.2s' }}>
              {updateCopiedStep === 1 ? '✓ Copied!' : '📋 Copy'}
            </button>
          </div>
        </div>
      </div>

      {/* Step 3: Restart */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '12px' }}>
        <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#ef444418', color: '#ef4444', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>3</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5', marginBottom: '6px' }}>
            <strong style={{ color: 'var(--text-primary)' }}>Restart the bridge</strong> — paste this command and press Enter:
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <code style={{ flex: 1, padding: '8px 10px', background: 'var(--bg-primary)', borderRadius: '8px', fontFamily: 'monospace', fontSize: '11px', color: '#a78bfa', userSelect: 'all', lineHeight: '1.4' }}>{updateRunCmd}</code>
            <button onClick={() => copyUpdateCmd(updateRunCmd, 2)} style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: updateCopiedStep === 2 ? '#22c55e18' : 'var(--bg-primary)', color: updateCopiedStep === 2 ? '#22c55e' : 'var(--text-secondary)', cursor: 'pointer', fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap', transition: 'all 0.2s' }}>
              {updateCopiedStep === 2 ? '✓ Copied!' : '📋 Copy'}
            </button>
          </div>
        </div>
      </div>

      {/* Re-scan button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #ef444415' }}>
        <button onClick={runDetection} style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', background: '#ef4444', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
          ✓ Done — Re-scan
        </button>
        <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Click after restarting the bridge to verify the update.</span>
      </div>
    </div>
  ) : null;

  const bridgeOutdatedBanner = bridgeOutdated && bridgeVersion ? (
    <div style={{
      marginBottom: '16px', padding: '20px', borderRadius: '12px',
      background: '#f59e0b08', border: '1px solid #f59e0b25',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
        <span style={{ fontSize: '22px' }}>🔄</span>
        <div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>Bridge Update Available</div>
          <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Your bridge is v{bridgeVersion} — v{MIN_BRIDGE_VERSION} is now available with new features</div>
        </div>
      </div>

      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6', margin: '0 0 14px' }}>
        A newer version of the bridge is available. Update in 3 quick steps:
      </p>

      {/* Step 1: Stop */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '12px' }}>
        <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#f59e0b18', color: '#f59e0b', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>1</span>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
          <strong style={{ color: 'var(--text-primary)' }}>Stop the bridge</strong> — go to the {updatePlatform === 'windows' ? 'PowerShell' : 'Terminal'} window where it's running and press <strong style={{ color: 'var(--text-primary)' }}>Ctrl+C</strong>
        </div>
      </div>

      {/* Step 2: Download new version */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '12px' }}>
        <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#f59e0b18', color: '#f59e0b', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>2</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5', marginBottom: '6px' }}>
            <strong style={{ color: 'var(--text-primary)' }}>Download the update</strong> — paste this command and press Enter:
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <code style={{ flex: 1, padding: '8px 10px', background: 'var(--bg-primary)', borderRadius: '8px', fontFamily: 'monospace', fontSize: '11px', color: '#a78bfa', userSelect: 'all', wordBreak: 'break-all', lineHeight: '1.4' }}>{updateDownloadCmd}</code>
            <button onClick={() => copyUpdateCmd(updateDownloadCmd, 1)} style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: updateCopiedStep === 1 ? '#22c55e18' : 'var(--bg-primary)', color: updateCopiedStep === 1 ? '#22c55e' : 'var(--text-secondary)', cursor: 'pointer', fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap', transition: 'all 0.2s' }}>
              {updateCopiedStep === 1 ? '✓ Copied!' : '📋 Copy'}
            </button>
          </div>
        </div>
      </div>

      {/* Step 3: Restart */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '12px' }}>
        <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#f59e0b18', color: '#f59e0b', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>3</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5', marginBottom: '6px' }}>
            <strong style={{ color: 'var(--text-primary)' }}>Restart the bridge</strong> — paste this command and press Enter:
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <code style={{ flex: 1, padding: '8px 10px', background: 'var(--bg-primary)', borderRadius: '8px', fontFamily: 'monospace', fontSize: '11px', color: '#a78bfa', userSelect: 'all', lineHeight: '1.4' }}>{updateRunCmd}</code>
            <button onClick={() => copyUpdateCmd(updateRunCmd, 2)} style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: updateCopiedStep === 2 ? '#22c55e18' : 'var(--bg-primary)', color: updateCopiedStep === 2 ? '#22c55e' : 'var(--text-secondary)', cursor: 'pointer', fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap', transition: 'all 0.2s' }}>
              {updateCopiedStep === 2 ? '✓ Copied!' : '📋 Copy'}
            </button>
          </div>
        </div>
      </div>

      {/* Re-scan button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #f59e0b15' }}>
        <button onClick={runDetection} style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', background: '#f59e0b', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
          ✓ Done — Re-scan
        </button>
        <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Click after restarting the bridge to verify the update.</span>
      </div>
    </div>
  ) : null;

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
          <>
            {/* Bridge update hint when multiple steps fail */}
            {errorCount >= 2 && (
              <div style={{ padding: '14px 18px', borderRadius: '12px', background: '#f59e0b10', border: '1px solid #f59e0b30', marginBottom: '12px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#f59e0b', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>⚠️ Bridge Update Likely Needed</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '8px' }}>
                  Multiple steps failed because your bridge may not support Second Brain features yet. Update your bridge to the latest version:
                </div>
                <code style={{ display: 'block', padding: '8px 10px', background: 'var(--bg-primary)', borderRadius: '8px', fontFamily: 'monospace', fontSize: '11px', color: '#a78bfa', userSelect: 'all', wordBreak: 'break-all', lineHeight: '1.4' }}>curl -sL https://raw.githubusercontent.com/ikosoymeta/Arcadia/main/bridge/setup.sh | bash</code>
              </div>
            )}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={runInstall} style={{ flex: 1, padding: '10px 16px', borderRadius: '10px', border: 'none', background: '#6366f1', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>🔄 Retry Setup</button>
              <button onClick={() => { setPhase('dashboard'); setBridgeConnected(true); softDetect(); }} style={{ flex: 1, padding: '10px 16px', borderRadius: '10px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>← Back to Dashboard</button>
            </div>
          </>
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

        {/* Bridge outdated warning */}
        {bridgeOutdatedBanner}

        {/* Bridge doesn't support Second Brain routes */}
        {bridgeNoSecondBrainBanner}

        {/* Status overview */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <div style={{ padding: '8px 14px', borderRadius: '8px', background: 'var(--bg-secondary)', border: `1px solid ${isFullyReady ? '#22c55e30' : '#f59e0b30'}`, fontSize: '12px', color: isFullyReady ? '#22c55e' : '#f59e0b', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
            <span style={{ fontSize: '14px' }}>{isFullyReady ? '●' : '○'}</span>
            {isFullyReady ? 'Fully Configured' : `${summary?.readyCount ?? 0} of ${summary?.totalRequired ?? 4} components ready`}
          </div>
          {bridgeVersion && (
            <div style={{ padding: '8px 14px', borderRadius: '8px', background: 'var(--bg-secondary)', border: `1px solid ${bridgeSupportsSecondBrain ? '#22c55e30' : '#ef444430'}`, fontSize: '12px', color: bridgeSupportsSecondBrain ? '#22c55e' : '#ef4444', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
              {bridgeSupportsSecondBrain ? '✓' : '⚠️'} Bridge v{bridgeVersion}
            </div>
          )}
          {bridgeSupportsSecondBrain === false && !bridgeVersion && (
            <div style={{ padding: '8px 14px', borderRadius: '8px', background: '#ef444408', border: '1px solid #ef444430', fontSize: '12px', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
              ⚠️ Bridge needs update
            </div>
          )}
          {isRemoteBridge() && (
            <div style={{ padding: '8px 14px', borderRadius: '8px', background: '#818cf810', border: '1px solid #818cf830', fontSize: '12px', color: '#818cf8', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
              🌐 Remote: {(() => { try { return new URL(getRemoteBridgeConfig().url).hostname; } catch { return 'remote'; } })()}
            </div>
          )}
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
          {!isFullyReady && bridgeSupportsSecondBrain !== false && (
            <button onClick={runInstall} style={{ marginTop: '14px', width: '100%', padding: '12px 20px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', fontSize: '14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: '0 4px 12px #6366f140' }}>
              ⚡ Complete Setup — Install Everything Automatically
            </button>
          )}
          {!isFullyReady && bridgeSupportsSecondBrain === false && (
            <div style={{ marginTop: '14px', width: '100%', padding: '12px 20px', borderRadius: '10px', border: '1px solid #ef444430', background: '#ef444408', fontSize: '13px', color: '#ef4444', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              ⚠️ Update your bridge first — setup requires Second Brain support
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div style={{ display: 'flex', gap: '10px', marginTop: '18px', flexWrap: 'wrap' }}>
          <button
            onClick={() => { const el = document.getElementById('style-guide-section'); if (el) el.scrollIntoView({ behavior: 'smooth' }); setStyleGuideOpen(true); }}
            style={{ fontSize: '12px', color: '#fff', background: '#6366f1', border: 'none', borderRadius: '8px', padding: '8px 16px', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <span>✍️</span> {styleGuideSaved ? 'Style Guide Saved ✓' : styleGuideResult ? 'View Style Guide' : 'Create Writing Style Guide'}
          </button>
          <button
            onClick={() => { const el = document.getElementById('addons-section'); if (el) el.scrollIntoView({ behavior: 'smooth' }); }}
            style={{ fontSize: '12px', color: 'var(--text-primary)', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 16px', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <span>🧩</span> Add-ons
          </button>
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
              <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                <button
                  onClick={(e) => { e.stopPropagation(); executeCommand(cmd.command); }}
                  title="Run this command"
                  style={{ padding: '5px 14px', borderRadius: '8px', border: 'none', background: activeCommand === cmd.command ? '#6366f1' : '#6366f120', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 600, color: activeCommand === cmd.command ? '#fff' : '#6366f1', transition: 'all 0.2s', whiteSpace: 'nowrap' }}
                  onMouseEnter={e => { if (activeCommand !== cmd.command) { (e.currentTarget as HTMLElement).style.background = '#6366f130'; } }}
                  onMouseLeave={e => { if (activeCommand !== cmd.command) { (e.currentTarget as HTMLElement).style.background = '#6366f120'; } }}
                >
                  {activeCommand === cmd.command && previewStreaming ? '⏳ Running...' : '▶ Run'}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setScheduleDialogSkill({ id: cmd.command, name: cmd.label, prompt: cmd.command, icon: cmd.icon }); setScheduleDialogOpen(true); }}
                  title="Schedule this command to run automatically"
                  style={{ padding: '5px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 500, color: 'var(--text-tertiary)', transition: 'all 0.2s', whiteSpace: 'nowrap' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#f59e0b'; (e.currentTarget as HTMLElement).style.color = '#f59e0b'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-tertiary)'; }}
                >
                  ⏰
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* My Custom Skills as Slash Commands */}
        {customSkillCommands.length > 0 && (
          <>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px', marginTop: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>My Skills</span>
              <span style={{ fontSize: '11px', fontWeight: 500, background: '#22c55e20', color: '#22c55e', padding: '2px 8px', borderRadius: '10px' }}>{customSkillCommands.length}</span>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px', marginTop: '-6px', lineHeight: '1.5' }}>
              Your custom skills are available as slash commands. Click to run, or type the command in the chat.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {customSkillCommands.map((cmd: any) => (
                <div
                  key={cmd.command}
                  style={{
                    background: activeCommand === cmd.command ? '#22c55e10' : 'var(--bg-secondary)',
                    border: `1px solid ${activeCommand === cmd.command ? '#22c55e40' : 'var(--border)'}`,
                    borderRadius: '10px', padding: '12px 14px', cursor: 'pointer', transition: 'all 0.2s ease',
                    display: 'flex', alignItems: 'center', gap: '12px',
                  }}
                  onClick={() => executeCommand(cmd.command)}
                  onMouseEnter={e => { if (activeCommand !== cmd.command) { (e.currentTarget as HTMLElement).style.borderColor = '#22c55e30'; (e.currentTarget as HTMLElement).style.background = 'var(--bg-primary)'; } }}
                  onMouseLeave={e => { if (activeCommand !== cmd.command) { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.background = 'var(--bg-secondary)'; } }}
                >
                  <div style={{ fontSize: '22px', lineHeight: '1', flexShrink: 0, width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', background: '#22c55e10' }}>
                    {cmd.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <code style={{ fontSize: '13px', fontWeight: 700, color: '#22c55e' }}>{cmd.command}</code>
                      <span style={{ fontSize: '10px', background: '#22c55e20', color: '#22c55e', padding: '1px 6px', borderRadius: '8px' }}>custom</span>
                      {activeCommand === cmd.command && previewStreaming && (
                        <div style={{ width: '10px', height: '10px', border: '2px solid #22c55e40', borderTopColor: '#22c55e', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                      )}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px', lineHeight: '1.4' }}>{cmd.description}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); executeCommand(cmd.command); }}
                      title="Run this skill"
                      style={{ padding: '5px 14px', borderRadius: '8px', border: 'none', background: activeCommand === cmd.command ? '#22c55e' : '#22c55e20', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 600, color: activeCommand === cmd.command ? '#fff' : '#22c55e', transition: 'all 0.2s', whiteSpace: 'nowrap' }}
                      onMouseEnter={e => { if (activeCommand !== cmd.command) { (e.currentTarget as HTMLElement).style.background = '#22c55e30'; } }}
                      onMouseLeave={e => { if (activeCommand !== cmd.command) { (e.currentTarget as HTMLElement).style.background = '#22c55e20'; } }}
                    >
                      {activeCommand === cmd.command && previewStreaming ? '⏳ Running...' : '▶ Run'}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); const skillId = cmd.command.replace('/skill-', ''); setScheduleDialogSkill({ id: skillId, name: cmd.label, prompt: (cmd as any).prompt || cmd.command, icon: cmd.icon }); setScheduleDialogOpen(true); }}
                      title="Schedule this skill to run automatically"
                      style={{ padding: '5px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 500, color: 'var(--text-tertiary)', transition: 'all 0.2s', whiteSpace: 'nowrap' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#f59e0b'; (e.currentTarget as HTMLElement).style.color = '#f59e0b'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-tertiary)'; }}
                    >
                      ⏰
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Link to create more skills */}
        <div style={{ marginTop: '16px', padding: '12px 16px', background: 'var(--bg-secondary)', border: '1px dashed var(--border)', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
          onClick={() => document.dispatchEvent(new CustomEvent('arcadia:navigate', { detail: 'skills' }))}
          onMouseEnter={e => (e.currentTarget.style.borderColor = '#6366f1')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
        >
          <span style={{ fontSize: '18px' }}>✨</span>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Create a new skill</div>
            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Build custom slash commands from the Skills panel</div>
          </div>
        </div>

        {/* ─── Session Startup Hook ─── */}
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px', marginTop: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>⚡ Session Startup Hook</span>
          {sessionHookEnabled && <span style={{ fontSize: '11px', fontWeight: 500, background: 'rgba(34,197,94,0.15)', color: '#22c55e', padding: '2px 8px', borderRadius: '10px' }}>Active</span>}
        </div>

        <div style={{
          padding: '16px', borderRadius: '12px',
          background: sessionHookEnabled ? 'rgba(34,197,94,0.04)' : 'var(--bg-secondary)',
          border: `1px solid ${sessionHookEnabled ? 'rgba(34,197,94,0.2)' : 'var(--border)'}`,
          marginBottom: '16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            <span style={{ fontSize: '24px', marginTop: '2px' }}>{sessionHookEnabled ? '🟢' : '⚪'}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                Auto-load project context at session start
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5', marginBottom: '12px' }}>
                {sessionHookEnabled
                  ? 'Claude will automatically load your Second Brain project context when you start a new session. This adds ~1-2 seconds to startup but gives Claude full awareness of your projects, priorities, and recent activity.'
                  : 'Enable this to have Claude automatically read your PARA workspace index and active project files at the start of every session. One-time setup, adds only 1-2 seconds to each session start.'}
              </div>

              {/* Status message */}
              {sessionHookMessage && (
                <div style={{
                  padding: '8px 12px', borderRadius: '8px', marginBottom: '10px', fontSize: '12px', lineHeight: '1.5',
                  background: sessionHookStatus === 'success' ? 'rgba(34,197,94,0.1)' : sessionHookStatus === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(59,130,246,0.1)',
                  color: sessionHookStatus === 'success' ? '#22c55e' : sessionHookStatus === 'error' ? '#ef4444' : '#3b82f6',
                  border: `1px solid ${sessionHookStatus === 'success' ? 'rgba(34,197,94,0.2)' : sessionHookStatus === 'error' ? 'rgba(239,68,68,0.2)' : 'rgba(59,130,246,0.2)'}`,
                }}>
                  {sessionHookStatus === 'configuring' && <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite', marginRight: '6px' }}>⏳</span>}
                  {sessionHookMessage}
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  onClick={() => configureSessionHook(!sessionHookEnabled)}
                  disabled={sessionHookConfiguring}
                  style={{
                    padding: '7px 16px', borderRadius: '8px', border: 'none', fontSize: '12px', fontWeight: 600, cursor: sessionHookConfiguring ? 'not-allowed' : 'pointer',
                    background: sessionHookEnabled ? 'rgba(239,68,68,0.12)' : '#22c55e',
                    color: sessionHookEnabled ? '#ef4444' : '#fff',
                    opacity: sessionHookConfiguring ? 0.6 : 1,
                    transition: 'all 0.2s',
                  }}
                >
                  {sessionHookConfiguring
                    ? (sessionHookEnabled ? 'Removing...' : 'Configuring...')
                    : (sessionHookEnabled ? 'Disable Hook' : 'Enable Hook')}
                </button>
                {sessionHookEnabled && (
                  <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Adds ~1-2s to each session start</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Scheduled Automations — always visible */}
        {(() => {
          try {
            const scheds = JSON.parse(localStorage.getItem('arcadia-skill-schedules') || '[]');
            const activeCount = scheds.filter((s: any) => s.enabled).length;
            return (
              <>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px', marginTop: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>⏰ Scheduled Automations</span>
                  {activeCount > 0 && <span style={{ fontSize: '11px', fontWeight: 500, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', padding: '2px 8px', borderRadius: '10px' }}>{activeCount} active</span>}
                </div>
                {scheds.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {/* Explanation */}
                    <div style={{ background: 'var(--bg-secondary)', border: '1px dashed var(--border)', borderRadius: '12px', padding: '16px', textAlign: 'center' }}>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>⏰ Automate your workflow</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', lineHeight: '1.6', maxWidth: '400px', margin: '0 auto' }}>
                        Schedule commands to run automatically. Pick a preset below or click ⏰ next to any command above.
                      </div>
                    </div>

                    {/* Quick Preset: Morning Routine */}
                    <button
                      onClick={() => {
                        const presets = [
                          { id: `sched-preset-daily-${Date.now()}`, skillId: '/daily-brief', skillName: 'Daily Brief', skillIcon: '☀️', skillPrompt: '/daily-brief', frequency: 'weekdays' as const, time: '09:00', customDays: [], enabled: true, writeToVault: false, vaultPath: '', vaultMode: 'append' as const, sendNotification: true, notificationTarget: 'toast' as const, createdAt: Date.now(), nextRun: 0, lastRun: null, runCount: 0 },
                          { id: `sched-preset-eod-${Date.now()}`, skillId: '/eod', skillName: 'End of Day', skillIcon: '🌙', skillPrompt: '/eod', frequency: 'weekdays' as const, time: '17:00', customDays: [], enabled: true, writeToVault: true, vaultPath: 'session_log.md', vaultMode: 'append' as const, sendNotification: true, notificationTarget: 'toast' as const, createdAt: Date.now(), nextRun: 0, lastRun: null, runCount: 0 },
                          { id: `sched-preset-eow-${Date.now()}`, skillId: '/eow', skillName: 'End of Week', skillIcon: '📦', skillPrompt: '/eow', frequency: 'weekly' as const, time: '16:00', customDays: [5], enabled: true, writeToVault: true, vaultPath: 'pulse.md', vaultMode: 'append' as const, sendNotification: true, notificationTarget: 'toast' as const, createdAt: Date.now(), nextRun: 0, lastRun: null, runCount: 0 },
                        ];
                        const existing = JSON.parse(localStorage.getItem('arcadia-skill-schedules') || '[]');
                        localStorage.setItem('arcadia-skill-schedules', JSON.stringify([...existing, ...presets]));
                        setScheduleRefreshKey(k => k + 1);
                      }}
                      style={{
                        padding: '14px 16px', borderRadius: '12px', border: '1px solid rgba(245,158,11,0.25)',
                        background: 'linear-gradient(135deg, rgba(245,158,11,0.06), rgba(245,158,11,0.02))',
                        cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '14px',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(245,158,11,0.5)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(245,158,11,0.25)'; (e.currentTarget as HTMLElement).style.transform = 'none'; }}
                    >
                      <div style={{ fontSize: '28px' }}>🌅</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#f59e0b', marginBottom: '3px' }}>Morning Routine Bundle</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', lineHeight: '1.5' }}>Sets up 3 automations in one click:</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span>☀️ Daily Brief — Weekdays at 9:00 AM</span>
                          <span>🌙 End of Day — Weekdays at 5:00 PM → session_log.md</span>
                          <span>📦 Weekly Review — Fridays at 4:00 PM → pulse.md</span>
                        </div>
                      </div>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: '#f59e0b', background: 'rgba(245,158,11,0.12)', padding: '4px 10px', borderRadius: '8px', whiteSpace: 'nowrap' }}>1-Click Setup</div>
                    </button>

                    {/* Individual presets */}
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => { setScheduleDialogSkill({ id: '/daily-brief', name: 'Daily Brief', prompt: '/daily-brief', icon: '☀️' }); setScheduleDialogOpen(true); }}
                        style={{ flex: '1 1 140px', fontSize: '12px', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px', transition: 'border-color 0.15s' }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#f59e0b'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
                      >
                        <span style={{ fontSize: '16px' }}>☀️</span>
                        <div><div style={{ fontWeight: 600, fontSize: '12px' }}>Daily Brief</div><div style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>Customize schedule</div></div>
                      </button>
                      <button
                        onClick={() => { setScheduleDialogSkill({ id: '/eod', name: 'End of Day', prompt: '/eod', icon: '🌙' }); setScheduleDialogOpen(true); }}
                        style={{ flex: '1 1 140px', fontSize: '12px', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px', transition: 'border-color 0.15s' }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#f59e0b'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
                      >
                        <span style={{ fontSize: '16px' }}>🌙</span>
                        <div><div style={{ fontWeight: 600, fontSize: '12px' }}>End of Day</div><div style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>Customize schedule</div></div>
                      </button>
                      <button
                        onClick={() => { setScheduleDialogSkill({ id: '/eow', name: 'End of Week', prompt: '/eow', icon: '📦' }); setScheduleDialogOpen(true); }}
                        style={{ flex: '1 1 140px', fontSize: '12px', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px', transition: 'border-color 0.15s' }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#f59e0b'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
                      >
                        <span style={{ fontSize: '16px' }}>📦</span>
                        <div><div style={{ fontWeight: 600, fontSize: '12px' }}>Weekly Review</div><div style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>Customize schedule</div></div>
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {scheds.slice(0, 5).map((sched: any) => {
                        const timeStr = new Date(`2000-01-01T${sched.time}`).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                        const freqLabel = sched.frequency === 'daily' ? 'Daily' : sched.frequency === 'weekdays' ? 'Weekdays' : sched.frequency === 'weekly' ? 'Weekly' : 'Custom';
                        return (
                          <div key={sched.id} style={{
                            padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border)',
                            background: sched.enabled ? 'var(--bg-secondary)' : 'rgba(100,100,100,0.05)',
                            opacity: sched.enabled ? 1 : 0.5, display: 'flex', alignItems: 'center', gap: '10px',
                          }}>
                            <span style={{ fontSize: '18px' }}>{sched.skillIcon}</span>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{sched.skillName}</div>
                              <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                                {freqLabel} at {timeStr}
                                {sched.writeToVault && <span> · → {sched.vaultPath}</span>}
                              </div>
                            </div>
                            <button
                              title={sched.enabled ? 'Click to pause' : 'Click to resume'}
                              onClick={(e) => {
                                e.stopPropagation();
                                try {
                                  const allScheds = JSON.parse(localStorage.getItem('arcadia-skill-schedules') || '[]');
                                  const target = allScheds.find((s: any) => s.id === sched.id);
                                  if (target) {
                                    target.enabled = !target.enabled;
                                    localStorage.setItem('arcadia-skill-schedules', JSON.stringify(allScheds));
                                    document.dispatchEvent(new CustomEvent('arcadia:schedules-changed', { detail: allScheds }));
                                    setScheduleRefreshKey(k => k + 1);
                                  }
                                } catch (err) { console.error('Toggle failed:', err); }
                              }}
                              style={{
                                fontSize: '10px', padding: '3px 8px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                                background: sched.enabled ? '#22c55e15' : '#ef444415',
                                color: sched.enabled ? '#22c55e' : '#ef4444',
                                fontWeight: 600, transition: 'all 0.15s',
                                display: 'flex', alignItems: 'center', gap: '3px',
                              }}
                              onMouseEnter={(e) => { (e.target as HTMLElement).style.transform = 'scale(1.05)'; }}
                              onMouseLeave={(e) => { (e.target as HTMLElement).style.transform = 'scale(1)'; }}
                            >
                              {sched.enabled ? '● Active' : '○ Paused'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    {scheds.length > 5 && (
                      <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', textAlign: 'center', marginTop: '8px' }}>
                        +{scheds.length - 5} more · <span style={{ color: 'var(--accent)', cursor: 'pointer' }} onClick={() => document.dispatchEvent(new CustomEvent('arcadia:navigate', { detail: 'skills' }))}>View all in Skills</span>
                      </div>
                    )}
                  </>
                )}
              </>
            );
          } catch { return null; }
        })()}

        {/* Execution History */}
        {(() => {
          try {
            const history: Array<{ scheduleId: string; skillName: string; skillIcon: string; timestamp: number; status: string; summary: string; vaultPath?: string; duration: number }> = JSON.parse(localStorage.getItem('arcadia-schedule-history') || '[]');
            if (history.length === 0) return null;
            return (
              <>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px', marginTop: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>📋 Recent Runs</span>
                  <span style={{ fontSize: '11px', fontWeight: 500, background: 'rgba(99,102,241,0.12)', color: '#818cf8', padding: '2px 8px', borderRadius: '10px' }}>{history.length}</span>
                  {history.length > 0 && (
                    <button
                      onClick={() => { localStorage.removeItem('arcadia-schedule-history'); setScheduleRefreshKey(k => k + 1); }}
                      style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}
                      title="Clear history"
                    >Clear</button>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', position: 'relative' }}>
                  {/* Timeline line */}
                  <div style={{ position: 'absolute', left: '11px', top: '8px', bottom: '8px', width: '2px', background: 'var(--border)', borderRadius: '1px', zIndex: 0 }} />
                  {history.slice(0, 10).map((entry, idx) => {
                    const date = new Date(entry.timestamp);
                    const isToday = new Date().toDateString() === date.toDateString();
                    const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                    const dateStr = isToday ? 'Today' : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
                    const statusColor = entry.status === 'success' ? '#22c55e' : entry.status === 'error' ? '#ef4444' : '#f59e0b';
                    const statusIcon = entry.status === 'success' ? '✓' : entry.status === 'error' ? '✗' : '⏭';
                    const durationStr = entry.duration < 1000 ? `${entry.duration}ms` : `${(entry.duration / 1000).toFixed(1)}s`;
                    return (
                      <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px 0', position: 'relative', zIndex: 1 }}>
                        {/* Timeline dot */}
                        <div style={{
                          width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0,
                          background: 'var(--bg-primary)', border: `2px solid ${statusColor}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '10px', color: statusColor, fontWeight: 700,
                        }}>{statusIcon}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                            <span style={{ fontSize: '14px' }}>{entry.skillIcon}</span>
                            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{entry.skillName}</span>
                            <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginLeft: 'auto', flexShrink: 0 }}>{durationStr}</span>
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <span>{dateStr} at {timeStr}</span>
                            {entry.vaultPath && <span style={{ color: '#818cf8' }}>→ {entry.vaultPath}</span>}
                          </div>
                          {entry.summary && (
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: '1.5', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>
                              {entry.summary.slice(0, 150)}{entry.summary.length > 150 ? '...' : ''}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {history.length > 10 && (
                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textAlign: 'center', marginTop: '4px' }}>
                    Showing 10 of {history.length} runs
                  </div>
                )}
              </>
            );
          } catch { return null; }
        })()}

        {/* Writing Style Guide */}
        <div id="style-guide-section" style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px', marginTop: '24px' }}>Writing Style Guide</div>
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
        <div id="addons-section" style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px', marginTop: '24px' }}>Optional Add-ons</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {ADDONS.map(addon => {
            // Detection: check detectionKey (wispr, obsidian) OR skillKey in skills list (gchat)
            const detected = addon.detectionKey ? (detection as any)?.[addon.detectionKey] : null;
            const detectedViaApp = typeof detected === 'object' && detected !== null ? detected.installed : typeof detected === 'boolean' ? detected : false;
            const detectedViaSkill = addon.skillKey ? ((detection as any)?.skills?.installed || []).includes(addon.skillKey) : false;
            const isInstalled = detectedViaApp || detectedViaSkill;
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
                      <div style={{ marginTop: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                            {isThisInstalling ? `Installing... (${addonInstallElapsed}s)` : 'Install Automatically'}
                          </button>
                          {!isThisInstalling && addon.setupUrl && (
                            <a href={addon.setupUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>or set up manually →</a>
                          )}
                        </div>

                        {/* Streaming install log */}
                        {(addonInstallLog[addon.id]?.length > 0) && (
                          <div style={{
                            marginTop: '8px',
                            padding: '8px 10px',
                            background: '#0a0a0f',
                            borderRadius: '8px',
                            border: '1px solid #1e1e2e',
                            maxHeight: '140px',
                            overflow: 'auto',
                            fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", Consolas, monospace',
                            fontSize: '10.5px',
                            lineHeight: '1.7',
                          }}>
                            {addonInstallLog[addon.id].map((line, i) => {
                              const isSuccess = line.includes('✓');
                              const isError = line.includes('✘');
                              const isLast = i === addonInstallLog[addon.id].length - 1;
                              return (
                                <div key={i} style={{
                                  color: isError ? '#ef4444' : isSuccess ? '#22c55e' : '#94a3b8',
                                  opacity: isLast && isThisInstalling ? 1 : 0.85,
                                  display: 'flex',
                                  alignItems: 'flex-start',
                                  gap: '6px',
                                }}>
                                  <span style={{ color: '#475569', flexShrink: 0 }}>{line.slice(0, 10)}</span>
                                  <span style={{ flex: 1, wordBreak: 'break-word' }}>
                                    {line.slice(11)}
                                    {isLast && isThisInstalling && (
                                      <span style={{ display: 'inline-block', width: '6px', height: '12px', background: '#6366f1', marginLeft: '2px', animation: 'blink 1s step-end infinite', verticalAlign: 'middle' }} />
                                    )}
                                  </span>
                                </div>
                              );
                            })}
                            <div ref={addonLogEndRef} />
                          </div>
                        )}
                      </div>
                    )}
                    {addonSuccess[addon.id] && !thisError && !isThisInstalling && (
                      <div style={{ fontSize: '11px', color: '#22c55e', marginTop: '6px', padding: '6px 10px', background: '#22c55e0a', borderRadius: '6px', border: '1px solid #22c55e20', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '13px' }}>✅</span> {addonSuccess[addon.id]}
                      </div>
                    )}
                    {thisError && !isThisInstalling && (
                      <div style={{ fontSize: '11px', color: '#ef4444', marginTop: '6px', padding: '6px 10px', background: '#ef44440a', borderRadius: '6px', border: '1px solid #ef444420', lineHeight: '1.5' }}>{thisError}</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Quick Reference */}
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px', marginTop: '24px' }}>How It Works</div>
        <div style={{ padding: '16px 20px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.7', marginBottom: '16px' }}>
          <div style={{ marginBottom: '8px' }}><strong style={{ color: 'var(--text-primary)' }}>Your Second Brain has four parts:</strong></div>
          <div style={{ marginBottom: '6px' }}><strong>1. Workspace</strong> — Your Google Drive <code style={{ background: 'var(--bg-primary)', padding: '1px 4px', borderRadius: '3px' }}>claude/</code> folder stores all projects, notes, and context.</div>
          <div style={{ marginBottom: '6px' }}><strong>2. CLAUDE.md</strong> — Your configuration file defines slash commands, preferences, and workflows.</div>
          <div style={{ marginBottom: '6px' }}><strong>3. Skills</strong> — Modular capabilities (calendar, docs, research) that Claude can use.</div>
          <div><strong>4. Plugins</strong> — Extensions that connect Claude to external services (Google Docs, Sheets, etc).</div>
        </div>

        {/* AI Skills table */}
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>What Your AI Can Do</div>
        <div style={{
          marginBottom: '24px', borderRadius: '12px', overflow: 'hidden',
          border: '1px solid var(--border)', background: 'var(--bg-secondary)',
        }}>
          {[
            { skill: '🧠 Memory', desc: 'Remembers your preferences, past conversations, and context' },
            { skill: '📝 Summarization', desc: 'Condenses long documents into key takeaways' },
            { skill: '📂 Organization', desc: 'Helps structure your thoughts and notes' },
            { skill: '🔍 Research', desc: 'Digs through information and brings back what\'s relevant' },
            { skill: '💬 Retrieval', desc: 'Ask "what did we discuss about X?" and get an answer' },
          ].map((row, i) => (
            <div key={i} style={{
              display: 'flex', gap: '12px', padding: '10px 16px',
              borderBottom: i < 4 ? '1px solid var(--border)' : 'none',
              alignItems: 'center',
            }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', minWidth: '140px', flexShrink: 0 }}>{row.skill}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{row.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right column: Preview */}
      {renderPreview()}

      {/* Schedule Dialog */}
      <ScheduleSkillDialog
        open={scheduleDialogOpen}
        onClose={() => { setScheduleDialogOpen(false); setScheduleDialogSkill(null); }}
        skill={scheduleDialogSkill}
        onSave={(schedule: SkillSchedule) => {
          try {
            const existing = JSON.parse(localStorage.getItem('arcadia-skill-schedules') || '[]');
            existing.push(schedule);
            localStorage.setItem('arcadia-skill-schedules', JSON.stringify(existing));
            setScheduleRefreshKey(k => k + 1);
          } catch (e) { console.error('Failed to save schedule:', e); }
          setScheduleDialogOpen(false);
          setScheduleDialogSkill(null);
        }}
      />

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
      `}</style>
    </div>
  );
}
