import React, { useState, useRef, useEffect, useCallback, memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useChat } from '../../store/ChatContext';
import { useConnection } from '../../store/ConnectionContext';
import { usePreview } from '../../store/PreviewContext';
import { sendMessage, abortStream } from '../../services/claude';
import type { Artifact, Message } from '../../types';
import styles from './ChatPanel.module.css';

interface ChatPanelProps {
  sidebarCollapsed: boolean;
  onExpandSidebar: () => void;
}

const QUICK_ACTIONS = [
  'Write a React component',
  'Create an HTML page',
  'Explain a concept',
  'Debug my code',
];

export function ChatPanel({ sidebarCollapsed, onExpandSidebar }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const {
    isStreaming,
    streamingText,
    activeConversationId,
    setStreaming,
    appendStreamingText,
    addMessage,
    getActiveConversation,
    createConversation,
  } = useChat();
  const { activeConnection } = useConnection();
  const { addArtifact, setArtifacts } = usePreview();

  const conversation = getActiveConversation();

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

    const allMessages = [
      ...(conversation?.messages || []).map(m => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: messageText },
    ];

    setStreaming(true);

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
        },
        onError: (err) => {
          setError(err);
          setStreaming(false);
        },
      }
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

  return (
    <div className={styles.chatPanel}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          {sidebarCollapsed && (
            <button className={styles.expandBtn} onClick={onExpandSidebar}>▷</button>
          )}
          <span className={styles.title}>
            {conversation?.title || 'Claude Editor'}
          </span>
        </div>
        {activeConnection && (
          <span className={styles.model}>{activeConnection.model}</span>
        )}
      </div>

      <div className={styles.messages} ref={messagesRef}>
        {!conversation || conversation.messages.length === 0 ? (
          <div className={styles.welcome}>
            <div className={styles.welcomeTitle}>Claude Editor</div>
            <div className={styles.welcomeSubtitle}>
              Your AI-powered workspace. Ask Claude to write code, create documents,
              analyze data, or build anything — with real-time preview.
            </div>
            <div className={styles.quickActions}>
              {QUICK_ACTIONS.map(action => (
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
                  <div className={styles.streamingDots}>
                    <span /><span /><span />
                  </div>
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
        <div className={styles.inputWrapper}>
          <textarea
            ref={textareaRef}
            className={styles.textarea}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={activeConnection ? 'Ask Claude anything...' : 'Configure an API connection in Settings first'}
            disabled={!activeConnection}
            rows={1}
          />
          {isStreaming ? (
            <button className={`${styles.sendBtn} ${styles.stopBtn}`} onClick={abortStream}>
              ■
            </button>
          ) : (
            <button
              className={styles.sendBtn}
              onClick={() => handleSend()}
              disabled={!input.trim() || !activeConnection}
            >
              ↑
            </button>
          )}
        </div>
        {conversation && conversation.messages.length > 0 && (
          <div className={styles.tokenCount}>
            {conversation.messages.reduce((sum, m) => sum + (m.tokens || 0), 0)} tokens used
          </div>
        )}
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
