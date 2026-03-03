import { useState, useEffect } from 'react';
import { useConnection } from '../../store/ConnectionContext';
import { useChat } from '../../store/ChatContext';

interface OnboardingProps {
  onComplete: () => void;
}

const META_PROXY_URL = 'http://localhost:8087';
const META_MODEL = 'claude-sonnet-4-20250514';

const MODELS = [
  {
    value: 'claude-sonnet-4-20250514',
    label: 'Claude Sonnet 4',
    desc: 'Best balance of speed and intelligence — great for most tasks',
    badge: '⭐ Recommended',
  },
  {
    value: 'claude-opus-4-20250514',
    label: 'Claude Opus 4',
    desc: 'Most powerful — best for complex reasoning and long tasks',
    badge: '🧠 Most Powerful',
  },
  {
    value: 'claude-haiku-35-20241022',
    label: 'Claude 3.5 Haiku',
    desc: 'Fastest responses — great for quick questions',
    badge: '⚡ Fastest',
  },
];

// ─── Detect Meta LDAR proxy ───────────────────────────────────────────────────
// Sends a lightweight OPTIONS/HEAD probe to localhost:8087.
// Returns true if the proxy is reachable (i.e. user is on Meta network).
async function detectMetaProxy(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${META_PROXY_URL}/v1/messages`, {
      method: 'OPTIONS',
      signal: controller.signal,
    }).catch(() => null);
    clearTimeout(timer);
    // Any response (even 4xx/405) means the port is open and proxy is running
    return res !== null;
  } catch {
    return false;
  }
}

export function OnboardingWizard({ onComplete }: OnboardingProps) {
  const { addConnection } = useConnection();
  const { createConversation } = useChat();

  type Step = 'detecting' | 'meta_connected' | 'welcome' | 'apikey' | 'connecting';
  const [step, setStep] = useState<Step>('detecting');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('claude-sonnet-4-20250514');
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState('');
  const [keyValid, setKeyValid] = useState(false);

  // ── On mount: probe for Meta proxy ───────────────────────────────────────
  useEffect(() => {
    detectMetaProxy().then(isMetaProxy => {
      if (isMetaProxy) {
        // Silently create a Meta proxy connection and complete onboarding
        addConnection({
          label: 'Meta Corporate (LDAR)',
          apiKey: '',
          model: META_MODEL,
          maxTokens: 4096,
          temperature: 0.7,
          baseUrl: META_PROXY_URL,
          status: 'connected',
        });
        localStorage.setItem('arcadia-onboarding-complete', 'true');
        localStorage.setItem('arcadia-connection-type', 'meta-proxy');
        createConversation(META_MODEL);
        setStep('meta_connected');
        // Auto-dismiss after 2s
        setTimeout(() => onComplete(), 2000);
      } else {
        setStep('welcome');
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const validateKeyFormat = (key: string) => key.startsWith('sk-ant') && key.length > 20;

  const handleKeyChange = (val: string) => {
    setApiKey(val);
    setError('');
    setKeyValid(validateKeyFormat(val));
  };

  const handleConnect = async () => {
    if (!validateKeyFormat(apiKey)) {
      setError('Please enter a valid Anthropic API key (starts with sk-ant...)');
      return;
    }
    setStep('connecting');
    setError('');

    // Test the connection with a minimal ping
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'x-api-key': apiKey.trim(),
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model,
          max_tokens: 16,
          messages: [{ role: 'user', content: 'Say ok' }],
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok && res.status !== 200) {
        const body = await res.json().catch(() => ({}));
        const msg = (body as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`;
        setError(`Connection failed: ${msg}`);
        setStep('apikey');
        return;
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setError('Connection timed out. Check your internet connection.');
      } else {
        setError('Network error. Please check your internet connection.');
      }
      setStep('apikey');
      return;
    }

    addConnection({
      label: 'My Claude',
      apiKey: apiKey.trim(),
      model,
      maxTokens: 4096,
      temperature: 0.7,
    });
    localStorage.setItem('arcadia-onboarding-complete', 'true');
    localStorage.setItem('arcadia-connection-type', 'api-key');
    createConversation(model);
    onComplete();
  };

  // ── Shared styles ─────────────────────────────────────────────────────────
  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000, padding: '16px',
  };
  const card: React.CSSProperties = {
    background: '#171717', borderRadius: '20px', border: '1px solid #2a2a2a',
    maxWidth: '420px', width: '100%', overflow: 'hidden',
    boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
  };
  const header: React.CSSProperties = { padding: '32px 32px 0', textAlign: 'center' };
  const body: React.CSSProperties = { padding: '24px 32px' };
  const footer: React.CSSProperties = { padding: '0 32px 32px' };

  // ── DETECTING (probe in progress) ─────────────────────────────────────────
  if (step === 'detecting') {
    return (
      <div style={overlay}>
        <div style={{ ...card, textAlign: 'center', padding: '48px 32px' }}>
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>✦</div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#e5e5e5', marginBottom: '8px' }}>
            Starting ArcadIA...
          </div>
          <div style={{ fontSize: '13px', color: '#a3a3a3' }}>
            Detecting your connection
          </div>
          <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'center', gap: '6px' }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                width: '8px', height: '8px', borderRadius: '50%', background: '#6366f1',
                animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
              }} />
            ))}
          </div>
          <style>{`
            @keyframes pulse {
              0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
              40% { opacity: 1; transform: scale(1); }
            }
          `}</style>
        </div>
      </div>
    );
  }

  // ── META CONNECTED (proxy detected, auto-connecting) ──────────────────────
  if (step === 'meta_connected') {
    return (
      <div style={overlay}>
        <div style={{ ...card, textAlign: 'center', padding: '48px 32px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🏢</div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#e5e5e5', marginBottom: '8px' }}>
            Connected via Meta
          </div>
          <div style={{ fontSize: '13px', color: '#a3a3a3', lineHeight: '1.6', marginBottom: '20px' }}>
            Corporate account detected.<br />
            Connecting you automatically — no API key needed.
          </div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)',
            borderRadius: '8px', padding: '8px 16px',
            fontSize: '13px', color: '#22c55e', fontWeight: 600,
          }}>
            ✓ Meta LDAR proxy active
          </div>
        </div>
      </div>
    );
  }

  // ── WELCOME ───────────────────────────────────────────────────────────────
  if (step === 'welcome') {
    return (
      <div style={overlay}>
        <div style={card}>
          <div style={header}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>✦</div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: '#e5e5e5', marginBottom: '8px' }}>
              ArcadIA
            </div>
            <div style={{ fontSize: '14px', color: '#a3a3a3', lineHeight: '1.6', marginBottom: '8px' }}>
              Your personal AI assistant powered by Claude.
              Ask anything, build anything — no technical skills needed.
            </div>
          </div>
          <div style={body}>
            {[
              { icon: '💬', title: 'Just ask in plain English', desc: 'Describe what you want — Claude figures out the rest' },
              { icon: '⚡', title: 'See it happen step by step', desc: 'Watch Claude think, plan, and create in real time' },
              { icon: '🎨', title: 'Get beautiful results', desc: 'Code, documents, websites — ready to use instantly' },
            ].map(f => (
              <div key={f.title} style={{ display: 'flex', gap: '14px', marginBottom: '18px', alignItems: 'flex-start' }}>
                <div style={{ fontSize: '24px', flexShrink: 0, marginTop: '2px' }}>{f.icon}</div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#e5e5e5', marginBottom: '2px' }}>{f.title}</div>
                  <div style={{ fontSize: '13px', color: '#a3a3a3' }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={footer}>
            <button
              onClick={() => setStep('apikey')}
              style={{
                width: '100%', padding: '14px', borderRadius: '12px',
                background: '#6366f1', border: 'none', color: '#fff',
                fontSize: '15px', fontWeight: 700, cursor: 'pointer',
              }}
            >
              Get Started — Connect with API Key →
            </button>
            <div style={{ textAlign: 'center', marginTop: '12px', fontSize: '12px', color: '#525252' }}>
              Meta employee? Make sure you're connected to the Meta network.
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── API KEY ───────────────────────────────────────────────────────────────
  if (step === 'apikey') {
    return (
      <div style={overlay}>
        <div style={card}>
          <div style={header}>
            <div style={{ fontSize: '36px', marginBottom: '12px' }}>🔑</div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#e5e5e5', marginBottom: '8px' }}>
              Connect to Claude
            </div>
            <div style={{ fontSize: '13px', color: '#a3a3a3', lineHeight: '1.6' }}>
              You need a free API key from Anthropic. It's like a password that lets you talk to Claude.
            </div>
          </div>
          <div style={body}>
            {/* Step-by-step guide */}
            <div style={{
              background: '#1a1a1a', borderRadius: '12px', padding: '16px',
              border: '1px solid #2a2a2a', marginBottom: '20px',
            }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#6366f1', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                How to get your key (2 min)
              </div>
              {[
                { n: '1', text: 'Go to console.anthropic.com', link: 'https://console.anthropic.com/keys', linkText: 'Open →' },
                { n: '2', text: 'Sign up or log in (it\'s free)' },
                { n: '3', text: 'Click "Create Key" and copy it' },
              ].map(s => (
                <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <div style={{
                    width: '22px', height: '22px', borderRadius: '50%',
                    background: '#6366f1', color: '#fff', fontSize: '11px',
                    fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>{s.n}</div>
                  <div style={{ fontSize: '13px', color: '#a3a3a3', flex: 1 }}>{s.text}</div>
                  {s.link && (
                    <a href={s.link} target="_blank" rel="noreferrer"
                      style={{ fontSize: '12px', color: '#6366f1', fontWeight: 600, textDecoration: 'none' }}>
                      {s.linkText}
                    </a>
                  )}
                </div>
              ))}
            </div>

            {/* Model picker */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#a3a3a3', marginBottom: '8px' }}>
                Choose model
              </label>
              <select
                value={model}
                onChange={e => setModel(e.target.value)}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: '10px',
                  border: '1.5px solid #2a2a2a', background: '#0f0f0f',
                  color: '#e5e5e5', fontSize: '13px', outline: 'none', boxSizing: 'border-box',
                }}
              >
                {MODELS.map(m => (
                  <option key={m.value} value={m.value}>{m.label} — {m.desc}</option>
                ))}
              </select>
            </div>

            {/* Key input */}
            <div style={{ marginBottom: '8px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#a3a3a3', marginBottom: '8px' }}>
                Paste your API key here
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={e => handleKeyChange(e.target.value)}
                  placeholder="sk-ant-api03-..."
                  autoFocus
                  style={{
                    width: '100%', padding: '12px 44px 12px 14px',
                    borderRadius: '10px', border: `1.5px solid ${error ? '#ef4444' : keyValid ? '#22c55e' : '#2a2a2a'}`,
                    background: '#0f0f0f', color: '#e5e5e5', fontSize: '14px',
                    fontFamily: 'monospace', boxSizing: 'border-box', outline: 'none',
                    transition: 'border-color 0.2s',
                  }}
                  onKeyDown={e => e.key === 'Enter' && keyValid && handleConnect()}
                />
                <button
                  onClick={() => setShowKey(p => !p)}
                  style={{
                    position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', color: '#525252', fontSize: '16px',
                  }}
                  title={showKey ? 'Hide key' : 'Show key'}
                >
                  {showKey ? '🙈' : '👁'}
                </button>
              </div>
              {keyValid && !error && (
                <div style={{ fontSize: '12px', color: '#22c55e', marginTop: '6px' }}>✓ Key format looks good</div>
              )}
              {error && (
                <div style={{ fontSize: '12px', color: '#ef4444', marginTop: '6px' }}>⚠ {error}</div>
              )}
            </div>
            <div style={{ fontSize: '11px', color: '#525252' }}>
              🔒 Your key is stored only in your browser — never sent to our servers.
            </div>
          </div>
          <div style={footer}>
            <button
              onClick={handleConnect}
              disabled={!keyValid}
              style={{
                width: '100%', padding: '14px', borderRadius: '12px',
                background: keyValid ? '#6366f1' : '#2a2a2a',
                border: 'none', color: keyValid ? '#fff' : '#525252',
                fontSize: '15px', fontWeight: 700,
                cursor: keyValid ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s',
              }}
            >
              Connect to Claude →
            </button>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px' }}>
              <button onClick={() => setStep('welcome')}
                style={{ background: 'none', border: 'none', color: '#525252', fontSize: '12px', cursor: 'pointer' }}>
                ← Back
              </button>
              <button onClick={() => { localStorage.setItem('arcadia-onboarding-complete', 'true'); onComplete(); }}
                style={{ background: 'none', border: 'none', color: '#525252', fontSize: '12px', cursor: 'pointer' }}>
                Skip for now
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── CONNECTING ────────────────────────────────────────────────────────────
  return (
    <div style={overlay}>
      <div style={{ ...card, textAlign: 'center', padding: '48px 32px' }}>
        <div style={{ fontSize: '40px', marginBottom: '16px' }}>✦</div>
        <div style={{ fontSize: '18px', fontWeight: 700, color: '#e5e5e5', marginBottom: '8px' }}>
          Connecting to Claude...
        </div>
        <div style={{ fontSize: '13px', color: '#a3a3a3' }}>
          Testing your API key. This takes just a second.
        </div>
        <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'center', gap: '6px' }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              width: '8px', height: '8px', borderRadius: '50%', background: '#6366f1',
              animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
            }} />
          ))}
        </div>
        <style>{`
          @keyframes pulse {
            0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
            40% { opacity: 1; transform: scale(1); }
          }
        `}</style>
      </div>
    </div>
  );
}
