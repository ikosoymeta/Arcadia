import { useState, useCallback, useRef, useEffect, useMemo, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useConnection } from '../../store/ConnectionContext';
import { useChat } from '../../store/ChatContext';
import { sendMessage, detectErrorInContent } from '../../services/claude';
import { trackMessage } from '../../services/analytics';
import type { Message, Artifact, ImageAttachment, ToolUseBlock } from '../../types';
import { CLAUDE_MODELS } from '../../types';
import styles from './SimpleView.module.css';

// ─── Quick suggestion prompts ─────────────────────────────────────────────────

const SUGGESTIONS = [
  { icon: '📋', label: 'Meeting notes', prompt: 'Help me turn rough meeting notes into a clean summary. I\'ll paste my notes and you organize them into: Key Decisions, Action Items (with owners and due dates), and Open Questions. Keep it concise and ready to share.' },
  { icon: '📧', label: 'Draft an email', prompt: 'Help me write a professional email. Ask me who it\'s to, the purpose, and key points I want to cover. Keep it clear, concise, and action-oriented.' },
  { icon: '📊', label: 'Summarize data', prompt: 'Help me make sense of data. I\'ll paste numbers, a table, or describe metrics, and you summarize the key takeaways, trends, and what actions I should consider. Present insights in plain language.' },
  { icon: '🎯', label: 'Project status update', prompt: 'Help me write a project status update. Ask me about the project name, what was accomplished this week, blockers, next steps, and any risks. Format it as a clean status report ready to share with stakeholders.' },
  { icon: '📝', label: 'HPM Self-Review', prompt: 'Help me draft my HPM self-review for this half. Ask me about my role, key projects, and accomplishments. Then write a draft with sections for Impact, Execution, and Collaboration.' },
  { icon: '💡', label: 'Brainstorm ideas', prompt: 'Help me brainstorm. I\'ll describe a challenge or opportunity, and you generate a range of creative solutions and approaches. Organize them by effort level (quick wins vs. bigger bets) so I can prioritize.' },
];

// ─── Follow-up suggestions based on response type ─────────────────────────────

function getFollowUpSuggestions(content: string): string[] {
  const lower = content.toLowerCase();
  if (lower.includes('action item') || lower.includes('meeting') || lower.includes('notes')) {
    return ['Add a timeline', 'Make it shorter', 'Format as a table', 'Add priority levels'];
  }
  if (lower.includes('email') || lower.includes('draft') || lower.includes('message')) {
    return ['Make it more concise', 'Make the tone friendlier', 'Add a call to action', 'Make it more formal'];
  }
  if (lower.includes('status') || lower.includes('update') || lower.includes('report')) {
    return ['Add risk assessment', 'Make it executive-friendly', 'Add metrics', 'Shorten to 3 bullet points'];
  }
  if (lower.includes('brainstorm') || lower.includes('idea') || lower.includes('solution')) {
    return ['Rank by impact', 'Add pros and cons', 'Create an action plan', 'Which is the quick win?'];
  }
  if (lower.includes('data') || lower.includes('metric') || lower.includes('number') || lower.includes('chart')) {
    return ['What are the key takeaways?', 'Compare to last period', 'What should I do about this?', 'Simplify for executives'];
  }
  return ['Make it shorter', 'Give me an example', 'Explain in simpler terms', 'What should I do next?'];
}

// ─── Bridge Setup Prompt ─────────────────────────────────────────────────────

const SETUP_CMD_MAC = 'curl -sL https://raw.githubusercontent.com/ikosoymeta/Arcadia/main/bridge/setup.sh | bash';
const SETUP_CMD_WIN = 'irm https://raw.githubusercontent.com/ikosoymeta/Arcadia/main/bridge/setup.ps1 | iex';
const MANUAL_CMD_MAC = 'node ~/.arcadia-bridge/arcadia-bridge.js';
const MANUAL_CMD_WIN = 'node "%USERPROFILE%\\.arcadia-bridge\\arcadia-bridge.js"';

function detectOS(): 'mac' | 'win' | 'linux' {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('win')) return 'win';
  if (ua.includes('linux') && !ua.includes('android')) return 'linux';
  return 'mac';
}

interface DiagState {
  bridge: 'checking' | 'ok' | 'fail';
  bridgeVersion: string;
  lastCheck: string;
}

function BridgeSetupPrompt({ onRetry }: { onRetry: () => void }) {
  const [copied, setCopied] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [diag, setDiag] = useState<DiagState>({ bridge: 'checking', bridgeVersion: '', lastCheck: '' });
  const [pollCount, setPollCount] = useState(0);
  const [os] = useState(detectOS);
  const setupCmd = os === 'win' ? SETUP_CMD_WIN : SETUP_CMD_MAC;
  const manualCmd = os === 'win' ? MANUAL_CMD_WIN : MANUAL_CMD_MAC;
  const terminalName = os === 'win' ? 'PowerShell' : 'Terminal';
  const terminalHint = os === 'win'
    ? 'Press \u229e Win → type "PowerShell" → right-click → Run as Administrator'
    : 'Press \u2318 Space → type "Terminal" → press Enter';

  // Health check
  const runDiagnostics = useCallback(async () => {
    setDiag(d => ({ ...d, bridge: 'checking', lastCheck: new Date().toLocaleTimeString() }));
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3000);
      const res = await fetch('http://127.0.0.1:8087/health', { signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        setDiag({ bridge: 'ok', bridgeVersion: data.version || 'unknown', lastCheck: new Date().toLocaleTimeString() });
        onRetry();
      } else {
        setDiag(d => ({ ...d, bridge: 'fail', lastCheck: new Date().toLocaleTimeString() }));
      }
    } catch {
      setDiag(d => ({ ...d, bridge: 'fail', lastCheck: new Date().toLocaleTimeString() }));
    }
  }, [onRetry]);

  // Always auto-poll for bridge connection every 3 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setPollCount(c => c + 1);
      runDiagnostics();
    }, 3000);
    runDiagnostics();
    return () => clearInterval(interval);
  }, [runDiagnostics]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(setupCmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      const el = document.getElementById('bridge-cmd');
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
      }
    }
  };

  return (
    <div className={styles.bridgeSetup}>
      <div className={styles.bridgeTitle}>
        <span className={styles.bridgeIcon}>⚡</span>
        Connect to Claude
      </div>
      <div className={styles.bridgeSubtitle}>
        Paste this command in <strong>{terminalName}</strong> to connect ArcadIA to Claude.
      </div>

      {/* Step 1: Open Terminal */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '10px 14px', borderRadius: '8px',
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid var(--border-color)',
        marginBottom: '8px'
      }}>
        <span style={{
          background: 'var(--accent)', color: '#fff', borderRadius: '50%',
          width: '22px', height: '22px', display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: '12px', fontWeight: 700, flexShrink: 0
        }}>1</span>
        <div style={{ fontSize: '13px' }}>
          <div>Open <strong style={{ color: 'var(--text-primary)' }}>{terminalName}</strong></div>
          <div style={{ opacity: 0.6, fontSize: '11.5px', marginTop: '2px' }}>{terminalHint}</div>
        </div>
      </div>

      {/* Step 2: Paste command */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '10px 14px', borderRadius: '8px',
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid var(--border-color)',
        marginBottom: '8px'
      }}>
        <span style={{
          background: 'var(--accent)', color: '#fff', borderRadius: '50%',
          width: '22px', height: '22px', display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: '12px', fontWeight: 700, flexShrink: 0
        }}>2</span>
        <span style={{ fontSize: '13px' }}>Paste the command below and press Enter</span>
      </div>

      <div className={styles.cmdBox}>
        <code id="bridge-cmd" className={styles.cmdText} style={{ fontSize: '11.5px' }}>{setupCmd}</code>
        <button className={styles.copyBtn} onClick={handleCopy}>
          {copied ? '✓ Copied!' : '📋 Copy'}
        </button>
      </div>

      {/* Warning: not Claude Code */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: '8px',
        padding: '8px 12px', borderRadius: '6px',
        background: 'rgba(234, 179, 8, 0.08)',
        border: '1px solid rgba(234, 179, 8, 0.2)',
        marginTop: '4px', fontSize: '12px', color: 'rgba(234, 179, 8, 0.9)'
      }}>
        <span style={{ flexShrink: 0, marginTop: '1px' }}>⚠️</span>
        <span>Use your system <strong>{terminalName}</strong>, not Claude Code's terminal. Pasting into Claude Code will trigger a security review instead of running the setup.</span>
      </div>

      {/* Auto-detection status - always visible */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '10px 14px', borderRadius: '8px',
        background: diag.bridge === 'ok' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(255, 255, 255, 0.03)',
        border: `1px solid ${diag.bridge === 'ok' ? 'rgba(34, 197, 94, 0.3)' : 'var(--border-color)'}`,
        marginTop: '12px', transition: 'all 0.3s ease'
      }}>
        <span style={{
          width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
          background: diag.bridge === 'ok' ? '#22c55e' : diag.bridge === 'checking' ? '#eab308' : '#6b7280',
          animation: diag.bridge !== 'ok' ? 'pulse 2s infinite' : 'none',
          boxShadow: diag.bridge === 'ok' ? '0 0 6px rgba(34, 197, 94, 0.5)' : 'none'
        }} />
        <span style={{ fontSize: '13px', color: diag.bridge === 'ok' ? '#22c55e' : 'var(--text-secondary)' }}>
          {diag.bridge === 'ok'
            ? `Connected! (v${diag.bridgeVersion})`
            : diag.bridge === 'checking'
              ? 'Checking for bridge...'
              : `Waiting for bridge...${pollCount > 0 ? ' (auto-checking every 3s)' : ''}`
          }
        </span>
      </div>

      {/* Already set up hint */}
      <div className={styles.bridgeNote} style={{ marginTop: '12px' }}>
        Already set up? The bridge auto-starts on login. If it stopped, run: <code style={{
          fontSize: '11px', background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: '4px'
        }}>{manualCmd}</code>
      </div>

      {/* Troubleshooting - collapsed by default */}
      <div className={styles.diagnostics}>
        <button className={styles.diagToggle} onClick={() => setShowAdvanced(!showAdvanced)}>
          {showAdvanced ? '▼' : '▶'} Troubleshooting
        </button>
        {showAdvanced && (
          <div className={styles.diagPanel}>
            <div className={styles.diagRow}>
              <span className={styles.diagLabel}>Bridge status</span>
              <span className={`${styles.diagValue} ${diag.bridge === 'ok' ? styles.diagOk : diag.bridge === 'fail' ? styles.diagFail : styles.diagWarn}`}>
                <span className={`${styles.diagDot} ${diag.bridge === 'ok' ? styles.diagDotGreen : diag.bridge === 'fail' ? styles.diagDotRed : styles.diagDotYellow}`} />
                {diag.bridge === 'checking' ? 'Checking...' : diag.bridge === 'ok' ? `Running (v${diag.bridgeVersion})` : 'Not detected'}
              </span>
            </div>
            <div className={styles.diagRow}>
              <span className={styles.diagLabel}>Endpoint</span>
              <span className={styles.diagValue}>localhost:8087</span>
            </div>
            <div className={styles.diagRow}>
              <span className={styles.diagLabel}>Last checked</span>
              <span className={styles.diagValue}>{diag.lastCheck || '—'}</span>
            </div>
            <button className={styles.retryBtn} onClick={runDiagnostics} style={{ marginTop: '8px', width: '100%' }}>
              Check now
            </button>

            <div className={styles.troubleshoot}>
              <div className={styles.troubleshootTitle}>Common fixes</div>
              <ul className={styles.troubleshootList}>
                <li>Make sure Claude Code is installed: <code>claude --version</code></li>
                <li>Make sure Node.js is installed: <code>node --version</code></li>
                <li>Check if port is in use: <code>{os === 'win' ? 'netstat -ano | findstr :8087' : 'lsof -i :8087'}</code></li>
                <li>Restart the bridge: <code>{os === 'win' ? 'irm https://raw.githubusercontent.com/ikosoymeta/Arcadia/main/bridge/setup.ps1 | iex' : 'bash ~/.arcadia-bridge/setup.sh'}</code></li>
                <li>Need help? <a href="mailto:ikosoy@meta.com?subject=ArcadIA%20Editor%20Support" style={{ color: 'var(--accent)' }}>Contact support</a></li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Activity Step ────────────────────────────────────────────────────────────

interface ActivityStep {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'done' | 'error';
  detail?: string;
  icon: string;
}

// ─── Artifact Card ────────────────────────────────────────────────────────────

function ArtifactCard({ artifact }: { artifact: Artifact }) {
  const [copied, setCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(artifact.type === 'html');

  const handleCopy = () => {
    navigator.clipboard.writeText(artifact.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const typeLabel = artifact.type === 'html' ? 'HTML' : artifact.language ?? artifact.type;
  const typeIcon = artifact.type === 'html' ? '🌐' : artifact.type === 'code' ? '💻' : '📄';

  return (
    <div className={styles.artifactCard}>
      <div className={styles.artifactHeader}>
        <div className={styles.artifactTitle}>
          <span>{typeIcon}</span>
          <span>{artifact.title ?? typeLabel}</span>
          {artifact.language && <span className={styles.artifactLang}>{artifact.language}</span>}
        </div>
        <div className={styles.artifactActions}>
          {artifact.type === 'html' && (
            <button className={styles.artifactBtn} onClick={() => setShowPreview(p => !p)}>
              {showPreview ? '📝 Code' : '👁 Preview'}
            </button>
          )}
          <button className={styles.artifactBtn} onClick={handleCopy}>
            {copied ? '✓ Copied' : '📋 Copy'}
          </button>
          {artifact.type === 'html' && (
            <button className={styles.artifactBtn} onClick={() => {
              const blob = new Blob([artifact.content], { type: 'text/html' });
              const url = URL.createObjectURL(blob);
              window.open(url, '_blank');
            }}>↗ Open</button>
          )}
        </div>
      </div>
      {showPreview && artifact.type === 'html' ? (
        <iframe srcDoc={artifact.content} className={styles.artifactIframe} sandbox="allow-scripts allow-same-origin" title="Preview" />
      ) : (
        <pre className={styles.artifactCode}><code>{artifact.content}</code></pre>
      )}
    </div>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

const MessageBubble = memo(function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  const hasArtifacts = message.artifacts && message.artifacts.length > 0;
  const [showThinking, setShowThinking] = useState(false);
  const hasImages = message.contentBlocks?.some(b => b.type === 'image');

  return (
    <div className={`${styles.messageBubble} ${isUser ? styles.userBubble : styles.assistantBubble}`}>
      {!isUser && (
        <div className={styles.avatarRow}>
          <div className={styles.claudeAvatar}>✦</div>
          <span className={styles.claudeLabel}>Claude</span>
          {message.model && (
            <span className={styles.modelBadge}>
              {message.model.replace('claude-', '').replace(/-\d{8}$/, '')}
            </span>
          )}
          {message.ttft && (
            <span className={styles.modelBadge}>{message.ttft}ms TTFT</span>
          )}
        </div>
      )}

      {/* Image attachments for user messages */}
      {isUser && hasImages && (
        <div className={styles.imageAttachments}>
          {message.contentBlocks?.filter(b => b.type === 'image').map((b, i) => {
            if (b.type !== 'image') return null;
            return (
              <img
                key={i}
                src={`data:${b.source.media_type};base64,${b.source.data}`}
                alt="Attachment"
                className={styles.attachedImage}
              />
            );
          })}
        </div>
      )}

      {/* Thinking section */}
      {message.thinkingText && (
        <div className={styles.thinkingSection}>
          <button className={styles.thinkingToggle} onClick={() => setShowThinking(p => !p)}>
            🧠 {showThinking ? 'Hide' : 'Show'} thinking ({Math.round(message.thinkingText.length / 4)} tokens)
          </button>
          {showThinking && (
            <div className={styles.thinkingContent}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.thinkingText}</ReactMarkdown>
            </div>
          )}
        </div>
      )}

      {/* Main content */}
      <div className={`${styles.bubbleContent} ${isUser ? styles.userContent : styles.assistantContent}`}>
        {isUser ? (
          <p>{message.content}</p>
        ) : (() => {
          const detectedError = message.content ? detectErrorInContent(message.content) : null;
          if (detectedError) {
            return (
              <div className={styles.errorCard}>
                <div className={styles.errorCardHeader}>
                  <span className={styles.errorCardIcon}>
                    {detectedError.type === 'content_policy' ? '⚠️' :
                     detectedError.type === 'rate_limit' ? '⏳' :
                     detectedError.type === 'timeout' ? '⏱️' :
                     detectedError.type === 'server_error' ? '🛠️' : '❌'}
                  </span>
                  <span className={styles.errorCardTitle}>{detectedError.title}</span>
                </div>
                <p className={styles.errorCardMessage}>{detectedError.message}</p>
                <div className={styles.errorCardSuggestion}>
                  <strong>What to try:</strong> {detectedError.suggestion}
                </div>
              </div>
            );
          }
          return message.content ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
          ) : (
            <p className={styles.emptyResponse}>Response content unavailable. The bridge may have returned an empty response.</p>
          );
        })()}
      </div>

      {/* Artifacts */}
      {hasArtifacts && (
        <div className={styles.artifactsSection}>
          {message.artifacts!.map(a => <ArtifactCard key={a.id} artifact={a} />)}
        </div>
      )}

      {/* Message meta */}
      {!isUser && ((message.inputTokens != null && message.inputTokens > 0) || (message.outputTokens != null && message.outputTokens > 0)) && (
        <div className={styles.messageMeta}>
          {message.inputTokens != null && message.inputTokens > 0 && <span>{message.inputTokens} in</span>}
          {message.outputTokens != null && message.outputTokens > 0 && <span>{message.outputTokens} out</span>}
          {message.totalTime != null && message.totalTime > 0 && <span>{(message.totalTime / 1000).toFixed(1)}s</span>}
        </div>
      )}
    </div>
  );
});

// ─── Contextual Waiting Tips ─────────────────────────────────────────────────

const GENERAL_TIPS = [
  { icon: '💡', text: 'Use Shift+Enter for multi-line prompts' },
  { icon: '🔄', text: 'Click suggestion chips below responses to keep the conversation going' },
  { icon: '🧠', text: 'Enable extended thinking in Settings for complex reasoning' },
  { icon: '✂️', text: 'Ask "Make it shorter" or "More formal" to refine any response' },
  { icon: '🔑', text: 'Switch to Engineer mode for code generation with live preview' },
  { icon: '📝', text: 'You can edit and resend any previous message' },
  { icon: '🔍', text: 'Try asking "What questions should I be asking?" when stuck' },
  { icon: '📎', text: 'Drag & drop images directly into the chat' },
];

const WRITING_TIPS = [
  { icon: '✍️', text: 'Specify the tone: casual, professional, persuasive, empathetic' },
  { icon: '📏', text: 'Set a target length: "Keep it under 100 words"' },
  { icon: '🎯', text: 'Name the audience: "Write this for a VP" vs "for a new hire"' },
  { icon: '📧', text: 'Ask for multiple versions to compare different approaches' },
  { icon: '💬', text: 'Provide context: who, what, why — the more detail, the better' },
  { icon: '🔄', text: 'Say "Make the CTA stronger" or "Soften the opening" to iterate' },
];

const DATA_TIPS = [
  { icon: '📊', text: 'Ask for trends, outliers, or comparisons in your data' },
  { icon: '📈', text: 'Request a specific format: "Show as a ranked table"' },
  { icon: '🔢', text: 'Claude can calculate percentages, averages, and growth rates' },
  { icon: '🎯', text: 'Ask "What should I do about this?" for actionable insights' },
  { icon: '📋', text: 'Try "Simplify for executives" to get a high-level summary' },
  { icon: '⚡', text: 'Paste CSV or table data directly — Claude parses it automatically' },
];

const CODE_TIPS = [
  { icon: '💻', text: 'Specify the language and framework for more accurate code' },
  { icon: '🐛', text: 'Paste error messages directly — Claude can debug them' },
  { icon: '📖', text: 'Ask for code comments and explanations alongside the solution' },
  { icon: '🧪', text: 'Request unit tests: "Add Jest tests for this function"' },
  { icon: '🔧', text: 'Ask "Refactor this for readability" to improve existing code' },
  { icon: '🎨', text: 'Claude can generate HTML artifacts with live preview' },
];

const PLANNING_TIPS = [
  { icon: '🗓️', text: 'Ask Claude to break projects into phases with milestones' },
  { icon: '⚖️', text: 'Request pros and cons for each option to compare approaches' },
  { icon: '🎯', text: 'Specify constraints: timeline, budget, team size' },
  { icon: '📋', text: 'Ask for a prioritized action list sorted by impact' },
  { icon: '🏗️', text: 'Try "First outline, then draft each section" for long tasks' },
  { icon: '💡', text: 'Ask "What am I missing?" to surface blind spots' },
];

function detectPromptCategory(text: string): 'writing' | 'data' | 'code' | 'planning' | 'general' {
  const lower = text.toLowerCase();
  if (/\b(email|draft|write|letter|message|memo|announce|blog|post|copy|subject line)\b/.test(lower)) return 'writing';
  if (/\b(meeting notes|summary|summarize|review|hpm|self-review|feedback)\b/.test(lower)) return 'writing';
  if (/\b(data|metric|number|chart|graph|csv|table|percent|growth|revenue|analytics|kpi|dashboard)\b/.test(lower)) return 'data';
  if (/\b(code|function|bug|error|api|sql|python|javascript|typescript|react|html|css|debug|refactor|test)\b/.test(lower)) return 'code';
  if (/\b(plan|strategy|brainstorm|idea|roadmap|project|prioritize|compare|decide|pros and cons|options)\b/.test(lower)) return 'planning';
  return 'general';
}

const TIPS_BY_CATEGORY: Record<string, { icon: string; text: string }[]> = {
  writing: WRITING_TIPS,
  data: DATA_TIPS,
  code: CODE_TIPS,
  planning: PLANNING_TIPS,
  general: GENERAL_TIPS,
};

// ─── TTFT History ────────────────────────────────────────────────────────────

const TTFT_STORAGE_KEY = 'arcadia_ttft_history';
const MAX_TTFT_SAMPLES = 20;

function saveTtft(seconds: number) {
  try {
    const raw = localStorage.getItem(TTFT_STORAGE_KEY);
    const history: number[] = raw ? JSON.parse(raw) : [];
    history.push(seconds);
    if (history.length > MAX_TTFT_SAMPLES) history.shift();
    localStorage.setItem(TTFT_STORAGE_KEY, JSON.stringify(history));
  } catch { /* ignore */ }
}

function getEstimatedTtft(): number | null {
  try {
    const raw = localStorage.getItem(TTFT_STORAGE_KEY);
    const history: number[] = raw ? JSON.parse(raw) : [];
    if (history.length < 2) return null;
    // Use median for robustness against outliers
    const sorted = [...history].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  } catch { return null; }
}

// ─── ThinkingTips Component ──────────────────────────────────────────────────

function ThinkingTips({ promptText }: { promptText: string }) {
  const category = useMemo(() => detectPromptCategory(promptText), [promptText]);
  const tips = useMemo(() => {
    const contextual = TIPS_BY_CATEGORY[category] || GENERAL_TIPS;
    // Mix: 2 contextual, then 1 general, repeating
    const mixed: { icon: string; text: string }[] = [];
    let ci = 0, gi = 0;
    for (let i = 0; i < 18; i++) {
      if (i % 3 === 2) {
        mixed.push(GENERAL_TIPS[gi % GENERAL_TIPS.length]);
        gi++;
      } else {
        mixed.push(contextual[ci % contextual.length]);
        ci++;
      }
    }
    return mixed;
  }, [category]);

  const [tipIndex, setTipIndex] = useState(0);
  const [fade, setFade] = useState(true);
  const [startIndex] = useState(() => Math.floor(Math.random() * tips.length));
  const estimatedTtft = useMemo(() => getEstimatedTtft(), []);

  useEffect(() => {
    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setTipIndex(prev => (prev + 1) % tips.length);
        setFade(true);
      }, 300);
    }, 4500);
    return () => clearInterval(interval);
  }, [tips.length]);

  const tip = tips[(startIndex + tipIndex) % tips.length];

  return (
    <div className={styles.tipCarousel}>
      {estimatedTtft && (
        <div className={styles.tipEstimate}>
          Usually responds in ~{estimatedTtft}s
        </div>
      )}
      <div className={styles.tipPulseBar}>
        <div className={styles.tipPulseTrack} />
      </div>
      <div className={`${styles.tipContent} ${fade ? styles.tipVisible : styles.tipHidden}`}>
        <span className={styles.tipIcon}>{tip.icon}</span>
        <span className={styles.tipText}>{tip.text}</span>
      </div>
    </div>
  );
}

// ─── Main SimpleView ──────────────────────────────────────────────────────────

export function SimpleView() {
  const { activeConnection, updateConnection, isMetaProxy, configStatus, retryAutoConnect } = useConnection();
  const {
    getActiveConversation, addMessage, createConversation,
    isStreaming, streamingText, streamingReasoning,
    setStreaming, appendStreamingText, appendStreamingReasoning,
    getStreamingState, abortConversationStream, setAbortController,
  } = useChat();

  const [input, setInput] = useState('');
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [activitySteps, setActivitySteps] = useState<ActivityStep[]>([]);
  // showActivity removed — progress is now inline in the response bubble
  const [error, setError] = useState('');
  const [followUps, setFollowUps] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [showThinkingLive, setShowThinkingLive] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesAreaRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const userScrolledUpRef = useRef(false);

  const conversation = getActiveConversation();
  const messages = conversation?.messages ?? [];

  // Smart auto-scroll: only scroll to bottom if user hasn't scrolled up
  useEffect(() => {
    if (!userScrolledUpRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamingText]);

  // Detect when user scrolls up manually
  useEffect(() => {
    const area = messagesAreaRef.current;
    if (!area) return;
    const handleScroll = () => {
      const distanceFromBottom = area.scrollHeight - area.scrollTop - area.clientHeight;
      // If user is more than 150px from bottom, they've scrolled up
      userScrolledUpRef.current = distanceFromBottom > 150;
    };
    area.addEventListener('scroll', handleScroll, { passive: true });
    return () => area.removeEventListener('scroll', handleScroll);
  }, []);

  // Reset scroll lock when a new message is sent by the user
  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role === 'user') {
      userScrolledUpRef.current = false;
    }
  }, [messages.length]);

  // Debounce streaming text for ReactMarkdown to avoid re-parsing on every token.
  // Updates at most every 80ms during streaming, giving smooth visual updates
  // without the cost of full markdown parsing on each token.
  const [debouncedStreamingText, setDebouncedStreamingText] = useState('');
  useEffect(() => {
    if (!isStreaming) {
      setDebouncedStreamingText(streamingText);
      return;
    }
    const timer = setTimeout(() => {
      setDebouncedStreamingText(streamingText);
    }, 80);
    return () => clearTimeout(timer);
  }, [streamingText, isStreaming]);

  const setStep = useCallback((id: string, status: ActivityStep['status'], detail?: string) => {
    setActivitySteps(prev => prev.map(s => s.id === id ? { ...s, status, detail: detail ?? s.detail } : s));
  }, []);

  const handleSend = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text && images.length === 0) return;
    if (!activeConnection) { setError('No connection configured. Go to Settings to add your API key.'); return; }

    // Ensure conversation exists
    let convId = conversation?.id;
    if (!convId) {
      convId = createConversation(activeConnection.model);
    }

    // If this conversation is already streaming, abort and save partial response
    const currentStreamState = getStreamingState(convId);
    if (currentStreamState.isStreaming) {
      const partialText = abortConversationStream(convId);
      if (partialText.trim()) {
        const partialMsg: Message = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: partialText + '\n\n*[Response interrupted]*',
          timestamp: Date.now(),
          model: activeConnection.model,
        };
        addMessage(convId, partialMsg);
      }
      // Brief pause to let abort propagate
      await new Promise(r => setTimeout(r, 50));
    }

    setError('');
    setInput('');
    setImages([]);
    setFollowUps([]);

    // Build user message
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
      model: activeConnection.model,
    };

    // Attach images if any
    if (images.length > 0) {
      userMsg.contentBlocks = [
        ...images.map(img => ({
          type: 'image' as const,
          source: { type: 'base64' as const, media_type: img.mediaType, data: img.data },
        })),
        { type: 'text' as const, text },
      ];
    }

    addMessage(convId, userMsg);
    trackMessage(userMsg, convId);

    // Build activity steps — unified for all connection types
    const steps: ActivityStep[] = [
      { id: 'thinking', label: 'Claude is thinking...', status: 'active', icon: '🧠' },
      { id: 'writing', label: 'Writing response', status: 'pending', icon: '✍️' },
      { id: 'artifacts', label: 'Preparing results', status: 'pending', icon: '📦' },
    ];
    setActivitySteps(steps);
    // Progress shown inline in response bubble

    setStreaming(convId, true);
    setShowThinkingLive(false);

    const controller = new AbortController();
    setAbortController(convId, controller);

    // Elapsed time counter
    const sendStartTime = Date.now();
    const elapsedTimer = setInterval(() => {
      const elapsed = Math.round((Date.now() - sendStartTime) / 1000);
      setActivitySteps(prev => prev.map(s =>
        s.id === 'thinking' && s.status === 'active'
          ? { ...s, detail: `${elapsed}s` }
          : s
      ));
    }, 1000);

    const allMessages = [...(conversation?.messages ?? []), userMsg];

    try {
      let firstToken = false;
      const result = await sendMessage({
        connection: activeConnection,
        messages: allMessages,
        systemPrompt: conversation?.systemPrompt,
        enableThinking: conversation?.enableThinking ?? activeConnection.enableThinking,
        thinkingBudget: conversation?.thinkingBudget ?? activeConnection.thinkingBudget,
        onToken: (chunk) => {
          if (!firstToken) {
            firstToken = true;
            clearInterval(elapsedTimer);
            const ttftMs = Date.now() - sendStartTime;
            const ttftSec = (ttftMs / 1000).toFixed(1);
            saveTtft(Math.round(ttftMs / 1000));
            setStep('thinking', 'done', `${ttftSec}s`);
            setStep('writing', 'active', 'Streaming...');
          }
          appendStreamingText(convId!, chunk);
        },
        onThinking: (chunk) => {
          appendStreamingReasoning(convId!, chunk);
        },
        signal: controller.signal,
      });

      setStep('writing', 'done');
      setStep('artifacts', 'active', `Found ${result.artifacts.length} artifact${result.artifacts.length !== 1 ? 's' : ''}`);

      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: result.content,
        timestamp: Date.now(),
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        artifacts: result.artifacts,
        thinkingText: result.thinkingText,
        toolCalls: result.toolCalls?.map(tc => ({ ...tc, type: 'tool_use' as const })) as ToolUseBlock[] | undefined,
        model: activeConnection.model,
        ttft: result.ttft,
        totalTime: result.totalTime,
      };

      addMessage(convId, assistantMsg);
      trackMessage(assistantMsg, convId);
      setStep('artifacts', 'done', result.artifacts.length > 0
        ? `${result.artifacts.length} artifact${result.artifacts.length !== 1 ? 's' : ''} ready`
        : 'Done');

      // Generate contextual follow-up suggestions
      setFollowUps(getFollowUpSuggestions(result.content));

      // Progress auto-clears when streaming ends
    } catch (err: unknown) {
      clearInterval(elapsedTimer);
      if (err instanceof Error && err.name === 'AbortError') {
        setActivitySteps(prev => prev.map(s => s.status === 'active' ? { ...s, status: 'error', detail: 'Stopped' } : s));
        // Progress auto-clears when streaming ends
      } else {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        setError(msg);
        setActivitySteps(prev => prev.map(s => s.status === 'active' ? { ...s, status: 'error', detail: msg } : s));
      }
    } finally {
      clearInterval(elapsedTimer);
      setStreaming(convId!, false);
      setAbortController(convId!, null);
    }
  }, [input, images, activeConnection, conversation, createConversation, addMessage,
    setStreaming, appendStreamingText, appendStreamingReasoning, setStep,
    getStreamingState, abortConversationStream, setAbortController]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    processFiles(Array.from(e.target.files ?? []));
    e.target.value = '';
  };

  const processFiles = (files: File[]) => {
    files.forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        const [header, data] = dataUrl.split(',');
        const mediaType = header.match(/data:([^;]+)/)?.[1] as ImageAttachment['mediaType'] ?? 'image/jpeg';
        setImages(prev => [...prev, {
          id: crypto.randomUUID(),
          name: file.name,
          mediaType,
          data,
          previewUrl: dataUrl,
        }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    processFiles(Array.from(e.dataTransfer.files));
  };

  const handleStop = () => {
    if (conversation?.id) {
      abortConversationStream(conversation.id);
    }
  };

  const isEmpty = messages.length === 0;

  return (
    <div
      className={styles.container}
      onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className={styles.dropOverlay}>
          <div className={styles.dropMessage}>📎 Drop image to attach</div>
        </div>
      )}

      {/* Messages area */}
      <div className={styles.messagesArea} ref={messagesAreaRef}>
        {isEmpty && !isStreaming ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyLogo}>✦</div>
            <h1 className={styles.emptyTitle}>What can I help you with?</h1>
            <p className={styles.emptySubtitle}>
              Powered by {activeConnection ? activeConnection.label : 'Claude'}
              {activeConnection && (
                <span className={styles.modelSelectorWrapper}>
                  <button
                    className={styles.modelPill}
                    onClick={() => setShowModelSelector(!showModelSelector)}
                    title="Click to change model"
                  >
                    {activeConnection.model.replace('claude-', '').replace(/-\d{8}$/, '')}
                    <span className={styles.modelPillArrow}>{showModelSelector ? '▲' : '▼'}</span>
                  </button>
                  {showModelSelector && (
                    <div className={styles.modelDropdown}>
                      <div className={styles.modelDropdownHeader}>Select Model</div>
                      {CLAUDE_MODELS.map(m => (
                        <button
                          key={m.id}
                          className={`${styles.modelOption} ${activeConnection.model === m.id ? styles.modelOptionActive : ''}`}
                          onClick={() => {
                            updateConnection(activeConnection.id, { model: m.id });
                            setShowModelSelector(false);
                          }}
                        >
                          <div className={styles.modelOptionMain}>
                            <span className={styles.modelOptionName}>{m.label}</span>
                            {m.badge && <span className={styles.modelOptionBadge}>{m.badge}</span>}
                          </div>
                          <div className={styles.modelOptionDesc}>{m.desc}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </span>
              )}
            </p>
            {/* Auto-config progress + bridge setup prompt */}
            {configStatus.phase !== 'ready' && configStatus.phase !== 'idle' && (
              <div className={styles.autoConfigBanner}>
                {configStatus.phase === 'error' ? (
                  <BridgeSetupPrompt onRetry={retryAutoConnect} />
                ) : (
                  <>
                    <div className={styles.configMessage}>
                      <span className={styles.configSpinner} />
                      {configStatus.message}
                    </div>
                    {configStatus.detail && (
                      <div className={styles.configDetail}>{configStatus.detail}</div>
                    )}
                    <div className={styles.progressBar}>
                      <div className={styles.progressFill} style={{ width: `${configStatus.progress}%` }} />
                    </div>
                    <div className={styles.progressLabel}>{configStatus.progress}% complete</div>
                  </>
                )}
              </div>
            )}
            {activeConnection && (
              <div className={styles.metaProxyBadge}>
                {isMetaProxy ? '🏢 Connected via Meta corporate account' : `✓ Connected — ${activeConnection.model.replace('claude-', '').replace(/-\d{8}$/, '')}`}
              </div>
            )}
            <div className={styles.suggestions}>
              {SUGGESTIONS.map(s => (
                <button
                  key={s.label}
                  className={styles.suggestionBtn}
                  onClick={() => handleSend(s.prompt)}
                >
                  <span className={styles.suggestionIcon}>{s.icon}</span>
                  <span>{s.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className={styles.messageList}>
            {messages.map(msg => <MessageBubble key={msg.id} message={msg} />)}
            {isStreaming && (
              <div className={`${styles.messageBubble} ${styles.assistantBubble}`}>
                <div className={styles.avatarRow}>
                  <div className={styles.claudeAvatar}>✦</div>
                  <span className={styles.claudeLabel}>Claude</span>
                </div>
                {streamingReasoning && (
                  <div className={styles.thinkingSection}>
                    <button
                      className={styles.thinkingToggle}
                      onClick={() => setShowThinkingLive(p => !p)}
                    >
                      🧠 {showThinkingLive ? 'Hide' : 'Show'} thinking ({Math.round(streamingReasoning.length / 4)} tokens)
                    </button>
                    {showThinkingLive && (
                      <div className={styles.thinkingContent}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingReasoning}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                )}
                <div className={`${styles.bubbleContent} ${styles.assistantContent}`}>
                  {debouncedStreamingText ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{debouncedStreamingText}</ReactMarkdown>
                  ) : (
                    <div className={styles.inlineProgress}>
                      {activitySteps.length > 0 ? (
                        <>
                          {(() => {
                            const activeStep = activitySteps.find(s => s.status === 'active');
                            const doneSteps = activitySteps.filter(s => s.status === 'done');
                            const isThinking = activeStep?.id === 'thinking';
                            return (
                              <>
                                {doneSteps.map(s => (
                                  <div key={s.id} className={styles.inlineStepDone}>
                                    <span className={styles.inlineCheck}>✓</span>
                                    <span>{s.label.replace('...', '')}</span>
                                    {s.detail && <span className={styles.inlineStepTime}>{s.detail}</span>}
                                  </div>
                                ))}
                                {activeStep && (
                                  <div className={styles.inlineStepActive}>
                                    <span className={styles.inlineSpinner} />
                                    <span>{activeStep.label}</span>
                                    {activeStep.detail && <span className={styles.inlineStepDetail}>{activeStep.detail}</span>}
                                  </div>
                                )}
                                {isThinking && <ThinkingTips promptText={messages[messages.length - 1]?.content || ''} />}
                              </>
                            );
                          })()}
                        </>
                      ) : (
                        <span className={styles.typingDots}><span /><span /><span /></span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className={styles.errorBanner}>
          <span>⚠ {error}</span>
          <button onClick={() => setError('')}>✕</button>
        </div>
      )}

      {/* Follow-up suggestions */}
      {followUps.length > 0 && !isStreaming && messages.length > 0 && (
        <div className={styles.followUpRow}>
          {followUps.map(f => (
            <button
              key={f}
              className={styles.followUpBtn}
              onClick={() => handleSend(f)}
            >
              {f}
            </button>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className={styles.inputArea}>
        {/* Image previews */}
        {images.length > 0 && (
          <div className={styles.imagePreviews}>
            {images.map(img => (
              <div key={img.id} className={styles.imagePreviewItem}>
                <img src={img.previewUrl} alt={img.name} className={styles.imagePreviewThumb} />
                <button
                  className={styles.imageRemoveBtn}
                  onClick={() => setImages(prev => prev.filter(i => i.id !== img.id))}
                >×</button>
              </div>
            ))}
          </div>
        )}

        <div className={styles.inputRow}>
          <button
            className={styles.attachBtn}
            onClick={() => fileInputRef.current?.click()}
            title="Attach image"
          >📎</button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleImageUpload}
            style={{ display: 'none' }}
          />
          <textarea
            ref={textareaRef}
            className={styles.textarea}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Claude anything... (Shift+Enter for new line)"
            rows={1}
            style={{ resize: 'none' }}
          />
          {isStreaming && (
            <button className={styles.stopBtn} onClick={handleStop} title="Stop generation">⏹</button>
          )}
          <button
            className={styles.sendBtn}
            onClick={() => handleSend()}
            disabled={!input.trim() && images.length === 0}
            title={isStreaming ? 'Send follow-up (interrupts current response)' : 'Send (Enter)'}
          >↑</button>
        </div>
        <div className={styles.inputHint}>
          Enter to send · Shift+Enter for new line · Drag & drop images
        </div>
      </div>
    </div>
  );
}
