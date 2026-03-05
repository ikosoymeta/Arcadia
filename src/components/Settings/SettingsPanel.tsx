import { useState, useRef } from 'react';
import { useConnection } from '../../store/ConnectionContext';
import { CLAUDE_MODELS, getModelInfo } from '../../types';
import { getRemoteBridgeConfig, setRemoteBridgeConfig, testBridgeConnection, normalizeBridgeUrl, type RemoteBridgeConfig } from '../../services/bridge';
import styles from './Settings.module.css';

type ConnectionType = 'apikey' | 'proxy';

export function SettingsPanel() {
  const {
    connections,
    activeConnection,
    addConnection,
    updateConnection,
    deleteConnection,
    setActiveConnection,
    testConnection,
  } = useConnection();

  const [showForm, setShowForm] = useState(connections.length === 0);
  const [connectionType, setConnectionType] = useState<ConnectionType>('apikey');
  const [showKey, setShowKey] = useState(false);
  const [formData, setFormData] = useState({
    label: '',
    apiKey: '',
    baseUrl: '',
    model: 'claude-sonnet-4-6',
    maxTokens: 8096,
    temperature: 0.7,
    enableThinking: false,
    thinkingBudget: 10000,
    effort: 'medium' as 'max' | 'high' | 'medium' | 'low',
    enableCaching: true,
  });
  const [testResult, setTestResult] = useState<{ id: string; success: boolean } | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Remote Bridge state
  const [remoteBridge, setRemoteBridge] = useState<RemoteBridgeConfig>(() => getRemoteBridgeConfig());
  const [bridgeTestResult, setBridgeTestResult] = useState<{ ok: boolean; latency: number; version?: string; platform?: string; error?: string } | null>(null);
  const [bridgeTesting, setBridgeTesting] = useState(false);
  const [bridgeUrlInput, setBridgeUrlInput] = useState(() => getRemoteBridgeConfig().url);
  const autoTestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [copiedCmd, setCopiedCmd] = useState(false);

  const handleBridgeToggle = (enabled: boolean) => {
    const updated = { ...remoteBridge, enabled };
    setRemoteBridge(updated);
    setRemoteBridgeConfig(updated);
    setBridgeTestResult(null);
  };

  const handleBridgeUrlInput = (raw: string) => {
    setBridgeUrlInput(raw);
    setBridgeTestResult(null);
    // Auto-test after 1.5s of no typing
    if (autoTestTimer.current) clearTimeout(autoTestTimer.current);
    if (raw.trim().length > 5) {
      autoTestTimer.current = setTimeout(async () => {
        const normalized = normalizeBridgeUrl(raw);
        if (!normalized) return;
        setBridgeTesting(true);
        const result = await testBridgeConnection(normalized);
        setBridgeTestResult(result);
        setBridgeTesting(false);
        // Auto-enable on successful test
        if (result.ok) {
          const updated = { enabled: true, url: normalized };
          setRemoteBridge(updated);
          setRemoteBridgeConfig(updated);
          setBridgeUrlInput(normalized);
        }
      }, 1500);
    }
  };

  const handleBridgeTest = async () => {
    const normalized = normalizeBridgeUrl(bridgeUrlInput);
    if (!normalized) return;
    setBridgeTesting(true);
    setBridgeTestResult(null);
    const result = await testBridgeConnection(normalized);
    setBridgeTestResult(result);
    setBridgeTesting(false);
    // Auto-enable on success
    if (result.ok) {
      const updated = { enabled: true, url: normalized };
      setRemoteBridge(updated);
      setRemoteBridgeConfig(updated);
      setBridgeUrlInput(normalized);
    }
  };

  const handleDisconnectRemote = () => {
    const updated = { enabled: false, url: '' };
    setRemoteBridge(updated);
    setRemoteBridgeConfig(updated);
    setBridgeUrlInput('');
    setBridgeTestResult(null);
  };

  const copyBridgeCommand = () => {
    navigator.clipboard.writeText('cd ~/Arcadia && node bridge/arcadia-bridge.js --host 0.0.0.0');
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  };

  const selectedModelInfo = getModelInfo(formData.model);

  const resetForm = () => {
    setFormData({ label: '', apiKey: '', baseUrl: '', model: 'claude-sonnet-4-6', maxTokens: 8096, temperature: 0.7, enableThinking: false, thinkingBudget: 10000, effort: 'medium' as 'max' | 'high' | 'medium' | 'low', enableCaching: true });
    setConnectionType('apikey');
    setShowForm(false);
    setEditingId(null);
    setShowKey(false);
  };

  const handleAdd = () => {
    if (!formData.label) return;
    if (connectionType === 'apikey' && !formData.apiKey) return;
    if (connectionType === 'proxy' && !formData.baseUrl) return;

    if (editingId) {
      updateConnection(editingId, {
        label: formData.label,
        apiKey: connectionType === 'apikey' ? formData.apiKey : '',
        model: formData.model,
        maxTokens: formData.maxTokens,
        temperature: formData.temperature,
        baseUrl: connectionType === 'proxy' ? formData.baseUrl : undefined,
        enableThinking: formData.enableThinking,
        thinkingBudget: formData.thinkingBudget,
        effort: formData.effort,
        enableCaching: formData.enableCaching,
      });
    } else {
      addConnection({
        label: formData.label,
        apiKey: connectionType === 'apikey' ? formData.apiKey : '',
        model: formData.model,
        maxTokens: formData.maxTokens,
        temperature: formData.temperature,
        baseUrl: connectionType === 'proxy' ? formData.baseUrl : undefined,
        enableThinking: formData.enableThinking,
        thinkingBudget: formData.thinkingBudget,
        effort: formData.effort,
        enableCaching: formData.enableCaching,
      });
    }
    resetForm();
  };

  const handleEdit = (id: string) => {
    const conn = connections.find(c => c.id === id);
    if (!conn) return;
    setFormData({
      label: conn.label,
      apiKey: conn.apiKey,
      baseUrl: conn.baseUrl ?? '',
      model: conn.model,
      maxTokens: conn.maxTokens,
      temperature: conn.temperature,
      enableThinking: conn.enableThinking ?? false,
      thinkingBudget: conn.thinkingBudget ?? 10000,
      effort: conn.effort ?? 'medium',
      enableCaching: conn.enableCaching ?? true,
    });
    setConnectionType(conn.baseUrl ? 'proxy' : 'apikey');
    setEditingId(id);
    setShowForm(true);
  };

  const handleTest = async (id: string) => {
    setTesting(id);
    setTestResult(null);
    const success = await testConnection(id);
    setTestResult({ id, success });
    setTesting(null);
  };

  const handleToggleThinking = (id: string, enabled: boolean) => {
    updateConnection(id, { enableThinking: enabled });
  };

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px', height: '100%', overflowY: 'auto' }}>
      <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '4px' }}>
        Settings
      </h2>
      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px' }}>
        Configure your Claude API connections and preferences.
      </p>

      {/* Connection list */}
      <div className={styles.section} style={{ background: 'var(--bg-secondary)', borderRadius: '14px', border: '1px solid var(--border)', marginBottom: '16px', overflow: 'hidden' }}>
        <div className={styles.sectionTitle}>API Connections</div>

        {connections.length === 0 && !showForm && (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px' }}>
            Auto-configuring connection... This happens automatically on the Meta network.
          </div>
        )}

        {connections.length > 0 && (
          <div className={styles.connList}>
            {connections.map(conn => {
              const mInfo = getModelInfo(conn.model);
              return (
                <div
                  key={conn.id}
                  className={`${styles.connCard} ${conn.isActive ? styles.active : ''}`}
                  onClick={() => setActiveConnection(conn.id)}
                >
                  <div className={`${styles.connStatus} ${styles[conn.status]}`} />
                  <div className={styles.connInfo}>
                    <div className={styles.connName}>
                      {conn.label}
                      {conn.isActive && <span style={{ fontSize: '10px', background: 'var(--accent)', color: '#fff', padding: '1px 6px', borderRadius: '10px', marginLeft: '6px' }}>Active</span>}
                    </div>
                    <div className={styles.connModel}>
                      {mInfo?.label ?? conn.model}
                      {conn.enableThinking && <span style={{ color: '#a78bfa', marginLeft: '6px' }}>🧠 Thinking ON</span>}
                      {conn.effort && conn.effort !== 'high' && <span style={{ color: '#fbbf24', marginLeft: '6px' }}>⚡ {conn.effort}</span>}
                      {conn.enableCaching !== false && <span style={{ color: '#34d399', marginLeft: '6px' }}>🗄️ Cached</span>}
                      {conn.baseUrl
                        ? ` · ${conn.baseUrl}`
                        : conn.apiKey
                          ? ` · ${conn.apiKey.slice(0, 8)}...${conn.apiKey.slice(-4)}`
                          : ''}
                    </div>
                  </div>
                  <div className={styles.connActions}>
                    {mInfo?.supportsThinking && (
                      <button
                        className={styles.connActionBtn}
                        style={{ color: conn.enableThinking ? '#a78bfa' : undefined }}
                        onClick={e => { e.stopPropagation(); handleToggleThinking(conn.id, !conn.enableThinking); }}
                        title="Toggle extended thinking"
                      >
                        🧠
                      </button>
                    )}
                    <button
                      className={styles.connActionBtn}
                      onClick={e => { e.stopPropagation(); handleTest(conn.id); }}
                      disabled={testing === conn.id}
                    >
                      {testing === conn.id ? '...' : 'Test'}
                    </button>
                    <button
                      className={styles.connActionBtn}
                      onClick={e => { e.stopPropagation(); handleEdit(conn.id); }}
                    >
                      ✎
                    </button>
                    <button
                      className={`${styles.connActionBtn} ${styles.danger}`}
                      onClick={e => { e.stopPropagation(); deleteConnection(conn.id); }}
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {testResult && (
          <div className={`${styles.testResult} ${testResult.success ? styles.success : styles.failure}`}>
            {testResult.success ? '✓ Connection successful!' : '✗ Connection failed. Check your API key.'}
          </div>
        )}

        {!showForm ? (
          <div className={styles.btnRow} style={{ padding: '12px 16px' }}>
            <button className={styles.primaryBtn} onClick={() => setShowForm(true)}>
              + Add Connection
            </button>
          </div>
        ) : (
          <div style={{ padding: '16px', borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '16px' }}>
              {editingId ? 'Edit Connection' : 'New Connection'}
            </div>

            {/* Connection type */}
            <div className={styles.field}>
              <label className={styles.label}>Connection Type</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className={connectionType === 'apikey' ? styles.primaryBtn : styles.secondaryBtn}
                  onClick={() => setConnectionType('apikey')}
                  style={{ flex: 1 }}
                >
                  🔑 API Key
                </button>
                <button
                  className={connectionType === 'proxy' ? styles.primaryBtn : styles.secondaryBtn}
                  onClick={() => setConnectionType('proxy')}
                  style={{ flex: 1 }}
                >
                  🔌 Custom Proxy
                </button>
              </div>
            </div>

            {/* Label */}
            <div className={styles.field}>
              <label className={styles.label}>Name</label>
              <input
                className={styles.input}
                value={formData.label}
                onChange={e => setFormData(p => ({ ...p, label: e.target.value }))}
                placeholder={connectionType === 'apikey' ? 'My Claude Key' : 'Custom Proxy'}
                autoFocus
              />
            </div>

            {/* API Key or Proxy URL */}
            {connectionType === 'apikey' ? (
              <div className={styles.field}>
                <label className={styles.label}>
                  Anthropic API Key
                  <a href="https://console.anthropic.com/keys" target="_blank" rel="noreferrer"
                    style={{ marginLeft: '8px', fontSize: '11px', color: 'var(--accent)', textDecoration: 'none' }}>
                    Get key →
                  </a>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    className={styles.input}
                    type={showKey ? 'text' : 'password'}
                    value={formData.apiKey}
                    onChange={e => setFormData(p => ({ ...p, apiKey: e.target.value }))}
                    placeholder="sk-ant-api03-..."
                    style={{ paddingRight: '40px' }}
                  />
                  <button
                    onClick={() => setShowKey(p => !p)}
                    style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: '14px' }}
                  >
                    {showKey ? '🙈' : '👁'}
                  </button>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                  🔒 Stored only in your browser. Never sent to our servers.
                </div>
              </div>
            ) : (
              <div className={styles.field}>
                <label className={styles.label}>Proxy URL</label>
                <input
                  className={styles.input}
                  value={formData.baseUrl}
                  onChange={e => setFormData(p => ({ ...p, baseUrl: e.target.value }))}
                  placeholder="http://localhost:8087"
                />
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                  Use for Meta LDAR or other Claude-compatible proxies.
                </div>
              </div>
            )}

            {/* Model */}
            <div className={styles.field}>
              <label className={styles.label}>Claude Model</label>
              <select
                className={styles.select}
                value={formData.model}
                onChange={e => setFormData(p => ({ ...p, model: e.target.value }))}
              >
                {CLAUDE_MODELS.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.label}{m.badge ? ` — ${m.badge}` : ''}
                  </option>
                ))}
              </select>
              {selectedModelInfo && (
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                  {selectedModelInfo.desc} · {(selectedModelInfo.contextWindow / 1000).toFixed(0)}K context
                </div>
              )}
            </div>

            {/* Extended Thinking */}
            {selectedModelInfo?.supportsThinking && (
              <div className={styles.field}>
                <label className={styles.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    checked={formData.enableThinking}
                    onChange={e => setFormData(p => ({ ...p, enableThinking: e.target.checked }))}
                  />
                  🧠 Enable Extended Thinking
                </label>
                {formData.enableThinking && (
                  <div style={{ marginTop: '8px' }}>
                    <label className={styles.label}>Thinking Budget (tokens): {formData.thinkingBudget.toLocaleString()}</label>
                    <input
                      className={styles.slider}
                      type="range"
                      min={1024}
                      max={100000}
                      step={1024}
                      value={formData.thinkingBudget}
                      onChange={e => setFormData(p => ({ ...p, thinkingBudget: parseInt(e.target.value) }))}
                    />
                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                      Higher budget = deeper reasoning, more tokens used.
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Max tokens & temperature */}
            <div className={styles.row}>
              <div className={styles.field}>
                <label className={styles.label}>Max Output Tokens</label>
                <input
                  className={styles.input}
                  type="number"
                  value={formData.maxTokens}
                  onChange={e => setFormData(p => ({ ...p, maxTokens: parseInt(e.target.value) || 8096 }))}
                  min={1}
                  max={200000}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Temperature: {formData.temperature}</label>
                <input
                  className={styles.slider}
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={formData.temperature}
                  onChange={e => setFormData(p => ({ ...p, temperature: parseFloat(e.target.value) }))}
                  disabled={formData.enableThinking}
                />
                {formData.enableThinking && (
                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                    Fixed at 1.0 when thinking is enabled.
                  </div>
                )}
              </div>
            </div>

            {/* Effort & Caching - Performance controls */}
            <div className={styles.row}>
              <div className={styles.field}>
                <label className={styles.label}>⚡ Effort Level: {formData.effort}</label>
                <select
                  className={styles.input}
                  value={formData.effort}
                  onChange={e => setFormData(p => ({ ...p, effort: e.target.value as 'max' | 'high' | 'medium' | 'low' }))}
                >
                  <option value="low">Low — fastest, concise responses</option>
                  <option value="medium">Medium — balanced (recommended)</option>
                  <option value="high">High — thorough, default behavior</option>
                  <option value="max">Max — deepest reasoning (Opus only)</option>
                </select>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                  Lower effort = faster responses, fewer tokens. Terminal always uses "low".
                </div>
              </div>
              <div className={styles.field}>
                <label className={styles.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    checked={formData.enableCaching}
                    onChange={e => setFormData(p => ({ ...p, enableCaching: e.target.checked }))}
                  />
                  🗄️ Prompt Caching
                </label>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                  Caches conversation prefix for faster TTFT. Cache hits cost 90% less.
                </div>
              </div>
            </div>

            <div className={styles.btnRow}>
              <button
                className={styles.primaryBtn}
                onClick={handleAdd}
                disabled={!formData.label || (connectionType === 'apikey' && !formData.apiKey) || (connectionType === 'proxy' && !formData.baseUrl)}
              >
                {editingId ? 'Save Changes' : 'Add Connection'}
              </button>
              <button className={styles.secondaryBtn} onClick={resetForm}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* Active config summary */}
      <div className={styles.section} style={{ background: 'var(--bg-secondary)', borderRadius: '14px', border: '1px solid var(--border)' }}>
        <div className={styles.sectionTitle}>Active Configuration</div>
        <div style={{ padding: '12px 16px' }}>
          {activeConnection ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <tbody>
                {[
                  ['Model', getModelInfo(activeConnection.model)?.label ?? activeConnection.model],
                  ['Endpoint', activeConnection.baseUrl || 'api.anthropic.com (direct)'],
                  ['Max Tokens', activeConnection.maxTokens.toLocaleString()],
                  ['Temperature', activeConnection.enableThinking ? '1.0 (thinking)' : String(activeConnection.temperature)],
                  ['Extended Thinking', activeConnection.enableThinking ? `Enabled (${(activeConnection.thinkingBudget ?? 10000).toLocaleString()} tokens)` : 'Disabled'],
                  ['Status', activeConnection.status],
                ].map(([k, v]) => (
                  <tr key={k} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '7px 0', color: 'var(--text-secondary)', width: '40%', fontWeight: 500 }}>{k}</td>
                    <td style={{ padding: '7px 0', color: k === 'Status' ? (activeConnection.status === 'connected' ? 'var(--success)' : 'var(--text-tertiary)') : 'var(--text-primary)' }}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', textAlign: 'center', padding: '12px 0' }}>
              No active connection. Add one above to start chatting.
            </div>
          )}
        </div>
      </div>

      {/* Remote Second Brain Bridge */}
      <div className={styles.section} style={{ background: 'var(--bg-secondary)', borderRadius: '14px', border: '1px solid var(--border)', marginTop: '16px' }}>
        <div className={styles.sectionTitle} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>🧠 Remote Second Brain</span>
          <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '20px', background: remoteBridge.enabled ? '#22c55e18' : '#64748b18', color: remoteBridge.enabled ? '#22c55e' : '#64748b', fontWeight: 600 }}>
            {remoteBridge.enabled ? `✅ Connected` : 'Not connected'}
          </span>
        </div>
        <div style={{ padding: '12px 16px' }}>

          {/* Connected state */}
          {remoteBridge.enabled && bridgeTestResult?.ok ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ padding: '14px 16px', borderRadius: '10px', background: '#22c55e08', border: '1px solid #22c55e25' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#22c55e' }}>✅ Remote Bridge Connected</span>
                  <button onClick={handleDisconnectRemote} style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '6px', border: '1px solid #ef444440', background: 'transparent', color: '#ef4444', cursor: 'pointer', fontWeight: 500 }}>Disconnect</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  <div><span style={{ color: 'var(--text-tertiary)' }}>URL:</span> <span style={{ fontFamily: 'monospace', color: 'var(--text-primary)' }}>{remoteBridge.url}</span></div>
                  <div><span style={{ color: 'var(--text-tertiary)' }}>Latency:</span> <span style={{ color: bridgeTestResult.latency < 200 ? '#22c55e' : bridgeTestResult.latency < 500 ? '#eab308' : '#ef4444' }}>{bridgeTestResult.latency}ms</span></div>
                  {bridgeTestResult.version && <div><span style={{ color: 'var(--text-tertiary)' }}>Bridge:</span> v{bridgeTestResult.version}</div>}
                  {bridgeTestResult.platform && <div><span style={{ color: 'var(--text-tertiary)' }}>Platform:</span> {bridgeTestResult.platform}</div>}
                </div>
              </div>
              <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', lineHeight: '1.5' }}>
                All Second Brain features are now routed through the remote bridge. Open the 🧠 Second Brain panel to use slash commands, or type <code style={{ background: 'var(--bg-primary)', padding: '1px 5px', borderRadius: '3px', fontFamily: 'monospace' }}>brain /daily-brief</code> in the Terminal.
              </p>
            </div>
          ) : (
            /* Setup state */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6', margin: 0 }}>
                Access your Second Brain from a remote machine (e.g., Mac laptop, OnDemand devserver). Just enter the address and we'll connect automatically.
              </p>

              {/* Step 1: Start bridge on remote */}
              <div style={{ padding: '12px 14px', borderRadius: '10px', background: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#6366f120', color: '#818cf8', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>1</span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Start the bridge on your remote machine</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <code style={{ flex: 1, display: 'block', padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: '6px', fontFamily: 'monospace', fontSize: '12px', color: '#a78bfa', userSelect: 'all' }}>
                    cd ~/Arcadia && node bridge/arcadia-bridge.js --host 0.0.0.0
                  </code>
                  <button onClick={copyBridgeCommand} style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: copiedCmd ? '#22c55e' : 'var(--text-secondary)', cursor: 'pointer', fontSize: '12px', fontWeight: 500, whiteSpace: 'nowrap', minWidth: '60px' }}>
                    {copiedCmd ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              {/* Step 2: Enter URL */}
              <div style={{ padding: '12px 14px', borderRadius: '10px', background: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#6366f120', color: '#818cf8', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>2</span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Enter the remote machine's address</span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    className={styles.input}
                    value={bridgeUrlInput}
                    onChange={e => handleBridgeUrlInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleBridgeTest()}
                    placeholder="devserver-hostname or IP address"
                    style={{ flex: 1, fontFamily: 'monospace' }}
                  />
                  <button
                    className={styles.primaryBtn}
                    onClick={handleBridgeTest}
                    disabled={bridgeTesting || !bridgeUrlInput.trim()}
                    style={{ whiteSpace: 'nowrap', minWidth: '90px' }}
                  >
                    {bridgeTesting ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ display: 'inline-block', width: '12px', height: '12px', border: '2px solid #fff4', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                        Testing…
                      </span>
                    ) : 'Connect'}
                  </button>
                </div>
                <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', margin: '6px 0 0', lineHeight: '1.4' }}>
                  Just type the hostname or IP — we'll add <code style={{ background: 'var(--bg-secondary)', padding: '0 3px', borderRadius: '2px' }}>http://</code> and port <code style={{ background: 'var(--bg-secondary)', padding: '0 3px', borderRadius: '2px' }}>:8087</code> automatically.
                </p>
              </div>

              {/* Test result */}
              {bridgeTestResult && (
                <div style={{
                  fontSize: '12px',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  background: bridgeTestResult.ok ? '#22c55e10' : '#ef444410',
                  border: `1px solid ${bridgeTestResult.ok ? '#22c55e30' : '#ef444430'}`,
                  color: bridgeTestResult.ok ? '#22c55e' : '#ef4444',
                  fontWeight: 500,
                }}>
                  {bridgeTestResult.ok
                    ? `✅ Connected! Bridge v${bridgeTestResult.version || '?'} on ${bridgeTestResult.platform || 'unknown'} (${bridgeTestResult.latency}ms). Remote mode is now active.`
                    : `❌ ${bridgeTestResult.error || 'Connection failed'}. Make sure the bridge is running on the remote machine and port 8087 is accessible.`}
                </div>
              )}

              {/* Troubleshooting tips (shown only on failure) */}
              {bridgeTestResult && !bridgeTestResult.ok && (
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', lineHeight: '1.6', padding: '10px 14px', background: 'var(--bg-primary)', borderRadius: '8px' }}>
                  <strong style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Troubleshooting:</strong>
                  <div>• Verify the bridge is running: <code>curl http://&lt;hostname&gt;:8087/health</code></div>
                  <div>• Check that port 8087 is not blocked by a firewall</div>
                  <div>• For OD devservers, make sure port forwarding is configured</div>
                  <div>• Ensure the bridge was started with <code>--host 0.0.0.0</code> (not just localhost)</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
