import { useState } from 'react';
import { useConnection } from '../../store/ConnectionContext';
import { useChat } from '../../store/ChatContext';
import { testConnection } from '../../services/claude';

interface OnboardingProps {
  onComplete: () => void;
}

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

export function OnboardingWizard({ onComplete }: OnboardingProps) {
  const { addConnection } = useConnection();
  const { createConversation } = useChat();
  const [step, setStep] = useState<'welcome' | 'apikey' | 'model' | 'connecting'>('welcome');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('claude-sonnet-4-20250514');
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState('');
  const [keyValid, setKeyValid] = useState(false);

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
    try {
      const ok = await testConnection(apiKey.trim(), model);
      if (!ok) {
        setError('Could not connect. Double-check your API key and try again.');
        setStep('apikey');
        return;
      }
    } catch {
      setError('Network error. Please check your internet connection.');
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
    createConversation(model);
    onComplete();
  };

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

  const header: React.CSSProperties = {
    padding: '32px 32px 0', textAlign: 'center',
  };

  const body: React.CSSProperties = { padding: '24px 32px' };
  const footer: React.CSSProperties = { padding: '0 32px 32px' };

  // ── WELCOME ──────────────────────────────────────────────────────────────
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
                transition: 'opacity 0.15s',
              }}
              onMouseOver={e => (e.currentTarget.style.opacity = '0.9')}
              onMouseOut={e => (e.currentTarget.style.opacity = '1')}
            >
              Get Started — it's free to try →
            </button>
            <div style={{ textAlign: 'center', marginTop: '12px', fontSize: '12px', color: '#525252' }}>
              You'll need a free Anthropic account. Takes 2 minutes.
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
                <div style={{ fontSize: '12px', color: '#22c55e', marginTop: '6px' }}>
                  ✓ Key format looks good
                </div>
              )}
              {error && (
                <div style={{ fontSize: '12px', color: '#ef4444', marginTop: '6px' }}>
                  ⚠ {error}
                </div>
              )}
            </div>

            <div style={{ fontSize: '11px', color: '#525252', marginBottom: '4px' }}>
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

  // ── MODEL PICKER ──────────────────────────────────────────────────────────
  if (step === 'model') {
    return (
      <div style={overlay}>
        <div style={card}>
          <div style={header}>
            <div style={{ fontSize: '36px', marginBottom: '12px' }}>🧠</div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#e5e5e5', marginBottom: '8px' }}>
              Choose your Claude
            </div>
            <div style={{ fontSize: '13px', color: '#a3a3a3', lineHeight: '1.6' }}>
              Pick the version that fits your needs. You can change this later.
            </div>
          </div>
          <div style={body}>
            {MODELS.map(m => (
              <div
                key={m.value}
                onClick={() => setModel(m.value)}
                style={{
                  padding: '16px', borderRadius: '12px', marginBottom: '10px',
                  border: `2px solid ${model === m.value ? '#6366f1' : '#2a2a2a'}`,
                  background: model === m.value ? 'rgba(99,102,241,0.08)' : '#1a1a1a',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#e5e5e5' }}>{m.label}</div>
                  <div style={{ fontSize: '11px', color: '#6366f1', fontWeight: 600 }}>{m.badge}</div>
                </div>
                <div style={{ fontSize: '13px', color: '#a3a3a3' }}>{m.desc}</div>
              </div>
            ))}
          </div>
          <div style={footer}>
            <button
              onClick={handleConnect}
              style={{
                width: '100%', padding: '14px', borderRadius: '12px',
                background: '#6366f1', border: 'none', color: '#fff',
                fontSize: '15px', fontWeight: 700, cursor: 'pointer',
              }}
            >
              Start Chatting →
            </button>
            <div style={{ textAlign: 'center', marginTop: '12px' }}>
              <button onClick={() => setStep('apikey')}
                style={{ background: 'none', border: 'none', color: '#525252', fontSize: '12px', cursor: 'pointer' }}>
                ← Back
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
        <div style={{ fontSize: '48px', marginBottom: '16px', animation: 'spin 1s linear infinite' }}>⟳</div>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        <div style={{ fontSize: '18px', fontWeight: 700, color: '#e5e5e5', marginBottom: '8px' }}>
          Connecting to Claude...
        </div>
        <div style={{ fontSize: '13px', color: '#a3a3a3' }}>
          Testing your connection. This takes just a second.
        </div>
      </div>
    </div>
  );
}
