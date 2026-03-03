import { useState, useCallback } from 'react';
import { useConnection } from '../../store/ConnectionContext';
import { useChat } from '../../store/ChatContext';
import { testConnection } from '../../services/claude';
import styles from './Onboarding.module.css';

interface OnboardingProps {
  onComplete: () => void;
}

const MODELS = [
  { value: 'claude-sonnet-4-20250514', name: 'Sonnet 4', desc: 'Best balance of speed and quality', badge: 'recommended', badgeClass: 'recommended' },
  { value: 'claude-opus-4-20250514', name: 'Opus 4', desc: 'Most capable, complex tasks', badge: 'powerful', badgeClass: 'powerful' },
  { value: 'claude-haiku-35-20241022', name: 'Haiku 3.5', desc: 'Fastest responses, simple tasks', badge: 'fast', badgeClass: 'fast' },
];

const DEFAULT_PROXY_URL = 'http://localhost:8087';
const TOTAL_STEPS = 4;

type ConnectionType = 'proxy' | 'apikey';

export function OnboardingWizard({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [connectionType, setConnectionType] = useState<ConnectionType>('proxy');
  const [connectionLabel, setConnectionLabel] = useState('Meta Proxy');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState(DEFAULT_PROXY_URL);
  const [model, setModel] = useState('claude-sonnet-4-20250514');
  const [testState, setTestState] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [apiKeyError, setApiKeyError] = useState('');
  const { addConnection } = useConnection();
  const { createConversation } = useChat();

  const handleConnectionTypeChange = (type: ConnectionType) => {
    setConnectionType(type);
    setConnectionLabel(type === 'proxy' ? 'Meta Proxy' : 'My API Key');
    setTestState('idle');
    setApiKeyError('');
  };

  const handleTestConnection = useCallback(async () => {
    if (connectionType === 'apikey' && !apiKey.trim()) {
      setApiKeyError('Please enter your API key');
      return;
    }
    if (connectionType === 'proxy' && !baseUrl.trim()) {
      setApiKeyError('Please enter the proxy URL');
      return;
    }

    setTestState('testing');
    setApiKeyError('');

    try {
      const ok = await testConnection(
        connectionType === 'apikey' ? apiKey.trim() : '',
        model,
        connectionType === 'proxy' ? baseUrl.trim() : undefined,
      );
      setTestState(ok ? 'success' : 'error');
      if (!ok) {
        setApiKeyError(
          connectionType === 'proxy'
            ? 'Connection failed. Make sure LDAR is running (wait ~5-10 min after reboot).'
            : 'Connection failed. Please check your API key.',
        );
      }
    } catch {
      setTestState('error');
      setApiKeyError(
        connectionType === 'proxy'
          ? 'Cannot reach proxy. Ensure LDAR is running at ' + baseUrl
          : 'Network error. Please check your connection and try again.',
      );
    }
  }, [apiKey, model, connectionType, baseUrl]);

  const handleFinish = () => {
    addConnection({
      label: connectionLabel || (connectionType === 'proxy' ? 'Meta Proxy' : 'My API Key'),
      apiKey: connectionType === 'apikey' ? apiKey.trim() : '',
      model,
      maxTokens: 4096,
      temperature: 0.7,
      baseUrl: connectionType === 'proxy' ? baseUrl.trim() : undefined,
    });

    localStorage.setItem('arcadia-onboarding-complete', 'true');
    createConversation(model);
    onComplete();
  };

  const handleSkip = () => {
    localStorage.setItem('arcadia-onboarding-complete', 'true');
    onComplete();
  };

  const canProceed = () => {
    if (step === 2) {
      if (connectionType === 'proxy') return baseUrl.trim().length > 0;
      return apiKey.trim().length > 0;
    }
    return true;
  };

  const next = () => {
    if (step === 2 && testState !== 'success') {
      handleTestConnection();
      return;
    }
    if (step < TOTAL_STEPS - 1) setStep(step + 1);
    else handleFinish();
  };

  const back = () => {
    if (step > 0) setStep(step - 1);
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.wizard}>
        <div className={styles.progress}>
          <div className={styles.progressFill} style={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }} />
        </div>

        <div className={styles.body}>
          {/* Step 0: Welcome */}
          {step === 0 && (
            <>
              <div className={styles.welcomeGraphic}>
                <span className={styles.logoLarge}>ArcadIA</span>
              </div>
              <div className={styles.stepTitle}>Welcome to ArcadIA Editor</div>
              <div className={styles.stepSubtitle}>
                Your AI-powered workspace for building, creating, and collaborating.
                Let's get you set up — it only takes a moment.
              </div>
              <div className={styles.featureList}>
                <div className={styles.featureItem}>
                  <span className={styles.featureIcon}>&#x1F4AC;</span>
                  <div className={styles.featureText}>
                    <div className={styles.featureTitle}>Chat with Claude</div>
                    <div className={styles.featureDesc}>Natural conversation with real-time streaming responses</div>
                  </div>
                </div>
                <div className={styles.featureItem}>
                  <span className={styles.featureIcon}>&#x25CE;</span>
                  <div className={styles.featureText}>
                    <div className={styles.featureTitle}>Live Preview</div>
                    <div className={styles.featureDesc}>See code, HTML, and markdown rendered as Claude writes</div>
                  </div>
                </div>
                <div className={styles.featureItem}>
                  <span className={styles.featureIcon}>&#x2328;</span>
                  <div className={styles.featureText}>
                    <div className={styles.featureTitle}>Code Workspace</div>
                    <div className={styles.featureDesc}>VS Code-like editor with terminal, debugger, and file explorer</div>
                  </div>
                </div>
                <div className={styles.featureItem}>
                  <span className={styles.featureIcon}>&#x1F465;</span>
                  <div className={styles.featureText}>
                    <div className={styles.featureTitle}>Team Collaboration</div>
                    <div className={styles.featureDesc}>Share conversations, build skill libraries, work with AI agents</div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Step 1: Choose Model */}
          {step === 1 && (
            <>
              <div className={styles.stepIcon}>&#x1F916;</div>
              <div className={styles.stepTitle}>Choose Your Model</div>
              <div className={styles.stepSubtitle}>
                Pick a Claude model. You can change this later for each conversation.
              </div>
              <div className={styles.modelGrid}>
                {MODELS.map(m => (
                  <div
                    key={m.value}
                    className={`${styles.modelCard} ${model === m.value ? styles.selected : ''}`}
                    onClick={() => setModel(m.value)}
                  >
                    <div className={styles.modelName}>{m.name}</div>
                    <div className={styles.modelDesc}>{m.desc}</div>
                    <span className={`${styles.modelBadge} ${styles[m.badgeClass]}`}>
                      {m.badge}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Step 2: Connection Setup */}
          {step === 2 && (
            <>
              <div className={styles.stepIcon}>&#x1F50C;</div>
              <div className={styles.stepTitle}>Connect to Claude</div>
              <div className={styles.stepSubtitle}>
                Choose how to connect. Meta employees can use the internal LDAR proxy — no API key needed.
              </div>

              {/* Connection type toggle */}
              <div className={styles.modelGrid}>
                <div
                  className={`${styles.modelCard} ${connectionType === 'proxy' ? styles.selected : ''}`}
                  onClick={() => handleConnectionTypeChange('proxy')}
                >
                  <div className={styles.modelName}>Meta Proxy</div>
                  <div className={styles.modelDesc}>Uses LDAR on your devserver. No API key required.</div>
                  <span className={`${styles.modelBadge} ${styles.recommended}`}>recommended</span>
                </div>
                <div
                  className={`${styles.modelCard} ${connectionType === 'apikey' ? styles.selected : ''}`}
                  onClick={() => handleConnectionTypeChange('apikey')}
                >
                  <div className={styles.modelName}>API Key</div>
                  <div className={styles.modelDesc}>Use your own Anthropic API key directly.</div>
                  <span className={`${styles.modelBadge} ${styles.fast}`}>external</span>
                </div>
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Connection Name</label>
                <input
                  className={styles.input}
                  value={connectionLabel}
                  onChange={e => setConnectionLabel(e.target.value)}
                  placeholder={connectionType === 'proxy' ? 'Meta Proxy' : 'My API Key'}
                />
              </div>

              {connectionType === 'proxy' ? (
                <div className={styles.field}>
                  <label className={styles.label}>Proxy URL</label>
                  <input
                    className={styles.input}
                    value={baseUrl}
                    onChange={e => { setBaseUrl(e.target.value); setTestState('idle'); setApiKeyError(''); }}
                    placeholder="http://localhost:8087"
                  />
                  <div className={styles.inputHint}>
                    LDAR auto-starts on devservers. Wait ~5-10 min after reboot for it to be ready.
                  </div>
                </div>
              ) : (
                <div className={styles.field}>
                  <label className={styles.label}>API Key</label>
                  <input
                    className={styles.input}
                    type="password"
                    value={apiKey}
                    onChange={e => { setApiKey(e.target.value); setTestState('idle'); setApiKeyError(''); }}
                    placeholder="sk-ant-api03-..."
                    autoFocus
                  />
                  <div className={styles.inputHint}>
                    Get your key from console.anthropic.com
                  </div>
                </div>
              )}

              {apiKeyError && <div className={styles.inputError}>{apiKeyError}</div>}

              {testState === 'testing' && (
                <div className={`${styles.testStatus} ${styles.testing}`}>
                  <div className={styles.spinner} />
                  Testing connection...
                </div>
              )}

              {testState === 'success' && (
                <div className={`${styles.testStatus} ${styles.success}`}>
                  &#x2713; Connected successfully!
                </div>
              )}

              {testState === 'error' && (
                <div className={`${styles.testStatus} ${styles.error}`}>
                  &#x2717; {apiKeyError || 'Connection failed'}
                </div>
              )}
            </>
          )}

          {/* Step 3: Ready to go */}
          {step === 3 && (
            <>
              <div className={styles.stepIcon}>&#x1F680;</div>
              <div className={styles.stepTitle}>You're All Set!</div>
              <div className={styles.stepSubtitle}>
                Here's how to make the most of ArcadIA.
              </div>

              <div className={styles.tipCard}>
                <div className={styles.tipIcon}>&#x1F4AC;</div>
                <div className={styles.tipText}>
                  <div className={styles.tipTitle}>Start a conversation</div>
                  <div className={styles.tipDesc}>Click "+ New Chat" or use a quick action on the welcome screen</div>
                </div>
              </div>

              <div className={styles.tipCard}>
                <div className={styles.tipIcon}>&#x1F4C1;</div>
                <div className={styles.tipText}>
                  <div className={styles.tipTitle}>Organize with folders</div>
                  <div className={styles.tipDesc}>Create folders in the sidebar to group related conversations</div>
                </div>
              </div>

              <div className={styles.tipCard}>
                <div className={styles.tipIcon}>&#x1F4CC;</div>
                <div className={styles.tipText}>
                  <div className={styles.tipTitle}>Pin important chats</div>
                  <div className={styles.tipDesc}>Right-click a conversation to pin, rename, share, or change visibility</div>
                </div>
              </div>

              <div className={styles.tipCard}>
                <div className={styles.tipIcon}>&#x26A1;</div>
                <div className={styles.tipText}>
                  <div className={styles.tipTitle}>Build reusable skills</div>
                  <div className={styles.tipDesc}>Save your best prompts as skills for quick reuse across projects</div>
                </div>
              </div>

              <div className={styles.tipCard}>
                <div className={styles.tipIcon}>?</div>
                <div className={styles.tipText}>
                  <div className={styles.tipTitle}>Need help?</div>
                  <div className={styles.tipDesc}>Click the "?" icon in the sidebar for the full user manual</div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className={styles.footer}>
          <div className={styles.dots}>
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <div key={i} className={`${styles.dot} ${i === step ? styles.active : ''}`} />
            ))}
          </div>

          <div className={styles.btnGroup}>
            {step === 0 && (
              <button className={styles.skipBtn} onClick={handleSkip}>Skip setup</button>
            )}
            {step > 0 && (
              <button className={styles.backBtn} onClick={back}>Back</button>
            )}
            <button
              className={styles.nextBtn}
              onClick={next}
              disabled={!canProceed()}
            >
              {step === 0 ? "Let's Go" :
               step === 2 && testState !== 'success' ? 'Test Connection' :
               step === TOTAL_STEPS - 1 ? 'Start Chatting' :
               'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
