import { useState, useCallback, useRef, useEffect } from 'react';
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useConnection } from '../../store/ConnectionContext';
import { useChat } from '../../store/ChatContext';
import { usePreview } from '../../store/PreviewContext';
import { sendMessage, getApiLogs, clearApiLogs, subscribeToApiLogs, detectErrorInContent } from '../../services/claude';
import { trackMessage } from '../../services/analytics';
import type { Message, ApiLogEntry, ImageAttachment, ToolDefinition, ToolUseBlock, Artifact } from '../../types';
import { CLAUDE_MODELS } from '../../types';
import styles from './EngineerView.module.css';

type EngTab = 'chat' | 'validate' | 'logs' | 'terminal' | 'debug';

// ─── Built-in tools ───────────────────────────────────────────────────────────

const BUILTIN_TOOLS: ToolDefinition[] = [
  {
    name: 'calculator',
    description: 'Perform mathematical calculations',
    input_schema: {
      type: 'object',
      properties: { expression: { type: 'string', description: 'Math expression to evaluate' } },
      required: ['expression'],
    },
  },
  {
    name: 'get_current_time',
    description: 'Get the current date and time',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'web_search',
    description: 'Search the web for information (simulated)',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Search query' } },
      required: ['query'],
    },
  },
];

function executeBuiltinTool(name: string, input: Record<string, unknown>): string {
  if (name === 'calculator') {
    try {
      // Safe eval using Function
      const result = new Function('return ' + String(input.expression))();
      return String(result);
    } catch {
      return 'Error: invalid expression';
    }
  }
  if (name === 'get_current_time') {
    return new Date().toISOString();
  }
  if (name === 'web_search') {
    return `[Simulated search results for: "${input.query}"] No live search available in this demo.`;
  }
  return 'Tool not found';
}

// ─── Terminal ─────────────────────────────────────────────────────────────────

interface TermLine { id: string; type: 'cmd' | 'out' | 'err'; text: string; }

function Terminal() {
  const [lines, setLines] = useState<TermLine[]>([
    { id: '0', type: 'out', text: 'ArcadIA Terminal v1.0 — type "help" for commands' },
  ]);
  const [cmd, setCmd] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [lines]);

  const run = (command: string) => {
    const c = command.trim();
    if (!c) return;
    setHistory(prev => [c, ...prev.slice(0, 49)]);
    setHistIdx(-1);
    setLines(prev => [...prev, { id: crypto.randomUUID(), type: 'cmd', text: `$ ${c}` }]);

    let out = '';
    const parts = c.split(' ');
    const base = parts[0];

    if (base === 'help') {
      out = `Available commands:
  help          Show this help
  clear         Clear terminal
  ls            List files
  pwd           Print working directory
  cat <file>    Show file contents
  env           Show environment variables
  model         Show active Claude model
  logs          Show last 5 API log entries
  npm run dev   Start dev server (simulated)
  npm run build Build project (simulated)
  git status    Show git status (simulated)`;
    } else if (base === 'clear') {
      setLines([{ id: crypto.randomUUID(), type: 'out', text: 'ArcadIA Terminal v1.0' }]);
      return;
    } else if (base === 'ls') {
      out = 'src/  public/  package.json  vite.config.ts  README.md  PROJECT_SUMMARY.md';
    } else if (base === 'pwd') {
      out = '/home/user/arcadia';
    } else if (base === 'env') {
      out = 'NODE_ENV=production\nAPP_VERSION=2.0.0\nCLAUDE_API=https://api.anthropic.com';
    } else if (base === 'model') {
      const conn = JSON.parse(localStorage.getItem('arcadia-active-connection') ?? 'null');
      out = conn ? `Active model: ${conn.model}` : 'No active connection';
    } else if (base === 'cat') {
      const file = parts[1];
      if (!file) { out = 'Usage: cat <filename>'; }
      else if (file === 'package.json') { out = '{ "name": "arcadia", "version": "2.0.0", ... }'; }
      else if (file === 'README.md') { out = '# ArcadIA — Claude Web Editor\nDual-interface AI editor powered by Claude.'; }
      else { out = `cat: ${file}: No such file or directory`; }
    } else if (base === 'logs') {
      const logs = getApiLogs().slice(0, 5);
      out = logs.length === 0 ? 'No API logs yet.' : logs.map(l =>
        `[${new Date(l.timestamp).toISOString()}] ${l.direction.toUpperCase()} ${l.label ?? ''}`
      ).join('\n');
    } else if (c === 'npm run dev') {
      out = '> arcadia@2.0.0 dev\n> vite\n\n  VITE v7.0.0  ready in 312 ms\n  ➜  Local:   http://localhost:5173/Arcadia/';
    } else if (c === 'npm run build') {
      out = '> arcadia@2.0.0 build\n> tsc -b && vite build\n\nvite v7.0.0 building for production...\n✓ 142 modules transformed.\ndist/index.html  0.46 kB\ndist/assets/index-[hash].js  284.12 kB\n✓ built in 3.2s';
    } else if (c === 'git status') {
      out = 'On branch main\nYour branch is up to date with \'origin/main\'.\n\nnothing to commit, working tree clean';
    } else {
      out = `${base}: command not found`;
    }

    setLines(prev => [...prev, { id: crypto.randomUUID(), type: base === 'cat' && !parts[1] ? 'err' : 'out', text: out }]);
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { run(cmd); setCmd(''); }
    else if (e.key === 'ArrowUp') {
      const idx = histIdx + 1;
      if (idx < history.length) { setHistIdx(idx); setCmd(history[idx]); }
    } else if (e.key === 'ArrowDown') {
      const idx = histIdx - 1;
      if (idx < 0) { setHistIdx(-1); setCmd(''); }
      else { setHistIdx(idx); setCmd(history[idx]); }
    }
  };

  return (
    <div className={styles.terminal} onClick={() => inputRef.current?.focus()}>
      <div className={styles.termLines}>
        {lines.map(l => (
          <div key={l.id} className={`${styles.termLine} ${l.type === 'cmd' ? styles.termCmd : l.type === 'err' ? styles.termErr : styles.termOut}`}>
            <pre>{l.text}</pre>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className={styles.termInputRow}>
        <span className={styles.termPrompt}>$</span>
        <input
          ref={inputRef}
          className={styles.termInput}
          value={cmd}
          onChange={e => setCmd(e.target.value)}
          onKeyDown={handleKey}
          spellCheck={false}
          autoComplete="off"
          placeholder="Enter command..."
        />
      </div>
    </div>
  );
}

// ─── API Logs Panel ───────────────────────────────────────────────────────────

function ApiLogsPanel() {
  const [logs, setLogs] = useState<ApiLogEntry[]>(getApiLogs);
  const [selected, setSelected] = useState<ApiLogEntry | null>(null);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    return subscribeToApiLogs(setLogs);
  }, []);

  const filtered = filter === 'all' ? logs : logs.filter(l => l.direction === filter);

  const dirColor = (d: string) => {
    if (d === 'request') return '#6366f1';
    if (d === 'response') return '#22c55e';
    if (d === 'error') return '#ef4444';
    if (d === 'thinking') return '#a78bfa';
    if (d === 'tool_call') return '#f59e0b';
    return '#a3a3a3';
  };

  return (
    <div className={styles.logsPanel}>
      <div className={styles.logsToolbar}>
        <div className={styles.logsFilters}>
          {['all', 'request', 'response', 'stream_token', 'thinking', 'tool_call', 'error'].map(f => (
            <button
              key={f}
              className={`${styles.filterBtn} ${filter === f ? styles.filterActive : ''}`}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
        <button className={styles.clearLogsBtn} onClick={clearApiLogs}>Clear</button>
      </div>
      <div className={styles.logsContent}>
        <div className={styles.logsList}>
          {filtered.length === 0 ? (
            <div className={styles.logsEmpty}>No logs yet. Send a message to see API activity.</div>
          ) : (
            filtered.map(log => (
              <div
                key={log.id}
                className={`${styles.logEntry} ${selected?.id === log.id ? styles.logSelected : ''}`}
                onClick={() => setSelected(log)}
              >
                <span className={styles.logDir} style={{ color: dirColor(log.direction) }}>
                  {log.direction.toUpperCase()}
                </span>
                <span className={styles.logLabel}>{log.label ?? log.direction}</span>
                <span className={styles.logTime}>{new Date(log.timestamp).toLocaleTimeString()}</span>
                {log.inputTokens != null && log.inputTokens > 0 && <span className={styles.logTokens}>↑{log.inputTokens}</span>}
                {log.outputTokens != null && log.outputTokens > 0 && <span className={styles.logTokens}>↓{log.outputTokens}</span>}
                {log.ttft != null && log.ttft > 0 && <span className={styles.logMetric}>TTFT {log.ttft.toFixed(0)}ms</span>}
                {log.tokensPerSecond != null && log.tokensPerSecond > 0 && <span className={styles.logMetric}>{log.tokensPerSecond.toFixed(1)} t/s</span>}
              </div>
            ))
          )}
        </div>
        {selected && (
          <div className={styles.logDetail}>
            <div className={styles.logDetailHeader}>
              <span style={{ color: dirColor(selected.direction) }}>{selected.direction.toUpperCase()}</span>
              <span>{new Date(selected.timestamp).toISOString()}</span>
              <button onClick={() => setSelected(null)}>✕</button>
            </div>
            {selected.ttft != null && selected.ttft > 0 && <div className={styles.logMetricRow}><b>TTFT:</b> {selected.ttft.toFixed(1)}ms</div>}
            {selected.totalTime != null && selected.totalTime > 0 && <div className={styles.logMetricRow}><b>Total:</b> {(selected.totalTime / 1000).toFixed(2)}s</div>}
            {selected.tokensPerSecond != null && selected.tokensPerSecond > 0 && <div className={styles.logMetricRow}><b>Speed:</b> {selected.tokensPerSecond.toFixed(1)} tokens/s</div>}
            {selected.inputTokens != null && selected.inputTokens > 0 && <div className={styles.logMetricRow}><b>Input tokens:</b> {selected.inputTokens}</div>}
            {selected.outputTokens != null && selected.outputTokens > 0 && <div className={styles.logMetricRow}><b>Output tokens:</b> {selected.outputTokens}</div>}
            <pre className={styles.logJson}>{JSON.stringify(selected.data, null, 2)}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Debug Panel ──────────────────────────────────────────────────────────────

function DebugPanel() {
  const { activeConnection } = useConnection();
  const { getActiveConversation } = useChat();
  const conv = getActiveConversation();

  const metrics = {
    messages: conv?.messages.length ?? 0,
    totalTokens: conv?.messages.reduce((s, m) => s + (m.outputTokens ?? 0) + (m.inputTokens ?? 0), 0) ?? 0,
    model: activeConnection?.model ?? 'none',
    thinking: activeConnection?.enableThinking ? `enabled (budget: ${activeConnection.thinkingBudget ?? 10000})` : 'disabled',
    maxTokens: activeConnection?.maxTokens ?? 0,
    temperature: activeConnection?.temperature ?? 0,
    status: activeConnection?.status ?? 'disconnected',
  };

  const logs = getApiLogs();
  const lastResponse = logs.find(l => l.direction === 'response');
  const lastRequest = logs.find(l => l.direction === 'request');

  return (
    <div className={styles.debugPanel}>
      <div className={styles.debugSection}>
        <div className={styles.debugSectionTitle}>Connection</div>
        <table className={styles.debugTable}>
          <tbody>
            {Object.entries(metrics).map(([k, v]) => (
              <tr key={k}>
                <td className={styles.debugKey}>{k}</td>
                <td className={styles.debugVal}>{String(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={styles.debugSection}>
        <div className={styles.debugSectionTitle}>Last Request</div>
        <pre className={styles.debugJson}>{lastRequest ? JSON.stringify(lastRequest.data, null, 2) : 'No requests yet'}</pre>
      </div>
      <div className={styles.debugSection}>
        <div className={styles.debugSectionTitle}>Last Response</div>
        <pre className={styles.debugJson}>{lastResponse ? JSON.stringify(lastResponse.data, null, 2) : 'No responses yet'}</pre>
      </div>
      <div className={styles.debugSection}>
        <div className={styles.debugSectionTitle}>localStorage Keys</div>
        <table className={styles.debugTable}>
          <tbody>
            {Object.keys(localStorage).filter(k => k.startsWith('arcadia-')).map(k => (
              <tr key={k}>
                <td className={styles.debugKey}>{k}</td>
                <td className={styles.debugVal} style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {localStorage.getItem(k)?.slice(0, 60) ?? ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Engineer Chat Panel ──────────────────────────────────────────────────────

function EngineerChat() {
  const { activeConnection, connections, setActiveConnection } = useConnection();
  const {
    getActiveConversation, addMessage, createConversation,
    isStreaming, streamingText, streamingReasoning,
    setStreaming, appendStreamingText, appendStreamingReasoning, setStreamingReasoning,
    getStreamingState, abortConversationStream, setAbortController,
  } = useChat();

  const [input, setInput] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [showSystem, setShowSystem] = useState(false);
  const [enableTools, setEnableTools] = useState(false);
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [error, setError] = useState('');
  const [showThinkingFor, setShowThinkingFor] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const conversation = getActiveConversation();
  const messages = conversation?.messages ?? [];

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, streamingText]);

  // Debounce streaming text for ReactMarkdown to avoid re-parsing on every token
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

  const modelInfo = CLAUDE_MODELS.find(m => m.id === activeConnection?.model);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text && images.length === 0) return;
    if (!activeConnection) { setError('Connecting to Meta infrastructure... Please wait.'); return; }

    setError('');
    setInput('');
    setImages([]);

    let convId = conversation?.id;
    if (!convId) convId = createConversation(activeConnection.model);

    // If already streaming, abort current stream and save partial response
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
      await new Promise(r => setTimeout(r, 50));
    }

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
      model: activeConnection.model,
    };

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
    setStreaming(convId, true);
    const controller = new AbortController();
    setAbortController(convId, controller);

    const allMessages = [...(conversation?.messages ?? []), userMsg];

    try {
      const result = await sendMessage({
        connection: activeConnection,
        messages: allMessages,
        systemPrompt: systemPrompt || undefined,
        tools: enableTools ? BUILTIN_TOOLS : undefined,
        onToken: (chunk: string) => appendStreamingText(convId!, chunk),
        onThinking: (chunk: string) => appendStreamingReasoning(convId!, chunk),
        onToolCall: (tc) => {
          const toolResult = executeBuiltinTool(tc.name, tc.input);
          console.log(`Tool ${tc.name} result:`, toolResult);
        },
        signal: controller.signal,
      });

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
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(err.message);
      }
    } finally {
      setStreaming(convId!, false);
      setAbortController(convId!, null);
    }
  }, [input, images, activeConnection, conversation, createConversation, addMessage, setStreaming, appendStreamingText, setStreamingReasoning, appendStreamingReasoning, systemPrompt, enableTools, getStreamingState, abortConversationStream, setAbortController]);

  const toggleThinking = (msgId: string) => {
    setShowThinkingFor(prev => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      return next;
    });
  };

  return (
    <div className={styles.engChat}>
      {/* Toolbar */}
      <div className={styles.engToolbar}>
        <div className={styles.engToolbarLeft}>
          <select
            className={styles.modelSelect}
            value={activeConnection?.id ?? ''}
            onChange={e => setActiveConnection(e.target.value)}
          >
            {connections.map(c => (
              <option key={c.id} value={c.id}>{c.label} — {c.model}</option>
            ))}
          </select>
          {modelInfo?.supportsThinking && (
            <label className={styles.toggleLabel}>
              <input
                type="checkbox"
                checked={activeConnection?.enableThinking ?? false}
                onChange={() => {/* handled in settings */}}
                disabled
              />
              <span>🧠 Thinking {activeConnection?.enableThinking ? 'ON' : 'OFF'}</span>
            </label>
          )}
          <label className={styles.toggleLabel}>
            <input type="checkbox" checked={enableTools} onChange={e => setEnableTools(e.target.checked)} />
            <span>🔧 Tools</span>
          </label>
          <button
            className={`${styles.systemBtn} ${showSystem ? styles.systemBtnActive : ''}`}
            onClick={() => setShowSystem(p => !p)}
          >
            ⚙ System
          </button>
        </div>
        <div className={styles.engToolbarRight}>
          {activeConnection && (
            <span className={`${styles.connStatus} ${styles[`status_${activeConnection.status}`]}`}>
              ● {activeConnection.status}
            </span>
          )}
        </div>
      </div>

      {/* System prompt */}
      {showSystem && (
        <div className={styles.systemPromptArea}>
          <textarea
            className={styles.systemPromptInput}
            value={systemPrompt}
            onChange={e => setSystemPrompt(e.target.value)}
            placeholder="System prompt — instructions that apply to the entire conversation..."
            rows={3}
          />
        </div>
      )}

      {/* Messages */}
      <div className={styles.engMessages}>
        {messages.length === 0 && !isStreaming ? (
          <div className={styles.engEmpty}>
            <div className={styles.engEmptyIcon}>⌨</div>
            <div className={styles.engEmptyTitle}>Engineer Console</div>
            <div className={styles.engEmptyDesc}>
              Full Claude API access — streaming, extended thinking, vision, tool use.
              <br />Use the tabs above to inspect API logs, terminal, and debug info.
            </div>
            {!activeConnection && (
              <div className={styles.engNoConn}>⚠ Connecting to Meta infrastructure...</div>
            )}
          </div>
        ) : (
          messages.map(msg => (
            <div key={msg.id} className={`${styles.engMsg} ${msg.role === 'user' ? styles.engMsgUser : styles.engMsgAssistant}`}>
              <div className={styles.engMsgRole}>
                {msg.role === 'user' ? '▶ user' : '◀ assistant'}
                {msg.model && <span className={styles.engMsgModel}>{msg.model}</span>}
              </div>
              {msg.role === 'user' && msg.contentBlocks?.some(b => b.type === 'image') && (
                <div className={styles.engImages}>
                  {msg.contentBlocks.filter(b => b.type === 'image').map((b, i) => {
                    const img = b as { type: 'image'; source: { data: string; media_type: string } };
                    return <img key={i} src={`data:${img.source.media_type};base64,${img.source.data}`} alt="" className={styles.engImage} />;
                  })}
                </div>
              )}
              <div className={styles.engMsgContent}>
                {msg.role === 'assistant' ? (() => {
                  const detectedError = msg.content ? detectErrorInContent(msg.content) : null;
                  if (detectedError) {
                    return (
                      <div className={styles.engErrorCard}>
                        <div className={styles.engErrorHeader}>
                          <span>{detectedError.type === 'content_policy' ? '⚠️' : detectedError.type === 'rate_limit' ? '⏳' : detectedError.type === 'timeout' ? '⏱️' : detectedError.type === 'server_error' ? '🛠️' : '❌'}</span>
                          <strong>{detectedError.title}</strong>
                        </div>
                        <p style={{ margin: '8px 0', color: 'var(--text-secondary)', fontSize: '13px' }}>{detectedError.message}</p>
                        <div className={styles.engErrorSuggestion}>
                          <strong>What to try:</strong> {detectedError.suggestion}
                        </div>
                      </div>
                    );
                  }
                  return msg.content ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                  ) : (
                    <p style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>Empty response — bridge may have returned no content.</p>
                  );
                })() : (
                  <pre className={styles.engUserText}>{msg.content}</pre>
                )}
              </div>
              {msg.thinkingText && (
                <div className={styles.engThinking}>
                  <button className={styles.engThinkingToggle} onClick={() => toggleThinking(msg.id)}>
                    🧠 Extended thinking ({Math.round(msg.thinkingText.length / 4)} tokens)
                    {showThinkingFor.has(msg.id) ? ' ▲' : ' ▼'}
                  </button>
                  {showThinkingFor.has(msg.id) && (
                    <pre className={styles.engThinkingContent}>{msg.thinkingText}</pre>
                  )}
                </div>
              )}
              {msg.toolCalls && msg.toolCalls.length > 0 && (
                <div className={styles.engToolCalls}>
                  {msg.toolCalls.map(tc => (
                    <div key={tc.id} className={styles.engToolCall}>
                      <span className={styles.engToolCallName}>🔧 {tc.name}</span>
                      <pre className={styles.engToolCallInput}>{JSON.stringify(tc.input, null, 2)}</pre>
                    </div>
                  ))}
                </div>
              )}
              {msg.artifacts && msg.artifacts.length > 0 && (
                <div className={styles.engArtifacts}>
                  {msg.artifacts.map(a => (
                    <div key={a.id} className={styles.engArtifact}>
                      <div className={styles.engArtifactHeader}>
                        <span>{a.type === 'html' ? '🌐' : '💻'} {a.title ?? a.language}</span>
                        <button onClick={() => navigator.clipboard.writeText(a.content)}>📋</button>
                      </div>
                      <pre className={styles.engArtifactCode}>{a.content}</pre>
                    </div>
                  ))}
                </div>
              )}
              <div className={styles.engMsgMeta}>
                {msg.inputTokens != null && msg.inputTokens > 0 && <span>↑{msg.inputTokens}</span>}
                {msg.outputTokens != null && msg.outputTokens > 0 && <span>↓{msg.outputTokens}</span>}
                {msg.ttft != null && msg.ttft > 0 && <span>TTFT {msg.ttft.toFixed(0)}ms</span>}
                {msg.totalTime != null && msg.totalTime > 0 && <span>{(msg.totalTime / 1000).toFixed(2)}s</span>}
                <span>{new Date(msg.timestamp).toLocaleTimeString()}</span>
              </div>
            </div>
          ))
        )}
        {isStreaming && (
          <div className={`${styles.engMsg} ${styles.engMsgAssistant}`}>
            <div className={styles.engMsgRole}>◀ assistant <span className={styles.streamingBadge}>streaming</span></div>
            {streamingReasoning && (
              <div className={styles.engThinking}>
                <div className={styles.engThinkingLive}>🧠 Thinking... ({Math.round(streamingReasoning.length / 4)} tokens)</div>
              </div>
            )}
            <div className={styles.engMsgContent}>
              {debouncedStreamingText ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{debouncedStreamingText}</ReactMarkdown>
              ) : (
                <span className={styles.engCursor}>▌</span>
              )}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Error */}
      {error && (
        <div className={styles.engError}>
          <span>⚠ {error}</span>
          <button onClick={() => setError('')}>✕</button>
        </div>
      )}

      {/* Input */}
      <div className={styles.engInputArea}>
        {images.length > 0 && (
          <div className={styles.engImagePreviews}>
            {images.map(img => (
              <div key={img.id} className={styles.engImagePreview}>
                <img src={img.previewUrl} alt="" />
                <button onClick={() => setImages(prev => prev.filter(i => i.id !== img.id))}>✕</button>
              </div>
            ))}
          </div>
        )}
        <div className={styles.engInputRow}>
          <button className={styles.engAttachBtn} onClick={() => fileInputRef.current?.click()} title="Attach image">📎</button>
          <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
            onChange={e => {
              Array.from(e.target.files ?? []).forEach(file => {
                const reader = new FileReader();
                reader.onload = ev => {
                  const dataUrl = ev.target?.result as string;
                  const [header, data] = dataUrl.split(',');
                  const mediaType = header.match(/data:([^;]+)/)?.[1] as ImageAttachment['mediaType'] ?? 'image/jpeg';
                  setImages(prev => [...prev, { id: crypto.randomUUID(), name: file.name, mediaType, data, previewUrl: dataUrl }]);
                };
                reader.readAsDataURL(file);
              });
              e.target.value = '';
            }}
          />
          <textarea
            className={styles.engInput}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Message Claude... (Enter to send, Shift+Enter for newline)"
            rows={1}
            disabled={!activeConnection}
          />
          {isStreaming && (
            <button className={styles.engStopBtn} onClick={() => { if (conversation?.id) abortConversationStream(conversation.id); }} title="Stop generation">⏹</button>
          )}
          <button
            className={styles.engSendBtn}
            onClick={handleSend}
            disabled={!input.trim() && images.length === 0}
            title={isStreaming ? 'Send follow-up (interrupts current response)' : 'Send (Enter)'}
          >↑</button>
        </div>
      </div>
    </div>
  );
}

// ─── Validation Pipeline Panel ──────────────────────────────────────────────

interface ValidationCommand {
  id: string;
  label: string;
  command: string;
  enabled: boolean;
}

interface ValidationResult {
  command: string;
  passed: boolean;
  exit_code: number;
  stdout: string;
  stderr: string;
  duration_ms: number;
}

interface ValidationRun {
  id: string;
  timestamp: number;
  passed: boolean;
  total: number;
  passed_count: number;
  failed_count: number;
  results: ValidationResult[];
  auto_fix_attempt?: number;
}

type PipelineStage = 'idle' | 'validating' | 'fixing' | 'done';

const DEFAULT_COMMANDS: ValidationCommand[] = [
  { id: '1', label: 'Lint', command: 'yarn lint', enabled: true },
  { id: '2', label: 'Type Check', command: 'yarn typecheck', enabled: true },
  { id: '3', label: 'Unit Tests', command: 'yarn test --watchAll=false', enabled: false },
  { id: '4', label: 'Build', command: 'yarn build', enabled: false },
];

const STORAGE_KEY = 'arcadia-validation-commands';
const BRIDGE_URL = 'http://127.0.0.1:8087';

function loadCommands(): ValidationCommand[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : DEFAULT_COMMANDS;
  } catch { return DEFAULT_COMMANDS; }
}

function saveCommands(cmds: ValidationCommand[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cmds));
}

function ValidationPanel() {
  const [commands, setCommands] = useState<ValidationCommand[]>(loadCommands);
  const [runs, setRuns] = useState<ValidationRun[]>([]);
  const [stage, setStage] = useState<PipelineStage>('idle');
  const [autoFix, setAutoFix] = useState(true);
  const [maxRetries, setMaxRetries] = useState(3);
  const [currentRetry, setCurrentRetry] = useState(0);
  const [projectDir, setProjectDir] = useState('');
  const [showConfig, setShowConfig] = useState(false);
  const [newCmd, setNewCmd] = useState({ label: '', command: '' });
  const [bridgeOk, setBridgeOk] = useState<boolean | null>(null);
  const [selectedRun, setSelectedRun] = useState<ValidationRun | null>(null);
  const [fixLog, setFixLog] = useState<string[]>([]);

  // Check bridge connectivity
  useEffect(() => {
    const check = async () => {
      try {
        const r = await fetch(`${BRIDGE_URL}/health`);
        const data = await r.json();
        setBridgeOk(data.capabilities?.validate === true);
      } catch { setBridgeOk(false); }
    };
    check();
    const interval = setInterval(check, 15000);
    return () => clearInterval(interval);
  }, []);

  const enabledCommands = commands.filter(c => c.enabled);

  const toggleCommand = (id: string) => {
    const updated = commands.map(c => c.id === id ? { ...c, enabled: !c.enabled } : c);
    setCommands(updated);
    saveCommands(updated);
  };

  const removeCommand = (id: string) => {
    const updated = commands.filter(c => c.id !== id);
    setCommands(updated);
    saveCommands(updated);
  };

  const addCommand = () => {
    if (!newCmd.label.trim() || !newCmd.command.trim()) return;
    const updated = [...commands, { id: crypto.randomUUID(), label: newCmd.label, command: newCmd.command, enabled: true }];
    setCommands(updated);
    saveCommands(updated);
    setNewCmd({ label: '', command: '' });
  };

  const runValidation = async () => {
    if (enabledCommands.length === 0) return;
    setStage('validating');
    setCurrentRetry(0);
    setFixLog([]);
    setSelectedRun(null);

    try {
      const response = await fetch(`${BRIDGE_URL}/v1/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commands: enabledCommands.map(c => c.command),
          cwd: projectDir || undefined,
        }),
      });

      const data = await response.json();
      const run: ValidationRun = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        passed: data.passed,
        total: data.total,
        passed_count: data.passed_count,
        failed_count: data.failed_count,
        results: data.results,
      };

      setRuns(prev => [run, ...prev]);
      setSelectedRun(run);

      if (!data.passed && autoFix) {
        await runAutoFixLoop(data, 1);
      } else {
        setStage('done');
      }
    } catch (err) {
      setFixLog(prev => [...prev, `Error: ${err instanceof Error ? err.message : 'Unknown error'}. Is the bridge running?`]);
      setStage('idle');
    }
  };

  const runAutoFixLoop = async (validationData: { results: ValidationResult[] }, attempt: number) => {
    if (attempt > maxRetries) {
      setFixLog(prev => [...prev, `Reached max retries (${maxRetries}). Some errors remain.`]);
      setStage('done');
      return;
    }

    setStage('fixing');
    setCurrentRetry(attempt);

    // Collect all errors
    const failedResults = validationData.results.filter(r => !r.passed);
    const errorText = failedResults.map(r => 
      `Command: ${r.command}\nExit code: ${r.exit_code}\nStderr: ${r.stderr}\nStdout: ${r.stdout}`
    ).join('\n\n---\n\n');

    setFixLog(prev => [...prev, `Auto-fix attempt ${attempt}/${maxRetries}: Sending ${failedResults.length} error(s) to Claude...`]);

    try {
      const response = await fetch(`${BRIDGE_URL}/v1/auto-fix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          errors: errorText,
          original_prompt: 'Fix the validation errors in the codebase',
          code: '',
          max_retries: maxRetries,
          stream: false,
        }),
      });

      // Read the SSE stream for the fix response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fixContent = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          // Parse SSE events
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const event = JSON.parse(line.slice(6));
                if (event.type === 'content_block_delta' && event.delta?.text) {
                  fixContent += event.delta.text;
                }
              } catch { /* skip non-JSON lines */ }
            }
          }
        }
      }

      setFixLog(prev => [...prev, `Claude suggested fix (${fixContent.length} chars). Re-validating...`]);

      // Re-run validation
      const revalidateResponse = await fetch(`${BRIDGE_URL}/v1/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commands: enabledCommands.map(c => c.command),
          cwd: projectDir || undefined,
        }),
      });

      const revalidateData = await revalidateResponse.json();
      const rerun: ValidationRun = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        passed: revalidateData.passed,
        total: revalidateData.total,
        passed_count: revalidateData.passed_count,
        failed_count: revalidateData.failed_count,
        results: revalidateData.results,
        auto_fix_attempt: attempt,
      };

      setRuns(prev => [rerun, ...prev]);
      setSelectedRun(rerun);

      if (revalidateData.passed) {
        setFixLog(prev => [...prev, `All checks passed after ${attempt} fix attempt(s)!`]);
        setStage('done');
      } else {
        setFixLog(prev => [...prev, `Still ${revalidateData.failed_count} failure(s). Retrying...`]);
        await runAutoFixLoop(revalidateData, attempt + 1);
      }
    } catch (err) {
      setFixLog(prev => [...prev, `Auto-fix error: ${err instanceof Error ? err.message : 'Unknown'}`]);
      setStage('done');
    }
  };

  const pipelineStages = [
    { key: 'generate', label: 'Generate', icon: '💬', desc: 'Claude generates code' },
    { key: 'validate', label: 'Validate', icon: '🔍', desc: `Run ${enabledCommands.length} check(s)` },
    { key: 'fix', label: 'Auto-Fix', icon: '🔧', desc: autoFix ? `Up to ${maxRetries} retries` : 'Disabled' },
    { key: 'done', label: 'Done', icon: '✅', desc: 'All checks pass' },
  ];

  const getStageStatus = (key: string) => {
    if (stage === 'idle') return 'pending';
    if (key === 'generate') return 'complete';
    if (key === 'validate') {
      if (stage === 'validating') return 'active';
      if (stage === 'fixing' || stage === 'done') return selectedRun?.passed ? 'complete' : 'failed';
    }
    if (key === 'fix') {
      if (stage === 'fixing') return 'active';
      if (stage === 'done' && currentRetry > 0) return selectedRun?.passed ? 'complete' : 'failed';
      if (stage === 'done' && currentRetry === 0) return 'skipped';
    }
    if (key === 'done') {
      if (stage === 'done') return selectedRun?.passed ? 'complete' : 'failed';
    }
    return 'pending';
  };

  return (
    <div className={styles.validatePanel}>
      {/* Pipeline visualization */}
      <div className={styles.pipeline}>
        <div className={styles.pipelineTitle}>Autonomous Dev Pipeline</div>
        <div className={styles.pipelineStages}>
          {pipelineStages.map((s, i) => {
            const status = getStageStatus(s.key);
            return (
              <React.Fragment key={s.key}>
                <div className={`${styles.pipelineStage} ${styles[`stage_${status}`]}`}>
                  <div className={styles.stageIcon}>
                    {status === 'active' ? <span className={styles.stageSpinner}>⟳</span> : s.icon}
                  </div>
                  <div className={styles.stageLabel}>{s.label}</div>
                  <div className={styles.stageDesc}>{s.desc}</div>
                </div>
                {i < pipelineStages.length - 1 && (
                  <div className={`${styles.pipelineArrow} ${status === 'complete' || status === 'failed' ? styles.arrowActive : ''}`}>→</div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Bridge status */}
      {bridgeOk === false && (
        <div className={styles.validateWarning}>
          Bridge not detected. Run this in Terminal to connect:
          <code>curl -sL https://raw.githubusercontent.com/ikosoymeta/Arcadia/main/bridge/setup.sh | bash</code>
          <span style={{ fontSize: '11px', opacity: 0.7, marginLeft: '8px' }}>Already set up? Run: <code>node ~/.arcadia-bridge/arcadia-bridge.js</code></span>
        </div>
      )}

      {/* Controls */}
      <div className={styles.validateControls}>
        <div className={styles.validateControlsLeft}>
          <button
            className={styles.validateRunBtn}
            onClick={runValidation}
            disabled={stage === 'validating' || stage === 'fixing' || enabledCommands.length === 0 || bridgeOk === false}
          >
            {stage === 'validating' ? '🔍 Validating...' : stage === 'fixing' ? `🔧 Fixing (${currentRetry}/${maxRetries})...` : '▶ Run Validation'}
          </button>
          <label className={styles.toggleLabel}>
            <input type="checkbox" checked={autoFix} onChange={e => setAutoFix(e.target.checked)} />
            <span>Auto-fix with Claude</span>
          </label>
          {autoFix && (
            <label className={styles.toggleLabel}>
              <span>Max retries:</span>
              <select
                value={maxRetries}
                onChange={e => setMaxRetries(Number(e.target.value))}
                style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: '4px', padding: '2px 4px', fontSize: '12px' }}
              >
                {[1, 2, 3, 5].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          )}
        </div>
        <div className={styles.validateControlsRight}>
          <button
            className={`${styles.systemBtn} ${showConfig ? styles.systemBtnActive : ''}`}
            onClick={() => setShowConfig(p => !p)}
          >
            ⚙ Configure
          </button>
        </div>
      </div>

      {/* Configuration */}
      {showConfig && (
        <div className={styles.validateConfig}>
          <div className={styles.configSection}>
            <div className={styles.configLabel}>Project Directory (optional)</div>
            <input
              className={styles.configInput}
              value={projectDir}
              onChange={e => setProjectDir(e.target.value)}
              placeholder="/path/to/your/project (leave empty for home dir)"
            />
          </div>
          <div className={styles.configSection}>
            <div className={styles.configLabel}>Validation Commands</div>
            <div className={styles.commandList}>
              {commands.map(cmd => (
                <div key={cmd.id} className={styles.commandItem}>
                  <input
                    type="checkbox"
                    checked={cmd.enabled}
                    onChange={() => toggleCommand(cmd.id)}
                  />
                  <span className={styles.commandLabel}>{cmd.label}</span>
                  <code className={styles.commandCode}>{cmd.command}</code>
                  <button className={styles.commandRemove} onClick={() => removeCommand(cmd.id)}>✕</button>
                </div>
              ))}
            </div>
            <div className={styles.addCommandRow}>
              <input
                className={styles.configInput}
                value={newCmd.label}
                onChange={e => setNewCmd(p => ({ ...p, label: e.target.value }))}
                placeholder="Label (e.g. Lint)"
                style={{ width: '120px' }}
              />
              <input
                className={styles.configInput}
                value={newCmd.command}
                onChange={e => setNewCmd(p => ({ ...p, command: e.target.value }))}
                placeholder="Command (e.g. yarn lint)"
                style={{ flex: 1 }}
                onKeyDown={e => { if (e.key === 'Enter') addCommand(); }}
              />
              <button className={styles.systemBtn} onClick={addCommand}>+ Add</button>
            </div>
          </div>
        </div>
      )}

      {/* Results area */}
      <div className={styles.validateResults}>
        {/* Fix log */}
        {fixLog.length > 0 && (
          <div className={styles.fixLog}>
            <div className={styles.fixLogTitle}>Pipeline Activity</div>
            {fixLog.map((line, i) => (
              <div key={i} className={styles.fixLogLine}>
                <span className={styles.fixLogTime}>{new Date().toLocaleTimeString()}</span>
                {line}
              </div>
            ))}
          </div>
        )}

        {/* Run history */}
        {runs.length > 0 && (
          <div className={styles.runHistory}>
            <div className={styles.runHistoryTitle}>Validation History</div>
            {runs.map(run => (
              <div
                key={run.id}
                className={`${styles.runItem} ${selectedRun?.id === run.id ? styles.runSelected : ''} ${run.passed ? styles.runPassed : styles.runFailed}`}
                onClick={() => setSelectedRun(run)}
              >
                <span className={styles.runIcon}>{run.passed ? '✅' : '❌'}</span>
                <span className={styles.runSummary}>
                  {run.passed_count}/{run.total} passed
                  {run.auto_fix_attempt != null && ` (fix #${run.auto_fix_attempt})`}
                </span>
                <span className={styles.runTime}>{new Date(run.timestamp).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        )}

        {/* Selected run details */}
        {selectedRun && (
          <div className={styles.runDetails}>
            <div className={styles.runDetailsTitle}>
              Run Details — {selectedRun.passed ? 'All Passed' : `${selectedRun.failed_count} Failed`}
            </div>
            {selectedRun.results.map((r, i) => (
              <div key={i} className={`${styles.resultItem} ${r.passed ? styles.resultPassed : styles.resultFailed}`}>
                <div className={styles.resultHeader}>
                  <span>{r.passed ? '✅' : '❌'} {r.command}</span>
                  <span className={styles.resultDuration}>{(r.duration_ms / 1000).toFixed(1)}s</span>
                </div>
                {!r.passed && (
                  <pre className={styles.resultOutput}>
                    {r.stderr || r.stdout || `Exit code: ${r.exit_code}`}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {runs.length === 0 && stage === 'idle' && (
          <div className={styles.validateEmpty}>
            <div className={styles.validateEmptyIcon}>🔍</div>
            <div className={styles.validateEmptyTitle}>Autonomous Validation Pipeline</div>
            <div className={styles.validateEmptyDesc}>
              Inspired by the GSD Auto-Worker pattern. Configure your validation commands
              (lint, typecheck, tests) and run them automatically after Claude generates code.
              <br /><br />
              When auto-fix is enabled, validation errors are automatically sent back to Claude
              for correction, creating an autonomous generate → validate → fix loop.
              <br /><br />
              <strong>How to use:</strong>
              <br />1. Configure your validation commands (click ⚙ Configure)
              <br />2. Set your project directory
              <br />3. Click "Run Validation" to start the pipeline
              <br />4. Enable "Auto-fix with Claude" for autonomous error correction
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main EngineerView ────────────────────────────────────────────────────────

// ─── Right Panel Workspace (Multi-tab like Manus) ────────────────────────────

type RightTab = 'code' | 'files' | 'data' | 'debug' | 'output';

interface BridgeHealth {
  status: string;
  version: string;
  claude_code: boolean;
  claude_path: string;
  meta_internal: boolean;
  uptime?: number;
  requests_served?: number;
  validation?: boolean;
}

// ─── Code Tab: Live code/HTML preview from artifacts ─────────────────────────

function CodeTab() {
  const { artifacts, activeArtifactId, setActiveArtifact } = usePreview();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const activeArtifact = artifacts.find(a => a.id === activeArtifactId);

  const handleCopy = async (content: string, id: string) => {
    await navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  useEffect(() => {
    if (activeArtifact?.type === 'html' && iframeRef.current) {
      const doc = iframeRef.current.contentDocument;
      if (doc) { doc.open(); doc.write(activeArtifact.content); doc.close(); }
    }
  }, [activeArtifact]);

  if (artifacts.length === 0) {
    return (
      <div className={styles.rpEmpty}>
        <div className={styles.rpEmptyIcon}>{'</>'}</div>
        <div className={styles.rpEmptyTitle}>Code Preview</div>
        <div className={styles.rpEmptyDesc}>
          Code blocks and HTML from Claude responses will appear here in real-time.
          Ask Claude to write code to get started.
        </div>
      </div>
    );
  }

  return (
    <div className={styles.rpCodeTab}>
      {artifacts.length > 1 && (
        <div className={styles.rpCodeTabs}>
          {artifacts.map((a, i) => (
            <button
              key={a.id}
              className={`${styles.rpCodeTabBtn} ${a.id === activeArtifactId ? styles.rpCodeTabActive : ''}`}
              onClick={() => setActiveArtifact(a.id)}
            >
              {a.title || a.language || `Artifact ${i + 1}`}
            </button>
          ))}
        </div>
      )}
      {activeArtifact && (
        <div className={styles.rpCodeContent}>
          <div className={styles.rpCodeHeader}>
            <span className={styles.rpCodeLang}>
              {activeArtifact.language || activeArtifact.type}
            </span>
            <div className={styles.rpCodeActions}>
              <button className={styles.rpSmallBtn} onClick={() => handleCopy(activeArtifact.content, activeArtifact.id)}>
                {copiedId === activeArtifact.id ? 'Copied!' : 'Copy'}
              </button>
              {activeArtifact.type === 'html' && (
                <button className={styles.rpSmallBtn} onClick={() => {
                  const blob = new Blob([activeArtifact.content], { type: 'text/html' });
                  window.open(URL.createObjectURL(blob), '_blank');
                }}>Open ↗</button>
              )}
            </div>
          </div>
          {activeArtifact.type === 'html' ? (
            <iframe ref={iframeRef} className={styles.rpIframe} sandbox="allow-scripts allow-same-origin" title="Preview" />
          ) : (
            <pre className={styles.rpCodeBlock}>
              <div className={styles.rpCodeLines}>
                {activeArtifact.content.split('\n').map((line, i) => (
                  <div key={i} className={styles.rpCodeLine}>
                    <span className={styles.rpLineNum}>{i + 1}</span>
                    <code>{line}</code>
                  </div>
                ))}
              </div>
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Files Tab: Artifact file browser ────────────────────────────────────────

function FilesTab() {
  const { artifacts } = usePreview();
  const { conversations, activeConversationId } = useChat();
  const activeConvo = conversations.find(c => c.id === activeConversationId);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Collect all code artifacts from conversation messages
  const allArtifacts = [...artifacts];
  const msgArtifacts = activeConvo?.messages
    ?.filter(m => m.artifacts && m.artifacts.length > 0)
    .flatMap(m => m.artifacts ?? []) ?? [];
  // Deduplicate by id
  const seen = new Set(allArtifacts.map(a => a.id));
  for (const a of msgArtifacts) {
    if (!seen.has(a.id)) { allArtifacts.push(a); seen.add(a.id); }
  }

  const selected = allArtifacts.find(a => a.id === selectedFile);

  const handleCopy = async (content: string, id: string) => {
    await navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDownload = (artifact: Artifact) => {
    const ext = artifact.language === 'python' ? '.py'
      : artifact.language === 'javascript' ? '.js'
      : artifact.language === 'typescript' ? '.ts'
      : artifact.language === 'html' ? '.html'
      : artifact.language === 'css' ? '.css'
      : artifact.language === 'json' ? '.json'
      : artifact.type === 'markdown' ? '.md'
      : '.txt';
    const filename = artifact.filename || `${artifact.title || 'file'}${ext}`;
    const blob = new Blob([artifact.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  if (allArtifacts.length === 0) {
    return (
      <div className={styles.rpEmpty}>
        <div className={styles.rpEmptyIcon}>📁</div>
        <div className={styles.rpEmptyTitle}>Files</div>
        <div className={styles.rpEmptyDesc}>
          Generated files, code snippets, and documents will be listed here.
          They are extracted from Claude's responses automatically.
        </div>
      </div>
    );
  }

  return (
    <div className={styles.rpFilesTab}>
      <div className={styles.rpFileList}>
        <div className={styles.rpFileListHeader}>
          <span>{allArtifacts.length} file{allArtifacts.length !== 1 ? 's' : ''}</span>
        </div>
        {allArtifacts.map((a, i) => {
          const icon = a.type === 'code' ? '📄' : a.type === 'html' ? '🌐' : a.type === 'markdown' ? '📝' : '📎';
          return (
            <button
              key={a.id}
              className={`${styles.rpFileItem} ${selectedFile === a.id ? styles.rpFileItemActive : ''}`}
              onClick={() => setSelectedFile(a.id)}
            >
              <span className={styles.rpFileIcon}>{icon}</span>
              <div className={styles.rpFileInfo}>
                <span className={styles.rpFileName}>{a.title || a.filename || `File ${i + 1}`}</span>
                <span className={styles.rpFileMeta}>
                  {a.language || a.type} · {a.content.split('\n').length} lines
                </span>
              </div>
            </button>
          );
        })}
      </div>
      {selected && (
        <div className={styles.rpFilePreview}>
          <div className={styles.rpFilePreviewHeader}>
            <span>{selected.title || selected.filename || 'File'}</span>
            <div className={styles.rpCodeActions}>
              <button className={styles.rpSmallBtn} onClick={() => handleCopy(selected.content, selected.id)}>
                {copiedId === selected.id ? 'Copied!' : 'Copy'}
              </button>
              <button className={styles.rpSmallBtn} onClick={() => handleDownload(selected)}>Download</button>
            </div>
          </div>
          <pre className={styles.rpCodeBlock}>
            <div className={styles.rpCodeLines}>
              {selected.content.split('\n').map((line, i) => (
                <div key={i} className={styles.rpCodeLine}>
                  <span className={styles.rpLineNum}>{i + 1}</span>
                  <code>{line}</code>
                </div>
              ))}
            </div>
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── Data Tab: Session metrics and token usage ───────────────────────────────

function DataTab() {
  const { conversations, activeConversationId } = useChat();
  const activeConvo = conversations.find(c => c.id === activeConversationId);
  const [sessionStart] = useState(() => new Date());
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const msgs = activeConvo?.messages ?? [];
  const assistantMsgs = msgs.filter(m => m.role === 'assistant');
  const totalTokensIn = msgs.reduce((s, m) => s + (m.inputTokens ?? 0), 0);
  const totalTokensOut = msgs.reduce((s, m) => s + (m.outputTokens ?? 0), 0);
  const totalTokens = totalTokensIn + totalTokensOut;

  // Performance metrics
  const ttfts = assistantMsgs.filter(m => m.ttft).map(m => m.ttft!);
  const avgTTFT = ttfts.length > 0 ? Math.round(ttfts.reduce((a, b) => a + b, 0) / ttfts.length) : null;
  const minTTFT = ttfts.length > 0 ? Math.min(...ttfts) : null;
  const maxTTFT = ttfts.length > 0 ? Math.max(...ttfts) : null;

  const totalTimes = assistantMsgs.filter(m => m.totalTime).map(m => m.totalTime!);
  const avgResponseTime = totalTimes.length > 0 ? Math.round(totalTimes.reduce((a, b) => a + b, 0) / totalTimes.length) : null;

  // Token usage per message (bar chart data)
  const tokenBars = assistantMsgs.slice(-10).map((m, i) => ({
    label: `#${i + 1}`,
    tokensIn: m.inputTokens ?? 0,
    tokensOut: m.outputTokens ?? 0,
  }));
  const maxBar = Math.max(...tokenBars.map(b => b.tokensIn + b.tokensOut), 1);

  const elapsed = Math.floor((now.getTime() - sessionStart.getTime()) / 1000);
  const hours = Math.floor(elapsed / 3600);
  const mins = Math.floor((elapsed % 3600) / 60);
  const secs = elapsed % 60;
  const sessionTime = hours > 0 ? `${hours}h ${mins}m ${secs}s` : mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  return (
    <div className={styles.rpDataTab}>
      {/* Session Overview */}
      <div className={styles.rpDataSection}>
        <div className={styles.rpDataSectionTitle}>Session Overview</div>
        <div className={styles.rpDataGrid}>
          <div className={styles.rpDataCard}>
            <div className={styles.rpDataCardValue}>{sessionTime}</div>
            <div className={styles.rpDataCardLabel}>Duration</div>
          </div>
          <div className={styles.rpDataCard}>
            <div className={styles.rpDataCardValue}>{conversations.length}</div>
            <div className={styles.rpDataCardLabel}>Conversations</div>
          </div>
          <div className={styles.rpDataCard}>
            <div className={styles.rpDataCardValue}>{msgs.length}</div>
            <div className={styles.rpDataCardLabel}>Messages</div>
          </div>
          <div className={styles.rpDataCard}>
            <div className={styles.rpDataCardValue}>{totalTokens > 0 ? (totalTokens > 1000 ? `${(totalTokens / 1000).toFixed(1)}k` : totalTokens) : '—'}</div>
            <div className={styles.rpDataCardLabel}>Total Tokens</div>
          </div>
        </div>
      </div>

      {/* Token Breakdown */}
      {totalTokens > 0 && (
        <div className={styles.rpDataSection}>
          <div className={styles.rpDataSectionTitle}>Token Usage</div>
          <div className={styles.rpTokenBar}>
            <div className={styles.rpTokenBarFill} style={{ width: `${totalTokensIn / totalTokens * 100}%` }}>
              <span>Input: {totalTokensIn.toLocaleString()}</span>
            </div>
            <div className={styles.rpTokenBarFillOut} style={{ width: `${totalTokensOut / totalTokens * 100}%` }}>
              <span>Output: {totalTokensOut.toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}

      {/* Performance */}
      <div className={styles.rpDataSection}>
        <div className={styles.rpDataSectionTitle}>Performance</div>
        <div className={styles.rpDataRows}>
          <div className={styles.rpDataRow}>
            <span>Avg TTFT</span>
            <span className={styles.rpDataRowValue}>{avgTTFT !== null ? (avgTTFT > 1000 ? `${(avgTTFT / 1000).toFixed(1)}s` : `${avgTTFT}ms`) : '—'}</span>
          </div>
          <div className={styles.rpDataRow}>
            <span>Min / Max TTFT</span>
            <span className={styles.rpDataRowValue}>
              {minTTFT !== null ? `${minTTFT > 1000 ? (minTTFT / 1000).toFixed(1) + 's' : minTTFT + 'ms'}` : '—'}
              {' / '}
              {maxTTFT !== null ? `${maxTTFT > 1000 ? (maxTTFT / 1000).toFixed(1) + 's' : maxTTFT + 'ms'}` : '—'}
            </span>
          </div>
          <div className={styles.rpDataRow}>
            <span>Avg Response</span>
            <span className={styles.rpDataRowValue}>{avgResponseTime !== null ? (avgResponseTime > 1000 ? `${(avgResponseTime / 1000).toFixed(1)}s` : `${avgResponseTime}ms`) : '—'}</span>
          </div>
          <div className={styles.rpDataRow}>
            <span>Model</span>
            <span className={styles.rpDataRowValue}>{activeConvo?.model || 'default'}</span>
          </div>
        </div>
      </div>

      {/* Token Usage Chart */}
      {tokenBars.length > 0 && tokenBars.some(b => b.tokensIn + b.tokensOut > 0) && (
        <div className={styles.rpDataSection}>
          <div className={styles.rpDataSectionTitle}>Tokens per Response (last 10)</div>
          <div className={styles.rpChart}>
            {tokenBars.map((bar, i) => (
              <div key={i} className={styles.rpChartBar}>
                <div className={styles.rpChartBarStack} style={{ height: `${((bar.tokensIn + bar.tokensOut) / maxBar) * 100}%` }}>
                  <div className={styles.rpChartBarIn} style={{ flex: bar.tokensIn }} />
                  <div className={styles.rpChartBarOut} style={{ flex: bar.tokensOut }} />
                </div>
                <span className={styles.rpChartLabel}>{bar.label}</span>
              </div>
            ))}
          </div>
          <div className={styles.rpChartLegend}>
            <span><span className={styles.rpLegendDotIn} /> Input</span>
            <span><span className={styles.rpLegendDotOut} /> Output</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Debug Tab: Bridge status, connection info, quick reference ──────────────

function DebugTab() {
  const { activeConnection } = useConnection();
  const connected = activeConnection?.status === 'connected';
  const endpoint = activeConnection?.baseUrl || 'http://localhost:8087';
  const [bridge, setBridge] = useState<BridgeHealth | null>(null);
  const [bridgeError, setBridgeError] = useState(false);

  useEffect(() => {
    const check = async () => {
      try {
        const ctrl = new AbortController();
        setTimeout(() => ctrl.abort(), 3000);
        const res = await fetch(`${endpoint}/health`, { signal: ctrl.signal });
        if (res.ok) { setBridge(await res.json()); setBridgeError(false); }
        else { setBridgeError(true); }
      } catch { setBridgeError(true); }
    };
    check();
    const interval = setInterval(check, 15000);
    return () => clearInterval(interval);
  }, [endpoint]);

  return (
    <div className={styles.rpDebugTab}>
      {/* Bridge Status */}
      <div className={styles.rpDebugSection}>
        <div className={styles.rpDebugSectionTitle}>Bridge Connection</div>
        <div className={styles.rpDebugRow}>
          <span>Status</span>
          <span className={bridgeError ? styles.rpDebugError : styles.rpDebugSuccess}>
            <span className={bridgeError ? styles.devDotRed : styles.devDotGreen} />
            {bridgeError ? 'Disconnected' : 'Connected'}
          </span>
        </div>
        {bridge && (
          <>
            <div className={styles.rpDebugRow}><span>Version</span><span>v{bridge.version}</span></div>
            <div className={styles.rpDebugRow}><span>Claude Path</span><span style={{ fontSize: '10px' }}>{bridge.claude_path}</span></div>
            <div className={styles.rpDebugRow}><span>Auth</span><span>{bridge.meta_internal ? 'Meta Internal' : 'Standard'}</span></div>
            {bridge.validation && <div className={styles.rpDebugRow}><span>Validation</span><span className={styles.rpDebugSuccess}>Available</span></div>}
            {bridge.requests_served !== undefined && <div className={styles.rpDebugRow}><span>Requests Served</span><span>{bridge.requests_served}</span></div>}
          </>
        )}
      </div>

      {/* Connection */}
      <div className={styles.rpDebugSection}>
        <div className={styles.rpDebugSectionTitle}>Connection</div>
        <div className={styles.rpDebugRow}>
          <span>App Status</span>
          <span className={connected ? styles.rpDebugSuccess : styles.rpDebugError}>
            <span className={connected ? styles.devDotGreen : styles.devDotRed} />
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        <div className={styles.rpDebugRow}><span>Endpoint</span><span style={{ fontSize: '10px' }}>{endpoint}</span></div>
      </div>

      {/* Quick Reference */}
      <div className={styles.rpDebugSection}>
        <div className={styles.rpDebugSectionTitle}>Quick Reference</div>
        {[
          { label: 'Health Check', cmd: 'curl localhost:8087/health' },
          { label: 'Start Bridge', cmd: 'node bridge/arcadia-bridge.js' },
          { label: 'Kill Bridge', cmd: 'pkill -f arcadia-bridge' },
          { label: 'View Logs', cmd: 'cat ~/.arcadia-bridge/bridge.log' },
          { label: 'Update', cmd: 'cd ~/Arcadia && git pull origin main' },
        ].map(item => (
          <div key={item.label} className={styles.rpDebugCmd}>
            <span className={styles.rpDebugCmdLabel}>{item.label}</span>
            <code className={styles.rpDebugCmdCode}>{item.cmd}</code>
          </div>
        ))}
      </div>

      {/* Recent Errors */}
      <div className={styles.rpDebugSection}>
        <div className={styles.rpDebugSectionTitle}>Recent API Errors</div>
        {(() => {
          const errors = getApiLogs().filter(l => l.direction === 'error').slice(-5);
          if (errors.length === 0) return <div className={styles.rpDebugNoErrors}>No errors recorded</div>;
          return errors.map(err => (
            <div key={err.id} className={styles.rpDebugErrorItem}>
              <span className={styles.rpDebugErrorTime}>{new Date(err.timestamp).toLocaleTimeString()}</span>
              <span className={styles.rpDebugErrorMsg}>{String((err.data as Record<string, unknown>)?.message || err.data).slice(0, 100)}</span>
            </div>
          ));
        })()}
      </div>
    </div>
  );
}

// ─── Output Tab: Live response output stream ─────────────────────────────────

function OutputTab() {
  const { conversations, activeConversationId } = useChat();
  const activeConvo = conversations.find(c => c.id === activeConversationId);
  const outputRef = useRef<HTMLDivElement>(null);

  // Get last few assistant messages as output
  const assistantMsgs = activeConvo?.messages?.filter(m => m.role === 'assistant').slice(-5) ?? [];

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [assistantMsgs.length]);

  if (assistantMsgs.length === 0) {
    return (
      <div className={styles.rpEmpty}>
        <div className={styles.rpEmptyIcon}>📤</div>
        <div className={styles.rpEmptyTitle}>Output</div>
        <div className={styles.rpEmptyDesc}>
          Claude's responses will stream here in real-time.
          Send a message to see the output.
        </div>
      </div>
    );
  }

  return (
    <div className={styles.rpOutputTab} ref={outputRef}>
      {assistantMsgs.map((msg, i) => (
        <div key={msg.id} className={styles.rpOutputBlock}>
          <div className={styles.rpOutputHeader}>
            <span className={styles.rpOutputNum}>Response #{i + 1}</span>
            <span className={styles.rpOutputMeta}>
              {msg.outputTokens ? `${msg.outputTokens} tokens` : ''}
              {msg.totalTime ? ` · ${msg.totalTime > 1000 ? `${(msg.totalTime / 1000).toFixed(1)}s` : `${msg.totalTime}ms`}` : ''}
            </span>
          </div>
          {msg.thinkingText && (
            <details className={styles.rpOutputThinking}>
              <summary>Thinking</summary>
              <pre>{msg.thinkingText}</pre>
            </details>
          )}
          <pre className={styles.rpOutputContent}>{msg.content}</pre>
          {msg.toolCalls && msg.toolCalls.length > 0 && (
            <div className={styles.rpOutputTools}>
              <span className={styles.rpOutputToolLabel}>Tools used:</span>
              {msg.toolCalls.map(tc => (
                <span key={tc.id} className={styles.rpOutputToolBadge}>{tc.name}</span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Right Panel Workspace ───────────────────────────────────────────────────

function RightPanelWorkspace() {
  const [activeTab, setActiveTab] = useState<RightTab>('code');
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <div className={styles.rpCollapsed}>
        <button className={styles.rpExpandBtn} onClick={() => setCollapsed(false)} title="Show panel">
          ◁
        </button>
      </div>
    );
  }

  return (
    <div className={styles.rpPanel}>
      <div className={styles.rpHeader}>
        <div className={styles.rpTabs}>
          {([['code', '</>', 'Code'], ['files', '📁', 'Files'], ['data', '📊', 'Data'], ['debug', '🔧', 'Debug'], ['output', '📤', 'Output']] as [RightTab, string, string][]).map(([id, icon, label]) => (
            <button
              key={id}
              className={`${styles.rpTab} ${activeTab === id ? styles.rpTabActive : ''}`}
              onClick={() => setActiveTab(id)}
              title={label}
            >
              <span className={styles.rpTabIcon}>{icon}</span>
              <span className={styles.rpTabLabel}>{label}</span>
            </button>
          ))}
        </div>
        <button className={styles.rpCollapseBtn} onClick={() => setCollapsed(true)} title="Collapse">▷</button>
      </div>
      <div className={styles.rpContent}>
        {activeTab === 'code' && <CodeTab />}
        {activeTab === 'files' && <FilesTab />}
        {activeTab === 'data' && <DataTab />}
        {activeTab === 'debug' && <DebugTab />}
        {activeTab === 'output' && <OutputTab />}
      </div>
    </div>
  );
}

// ─── Main EngineerView ────────────────────────────────────────────────────────

export function EngineerView() {
  const [tab, setTab] = useState<EngTab>('terminal');

  return (
    <div className={styles.engineerWrapper}>
      <div className={styles.container}>
        <div className={styles.tabBar}>
          {(['chat', 'validate', 'logs', 'terminal', 'debug'] as EngTab[]).map(t => (
            <button
              key={t}
              className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`}
              onClick={() => setTab(t)}
            >
              {t === 'chat' && '💬 Chat'}
              {t === 'validate' && '✅ Validate'}
              {t === 'logs' && '📡 API Logs'}
              {t === 'terminal' && '⌨ Terminal'}
              {t === 'debug' && '🐛 Debug'}
            </button>
          ))}
        </div>
        <div className={styles.tabContent}>
          {tab === 'chat' && <EngineerChat />}
          {tab === 'validate' && <ValidationPanel />}
          {tab === 'logs' && <ApiLogsPanel />}
          {tab === 'terminal' && <Terminal />}
          {tab === 'debug' && <DebugPanel />}
        </div>
      </div>
      <RightPanelWorkspace />
    </div>
  );
}
