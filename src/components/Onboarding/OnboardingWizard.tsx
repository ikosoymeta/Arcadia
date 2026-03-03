import { useConnection } from '../../store/ConnectionContext';
import { useChat } from '../../store/ChatContext';
import styles from './Onboarding.module.css';

interface OnboardingProps {
  onComplete: () => void;
}

const DEFAULT_PROXY_URL = 'http://localhost:8087';

export function OnboardingWizard({ onComplete }: OnboardingProps) {
  const { addConnection } = useConnection();
  const { createConversation } = useChat();

  // Auto-configure Meta Proxy and go straight in
  const handleStart = () => {
    addConnection({
      label: 'Meta Proxy',
      apiKey: '',
      model: 'claude-sonnet-4-20250514',
      maxTokens: 4096,
      temperature: 0.7,
      baseUrl: DEFAULT_PROXY_URL,
    });

    localStorage.setItem('arcadia-onboarding-complete', 'true');
    createConversation('claude-sonnet-4-20250514');
    onComplete();
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.wizard}>
        <div className={styles.body}>
          <div className={styles.welcomeGraphic}>
            <span className={styles.logoLarge}>ArcadIA</span>
          </div>
          <div className={styles.stepTitle}>Welcome to ArcadIA Editor</div>
          <div className={styles.stepSubtitle}>
            AI-powered workspace for building, creating, and collaborating with Claude.
            Connects automatically via your devserver.
          </div>
          <div className={styles.featureList}>
            <div className={styles.featureItem}>
              <span className={styles.featureIcon}>&#x1F4AC;</span>
              <div className={styles.featureText}>
                <div className={styles.featureTitle}>Chat with Claude</div>
                <div className={styles.featureDesc}>Natural conversation with real-time streaming</div>
              </div>
            </div>
            <div className={styles.featureItem}>
              <span className={styles.featureIcon}>&#x25CE;</span>
              <div className={styles.featureText}>
                <div className={styles.featureTitle}>Live Preview</div>
                <div className={styles.featureDesc}>See code and HTML rendered as Claude writes</div>
              </div>
            </div>
            <div className={styles.featureItem}>
              <span className={styles.featureIcon}>&#x2328;</span>
              <div className={styles.featureText}>
                <div className={styles.featureTitle}>Code Workspace</div>
                <div className={styles.featureDesc}>Editor with terminal and file explorer</div>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.footer}>
          <div className={styles.btnGroup}>
            <button className={styles.nextBtn} onClick={handleStart}>
              Start Chatting
            </button>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textAlign: 'center', marginTop: '8px' }}>
            Uses Meta LDAR proxy (localhost:8087). Change in Settings anytime.
          </div>
        </div>
      </div>
    </div>
  );
}
