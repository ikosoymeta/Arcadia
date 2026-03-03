import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useConnection } from '../../store/ConnectionContext';
import { useChat } from '../../store/ChatContext';
import { sendMessage } from '../../services/claude';
import type { Message, Artifact, ImageAttachment, ToolUseBlock } from '../../types';
import styles from './SimpleView.module.css';

// ─── Quick suggestion prompts ─────────────────────────────────────────────────

const SUGGESTIONS = [
  { icon: '🌐', label: 'Build a website', prompt: 'Build me a beautiful landing page for a tech startup with a hero section, features, and contact form' },
  { icon: '📝', label: 'Write an email', prompt: 'Write a professional email to schedule a meeting with a client' },
  { icon: '🔍', label: 'Explain a concept', prompt: 'Explain how machine learning works in simple terms' },
  { icon: '🐛', label: 'Debug my code', prompt: 'Help me debug this code and explain what\'s wrong' },
  { icon: '📊', label: 'Analyze data', prompt: 'Help me analyze and visualize this dataset' },
  { icon: '✍️', label: 'Write content', prompt: 'Write a compelling blog post about the future of AI' },
];

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
            <button
              className={styles.artifactBtn}
              onClick={() => setShowPreview(p => !p)}
            >
              {showPreview ? '📝 Code' : '👁 Preview'}
            </button>
          )}
          <button className={styles.artifactBtn} onClick={handleCopy}>
            {copied ? '✓ Copied' : '📋 Copy'}
          </button>
          {artifact.type === 'html' && (
            <button
              className={styles.artifactBtn}
              onClick={() => {
                const blob = new Blob([artifact.content], { type: 'text/html' });
                const url = URL.createObjectURL(blob);
                window.open(url, '_blank');
              }}
            >
              ↗ Open
            </button>
          )}
        </div>
      </div>
      {showPreview && artifact.type === 'html' ? (
        <iframe
          srcDoc={artifact.content}
          className={styles.artifactIframe}
          sandbox="allow-scripts allow-same-origin"
          title="Preview"
        />
      ) : (
        <pre className={styles.artifactCode}>
          <code>{artifact.content}</code>
        </pre>
      )}
    </div>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  const hasArtifacts = message.artifacts && message.artifacts.length > 0;
  const hasThinking = !!message.thinkingText;
  const [showThinking, setShowThinking] = useState(false);

  return (
    <div className={`${styles.messageBubble} ${isUser ? styles.userBubble : styles.assistantBubble}`}>
      {!isUser && (
        <div className={styles.avatarRow}>
          <div className={styles.claudeAvatar}>✦</div>
          <span className={styles.claudeLabel}>Claude</span>
          {message.model && <span className={styles.modelBadge}>{message.model.split('-').slice(0, 3).join(' ')}</span>}
        </div>
      )}
      {isUser && message.contentBlocks?.some(b => b.type === 'image') && (
        <div className={styles.imageAttachments}>
          {message.contentBlocks.filter(b => b.type === 'image').map((b, i) => {
            const img = b as { type: 'image'; source: { data: string; media_type: string } };
            return (
              <img
                key={i}
                src={`data:${img.source.media_type};base64,${img.source.data}`}
                alt="attachment"
                className={styles.attachedImage}
              />
            );
          })}
        </div>
      )}
      <div className={`${styles.bubbleContent} ${isUser ? styles.userContent : styles.assistantContent}`}>
        {isUser ? (
          <p>{message.content}</p>
        ) : (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
        )}
      </div>
      {hasThinking && (
        <div className={styles.thinkingSection}>
          <button className={styles.thinkingToggle} onClick={() => setShowThinking(p => !p)}>
            🧠 {showThinking ? 'Hide' : 'Show'} reasoning ({Math.round((message.thinkingText?.length ?? 0) / 4)} tokens)
          </button>
          {showThinking && (
            <div className={styles.thinkingContent}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.thinkingText!}</ReactMarkdown>
            </div>
          )}
        </div>
      )}
      {hasArtifacts && (
        <div className={styles.artifactsSection}>
          {message.artifacts!.map(a => <ArtifactCard key={a.id} artifact={a} />)}
        </div>
      )}
      {message.totalTime && (
        <div className={styles.messageMeta}>
          {message.outputTokens && <span>{message.outputTokens} tokens</span>}
          {message.ttft && <span>TTFT {message.ttft.toFixed(0)}ms</span>}
          <span>{(message.totalTime / 1000).toFixed(1)}s</span>
        </div>
      )}
    </div>
  );
}

// ─── Activity Feed ────────────────────────────────────────────────────────────

function ActivityFeed({ steps }: { steps: ActivityStep[] }) {
  return (
    <div className={styles.activityFeed}>
      {steps.map(step => (
        <div key={step.id} className={`${styles.activityStep} ${styles[`step_${step.status}`]}`}>
          <div className={styles.stepIconWrap}>
            {step.status === 'active' ? (
              <span className={styles.spinnerDot} />
            ) : step.status === 'done' ? (
              <span className={styles.stepCheck}>✓</span>
            ) : step.status === 'error' ? (
              <span className={styles.stepError}>✗</span>
            ) : (
              <span className={styles.stepPending}>{step.icon}</span>
            )}
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
  const { activeConnection } = useConnection();
  const { getActiveConversation, addMessage, createConversation, isStreaming, setStreaming, streamingText, setStreamingText, appendStreamingText, streamingReasoning, setStreamingReasoning, appendStreamingReasoning } = useChat();

  const [input, setInput] = useState('');
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [activitySteps, setActivitySteps] = useState<ActivityStep[]>([]);
  const [showActivity, setShowActivity] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const conversation = getActiveConversation();
  const messages = conversation?.messages ?? [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  const setStep = useCallback((id: string, status: ActivityStep['status'], detail?: string) => {
    setActivitySteps(prev => prev.map(s => s.id === id ? { ...s, status, detail: detail ?? s.detail } : s));
  }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text && images.length === 0) return;
    if (!activeConnection) { setError('No connection configured. Go to Settings to add your API key.'); return; }
    if (isStreaming) return;

    setError('');
    setInput('');
    setImages([]);

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
      setStep('artifacts', 'done', result.artifacts.length > 0 ? `${result.artifacts.length} artifact${result.artifacts.length !== 1 ? 's' : ''} ready` : 'Done');

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
  }, [input, images, activeConnection, isStreaming, conversation, createConversation, addMessage, setStreaming, setStreamingText, appendStreamingText, setStreamingReasoning, appendStreamingReasoning, setStep]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    files.forEach(file => {
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
    e.target.value = '';
  };

  const isEmpty = messages.length === 0;

  return (
    <div className={styles.container}>
      {/* Messages area */}
      <div className={styles.messagesArea}>
        {isEmpty && !isStreaming ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyLogo}>✦</div>
            <h1 className={styles.emptyTitle}>What can I help you with?</h1>
            <p className={styles.emptySubtitle}>
              Powered by {activeConnection ? activeConnection.label : 'Claude'}
              {activeConnection && <span className={styles.modelPill}>{activeConnection.model.split('-').slice(1, 4).join(' ')}</span>}
            </p>
            {!activeConnection && (
              <div className={styles.noConnectionBanner}>
                ⚠ No API key configured.{' '}
                <button className={styles.inlineLinkBtn} onClick={() => {
                  document.dispatchEvent(new CustomEvent('arcadia:navigate', { detail: 'settings' }));
                }}>
                  Open Settings →
                </button>
              </div>
            )}
            <div className={styles.suggestions}>
              {SUGGESTIONS.map(s => (
                <button
                  key={s.label}
                  className={styles.suggestionBtn}
                  onClick={() => { setInput(s.prompt); textareaRef.current?.focus(); }}
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
                  {streamingText ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingText}</ReactMarkdown>
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

      {/* Input area */}
      <div className={styles.inputArea}>
        {images.length > 0 && (
          <div className={styles.imagePreviewRow}>
            {images.map(img => (
              <div key={img.id} className={styles.imagePreviewItem}>
                <img src={img.previewUrl} alt={img.name} className={styles.imageThumb} />
                <button className={styles.removeImageBtn} onClick={() => setImages(prev => prev.filter(i => i.id !== img.id))}>✕</button>
              </div>
            ))}
          </div>
        )}
        <div className={styles.inputRow}>
          <button
            className={styles.attachBtn}
            onClick={() => fileInputRef.current?.click()}
            title="Attach image"
          >
            📎
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            multiple
            style={{ display: 'none' }}
            onChange={handleImageUpload}
          />
          <textarea
            ref={textareaRef}
            className={styles.inputBox}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={activeConnection ? 'Ask Claude anything... (Shift+Enter for new line)' : 'Add your API key in Settings to start chatting'}
            rows={1}
            disabled={!activeConnection || isStreaming}
          />
          {isStreaming ? (
            <button
              className={styles.stopBtn}
              onClick={() => abortRef.current?.abort()}
            >
              ⏹ Stop
            </button>
          ) : (
            <button
              className={styles.sendBtn}
              onClick={handleSend}
              disabled={(!input.trim() && images.length === 0) || !activeConnection}
            >
              ↑
            </button>
          )}
        </div>
        <div className={styles.inputHint}>
          {activeConnection ? (
            <>Claude may make mistakes. Verify important information.</>
          ) : (
            <>Go to Settings to add your Anthropic API key.</>
          )}
        </div>
      </div>
    </div>
  );
}
