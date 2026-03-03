import { useState, useCallback, useRef, useEffect, memo } from 'react';
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
  { icon: '📋', label: 'HPM Self-Review', prompt: 'Help me draft my HPM self-review for this half. I\'m a software engineer. Include sections for Impact, Execution, and Collaboration. Ask me clarifying questions about my projects and accomplishments before writing the draft.' },
  { icon: '📝', label: 'Write a design doc', prompt: 'Help me write a technical design document. Include sections for: Problem Statement, Proposed Solution, Architecture Overview, Data Model, API Design, Rollout Plan, and Open Questions. Start by asking me what the feature is about.' },
  { icon: '💻', label: 'Write a React component', prompt: 'Write a React component in TypeScript with hooks. It should be a reusable data table with sorting, filtering, and pagination. Include proper types and follow Meta\'s coding conventions.' },
  { icon: '🐛', label: 'Debug help', prompt: 'Help me debug an issue. I\'ll describe the symptoms and share relevant code. Walk me through a systematic debugging approach and suggest potential fixes.' },
  { icon: '📊', label: 'Presto query', prompt: 'Help me write a Presto SQL query to analyze user engagement metrics. I need to aggregate daily active users, session duration, and retention rates from our events table, broken down by platform.' },
  { icon: '✍️', label: 'Peer review draft', prompt: 'Help me write a thoughtful peer review for a colleague. I want to highlight their strengths, provide constructive feedback, and suggest growth areas. Ask me about their contributions first.' },
];

// ─── Follow-up suggestions based on response type ─────────────────────────────

function getFollowUpSuggestions(content: string): string[] {
  const lower = content.toLowerCase();
  if (lower.includes('```html') || lower.includes('landing page') || lower.includes('website')) {
    return ['Add a dark mode toggle', 'Make it mobile responsive', 'Add animations', 'Add a pricing section'];
  }
  if (lower.includes('```python') || lower.includes('```javascript') || lower.includes('```typescript')) {
    return ['Add error handling', 'Write unit tests for this', 'Optimize for performance', 'Add documentation'];
  }
  if (lower.includes('email') || lower.includes('write') || lower.includes('draft')) {
    return ['Make it more formal', 'Make it shorter', 'Add bullet points', 'Translate to Spanish'];
  }
  if (lower.includes('explain') || lower.includes('how') || lower.includes('what is')) {
    return ['Give me a practical example', 'Go deeper on this', 'Explain like I\'m 5', 'What are the downsides?'];
  }
  return ['Tell me more', 'Give me an example', 'How do I use this?', 'What are alternatives?'];
}

// ─── Bridge Setup Prompt ─────────────────────────────────────────────────────

const SETUP_COMMAND = 'curl -sL https://raw.githubusercontent.com/ikosoymeta/Arcadia/main/bridge/setup.sh | bash';
const COMMAND_FILE_URL = 'https://raw.githubusercontent.com/ikosoymeta/Arcadia/main/bridge/Start-ArcadIA-Bridge.command';
const MANUAL_START_CMD = 'node ~/.arcadia-bridge/arcadia-bridge.js';

interface DiagState {
  bridge: 'checking' | 'ok' | 'fail';
  bridgeVersion: string;
  lastCheck: string;
}

function BridgeSetupPrompt({ onRetry }: { onRetry: () => void }) {
  const [copied, setCopied] = useState(false);
  const [step, setStep] = useState<'setup' | 'waiting'>('setup');
  const [showDiag, setShowDiag] = useState(false);
  const [diag, setDiag] = useState<DiagState>({ bridge: 'checking', bridgeVersion: '', lastCheck: '' });

  // Run diagnostics
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
      } else {
        setDiag(d => ({ ...d, bridge: 'fail', lastCheck: new Date().toLocaleTimeString() }));
      }
    } catch {
      setDiag(d => ({ ...d, bridge: 'fail', lastCheck: new Date().toLocaleTimeString() }));
    }
  }, []);

  useEffect(() => {
    if (showDiag) runDiagnostics();
  }, [showDiag, runDiagnostics]);

  // Auto-poll when in waiting state
  useEffect(() => {
    if (step !== 'waiting') return;
    const interval = setInterval(() => {
      runDiagnostics();
      onRetry();
    }, 3000);
    return () => clearInterval(interval);
  }, [step, onRetry, runDiagnostics]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(SETUP_COMMAND);
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

  const handleDone = () => {
    setStep('waiting');
    runDiagnostics();
    onRetry();
  };

  return (
    <div className={styles.bridgeSetup}>
      {step === 'setup' ? (
        <>
          <div className={styles.bridgeTitle}>
            <span className={styles.bridgeIcon}>⚡</span>
            Connect to Claude
          </div>
          <div className={styles.bridgeSubtitle}>
            ArcadIA needs a small local bridge to connect to Claude Code on your Mac.
            Choose one of the options below to get started.
          </div>

          <div className={styles.bridgeSteps}>
            <div className={styles.bridgeStep}>
              <span className={styles.stepNum}>A</span>
              <span><strong>Option A:</strong> One-click setup (recommended)</span>
            </div>
          </div>

          <div className={styles.cmdBox}>
            <code className={styles.cmdText} style={{ flex: 1, textAlign: 'center', fontSize: '12px' }}>Download → double-click → done</code>
            <a
              href={COMMAND_FILE_URL}
              download="Start-ArcadIA-Bridge.command"
              className={styles.copyBtn}
              style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              ⬇ Download Bridge
            </a>
          </div>

          <div className={styles.bridgeNote} style={{ marginBottom: '16px' }}>
            After downloading, double-click the file. If macOS blocks it, right-click → Open.
            Keep the terminal window open while using ArcadIA.
          </div>

          <div className={styles.bridgeSteps}>
            <div className={styles.bridgeStep}>
              <span className={styles.stepNum}>B</span>
              <span><strong>Option B:</strong> Terminal command</span>
            </div>
          </div>

          <div className={styles.cmdBox}>
            <code id="bridge-cmd" className={styles.cmdText}>{SETUP_COMMAND}</code>
            <button className={styles.copyBtn} onClick={handleCopy}>
              {copied ? '✓ Copied!' : '📋 Copy'}
            </button>
          </div>

          <button className={styles.doneBtn} onClick={handleDone}>
            ✅ I've started the bridge
          </button>

          <div className={styles.bridgeNote}>
            Already set up? Just run: <code style={{ fontSize: '11px', background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: '4px' }}>{MANUAL_START_CMD}</code>
          </div>

          {/* Connection Diagnostics */}
          <div className={styles.diagnostics}>
            <button className={styles.diagToggle} onClick={() => setShowDiag(!showDiag)}>
              {showDiag ? '▼' : '▶'} Connection diagnostics
            </button>
            {showDiag && (
              <div className={styles.diagPanel}>
                <div className={styles.diagRow}>
                  <span className={styles.diagLabel}>ArcadIA Bridge</span>
                  <span className={`${styles.diagValue} ${diag.bridge === 'ok' ? styles.diagOk : diag.bridge === 'fail' ? styles.diagFail : styles.diagWarn}`}>
                    <span className={`${styles.diagDot} ${diag.bridge === 'ok' ? styles.diagDotGreen : diag.bridge === 'fail' ? styles.diagDotRed : styles.diagDotYellow}`} />
                    {diag.bridge === 'checking' ? 'Checking...' : diag.bridge === 'ok' ? `Running (v${diag.bridgeVersion})` : 'Not detected'}
                  </span>
                </div>
                <div className={styles.diagRow}>
                  <span className={styles.diagLabel}>Proxy endpoint</span>
                  <span className={styles.diagValue}>localhost:8087</span>
                </div>
                <div className={styles.diagRow}>
                  <span className={styles.diagLabel}>Last checked</span>
                  <span className={styles.diagValue}>{diag.lastCheck || '—'}</span>
                </div>
                <button className={styles.retryBtn} onClick={runDiagnostics} style={{ marginTop: '8px', width: '100%' }}>
                  Re-check now
                </button>

                <div className={styles.troubleshoot}>
                  <div className={styles.troubleshootTitle}>Troubleshooting</div>
                  <ul className={styles.troubleshootList}>
                    <li>Make sure Claude Code is installed: run <code>claude --version</code></li>
                    <li>Make sure Node.js is installed: run <code>node --version</code></li>
                    <li>Try running the setup command again (see above)</li>
                    <li>Check if the bridge is running: <code>lsof -i :8087</code></li>
                    <li>Restart the bridge: <code>node ~/.arcadia-bridge/arcadia-bridge.js</code></li>
                    <li>Need help? <a href="mailto:ikosoy@meta.com?subject=ArcadIA%20Editor%20Support" style={{ color: 'var(--accent)' }}>Contact support</a></li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className={styles.bridgeTitle}>
            <span className={styles.bridgePulse} />
            Looking for connection...
          </div>
          <div className={styles.bridgeSubtitle}>
            Waiting for the bridge to start. This usually takes 2–3 seconds.
            The app will auto-connect as soon as it detects the bridge.
          </div>
          <div className={styles.progressBar}>
            <div className={styles.progressIndeterminate} />
          </div>

          {/* Live diagnostics while waiting */}
          <div className={styles.diagPanel} style={{ marginTop: '14px' }}>
            <div className={styles.diagRow}>
              <span className={styles.diagLabel}>Bridge status</span>
              <span className={`${styles.diagValue} ${diag.bridge === 'ok' ? styles.diagOk : styles.diagFail}`}>
                <span className={`${styles.diagDot} ${diag.bridge === 'ok' ? styles.diagDotGreen : styles.diagDotRed}`} />
                {diag.bridge === 'checking' ? 'Checking...' : diag.bridge === 'ok' ? 'Connected!' : 'Waiting...'}
              </span>
            </div>
            <div className={styles.diagRow}>
              <span className={styles.diagLabel}>Last checked</span>
              <span className={styles.diagValue}>{diag.lastCheck || '—'}</span>
            </div>
            <div className={styles.diagRow}>
              <span className={styles.diagLabel}>Auto-retry</span>
              <span className={`${styles.diagValue} ${styles.diagOk}`}>Every 3 seconds</span>
            </div>
          </div>

          <button className={styles.retryBtn} onClick={() => { runDiagnostics(); onRetry(); }} style={{ marginTop: '12px' }}>
            Check now
          </button>
          <button className={styles.backLink} onClick={() => setStep('setup')}>
            ← Back to setup instructions
          </button>
        </>
      )}
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

// ─── Activity Feed ────────────────────────────────────────────────────────────

function ActivityFeed({ steps }: { steps: ActivityStep[] }) {
  return (
    <div className={styles.activityFeed}>
      {steps.map(step => (
        <div key={step.id} className={`${styles.activityStep} ${styles[`step_${step.status}`]}`}>
          <div className={styles.stepIconWrap}>
            {step.status === 'active' && <span className={styles.spinnerDot} />}
            {step.status === 'done' && <span className={styles.stepCheck}>✓</span>}
            {step.status === 'error' && <span className={styles.stepError}>✗</span>}
            {step.status === 'pending' && <span className={styles.stepPending}>{step.icon}</span>}
          </div>
          <div className={styles.stepBody}>
            <div className={styles.stepLabel}>{step.label}</div>
            {step.detail && <div className={styles.stepDetail}>{step.detail}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main SimpleView ──────────────────────────────────────────────────────────

export function SimpleView() {
  const { activeConnection, updateConnection, isMetaProxy, configStatus, retryAutoConnect } = useConnection();
  const {
    getActiveConversation, addMessage, createConversation,
    isStreaming, setStreaming, streamingText, setStreamingText,
    appendStreamingText, streamingReasoning, setStreamingReasoning, appendStreamingReasoning,
  } = useChat();

  const [input, setInput] = useState('');
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [activitySteps, setActivitySteps] = useState<ActivityStep[]>([]);
  const [showActivity, setShowActivity] = useState(false);
  const [error, setError] = useState('');
  const [followUps, setFollowUps] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
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
    if (isStreaming) return;

    setError('');
    setInput('');
    setImages([]);
    setFollowUps([]);

    // Ensure conversation exists
    let convId = conversation?.id;
    if (!convId) {
      convId = createConversation(activeConnection.model);
    }

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

    // Build activity steps
    const steps: ActivityStep[] = [
      { id: 'thinking', label: 'Claude is thinking...', status: 'active', icon: '🧠' },
      { id: 'writing', label: 'Writing response', status: 'pending', icon: '✍️' },
      { id: 'artifacts', label: 'Preparing results', status: 'pending', icon: '📦' },
    ];
    setActivitySteps(steps);
    setShowActivity(true);

    setStreaming(true);
    setStreamingText('');
    setStreamingReasoning('');

    abortRef.current = new AbortController();

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
            setStep('thinking', 'done');
            setStep('writing', 'active', 'Streaming response...');
          }
          appendStreamingText(chunk);
        },
        onThinking: (chunk) => {
          appendStreamingReasoning(chunk);
        },
        signal: abortRef.current.signal,
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

      setTimeout(() => setShowActivity(false), 2000);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        setActivitySteps(prev => prev.map(s => s.status === 'active' ? { ...s, status: 'error', detail: 'Stopped' } : s));
        setTimeout(() => setShowActivity(false), 1500);
      } else {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        setError(msg);
        setActivitySteps(prev => prev.map(s => s.status === 'active' ? { ...s, status: 'error', detail: msg } : s));
      }
    } finally {
      setStreaming(false);
      setStreamingText('');
      setStreamingReasoning('');
    }
  }, [input, images, activeConnection, isStreaming, conversation, createConversation, addMessage,
    setStreaming, setStreamingText, appendStreamingText, setStreamingReasoning, appendStreamingReasoning, setStep]);

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
    abortRef.current?.abort();
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
                    <div className={styles.thinkingLive}>
                      🧠 <span>Thinking...</span>
                    </div>
                  </div>
                )}
                <div className={`${styles.bubbleContent} ${styles.assistantContent}`}>
                  {debouncedStreamingText ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{debouncedStreamingText}</ReactMarkdown>
                  ) : (
                    <span className={styles.typingDots}><span /><span /><span /></span>
                  )}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Activity feed overlay */}
      {showActivity && activitySteps.length > 0 && (
        <div className={styles.activityOverlay}>
          <ActivityFeed steps={activitySteps} />
        </div>
      )}

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
          {isStreaming ? (
            <button className={styles.stopBtn} onClick={handleStop} title="Stop generation">⏹</button>
          ) : (
            <button
              className={styles.sendBtn}
              onClick={() => handleSend()}
              disabled={!input.trim() && images.length === 0}
              title="Send (Enter)"
            >↑</button>
          )}
        </div>
        <div className={styles.inputHint}>
          Enter to send · Shift+Enter for new line · Drag & drop images
        </div>
      </div>
    </div>
  );
}
