import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useConnection } from '../../store/ConnectionContext';
import { useChat } from '../../store/ChatContext';
import { sendMessage, getApiLogs, clearApiLogs, subscribeToApiLogs } from '../../services/claude';
import { trackMessage } from '../../services/analytics';
import type { Message, ApiLogEntry, ImageAttachment, ToolDefinition, ToolUseBlock } from '../../types';
import { CLAUDE_MODELS } from '../../types';
import styles from './EngineerView.module.css';

type EngTab = 'chat' | 'logs' | 'terminal' | 'debug';

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
  const { getActiveConversation, addMessage, createConversation, isStreaming, setStreaming, streamingText, setStreamingText, appendStreamingText, streamingReasoning, appendStreamingReasoning, setStreamingReasoning } = useChat();

  const [input, setInput] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [showSystem, setShowSystem] = useState(false);
  const [enableTools, setEnableTools] = useState(false);
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [error, setError] = useState('');
  const [showThinkingFor, setShowThinkingFor] = useState<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const conversation = getActiveConversation();
  const messages = conversation?.messages ?? [];

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, streamingText]);

  const modelInfo = CLAUDE_MODELS.find(m => m.id === activeConnection?.model);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text && images.length === 0) return;
    if (!activeConnection) { setError('Connecting to Meta infrastructure... Please wait.'); return; }
    if (isStreaming) return;

    setError('');
    setInput('');
    setImages([]);

    let convId = conversation?.id;
    if (!convId) convId = createConversation(activeConnection.model);

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
    setStreaming(true);
    setStreamingText('');
    setStreamingReasoning('');
    abortRef.current = new AbortController();

    const allMessages = [...(conversation?.messages ?? []), userMsg];

    try {
      const result = await sendMessage({
        connection: activeConnection,
        messages: allMessages,
        systemPrompt: systemPrompt || undefined,
        tools: enableTools ? BUILTIN_TOOLS : undefined,
        onToken: appendStreamingText,
        onThinking: appendStreamingReasoning,
        onToolCall: (tc) => {
          // Execute built-in tool and show result
          const toolResult = executeBuiltinTool(tc.name, tc.input);
          console.log(`Tool ${tc.name} result:`, toolResult);
        },
        signal: abortRef.current.signal,
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
      setStreaming(false);
      setStreamingText('');
      setStreamingReasoning('');
    }
  }, [input, images, activeConnection, isStreaming, conversation, createConversation, addMessage, setStreaming, setStreamingText, appendStreamingText, setStreamingReasoning, appendStreamingReasoning, systemPrompt, enableTools]);

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
                {msg.role === 'assistant' ? (
                  msg.content ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                  ) : (
                    <p style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>Empty response — bridge may have returned no content.</p>
                  )
                ) : (
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
              {streamingText ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingText}</ReactMarkdown>
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
            disabled={!activeConnection || isStreaming}
          />
          {isStreaming ? (
            <button className={styles.engStopBtn} onClick={() => abortRef.current?.abort()}>⏹</button>
          ) : (
            <button className={styles.engSendBtn} onClick={handleSend} disabled={!input.trim() && images.length === 0}>↑</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main EngineerView ────────────────────────────────────────────────────────

export function EngineerView() {
  const [tab, setTab] = useState<EngTab>('chat');

  return (
    <div className={styles.container}>
      <div className={styles.tabBar}>
        {(['chat', 'logs', 'terminal', 'debug'] as EngTab[]).map(t => (
          <button
            key={t}
            className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'chat' && '💬 Chat'}
            {t === 'logs' && '📡 API Logs'}
            {t === 'terminal' && '⌨ Terminal'}
            {t === 'debug' && '🐛 Debug'}
          </button>
        ))}
      </div>
      <div className={styles.tabContent}>
        {tab === 'chat' && <EngineerChat />}
        {tab === 'logs' && <ApiLogsPanel />}
        {tab === 'terminal' && <Terminal />}
        {tab === 'debug' && <DebugPanel />}
      </div>
    </div>
  );
}
