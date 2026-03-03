import { useState } from 'react';
import { useConnection } from '../../store/ConnectionContext';
import styles from './Settings.module.css';

const MODELS = [
  { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
  { value: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
  { value: 'claude-haiku-35-20241022', label: 'Claude 3.5 Haiku' },
];

const DEFAULT_PROXY_URL = 'http://localhost:8087';

type ConnectionType = 'proxy' | 'apikey';

export function SettingsPanel() {
  const {
    connections,
    activeConnection,
    addConnection,
    deleteConnection,
    setActiveConnection,
    testConnection,
  } = useConnection();

  const [showForm, setShowForm] = useState(false);
  const [connectionType, setConnectionType] = useState<ConnectionType>('proxy');
  const [formData, setFormData] = useState({
    label: 'Meta Proxy',
    apiKey: '',
    baseUrl: DEFAULT_PROXY_URL,
    model: 'claude-sonnet-4-20250514',
    maxTokens: 4096,
    temperature: 0.7,
  });
  const [testResult, setTestResult] = useState<{ id: string; success: boolean } | null>(null);
  const [testing, setTesting] = useState<string | null>(null);

  const handleConnectionTypeChange = (type: ConnectionType) => {
    setConnectionType(type);
    setFormData(prev => ({
      ...prev,
      label: type === 'proxy' ? 'Meta Proxy' : '',
      apiKey: type === 'proxy' ? '' : prev.apiKey,
      baseUrl: type === 'proxy' ? DEFAULT_PROXY_URL : '',
    }));
  };

  const resetForm = () => {
    setConnectionType('proxy');
    setFormData({ label: 'Meta Proxy', apiKey: '', baseUrl: DEFAULT_PROXY_URL, model: 'claude-sonnet-4-20250514', maxTokens: 4096, temperature: 0.7 });
    setShowForm(false);
  };

  const handleAdd = () => {
    if (!formData.label) return;
    if (connectionType === 'apikey' && !formData.apiKey) return;
    if (connectionType === 'proxy' && !formData.baseUrl) return;

    addConnection({
      label: formData.label,
      apiKey: connectionType === 'apikey' ? formData.apiKey : '',
      model: formData.model,
      maxTokens: formData.maxTokens,
      temperature: formData.temperature,
      baseUrl: connectionType === 'proxy' ? formData.baseUrl : undefined,
    });
    resetForm();
  };

  const handleTest = async (id: string) => {
    setTesting(id);
    setTestResult(null);
    const success = await testConnection(id);
    setTestResult({ id, success });
    setTesting(null);
  };

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '24px' }}>
        Settings
      </h2>

      <div className={styles.section} style={{ background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border)', marginBottom: '16px' }}>
        <div className={styles.sectionTitle}>API Connections</div>

        {connections.length > 0 && (
          <div className={styles.connList}>
            {connections.map(conn => (
              <div
                key={conn.id}
                className={`${styles.connCard} ${conn.isActive ? styles.active : ''}`}
                onClick={() => setActiveConnection(conn.id)}
              >
                <div className={`${styles.connStatus} ${styles[conn.status]}`} />
                <div className={styles.connInfo}>
                  <div className={styles.connName}>{conn.label}</div>
                  <div className={styles.connModel}>
                    {conn.model}
                    {conn.baseUrl
                      ? ` \u00B7 ${conn.baseUrl}`
                      : conn.apiKey
                        ? ` \u00B7 ${conn.apiKey.slice(0, 8)}...${conn.apiKey.slice(-4)}`
                        : ''}
                  </div>
                </div>
                <div className={styles.connActions}>
                  <button
                    className={styles.connActionBtn}
                    onClick={(e) => { e.stopPropagation(); handleTest(conn.id); }}
                    disabled={testing === conn.id}
                  >
                    {testing === conn.id ? '...' : 'Test'}
                  </button>
                  <button
                    className={`${styles.connActionBtn} ${styles.danger}`}
                    onClick={(e) => { e.stopPropagation(); deleteConnection(conn.id); }}
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {testResult && (
          <div className={`${styles.testResult} ${testResult.success ? styles.success : styles.failure}`}>
            {testResult.success ? 'Connection successful!' : 'Connection failed. Check configuration.'}
          </div>
        )}

        {!showForm ? (
          <div className={styles.btnRow}>
            <button className={styles.primaryBtn} onClick={() => setShowForm(true)}>
              + Add Connection
            </button>
          </div>
        ) : (
          <div style={{ marginTop: '16px' }}>
            {/* Connection type toggle */}
            <div className={styles.field}>
              <label className={styles.label}>Connection Type</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className={styles[connectionType === 'proxy' ? 'primaryBtn' : 'secondaryBtn']}
                  onClick={() => handleConnectionTypeChange('proxy')}
                  style={{ flex: 1 }}
                >
                  Meta Proxy (LDAR)
                </button>
                <button
                  className={styles[connectionType === 'apikey' ? 'primaryBtn' : 'secondaryBtn']}
                  onClick={() => handleConnectionTypeChange('apikey')}
                  style={{ flex: 1 }}
                >
                  API Key
                </button>
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Connection Label</label>
              <input
                className={styles.input}
                value={formData.label}
                onChange={e => setFormData(prev => ({ ...prev, label: e.target.value }))}
                placeholder={connectionType === 'proxy' ? 'Meta Proxy' : 'My API Key'}
              />
            </div>

            {connectionType === 'proxy' ? (
              <div className={styles.field}>
                <label className={styles.label}>Proxy URL</label>
                <input
                  className={styles.input}
                  value={formData.baseUrl}
                  onChange={e => setFormData(prev => ({ ...prev, baseUrl: e.target.value }))}
                  placeholder="http://localhost:8087"
                />
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                  LDAR auto-starts on devservers. No API key needed.
                </div>
              </div>
            ) : (
              <div className={styles.field}>
                <label className={styles.label}>API Key</label>
                <input
                  className={styles.input}
                  type="password"
                  value={formData.apiKey}
                  onChange={e => setFormData(prev => ({ ...prev, apiKey: e.target.value }))}
                  placeholder="sk-ant-..."
                />
              </div>
            )}

            <div className={styles.field}>
              <label className={styles.label}>Model</label>
              <select
                className={styles.select}
                value={formData.model}
                onChange={e => setFormData(prev => ({ ...prev, model: e.target.value }))}
              >
                {MODELS.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div className={styles.row}>
              <div className={styles.field}>
                <label className={styles.label}>Max Tokens</label>
                <input
                  className={styles.input}
                  type="number"
                  value={formData.maxTokens}
                  onChange={e => setFormData(prev => ({ ...prev, maxTokens: parseInt(e.target.value) || 4096 }))}
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
                  step={0.1}
                  value={formData.temperature}
                  onChange={e => setFormData(prev => ({ ...prev, temperature: parseFloat(e.target.value) }))}
                />
              </div>
            </div>
            <div className={styles.btnRow}>
              <button className={styles.primaryBtn} onClick={handleAdd}>Save Connection</button>
              <button className={styles.secondaryBtn} onClick={resetForm}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      <div className={styles.section} style={{ background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border)' }}>
        <div className={styles.sectionTitle}>Active Configuration</div>
        {activeConnection ? (
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.8' }}>
            <div><strong>Model:</strong> {activeConnection.model}</div>
            <div><strong>Endpoint:</strong> {activeConnection.baseUrl || 'Anthropic API (direct)'}</div>
            <div><strong>Max Tokens:</strong> {activeConnection.maxTokens.toLocaleString()}</div>
            <div><strong>Temperature:</strong> {activeConnection.temperature}</div>
            <div><strong>Status:</strong> <span style={{ color: activeConnection.status === 'connected' ? 'var(--success)' : 'var(--text-tertiary)' }}>{activeConnection.status}</span></div>
          </div>
        ) : (
          <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>
            No active connection. Add one above to get started.
          </div>
        )}
      </div>
    </div>
  );
}
