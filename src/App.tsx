import { useState, lazy, Suspense, useEffect } from 'react';
import { ChatProvider } from './store/ChatContext';
import { ConnectionProvider } from './store/ConnectionContext';
import { PreviewProvider } from './store/PreviewContext';
import { Sidebar } from './components/Sidebar/Sidebar';
import { OnboardingWizard } from './components/Onboarding/OnboardingWizard';
import { SimpleView } from './components/SimpleView/SimpleView';
import { EngineerView } from './components/EngineerView/EngineerView';
import { ModeSwitcher } from './components/ModeSwitcher/ModeSwitcher';
import type { ViewMode, InterfaceMode } from './types';
import styles from './App.module.css';

// Lazy-loaded panels for code splitting
const SettingsPanel = lazy(() => import('./components/Settings/SettingsPanel').then(m => ({ default: m.SettingsPanel })));
const BenchmarkPanel = lazy(() => import('./components/Benchmark/BenchmarkPanel').then(m => ({ default: m.BenchmarkPanel })));
const CodeWorkspace = lazy(() => import('./components/CodeWorkspace/CodeWorkspace').then(m => ({ default: m.CodeWorkspace })));
const SkillsPanel = lazy(() => import('./components/Skills/SkillsPanel').then(m => ({ default: m.SkillsPanel })));
const TeamPanel = lazy(() => import('./components/Team/TeamPanel').then(m => ({ default: m.TeamPanel })));
const HelpPanel = lazy(() => import('./components/Help/HelpPanel').then(m => ({ default: m.HelpPanel })));
const IntegrationsPanel = lazy(() => import('./components/Integrations/IntegrationsPanel').then(m => ({ default: m.IntegrationsPanel })));
const PreviewPanel = lazy(() => import('./components/Preview/PreviewPanel').then(m => ({ default: m.PreviewPanel })));

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
  const [interfaceMode, setInterfaceMode] = useState<InterfaceMode>(
    () => (localStorage.getItem('arcadia-interface-mode') as InterfaceMode) ?? 'simple'
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [previewCollapsed, setPreviewCollapsed] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(
    () => !localStorage.getItem('arcadia-onboarding-complete')
  );

  // Persist interface mode
  useEffect(() => {
    localStorage.setItem('arcadia-interface-mode', interfaceMode);
  }, [interfaceMode]);

  // Listen for navigation events from child components
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as ViewMode;
      setViewMode(detail);
    };
    document.addEventListener('arcadia:navigate', handler);
    return () => document.removeEventListener('arcadia:navigate', handler);
  }, []);

  const handleInterfaceChange = (mode: InterfaceMode) => {
    setInterfaceMode(mode);
    setViewMode('chat');
  };

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
              {/* Mode switcher header — shown only on chat view */}
              {viewMode === 'chat' && (
                <div className={styles.modeHeader}>
                  <ModeSwitcher mode={interfaceMode} onChange={handleInterfaceChange} />
                  <div className={styles.modeHint}>
                    {interfaceMode === 'simple'
                      ? 'Friendly mode — just describe what you need'
                      : 'Engineer mode — full API access, logs, terminal'}
                  </div>
                </div>
              )}

              {/* Chat views */}
              {viewMode === 'chat' && interfaceMode === 'simple' && (
                <div className={styles.chatLayout}>
                  <SimpleView />
                  <Suspense fallback={null}>
                    <PreviewPanel
                      collapsed={previewCollapsed}
                      onToggleCollapse={() => setPreviewCollapsed(p => !p)}
                    />
                  </Suspense>
                </div>
              )}
              {viewMode === 'chat' && interfaceMode === 'engineer' && (
                <div className={styles.engineerLayout}>
                  <EngineerView />
                </div>
              )}

              {/* Other views */}
              {viewMode === 'code-workspace' && (
                <Suspense fallback={<LoadingFallback />}>
                  <CodeWorkspace onNavigateHome={() => setViewMode('chat')} />
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
              {viewMode === 'integrations' && (
                <div className={styles.fullWidth}>
                  <Suspense fallback={<LoadingFallback />}>
                    <IntegrationsPanel />
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
