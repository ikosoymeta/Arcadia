import { useState, lazy, Suspense } from 'react';
import { ChatProvider } from './store/ChatContext';
import { ConnectionProvider } from './store/ConnectionContext';
import { PreviewProvider } from './store/PreviewContext';
import { Sidebar } from './components/Sidebar/Sidebar';
import { ChatPanel } from './components/Chat/ChatPanel';
import { PreviewPanel } from './components/Preview/PreviewPanel';
import { OnboardingWizard } from './components/Onboarding/OnboardingWizard';
import type { ViewMode } from './types';
import styles from './App.module.css';

// Lazy-loaded panels for code splitting
const SettingsPanel = lazy(() => import('./components/Settings/SettingsPanel').then(m => ({ default: m.SettingsPanel })));
const BenchmarkPanel = lazy(() => import('./components/Benchmark/BenchmarkPanel').then(m => ({ default: m.BenchmarkPanel })));
const CodeWorkspace = lazy(() => import('./components/CodeWorkspace/CodeWorkspace').then(m => ({ default: m.CodeWorkspace })));
const SkillsPanel = lazy(() => import('./components/Skills/SkillsPanel').then(m => ({ default: m.SkillsPanel })));
const TeamPanel = lazy(() => import('./components/Team/TeamPanel').then(m => ({ default: m.TeamPanel })));
const HelpPanel = lazy(() => import('./components/Help/HelpPanel').then(m => ({ default: m.HelpPanel })));

function LoadingFallback() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100%', width: '100%', color: 'var(--text-tertiary)', fontSize: '13px',
    }}>
      Loading...
    </div>
  );
}

function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('chat');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [previewCollapsed, setPreviewCollapsed] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(
    () => !localStorage.getItem('arcadia-onboarding-complete')
  );

  return (
    <ConnectionProvider>
      <ChatProvider>
        <PreviewProvider>
          {showOnboarding && (
            <OnboardingWizard onComplete={() => setShowOnboarding(false)} />
          )}
          <div className={styles.app}>
            <Sidebar
              viewMode={viewMode}
              onViewChange={setViewMode}
              collapsed={sidebarCollapsed}
              onToggleCollapse={() => setSidebarCollapsed(p => !p)}
            />
            <div className={styles.mainContent}>
              {viewMode === 'chat' && (
                <>
                  <ChatPanel
                    sidebarCollapsed={sidebarCollapsed}
                    onExpandSidebar={() => setSidebarCollapsed(false)}
                  />
                  <PreviewPanel
                    collapsed={previewCollapsed}
                    onToggleCollapse={() => setPreviewCollapsed(p => !p)}
                  />
                </>
              )}
              {viewMode === 'code-workspace' && (
                <Suspense fallback={<LoadingFallback />}>
                  <CodeWorkspace />
                </Suspense>
              )}
              {viewMode === 'settings' && (
                <div className={styles.fullWidth}>
                  <Suspense fallback={<LoadingFallback />}>
                    <SettingsPanel />
                  </Suspense>
                </div>
              )}
              {viewMode === 'benchmarks' && (
                <div className={styles.fullWidth}>
                  <Suspense fallback={<LoadingFallback />}>
                    <BenchmarkPanel />
                  </Suspense>
                </div>
              )}
              {viewMode === 'skills' && (
                <div className={styles.fullWidth}>
                  <Suspense fallback={<LoadingFallback />}>
                    <SkillsPanel />
                  </Suspense>
                </div>
              )}
              {viewMode === 'team' && (
                <div className={styles.fullWidth}>
                  <Suspense fallback={<LoadingFallback />}>
                    <TeamPanel />
                  </Suspense>
                </div>
              )}
              {viewMode === 'help' && (
                <div className={styles.fullWidth}>
                  <Suspense fallback={<LoadingFallback />}>
                    <HelpPanel />
                  </Suspense>
                </div>
              )}
            </div>
          </div>
        </PreviewProvider>
      </ChatProvider>
    </ConnectionProvider>
  );
}

export default App;
