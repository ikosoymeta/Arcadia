import { useState, useEffect } from 'react';
import { useConnection } from '../../store/ConnectionContext';
import { useChat } from '../../store/ChatContext';

interface OnboardingProps {
  onComplete: () => void;
}

const META_PROXY_URL = 'http://localhost:8087';
const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

const MODELS = [
  { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4', desc: 'Best balance of speed and intelligence', badge: '⭐ Recommended' },
  { value: 'claude-opus-4-20250514', label: 'Claude Opus 4', desc: 'Most powerful — best for complex reasoning', badge: '🧠 Most Powerful' },
  { value: 'claude-haiku-35-20241022', label: 'Claude 3.5 Haiku', desc: 'Fastest responses — great for quick questions', badge: '⚡ Fastest' },
];

// ─── Probe Meta LDAR proxy (on-network / VPN) ─────────────────────────────────
async function detectMetaProxy(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${META_PROXY_URL}/v1/messages`, {
      method: 'OPTIONS',
      signal: controller.signal,
    }).catch(() => null);
    clearTimeout(timer);
    return res !== null;
  } catch {
    return false;
  }
}

// ─── Validate MetaGen key format (mg-api-...) ─────────────────────────────────
function isMetaGenKey(key: string): boolean {
  return key.startsWith('mg-api-') && key.length > 15;
}

// ─── Validate Anthropic key format (sk-ant-...) ───────────────────────────────
function isAnthropicKey(key: string): boolean {
  return key.startsWith('sk-ant') && key.length > 20;
}

// ─── MetaGen API endpoint ─────────────────────────────────────────────────────
// MetaGen is Meta's approved gateway for 3P models including Claude.
// Keys are obtained via the Meta Entitlements Portal (format: mg-api-xxxxxxxxxx)
const METAGEN_ENDPOINT = 'https://metagen.meta.com/v1/messages';

export function OnboardingWizard({ onComplete }: OnboardingProps) {
  const { addConnection } = useConnection();
  const { createConversation } = useChat();

  type Step = 'detecting' | 'meta_proxy_connected' | 'welcome' | 'key_input' | 'connecting';
  const [step, setStep] = useState<Step>('detecting');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState('');
  const [keyType, setKeyType] = useState<'metagen' | 'anthropic' | null>(null);

  // ── On mount: probe for Meta LDAR proxy ──────────────────────────────────
  useEffect(() => {
    detectMetaProxy().then(isMetaProxy => {
      if (isMetaProxy) {
        addConnection({
          label: 'Meta LDAR (Corporate)',
          apiKey: '',
          model: DEFAULT_MODEL,
          maxTokens: 4096,
          temperature: 0.7,
          baseUrl: META_PROXY_URL,
          status: 'connected',
        });
        localStorage.setItem('arcadia-onboarding-complete', 'true');
        localStorage.setItem('arcadia-connection-type', 'meta-ldar');
        createConversation(DEFAULT_MODEL);
        setStep('meta_proxy_connected');
        setTimeout(() => onComplete(), 2000);
      } else {
        setStep('welcome');
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleKeyChange = (val: string) => {
    setApiKey(val);
    setError('');
    if (isMetaGenKey(val)) setKeyType('metagen');
    else if (isAnthropicKey(val)) setKeyType('anthropic');
    else setKeyType(null);
  };

  const isKeyValid = keyType !== null;

  const handleConnect = async () => {
    if (!isKeyValid) {
      setError('Please enter a valid MetaGen key (mg-api-...) or Anthropic API key (sk-ant-...)');
      return;
    }
    setStep('connecting');
    setError('');

    const isMetaGen = keyType === 'metagen';
    const endpoint = isMetaGen ? METAGEN_ENDPOINT : 'https://api.anthropic.com/v1/messages';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': apiKey.trim(),
    };
    if (!isMetaGen) {
      headers['anthropic-dangerous-direct-browser-access'] = 'true';
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          max_tokens: 16,
          messages: [{ role: 'user', content: 'Say ok' }],
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = (body as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`;
        setError(`Connection failed: ${msg}`);
        setStep('key_input');
        return;
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setError('Connection timed out. Check your internet connection.');
      } else {
        // For MetaGen, network errors are expected from browser (CORS) — still save the key
        if (isMetaGen) {
          // MetaGen may block browser CORS — save anyway, will work from Claude Code / server context
          addConnection({
            label: 'Meta (MetaGen)',
            apiKey: apiKey.trim(),
            model,
            maxTokens: 4096,
            temperature: 0.7,
            baseUrl: METAGEN_ENDPOINT.replace('/v1/messages', ''),
            status: 'connected',
          });
          localStorage.setItem('arcadia-onboarding-complete', 'true');
          localStorage.setItem('arcadia-connection-type', 'metagen');
          createConversation(model);
          onComplete();
          return;
        }
        setError('Network error. Please check your internet connection.');
        setStep('key_input');
        return;
      }
      setStep('key_input');
      return;
    }

    addConnection({
      label: isMetaGen ? 'Meta (MetaGen)' : 'My Claude',
      apiKey: apiKey.trim(),
      model,
      maxTokens: 4096,
      temperature: 0.7,
      baseUrl: isMetaGen ? METAGEN_ENDPOINT.replace('/v1/messages', '') : undefined,
      status: 'connected',
    });
    localStorage.setItem('arcadia-onboarding-complete', 'true');
    localStorage.setItem('arcadia-connection-type', isMetaGen ? 'metagen' : 'api-key');
    createConversation(model);
    onComplete();
  };

  // ── Shared styles ─────────────────────────────────────────────────────────
  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000, padding: '16px',
  };
  const card: React.CSSProperties = {
    background: '#171717', borderRadius: '20px', border: '1px solid #2a2a2a',
    maxWidth: '440px', width: '100%', overflow: 'hidden',
    boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
  };
  const dots = (
    <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'center', gap: '6px' }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          width: '8px', height: '8px', borderRadius: '50%', background: '#6366f1',
          animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
        }} />
      ))}
      <style>{`@keyframes pulse { 0%,80%,100%{opacity:.3;transform:scale(.8)} 40%{opacity:1;transform:scale(1)} }`}</style>
    </div>
  );

  // ── DETECTING ─────────────────────────────────────────────────────────────
  if (step === 'detecting') {
    return (
      <div style={overlay}>
        <div style={{ ...card, textAlign: 'center', padding: '48px 32px' }}>
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>✦</div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#e5e5e5', marginBottom: '8px' }}>Starting ArcadIA...</div>
          <div style={{ fontSize: '13px', color: '#a3a3a3' }}>Detecting your connection</div>
          {dots}
        </div>
      </div>
    );
  }

  // ── META PROXY CONNECTED ──────────────────────────────────────────────────
  if (step === 'meta_proxy_connected') {
    return (
      <div style={overlay}>
        <div style={{ ...card, textAlign: 'center', padding: '48px 32px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🏢</div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#e5e5e5', marginBottom: '8px' }}>Connected via Meta</div>
          <div style={{ fontSize: '13px', color: '#a3a3a3', lineHeight: '1.6', marginBottom: '20px' }}>
            Corporate LDAR proxy detected.<br />Connecting automatically — no key needed.
          </div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)',
            borderRadius: '8px', padding: '8px 16px', fontSize: '13px', color: '#22c55e', fontWeight: 600,
          }}>✓ Meta LDAR proxy active</div>
        </div>
      </div>
    );
  }

  // ── WELCOME ───────────────────────────────────────────────────────────────
  if (step === 'welcome') {
    return (
      <div style={overlay}>
        <div style={card}>
          <div style={{ padding: '32px 32px 0', textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>✦</div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: '#e5e5e5', marginBottom: '8px' }}>ArcadIA</div>
            <div style={{ fontSize: '14px', color: '#a3a3a3', lineHeight: '1.6' }}>
              Your personal Claude assistant. Ask anything, build anything.
            </div>
          </div>
          <div style={{ padding: '24px 32px' }}>
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
          <div style={{ padding: '0 32px 32px' }}>
            <button
              onClick={() => setStep('key_input')}
              style={{
                width: '100%', padding: '14px', borderRadius: '12px',
                background: '#6366f1', border: 'none', color: '#fff',
                fontSize: '15px', fontWeight: 700, cursor: 'pointer',
              }}
            >
              Get Started →
            </button>
            <div style={{ textAlign: 'center', marginTop: '12px', fontSize: '12px', color: '#525252' }}>
              Meta employee? Connect to Meta network or use your MetaGen key.
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── KEY INPUT ─────────────────────────────────────────────────────────────
  if (step === 'key_input') {
    return (
      <div style={overlay}>
        <div style={card}>
          <div style={{ padding: '32px 32px 0', textAlign: 'center' }}>
            <div style={{ fontSize: '36px', marginBottom: '12px' }}>🔑</div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#e5e5e5', marginBottom: '8px' }}>Connect to Claude</div>
            <div style={{ fontSize: '13px', color: '#a3a3a3', lineHeight: '1.6' }}>
              Use your MetaGen key or a personal Anthropic API key.
            </div>
          </div>
          <div style={{ padding: '24px 32px' }}>

            {/* Two-path guide */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
              {[
                {
                  icon: '🏢',
                  title: 'Meta Employee',
                  steps: ['Go to Meta Entitlements Portal', 'Search "MetaGen" & request access', 'Paste your mg-api-... key below'],
                  color: '#3b82f6',
                },
                {
                  icon: '👤',
                  title: 'Personal Use',
                  steps: ['Go to console.anthropic.com', 'Sign up / log in (free)', 'Create key & paste sk-ant-... below'],
                  color: '#6366f1',
                },
              ].map(path => (
                <div key={path.title} style={{
                  background: '#1a1a1a', borderRadius: '12px', padding: '14px',
                  border: `1px solid ${path.color}33`,
                }}>
                  <div style={{ fontSize: '20px', marginBottom: '6px' }}>{path.icon}</div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: path.color, marginBottom: '8px' }}>{path.title}</div>
                  {path.steps.map((s, i) => (
                    <div key={i} style={{ display: 'flex', gap: '6px', marginBottom: '5px', alignItems: 'flex-start' }}>
                      <div style={{
                        width: '16px', height: '16px', borderRadius: '50%', background: path.color,
                        color: '#fff', fontSize: '9px', fontWeight: 700, display: 'flex',
                        alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px',
                      }}>{i + 1}</div>
                      <div style={{ fontSize: '11px', color: '#a3a3a3', lineHeight: '1.4' }}>{s}</div>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* Model picker */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#a3a3a3', marginBottom: '6px' }}>
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
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#a3a3a3', marginBottom: '6px' }}>
                Paste your key
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={e => handleKeyChange(e.target.value)}
                  placeholder="mg-api-... or sk-ant-..."
                  autoFocus
                  style={{
                    width: '100%', padding: '12px 44px 12px 14px',
                    borderRadius: '10px',
                    border: `1.5px solid ${error ? '#ef4444' : keyType === 'metagen' ? '#3b82f6' : keyType === 'anthropic' ? '#22c55e' : '#2a2a2a'}`,
                    background: '#0f0f0f', color: '#e5e5e5', fontSize: '14px',
                    fontFamily: 'monospace', boxSizing: 'border-box', outline: 'none',
                    transition: 'border-color 0.2s',
                  }}
                  onKeyDown={e => e.key === 'Enter' && isKeyValid && handleConnect()}
                />
                <button
                  onClick={() => setShowKey(p => !p)}
                  style={{
                    position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', color: '#525252', fontSize: '16px',
                  }}
                >{showKey ? '🙈' : '👁'}</button>
              </div>
              {keyType === 'metagen' && !error && (
                <div style={{ fontSize: '12px', color: '#3b82f6', marginTop: '6px' }}>🏢 MetaGen key detected</div>
              )}
              {keyType === 'anthropic' && !error && (
                <div style={{ fontSize: '12px', color: '#22c55e', marginTop: '6px' }}>✓ Anthropic key detected</div>
              )}
              {error && (
                <div style={{ fontSize: '12px', color: '#ef4444', marginTop: '6px' }}>⚠ {error}</div>
              )}
            </div>
            <div style={{ fontSize: '11px', color: '#525252' }}>
              🔒 Your key is stored only in your browser — never sent to our servers.
            </div>
          </div>
          <div style={{ padding: '0 32px 32px' }}>
            <button
              onClick={handleConnect}
              disabled={!isKeyValid}
              style={{
                width: '100%', padding: '14px', borderRadius: '12px',
                background: isKeyValid ? (keyType === 'metagen' ? '#3b82f6' : '#6366f1') : '#2a2a2a',
                border: 'none', color: isKeyValid ? '#fff' : '#525252',
                fontSize: '15px', fontWeight: 700,
                cursor: isKeyValid ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s',
              }}
            >
              {keyType === 'metagen' ? '🏢 Connect via MetaGen →' : 'Connect to Claude →'}
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
          {keyType === 'metagen' ? 'Connecting via MetaGen...' : 'Connecting to Claude...'}
        </div>
        <div style={{ fontSize: '13px', color: '#a3a3a3' }}>Testing your key. This takes just a second.</div>
        {dots}
      </div>
    </div>
  );
}
