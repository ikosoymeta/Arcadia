import React, { useState, useCallback } from 'react';
import { useConnection } from '../../store/ConnectionContext';
import { useChat } from '../../store/ChatContext';
import styles from './Onboarding.module.css';

interface OnboardingProps {
  onComplete: () => void;
}

const MODELS = [
  { value: 'claude-sonnet-4-20250514', name: 'Sonnet 4', desc: 'Best balance of speed and quality', badge: 'recommended', badgeClass: 'recommended' },
  { value: 'claude-opus-4-20250514', name: 'Opus 4', desc: 'Most capable, complex tasks', badge: 'powerful', badgeClass: 'powerful' },
  { value: 'claude-haiku-35-20241022', name: 'Haiku 3.5', desc: 'Fastest responses, simple tasks', badge: 'fast', badgeClass: 'fast' },
];

const TOTAL_STEPS = 4;

export function OnboardingWizard({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [connectionLabel, setConnectionLabel] = useState('My API Key');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('claude-sonnet-4-20250514');
  const [testState, setTestState] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [apiKeyError, setApiKeyError] = useState('');
  const { addConnection } = useConnection();
  const { createConversation } = useChat();

  const handleTestConnection = useCallback(async () => {
    if (!apiKey.trim()) {
      setApiKeyError('Please enter your API key');
      return;
    }

    setTestState('testing');
    setApiKeyError('');

    try {
      const response = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Say "connected" in one word.' }],
          apiKey: apiKey.trim(),
        }),
      });
      setTestState(response.ok ? 'success' : 'error');
      if (!response.ok) setApiKeyError('Connection failed. Please check your API key.');
    } catch {
      setTestState('error');
      setApiKeyError('Network error. Make sure the dev server is running.');
    }
  }, [apiKey, model]);

  const handleFinish = () => {
    // Save the connection
    addConnection({
      label: connectionLabel || 'My API Key',
      apiKey: apiKey.trim(),
      model,
      maxTokens: 4096,
      temperature: 0.7,
    });

    // Mark onboarding as complete
    localStorage.setItem('arcadia-onboarding-complete', 'true');

    // Create first conversation
    createConversation(model);

    onComplete();
  };

  const handleSkip = () => {
    localStorage.setItem('arcadia-onboarding-complete', 'true');
    onComplete();
  };

  const canProceed = () => {
    if (step === 2) return apiKey.trim().length > 0;
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
                  <span className={styles.featureIcon}>💬</span>
                  <div className={styles.featureText}>
                    <div className={styles.featureTitle}>Chat with Claude</div>
                    <div className={styles.featureDesc}>Natural conversation with real-time streaming responses</div>
                  </div>
                </div>
                <div className={styles.featureItem}>
                  <span className={styles.featureIcon}>◎</span>
                  <div className={styles.featureText}>
                    <div className={styles.featureTitle}>Live Preview</div>
                    <div className={styles.featureDesc}>See code, HTML, and markdown rendered as Claude writes</div>
                  </div>
                </div>
                <div className={styles.featureItem}>
                  <span className={styles.featureIcon}>⌨</span>
                  <div className={styles.featureText}>
                    <div className={styles.featureTitle}>Code Workspace</div>
                    <div className={styles.featureDesc}>VS Code-like editor with terminal, debugger, and file explorer</div>
                  </div>
                </div>
                <div className={styles.featureItem}>
                  <span className={styles.featureIcon}>👥</span>
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
              <div className={styles.stepIcon}>🤖</div>
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

          {/* Step 2: API Key */}
          {step === 2 && (
            <>
              <div className={styles.stepIcon}>🔑</div>
              <div className={styles.stepTitle}>Connect Your API Key</div>
              <div className={styles.stepSubtitle}>
                Enter your Anthropic API key to start chatting with Claude.
                Your key is stored only in your browser — never sent to any server except Anthropic.
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Connection Name</label>
                <input
                  className={styles.input}
                  value={connectionLabel}
                  onChange={e => setConnectionLabel(e.target.value)}
                  placeholder="My API Key"
                />
              </div>

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
                {apiKeyError && <div className={styles.inputError}>{apiKeyError}</div>}
                <div className={styles.inputHint}>
                  Get your key from console.anthropic.com → API Keys
                </div>
              </div>

              {testState === 'testing' && (
                <div className={`${styles.testStatus} ${styles.testing}`}>
                  <div className={styles.spinner} />
                  Testing connection...
                </div>
              )}

              {testState === 'success' && (
                <div className={`${styles.testStatus} ${styles.success}`}>
                  ✓ Connected successfully! Your API key works.
                </div>
              )}

              {testState === 'error' && (
                <div className={`${styles.testStatus} ${styles.error}`}>
                  ✗ {apiKeyError || 'Connection failed'}
                </div>
              )}
            </>
          )}

          {/* Step 3: Ready to go */}
          {step === 3 && (
            <>
              <div className={styles.stepIcon}>🚀</div>
              <div className={styles.stepTitle}>You're All Set!</div>
              <div className={styles.stepSubtitle}>
                Here's how to make the most of ArcadIA. Click any tip below when you're ready.
              </div>

              <div className={styles.tipCard}>
                <div className={styles.tipIcon}>💬</div>
                <div className={styles.tipText}>
                  <div className={styles.tipTitle}>Start a conversation</div>
                  <div className={styles.tipDesc}>Click "+ New Chat" or use a quick action on the welcome screen</div>
                </div>
              </div>

              <div className={styles.tipCard}>
                <div className={styles.tipIcon}>📁</div>
                <div className={styles.tipText}>
                  <div className={styles.tipTitle}>Organize with folders</div>
                  <div className={styles.tipDesc}>Create folders in the sidebar to group related conversations</div>
                </div>
              </div>

              <div className={styles.tipCard}>
                <div className={styles.tipIcon}>📌</div>
                <div className={styles.tipText}>
                  <div className={styles.tipTitle}>Pin important chats</div>
                  <div className={styles.tipDesc}>Right-click a conversation to pin, rename, share, or change visibility</div>
                </div>
              </div>

              <div className={styles.tipCard}>
                <div className={styles.tipIcon}>⚡</div>
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
