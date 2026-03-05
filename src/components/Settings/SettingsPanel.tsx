import { useState } from 'react';
import { useConnection } from '../../store/ConnectionContext';
import { CLAUDE_MODELS, getModelInfo } from '../../types';
import { getRemoteBridgeConfig, setRemoteBridgeConfig, testBridgeConnection, type RemoteBridgeConfig } from '../../services/bridge';
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
  const [bridgeTestResult, setBridgeTestResult] = useState<{ ok: boolean; latency: number; error?: string } | null>(null);
  const [bridgeTesting, setBridgeTesting] = useState(false);

  const handleBridgeToggle = (enabled: boolean) => {
    const updated = { ...remoteBridge, enabled };
    setRemoteBridge(updated);
    setRemoteBridgeConfig(updated);
    setBridgeTestResult(null);
  };

  const handleBridgeUrlChange = (url: string) => {
    const updated = { ...remoteBridge, url };
    setRemoteBridge(updated);
    setRemoteBridgeConfig(updated);
    setBridgeTestResult(null);
  };

  const handleBridgeTest = async () => {
    if (!remoteBridge.url.trim()) return;
    setBridgeTesting(true);
    setBridgeTestResult(null);
    const result = await testBridgeConnection(remoteBridge.url.trim().replace(/\/+$/, ''));
    setBridgeTestResult(result);
    setBridgeTesting(false);
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
            {remoteBridge.enabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
        <div style={{ padding: '12px 16px' }}>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '12px' }}>
            For Windows users with Second Brain running on a remote machine (e.g., OnDemand devserver).
            Configure the remote bridge URL to access your Second Brain from this device.
          </p>

          {/* Enable toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <label style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                checked={remoteBridge.enabled}
                onChange={e => handleBridgeToggle(e.target.checked)}
                style={{ accentColor: '#6366f1', width: '16px', height: '16px' }}
              />
              Use remote bridge instead of localhost
            </label>
          </div>

          {/* URL input (shown when enabled) */}
          {remoteBridge.enabled && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label className={styles.label}>Remote Bridge URL</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    className={styles.input}
                    value={remoteBridge.url}
                    onChange={e => handleBridgeUrlChange(e.target.value)}
                    placeholder="http://your-devserver.example.com:8087"
                    style={{ flex: 1 }}
                  />
                  <button
                    className={styles.primaryBtn}
                    onClick={handleBridgeTest}
                    disabled={bridgeTesting || !remoteBridge.url.trim()}
                    style={{ whiteSpace: 'nowrap', minWidth: '80px' }}
                  >
                    {bridgeTesting ? 'Testing...' : 'Test'}
                  </button>
                </div>
              </div>

              {/* Test result */}
              {bridgeTestResult && (
                <div style={{
                  fontSize: '12px',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  background: bridgeTestResult.ok ? '#22c55e10' : '#ef444410',
                  border: `1px solid ${bridgeTestResult.ok ? '#22c55e30' : '#ef444430'}`,
                  color: bridgeTestResult.ok ? '#22c55e' : '#ef4444',
                  fontWeight: 500,
                }}>
                  {bridgeTestResult.ok
                    ? `✓ Connected successfully (${bridgeTestResult.latency}ms latency)`
                    : `✗ ${bridgeTestResult.error || 'Connection failed'}`}
                </div>
              )}

              {/* Help text */}
              <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', lineHeight: '1.6', padding: '8px 12px', background: 'var(--bg-primary)', borderRadius: '8px' }}>
                <strong style={{ color: 'var(--text-secondary)' }}>Setup:</strong> Run the ArcadIA Bridge on your remote machine:
                <code style={{ display: 'block', marginTop: '4px', padding: '6px 8px', background: 'var(--bg-secondary)', borderRadius: '4px', fontFamily: 'monospace', fontSize: '11px' }}>
                  cd ~/Arcadia && node bridge/arcadia-bridge.js --host 0.0.0.0
                </code>
                <div style={{ marginTop: '6px' }}>Then enter the URL above (e.g., <code>http://devserver-hostname:8087</code>).</div>
                <div style={{ marginTop: '4px' }}>The bridge must be accessible from this device. If using an OD devserver, ensure port 8087 is forwarded.</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
