import { useState } from 'react';
import { ChatProvider } from './store/ChatContext';
import { ConnectionProvider } from './store/ConnectionContext';
import { PreviewProvider } from './store/PreviewContext';
import { Sidebar } from './components/Sidebar/Sidebar';
import { ChatPanel } from './components/Chat/ChatPanel';
import { PreviewPanel } from './components/Preview/PreviewPanel';
import { SettingsPanel } from './components/Settings/SettingsPanel';
import { BenchmarkPanel } from './components/Benchmark/BenchmarkPanel';
import { CodeWorkspace } from './components/CodeWorkspace/CodeWorkspace';
import { ViewMode } from './types';
import styles from './App.module.css';

function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('chat');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [previewCollapsed, setPreviewCollapsed] = useState(false);

  return (
    <ConnectionProvider>
      <ChatProvider>
        <PreviewProvider>
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
                <CodeWorkspace />
              )}
              {viewMode === 'settings' && (
                <div className={styles.fullWidth}>
                  <SettingsPanel />
                </div>
              )}
              {viewMode === 'benchmarks' && (
                <div className={styles.fullWidth}>
                  <BenchmarkPanel />
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
