import { useState, useRef, useCallback, lazy, Suspense, useEffect } from 'react';
import { ChatProvider, useChat } from './store/ChatContext';
import { ConnectionProvider } from './store/ConnectionContext';
import { PreviewProvider } from './store/PreviewContext';
import { Sidebar } from './components/Sidebar/Sidebar';
// Lazy-load chat views — only one is shown at a time
const SimpleView = lazy(() => import('./components/SimpleView/SimpleView').then(m => ({ default: m.SimpleView })));
const EngineerView = lazy(() => import('./components/EngineerView/EngineerView').then(m => ({ default: m.EngineerView })));
import { ModeSwitcher } from './components/ModeSwitcher/ModeSwitcher';
import type { ViewMode, InterfaceMode } from './types';
import { trackSession, trackSessionDuration } from './services/analytics';
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
const AnalyticsPanel = lazy(() => import('./components/Analytics/AnalyticsPanel').then(m => ({ default: m.AnalyticsPanel })));
const SecondBrainPanel = lazy(() => import('./components/SecondBrain/SecondBrainPanel').then(m => ({ default: m.SecondBrainPanel })));

// ─── Constants ────────────────────────────────────────────────────────────────
const PREVIEW_MIN = 200;
const PREVIEW_MAX = 600;
const PREVIEW_DEFAULT = 340;

function loadWidth(key: string, fallback: number): number {
  const v = localStorage.getItem(key);
  return v ? parseInt(v, 10) : fallback;
}

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

// ─── Resize Handle Component (preview only) ──────────────────────────────────
function ResizeHandle({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <div className={styles.resizeHandle} onMouseDown={onMouseDown}>
      <div className={styles.resizeLine} />
    </div>
  );
}

// ─── Shared Conversation Loader ─────────────────────────────────────────────
// This must be inside ChatProvider to access importConversation.
function SharedConversationLoader() {
  const { importConversation } = useChat();
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    const hash = window.location.hash;
    if (!hash.startsWith('#share=')) return;
    loadedRef.current = true;

    (async () => {
      try {
        const { decodeShareHash } = await import('./services/share');
        const conv = await decodeShareHash();
        if (conv) {
          importConversation(conv);
          // Clean up the hash so it doesn't reload on refresh
          history.replaceState(null, '', window.location.pathname + window.location.search);
        }
      } catch (err) {
        console.error('Failed to load shared conversation:', err);
      }
    })();
  }, [importConversation]);

  return null;
}

// ─── App ──────────────────────────────────────────────────────────────────────
function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('chat');
  const [interfaceMode, setInterfaceMode] = useState<InterfaceMode>(
    () => (localStorage.getItem('arcadia-interface-mode') as InterfaceMode) ?? 'simple'
  );
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [previewCollapsed, setPreviewCollapsed] = useState(false);

  // Preview panel width (resizable)
  const [previewWidth, setPreviewWidth] = useState(() => loadWidth('arcadia-preview-width', PREVIEW_DEFAULT));
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, width: 0 });

  // Persist preview width
  useEffect(() => {
    localStorage.setItem('arcadia-preview-width', String(previewWidth));
  }, [previewWidth]);

  // Persist interface mode
  useEffect(() => {
    localStorage.setItem('arcadia-interface-mode', interfaceMode);
  }, [interfaceMode]);

  // Track session on app load
  useEffect(() => {
    trackSession();
    const startTime = Date.now();
    const handleUnload = () => {
      const minutes = Math.round((Date.now() - startTime) / 60000);
      if (minutes > 0) trackSessionDuration(minutes);
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, []);

  // Listen for navigation events from child components
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as ViewMode;
      setViewMode(detail);
    };
    document.addEventListener('arcadia:navigate', handler);
    return () => document.removeEventListener('arcadia:navigate', handler);
  }, []);

  // ─── Preview drag handlers ─────────────────────────────────────────────────
  const handlePreviewDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, width: previewWidth };
  }, [previewWidth]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - dragStartRef.current.x;
      const newWidth = Math.min(PREVIEW_MAX, Math.max(PREVIEW_MIN, dragStartRef.current.width - delta));
      setPreviewWidth(newWidth);
    };

    const handleMouseUp = () => setIsDragging(false);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isDragging]);

  const handleInterfaceChange = (mode: InterfaceMode) => {
    setInterfaceMode(mode);
    setViewMode('chat');
  };

  return (
    <ConnectionProvider>
      <ChatProvider>
        <SharedConversationLoader />
        <PreviewProvider>
          {/* Drag overlay to prevent iframe/element interference during resize */}
          {isDragging && <div className={styles.dragOverlay} />}

          <div className={styles.app}>
            {/* ─── Sidebar Panel (fixed width, toggle show/hide) ─────────── */}
            {sidebarVisible && (
              <div className={styles.sidebarPanel}>
                <Sidebar
                  viewMode={viewMode}
                  onViewChange={setViewMode}
                  collapsed={false}
                  onToggleCollapse={() => setSidebarVisible(false)}
                />
              </div>
            )}

            {/* Collapsed sidebar restore button */}
            {!sidebarVisible && (
              <button
                className={styles.panelRestoreBtn}
                style={{ left: 0, borderRadius: '0 8px 8px 0' }}
                onClick={() => setSidebarVisible(true)}
                title="Show sidebar"
              >
                <span className={styles.restoreIcon}>◀</span>
                <span className={styles.restoreLabel}>Sidebar</span>
              </button>
            )}

            {/* ─── Main Content Panel (fills remaining space) ────────────── */}
            <div className={styles.mainContent}>
              {/* Mode switcher header — always shown on chat view */}
              {viewMode === 'chat' && (
                <div className={styles.modeHeader}>
                  {!sidebarVisible && (
                    <button
                      className={styles.headerIconBtn}
                      onClick={() => setSidebarVisible(true)}
                      title="Show sidebar"
                    >☰</button>
                  )}
                  <ModeSwitcher mode={interfaceMode} onChange={handleInterfaceChange} />
                  <div className={styles.modeHint}>
                    {interfaceMode === 'simple'
                      ? 'Friendly mode — just describe what you need'
                      : 'Engineer mode — full API access, logs, terminal'}
                  </div>
                  <div style={{ flex: 1 }} />
                  {/* Preview toggle in header */}
                  {interfaceMode === 'simple' && (
                    <button
                      className={styles.headerIconBtn}
                      onClick={() => setPreviewCollapsed(p => !p)}
                      title={previewCollapsed ? 'Show preview panel' : 'Hide preview panel'}
                    >
                      {previewCollapsed ? '◁ Preview' : 'Preview ▷'}
                    </button>
                  )}
                </div>
              )}

              {/* Chat views */}
              {viewMode === 'chat' && interfaceMode === 'simple' && (
                <div className={styles.chatLayout}>
                  <Suspense fallback={<LoadingFallback />}>
                    <SimpleView />
                  </Suspense>
                </div>
              )}
              {viewMode === 'chat' && interfaceMode === 'engineer' && (
                <div className={styles.engineerLayout}>
                  <Suspense fallback={<LoadingFallback />}>
                    <EngineerView />
                  </Suspense>
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
                  <Suspense fallback={<LoadingFallback />}><SettingsPanel /></Suspense>
                </div>
              )}
              {viewMode === 'benchmarks' && (
                <div className={styles.fullWidth}>
                  <Suspense fallback={<LoadingFallback />}><BenchmarkPanel /></Suspense>
                </div>
              )}
              {viewMode === 'skills' && (
                <div className={styles.fullWidth}>
                  <Suspense fallback={<LoadingFallback />}><SkillsPanel /></Suspense>
                </div>
              )}
              {viewMode === 'team' && (
                <div className={styles.fullWidth}>
                  <Suspense fallback={<LoadingFallback />}><TeamPanel /></Suspense>
                </div>
              )}
              {viewMode === 'help' && (
                <div className={styles.fullWidth}>
                  <Suspense fallback={<LoadingFallback />}><HelpPanel /></Suspense>
                </div>
              )}
              {viewMode === 'integrations' && (
                <div className={styles.fullWidth}>
                  <Suspense fallback={<LoadingFallback />}><IntegrationsPanel /></Suspense>
                </div>
              )}
              {viewMode === 'analytics' && (
                <div className={styles.fullWidth}>
                  <Suspense fallback={<LoadingFallback />}><AnalyticsPanel /></Suspense>
                </div>
              )}
              {viewMode === 'secondbrain' && (
                <div className={styles.fullWidth}>
                  <Suspense fallback={<LoadingFallback />}><SecondBrainPanel /></Suspense>
                </div>
              )}
            </div>

            {/* ─── Preview Panel (resizable, Simple mode only) ───────────── */}
            {viewMode === 'chat' && interfaceMode === 'simple' && (
              <>
                {!previewCollapsed && (
                  <ResizeHandle onMouseDown={handlePreviewDragStart} />
                )}
                {!previewCollapsed && (
                  <div
                    className={styles.previewPanel}
                    style={{ width: previewWidth, minWidth: previewWidth, maxWidth: previewWidth }}
                  >
                    <Suspense fallback={null}>
                      <PreviewPanel
                        collapsed={false}
                        onToggleCollapse={() => setPreviewCollapsed(true)}
                      />
                    </Suspense>
                  </div>
                )}
              </>
            )}

            {/* Collapsed preview restore button */}
            {viewMode === 'chat' && interfaceMode === 'simple' && previewCollapsed && (
              <button
                className={styles.panelRestoreBtn}
                style={{ right: 0, borderRadius: '8px 0 0 8px' }}
                onClick={() => setPreviewCollapsed(false)}
                title="Show preview panel"
              >
                <span className={styles.restoreLabel}>Preview</span>
                <span className={styles.restoreIcon}>▶</span>
              </button>
            )}
          </div>

          {/* ─── Persistent Help Link ─────────────────────────────────── */}
          <a
            href="mailto:ikosoy@meta.com?subject=ArcadIA%20Editor%20Support"
            className={styles.persistentHelp}
            title="Contact ArcadIA Support"
          >
            Need help? Contact support
          </a>
        </PreviewProvider>
      </ChatProvider>
    </ConnectionProvider>
  );
}

export default App;
