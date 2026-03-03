import React, { useState, useRef, useEffect, useCallback, memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useChat } from '../../store/ChatContext';
import { useConnection } from '../../store/ConnectionContext';
import { usePreview } from '../../store/PreviewContext';
import { sendMessage, abortStream } from '../../services/claude';
import type { Artifact, Message, CoworkTask } from '../../types';
import styles from './ChatPanel.module.css';

interface ChatPanelProps {
  sidebarCollapsed: boolean;
  onExpandSidebar: () => void;
}

const QUICK_ACTIONS_CHAT = [
  'Write a React component',
  'Create an HTML page',
  'Explain a concept',
  'Debug my code',
];

const QUICK_ACTIONS_COWORK = [
  'Build a landing page with form and validation',
  'Create a REST API with documentation',
  'Refactor this codebase for performance',
  'Analyze data and generate a report',
];

export function ChatPanel({ sidebarCollapsed, onExpandSidebar }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const {
    isStreaming,
    streamingText,
    streamingReasoning,
    activeConversationId,
    chatMode,
    globalInstructions,
    coworkTasks,
    activeCoworkTaskId,
    setStreaming,
    appendStreamingText,
    setStreamingReasoning,
    addMessage,
    getActiveConversation,
    createConversation,
    setChatMode,
    setGlobalInstructions,
    createCoworkTask,
    updateCoworkTaskStatus,
    getFolderInstructions,
  } = useChat();
  const { activeConnection } = useConnection();
  const { addArtifact, setArtifacts } = usePreview();

  const conversation = getActiveConversation();
  const activeCoworkTask = coworkTasks.find(t => t.id === activeCoworkTaskId);

  const scrollToBottom = useCallback(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [conversation?.messages, streamingText, scrollToBottom]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
    }
  }, [input]);

  const handleSend = async (text?: string) => {
    const messageText = text || input.trim();
    if (!messageText || isStreaming) return;

    if (!activeConnection) {
      setError('No API connection configured. Go to Settings to add one.');
      return;
    }

    setError(null);
    setInput('');

    let convId = activeConversationId;
    if (!convId) {
      convId = createConversation(activeConnection.model);
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: messageText,
      timestamp: Date.now(),
    };
    addMessage(convId, userMessage);

    // Build system instructions from global + folder context
    let systemPrompt = '';
    if (globalInstructions) {
      systemPrompt += globalInstructions;
    }
    if (conversation?.folderId) {
      const folderInstr = getFolderInstructions(conversation.folderId);
      if (folderInstr) {
        systemPrompt += (systemPrompt ? '\n\n' : '') + folderInstr;
      }
    }
    if (chatMode === 'cowork') {
      systemPrompt += (systemPrompt ? '\n\n' : '') +
        'You are in Cowork mode. Break complex tasks into clear steps. ' +
        'Show your reasoning and planning before executing. ' +
        'When generating code or documents, create complete, production-ready outputs. ' +
        'If a task has multiple parts, work through them systematically.';
    }

    const allMessages = [
      ...(conversation?.messages || []).map(m => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: messageText },
    ];

    // In Cowork mode, create a task tracker
    if (chatMode === 'cowork') {
      createCoworkTask(messageText.slice(0, 60), convId, [
        { label: 'Understanding request', status: 'in_progress' },
        { label: 'Planning approach', status: 'pending' },
        { label: 'Generating output', status: 'pending' },
        { label: 'Finalizing', status: 'pending' },
      ]);
    }

    setStreaming(true);
    setStreamingReasoning('');

    await sendMessage(
      allMessages,
      activeConnection.apiKey,
      activeConnection.model,
      activeConnection.maxTokens,
      activeConnection.temperature,
      {
        onToken: (token) => {
          appendStreamingText(token);
        },
        onArtifact: (artifact: Artifact) => {
          addArtifact(artifact);
        },
        onComplete: (message) => {
          addMessage(convId!, message);
          if (message.artifacts && message.artifacts.length > 0) {
            setArtifacts(message.artifacts);
          }
          setStreaming(false);
          // Complete cowork task
          if (activeCoworkTaskId) {
            updateCoworkTaskStatus(activeCoworkTaskId, 'completed');
          }
        },
        onError: (err) => {
          setError(err);
          setStreaming(false);
          if (activeCoworkTaskId) {
            updateCoworkTaskStatus(activeCoworkTaskId, 'error');
          }
        },
      },
      systemPrompt || undefined
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCodeClick = useCallback((code: string, language?: string) => {
    const isHtml = language === 'html' && (
      code.includes('<html') || code.includes('<!DOCTYPE') || code.includes('<body')
    );
    addArtifact({
      id: crypto.randomUUID(),
      type: isHtml ? 'html' : 'code',
      language: language || 'text',
      content: code,
      title: `${language || 'Code'} snippet`,
    });
  }, [addArtifact]);

  const quickActions = chatMode === 'cowork' ? QUICK_ACTIONS_COWORK : QUICK_ACTIONS_CHAT;

  return (
    <div className={styles.chatPanel}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          {sidebarCollapsed && (
            <button className={styles.expandBtn} onClick={onExpandSidebar}>&#x25B7;</button>
          )}
          <span className={styles.title}>
            {conversation?.title || 'ArcadIA Editor'}
          </span>
        </div>
        <div className={styles.headerRight}>
          {/* Chat/Cowork mode toggle */}
          <div className={styles.modeToggle}>
            <button
              className={`${styles.modeBtn} ${chatMode === 'chat' ? styles.modeActive : ''}`}
              onClick={() => setChatMode('chat')}
            >
              Chat
            </button>
            <button
              className={`${styles.modeBtn} ${chatMode === 'cowork' ? styles.modeActive : ''}`}
              onClick={() => setChatMode('cowork')}
            >
              Cowork
            </button>
          </div>
          {activeConnection && (
            <span className={styles.model}>{activeConnection.model}</span>
          )}
        </div>
      </div>

      {/* Cowork task activity bar */}
      {chatMode === 'cowork' && activeCoworkTask && activeCoworkTask.status !== 'completed' && (
        <CoworkActivityBar task={activeCoworkTask} />
      )}

      <div className={styles.messages} ref={messagesRef}>
        {!conversation || conversation.messages.length === 0 ? (
          <div className={styles.welcome}>
            <div className={styles.welcomeTitle}>
              {chatMode === 'cowork' ? 'Cowork Mode' : 'ArcadIA Editor'}
            </div>
            <div className={styles.welcomeSubtitle}>
              {chatMode === 'cowork'
                ? 'Describe a complex task and Claude will plan, execute, and deliver finished work — step by step.'
                : 'Your AI-powered workspace. Ask Claude to write code, create documents, analyze data, or build anything — with real-time preview.'
              }
            </div>
            {chatMode === 'cowork' && (
              <div className={styles.coworkBadges}>
                <span className={styles.coworkBadge}>Multi-step tasks</span>
                <span className={styles.coworkBadge}>Progress tracking</span>
                <span className={styles.coworkBadge}>Course-correct anytime</span>
              </div>
            )}
            <div className={styles.quickActions}>
              {quickActions.map(action => (
                <button
                  key={action}
                  className={styles.quickAction}
                  onClick={() => handleSend(action)}
                >
                  {action}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {conversation.messages.map(msg => (
              <MemoizedMessage
                key={msg.id}
                msg={msg}
                onCodeClick={handleCodeClick}
              />
            ))}

            {isStreaming && streamingText && (
              <div className={`${styles.message}`}>
                <div className={`${styles.avatar} ${styles.assistantAvatar}`}>C</div>
                <div className={`${styles.bubble} ${styles.assistantBubble}`}>
                  {/* Reasoning/thinking indicator */}
                  {chatMode === 'cowork' && streamingReasoning && (
                    <div className={styles.reasoningBlock}>
                      <div className={styles.reasoningHeader}>
                        <span className={styles.reasoningIcon}>&#x2699;</span>
                        Thinking...
                      </div>
                      <div className={styles.reasoningText}>{streamingReasoning}</div>
                    </div>
                  )}
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {streamingText}
                  </ReactMarkdown>
                  <div className={styles.streamingDots}>
                    <span /><span /><span />
                  </div>
                </div>
              </div>
            )}

            {isStreaming && !streamingText && (
              <div className={`${styles.message}`}>
                <div className={`${styles.avatar} ${styles.assistantAvatar}`}>C</div>
                <div className={`${styles.bubble} ${styles.assistantBubble}`}>
                  {chatMode === 'cowork' ? (
                    <div className={styles.coworkThinking}>
                      <div className={styles.coworkThinkingLabel}>Planning approach...</div>
                      <div className={styles.coworkThinkingBar}>
                        <div className={styles.coworkThinkingFill} />
                      </div>
                    </div>
                  ) : (
                    <div className={styles.streamingDots}>
                      <span /><span /><span />
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {error && (
          <div className={styles.errorMsg}>{error}</div>
        )}
      </div>

      <div className={styles.inputArea}>
        {/* Global instructions toggle */}
        {showInstructions && (
          <div className={styles.instructionsPanel}>
            <div className={styles.instructionsHeader}>
              <span>Global Instructions</span>
              <button
                className={styles.instructionsClose}
                onClick={() => setShowInstructions(false)}
              >x</button>
            </div>
            <textarea
              className={styles.instructionsTextarea}
              value={globalInstructions}
              onChange={e => setGlobalInstructions(e.target.value)}
              placeholder="Set instructions that apply to all conversations (e.g., 'Always respond in bullet points', 'Use TypeScript for code examples')..."
              rows={3}
            />
          </div>
        )}
        <div className={styles.inputWrapper}>
          <div className={styles.inputControls}>
            <button
              className={`${styles.instructionsBtn} ${globalInstructions ? styles.instructionsActive : ''}`}
              onClick={() => setShowInstructions(p => !p)}
              title="Global instructions"
            >
              &#x2699;
            </button>
          </div>
          <textarea
            ref={textareaRef}
            className={styles.textarea}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              !activeConnection ? 'Configure an API connection in Settings first' :
              chatMode === 'cowork' ? 'Describe what you want to build or accomplish...' :
              'Ask Claude anything...'
            }
            disabled={!activeConnection}
            rows={1}
          />
          {isStreaming ? (
            <button className={`${styles.sendBtn} ${styles.stopBtn}`} onClick={abortStream}>
              &#x25A0;
            </button>
          ) : (
            <button
              className={styles.sendBtn}
              onClick={() => handleSend()}
              disabled={!input.trim() || !activeConnection}
            >
              &#x2191;
            </button>
          )}
        </div>
        {conversation && conversation.messages.length > 0 && (
          <div className={styles.tokenCount}>
            {conversation.messages.reduce((sum, m) => sum + (m.tokens || 0), 0)} tokens used
            {chatMode === 'cowork' && ' | Cowork mode'}
          </div>
        )}
      </div>
    </div>
  );
}

// Cowork activity bar showing task progress
function CoworkActivityBar({ task }: { task: CoworkTask }) {
  const completedSteps = task.steps.filter(s => s.status === 'completed').length;
  const progress = (completedSteps / task.steps.length) * 100;

  return (
    <div className={styles.activityBar}>
      <div className={styles.activityHeader}>
        <span className={styles.activityLabel}>
          {task.status === 'planning' ? 'Planning...' :
           task.status === 'in_progress' ? 'Working...' :
           task.status === 'awaiting_permission' ? 'Needs permission' :
           task.status === 'paused' ? 'Paused' :
           task.status === 'error' ? 'Error' : 'Done'}
        </span>
        <span className={styles.activityProgress}>
          {completedSteps}/{task.steps.length} steps
        </span>
      </div>
      <div className={styles.activityProgressBar}>
        <div className={styles.activityProgressFill} style={{ width: `${progress}%` }} />
      </div>
      <div className={styles.activitySteps}>
        {task.steps.map(step => (
          <div
            key={step.id}
            className={`${styles.activityStep} ${styles[`step_${step.status}`]}`}
          >
            <span className={styles.stepIndicator}>
              {step.status === 'completed' ? '\u2713' :
               step.status === 'in_progress' ? '\u25CF' :
               step.status === 'error' ? '!' :
               '\u25CB'}
            </span>
            <span className={styles.stepLabel}>{step.label}</span>
            {step.detail && (
              <span className={styles.stepDetail}>{step.detail}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Memoized message component — prevents re-rendering all messages during streaming
const MemoizedMessage = memo(function MemoizedMessage({
  msg,
  onCodeClick,
}: {
  msg: Message;
  onCodeClick: (code: string, language?: string) => void;
}) {
  const markdownComponents = useMemo(() => ({
    code({ className, children, ...props }: any) {
      const match = /language-(\w+)/.exec(className || '');
      const codeStr = String(children).replace(/\n$/, '');
      if (match) {
        return (
          <pre onClick={() => onCodeClick(codeStr, match[1])}>
            <code className={className} {...props}>{children}</code>
          </pre>
        );
      }
      return <code className={className} {...props}>{children}</code>;
    },
    pre({ children }: any) {
      return <>{children}</>;
    },
  }), [onCodeClick]);

  return (
    <div className={`${styles.message} ${styles[msg.role]}`}>
      <div className={`${styles.avatar} ${msg.role === 'user' ? styles.userAvatar : styles.assistantAvatar}`}>
        {msg.role === 'user' ? 'U' : 'C'}
      </div>
      <div className={`${styles.bubble} ${msg.role === 'user' ? styles.userBubble : styles.assistantBubble}`}>
        {msg.role === 'user' ? (
          msg.content
        ) : (
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {msg.content}
          </ReactMarkdown>
        )}
      </div>
    </div>
  );
});
