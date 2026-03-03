import { useState, useRef, useCallback, lazy, Suspense, useEffect } from 'react';
import { ChatProvider } from './store/ChatContext';
import { ConnectionProvider } from './store/ConnectionContext';
import { PreviewProvider } from './store/PreviewContext';
import { Sidebar } from './components/Sidebar/Sidebar';
// OnboardingWizard removed — auto-config handles everything silently
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

// ─── Constants ────────────────────────────────────────────────────────────────
const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 500;
const PREVIEW_MIN = 200;
const PREVIEW_MAX = 600;
const SIDEBAR_DEFAULT = 280;
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

// ─── Resize Handle Component ──────────────────────────────────────────────────
function ResizeHandle({ onMouseDown, position }: { onMouseDown: (e: React.MouseEvent) => void; position: 'left' | 'right' }) {
  return (
    <div
      className={`${styles.resizeHandle} ${position === 'left' ? styles.resizeLeft : styles.resizeRight}`}
      onMouseDown={onMouseDown}
    >
      <div className={styles.resizeLine} />
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('chat');
  const [interfaceMode, setInterfaceMode] = useState<InterfaceMode>(
    () => (localStorage.getItem('arcadia-interface-mode') as InterfaceMode) ?? 'simple'
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [previewCollapsed, setPreviewCollapsed] = useState(false);
  // No onboarding needed — auto-config runs silently in ConnectionProvider

  // Panel widths (px)
  const [sidebarWidth, setSidebarWidth] = useState(() => loadWidth('arcadia-sidebar-width', SIDEBAR_DEFAULT));
  const [previewWidth, setPreviewWidth] = useState(() => loadWidth('arcadia-preview-width', PREVIEW_DEFAULT));
  const [isDragging, setIsDragging] = useState<'sidebar' | 'preview' | null>(null);
  const dragStartRef = useRef({ x: 0, width: 0 });

  // Persist widths
  useEffect(() => {
    localStorage.setItem('arcadia-sidebar-width', String(sidebarWidth));
  }, [sidebarWidth]);
  useEffect(() => {
    localStorage.setItem('arcadia-preview-width', String(previewWidth));
  }, [previewWidth]);

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

  // ─── Drag handlers ──────────────────────────────────────────────────────────
  const handleSidebarDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging('sidebar');
    dragStartRef.current = { x: e.clientX, width: sidebarWidth };
  }, [sidebarWidth]);

  const handlePreviewDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging('preview');
    dragStartRef.current = { x: e.clientX, width: previewWidth };
  }, [previewWidth]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - dragStartRef.current.x;
      if (isDragging === 'sidebar') {
        const newWidth = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, dragStartRef.current.width + delta));
        setSidebarWidth(newWidth);
      } else if (isDragging === 'preview') {
        const newWidth = Math.min(PREVIEW_MAX, Math.max(PREVIEW_MIN, dragStartRef.current.width - delta));
        setPreviewWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(null);
    };

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

  // Determine if preview panel should show
  const showPreview = viewMode === 'chat' && interfaceMode === 'simple' && !previewCollapsed;
  const effectiveSidebarWidth = sidebarCollapsed ? 0 : sidebarWidth;
  const effectivePreviewWidth = showPreview ? previewWidth : 0;

  return (
    <ConnectionProvider>
      <ChatProvider>
        <PreviewProvider>
          {/* Drag overlay to prevent iframe/element interference during resize */}
          {isDragging && <div className={styles.dragOverlay} />}

          <div className={styles.app}>
            {/* ─── Sidebar Panel ──────────────────────────────────────────── */}
            {!sidebarCollapsed && (
              <div
                className={styles.sidebarPanel}
                style={{ width: sidebarWidth, minWidth: sidebarWidth, maxWidth: sidebarWidth }}
              >
                <Sidebar
                  viewMode={viewMode}
                  onViewChange={setViewMode}
                  collapsed={false}
                  onToggleCollapse={() => setSidebarCollapsed(true)}
                />
              </div>
            )}

            {/* Sidebar resize handle */}
            {!sidebarCollapsed && (
              <ResizeHandle onMouseDown={handleSidebarDragStart} position="left" />
            )}

            {/* Collapsed sidebar restore button — fixed left edge */}
            {sidebarCollapsed && (
              <button
                className={styles.panelRestoreBtn}
                style={{ left: 0, borderRadius: '0 8px 8px 0' }}
                onClick={() => setSidebarCollapsed(false)}
                title="Show sidebar"
              >
                <span className={styles.restoreIcon}>◀</span>
                <span className={styles.restoreLabel}>Sidebar</span>
              </button>
            )}

            {/* ─── Main Content Panel ────────────────────────────────────── */}
            <div
              className={styles.mainContent}
              style={{
                width: `calc(100vw - ${effectiveSidebarWidth}px - ${effectivePreviewWidth}px - ${!sidebarCollapsed ? 6 : 0}px - ${showPreview ? 6 : 0}px)`,
              }}
            >
              {/* Mode switcher header — always shown on chat view */}
              {viewMode === 'chat' && (
                <div className={styles.modeHeader}>
                  {sidebarCollapsed && (
                    <button
                      className={styles.headerIconBtn}
                      onClick={() => setSidebarCollapsed(false)}
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
                  <SimpleView />
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

            {/* ─── Preview Panel (Simple mode only) ──────────────────────── */}
            {viewMode === 'chat' && interfaceMode === 'simple' && (
              <>
                {!previewCollapsed && (
                  <ResizeHandle onMouseDown={handlePreviewDragStart} position="right" />
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

            {/* Collapsed preview restore button — fixed right edge */}
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
