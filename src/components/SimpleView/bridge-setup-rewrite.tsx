// New simplified BridgeSetupPrompt - replaces lines 45-260 in SimpleView.tsx

// Constants
const SETUP_COMMAND = 'curl -sL https://raw.githubusercontent.com/ikosoymeta/Arcadia/main/bridge/setup.sh | bash';
const MANUAL_START_CMD = 'node ~/.arcadia-bridge/arcadia-bridge.js';

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
        onRetry(); // Trigger reconnect in parent
      } else {
        setDiag(d => ({ ...d, bridge: 'fail', lastCheck: new Date().toLocaleTimeString() }));
      }
    } catch {
      setDiag(d => ({ ...d, bridge: 'fail', lastCheck: new Date().toLocaleTimeString() }));
    }
  }, [onRetry]);

  // Auto-poll for bridge connection every 3 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setPollCount(c => c + 1);
      runDiagnostics();
    }, 3000);
    // Run immediately on mount
    runDiagnostics();
    return () => clearInterval(interval);
  }, [runDiagnostics]);

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

  return (
    <div className={styles.bridgeSetup}>
      <div className={styles.bridgeTitle}>
        <span className={styles.bridgeIcon}>⚡</span>
        Connect to Claude
      </div>
      <div className={styles.bridgeSubtitle}>
        Paste this command in Terminal to connect ArcadIA to Claude on your Mac.
        <br />
        <span style={{ opacity: 0.7, fontSize: '12px' }}>
          Open Terminal: press <kbd style={{ 
            background: 'var(--bg-tertiary)', padding: '1px 5px', borderRadius: '3px', 
            fontSize: '11px', border: '1px solid var(--border-color)' 
          }}>⌘ Space</kbd> → type "Terminal" → press Enter
        </span>
      </div>

      <div className={styles.cmdBox}>
        <code id="bridge-cmd" className={styles.cmdText} style={{ fontSize: '11.5px' }}>{SETUP_COMMAND}</code>
        <button className={styles.copyBtn} onClick={handleCopy}>
          {copied ? '✓ Copied!' : '📋 Copy'}
        </button>
      </div>

      {/* Auto-detection status */}
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
          animation: diag.bridge === 'checking' ? 'pulse 1.5s infinite' : diag.bridge === 'ok' ? 'none' : 'pulse 2s infinite',
          boxShadow: diag.bridge === 'ok' ? '0 0 6px rgba(34, 197, 94, 0.5)' : 'none'
        }} />
        <span style={{ fontSize: '13px', color: diag.bridge === 'ok' ? '#22c55e' : 'var(--text-secondary)' }}>
          {diag.bridge === 'ok' 
            ? `Connected! (v${diag.bridgeVersion})` 
            : diag.bridge === 'checking' 
              ? 'Checking for bridge...' 
              : `Waiting for bridge... ${pollCount > 0 ? `(checking every 3s)` : ''}`
          }
        </span>
      </div>

      {/* Already set up hint */}
      <div className={styles.bridgeNote} style={{ marginTop: '12px' }}>
        Already set up? The bridge auto-starts on login. If it stopped, run: <code style={{ 
          fontSize: '11px', background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: '4px' 
        }}>{MANUAL_START_CMD}</code>
      </div>

      {/* Advanced / Troubleshooting - collapsed by default */}
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
                <li>Check if port is in use: <code>lsof -i :8087</code></li>
                <li>Restart the bridge: <code>bash ~/.arcadia-bridge/setup.sh</code></li>
                <li>Need help? <a href="mailto:ikosoy@meta.com?subject=ArcadIA%20Editor%20Support" style={{ color: 'var(--accent)' }}>Contact support</a></li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
