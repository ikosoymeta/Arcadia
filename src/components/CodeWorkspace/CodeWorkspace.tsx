import React, { useState, useRef } from 'react';
import { usePreview } from '../../store/PreviewContext';
import type { FileNode, TerminalEntry } from '../../types';
import styles from './CodeWorkspace.module.css';

// Build a file tree from artifacts
function buildFileTree(files: { name: string; content: string; language: string }[]): FileNode[] {
  const root: FileNode[] = [];
  for (const file of files) {
    const parts = file.name.split('/');
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      const existing = current.find(n => n.name === part);
      if (existing && !isFile) {
        current = existing.children || [];
      } else if (isFile) {
        current.push({
          name: part,
          path: file.name,
          type: 'file',
          content: file.content,
          language: file.language,
        });
      } else {
        const dir: FileNode = { name: part, path: parts.slice(0, i + 1).join('/'), type: 'directory', children: [] };
        current.push(dir);
        current = dir.children!;
      }
    }
  }
  return root;
}

const SAMPLE_FILES: { name: string; content: string; language: string }[] = [
  {
    name: 'src/index.tsx',
    content: `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(
  document.getElementById('root')!
).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);`,
    language: 'typescript',
  },
  {
    name: 'src/App.tsx',
    content: `import React, { useState } from 'react';

export default function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="app">
      <h1>Hello World</h1>
      <p>Count: {count}</p>
      <button onClick={() => setCount(c => c + 1)}>
        Increment
      </button>
    </div>
  );
}`,
    language: 'typescript',
  },
  {
    name: 'src/utils/helpers.ts',
    content: `export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function debounce<T extends (...args: any[]) => void>(
  fn: T,
  delay: number
): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: any[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  }) as T;
}`,
    language: 'typescript',
  },
  {
    name: 'package.json',
    content: `{
  "name": "my-project",
  "version": "1.0.0",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "test": "vitest"
  }
}`,
    language: 'json',
  },
  {
    name: 'README.md',
    content: `# My Project

A sample project demonstrating the Code Workspace.

## Features
- File explorer with tree view
- Integrated terminal
- Debug panel with variables & breakpoints
- AI assistant dock

## Getting Started
\`\`\`bash
npm install
npm run dev
\`\`\``,
    language: 'markdown',
  },
];

export function CodeWorkspace() {
  const { artifacts } = usePreview();
  const [explorerCollapsed, setExplorerCollapsed] = useState(false);
  const [debugCollapsed, setDebugCollapsed] = useState(true);
  const [terminalHeight] = useState(200);
  const [terminalVisible, setTerminalVisible] = useState(true);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [openFiles, setOpenFiles] = useState<string[]>([]);
  const [terminalInput, setTerminalInput] = useState('');
  const [terminalEntries, setTerminalEntries] = useState<TerminalEntry[]>([
    { id: '1', command: 'echo "Welcome to Claude Editor Terminal"', output: 'Welcome to Claude Editor Terminal', timestamp: Date.now(), status: 'success' },
  ]);
  const [aiDockOpen, setAiDockOpen] = useState(false);
  const [watchExpressions, setWatchExpressions] = useState<string[]>(['state.count', 'props.data']);
  const [breakpoints] = useState<{ file: string; line: number }[]>([
    { file: 'src/App.tsx', line: 5 },
    { file: 'src/utils/helpers.ts', line: 3 },
  ]);
  const terminalRef = useRef<HTMLDivElement>(null);

  // Combine sample files with artifacts
  const allFiles = [
    ...SAMPLE_FILES,
    ...artifacts
      .filter(a => a.type === 'code')
      .map((a, i) => ({
        name: a.filename || `artifacts/${a.language || 'code'}_${i + 1}.${getExtension(a.language)}`,
        content: a.content,
        language: a.language || 'text',
      })),
  ];

  const fileTree = buildFileTree(allFiles);

  const getFileContent = (path: string) => {
    return allFiles.find(f => f.name === path);
  };

  const handleOpenFile = (path: string) => {
    setActiveFile(path);
    if (!openFiles.includes(path)) {
      setOpenFiles(prev => [...prev, path]);
    }
  };

  const handleCloseFile = (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenFiles(prev => prev.filter(f => f !== path));
    if (activeFile === path) {
      const remaining = openFiles.filter(f => f !== path);
      setActiveFile(remaining.length > 0 ? remaining[remaining.length - 1] : null);
    }
  };

  const handleTerminalSubmit = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' || !terminalInput.trim()) return;
    const cmd = terminalInput.trim();
    let output = '';
    let status: 'success' | 'error' = 'success';

    // Simulate terminal commands
    if (cmd === 'ls') {
      output = allFiles.map(f => f.name).join('\n');
    } else if (cmd === 'pwd') {
      output = '/workspace/my-project';
    } else if (cmd.startsWith('cat ')) {
      const file = allFiles.find(f => f.name === cmd.slice(4).trim());
      output = file ? file.content : `cat: ${cmd.slice(4)}: No such file or directory`;
      if (!file) status = 'error';
    } else if (cmd === 'help') {
      output = 'Available commands: ls, pwd, cat <file>, clear, help, npm run dev, git status';
    } else if (cmd === 'clear') {
      setTerminalEntries([]);
      setTerminalInput('');
      return;
    } else if (cmd === 'npm run dev') {
      output = '  VITE v5.0.0  ready in 156 ms\n\n  -> Local:   http://localhost:5173/\n  -> Network: http://192.168.1.100:5173/';
    } else if (cmd === 'git status') {
      output = 'On branch main\nnothing to commit, working tree clean';
    } else if (cmd === 'npm test') {
      output = ' PASS  src/App.test.tsx\n  App\n    ✓ renders heading (23ms)\n    ✓ increments counter (45ms)\n\nTest Suites: 1 passed, 1 total\nTests:       2 passed, 2 total';
    } else {
      output = `zsh: command not found: ${cmd.split(' ')[0]}`;
      status = 'error';
    }

    setTerminalEntries(prev => [...prev, { id: crypto.randomUUID(), command: cmd, output, timestamp: Date.now(), status }]);
    setTerminalInput('');

    setTimeout(() => {
      if (terminalRef.current) {
        terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
      }
    }, 50);
  };

  const activeFileData = activeFile ? getFileContent(activeFile) : null;

  return (
    <div className={styles.workspace}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <button
          className={`${styles.toolBtn} ${!explorerCollapsed ? styles.active : ''}`}
          onClick={() => setExplorerCollapsed(p => !p)}
          title="Toggle Explorer"
        >
          ☰ Explorer
        </button>
        <button
          className={`${styles.toolBtn} ${terminalVisible ? styles.active : ''}`}
          onClick={() => setTerminalVisible(p => !p)}
          title="Toggle Terminal"
        >
          ⌘ Terminal
        </button>
        <button
          className={`${styles.toolBtn} ${!debugCollapsed ? styles.active : ''}`}
          onClick={() => setDebugCollapsed(p => !p)}
          title="Toggle Debug"
        >
          ⚡ Debug
        </button>
        <div className={styles.toolSep} />
        <button
          className={`${styles.toolBtn} ${aiDockOpen ? styles.active : ''}`}
          onClick={() => setAiDockOpen(p => !p)}
          title="AI Assistant"
        >
          ✦ AI Assist
        </button>
        <div className={styles.toolTitle}>
          Claude Code Workspace
        </div>
        <button className={styles.toolBtn} title="Split Editor">⫽</button>
        <button className={styles.toolBtn} title="Search">🔍</button>
        <button className={styles.toolBtn} title="Git">⎇</button>
      </div>

      <div className={styles.body}>
        {/* File Explorer */}
        <div className={`${styles.explorer} ${explorerCollapsed ? styles.collapsed : ''}`}>
          <div className={styles.explorerHeader}>
            <span>Explorer</span>
            <button className={styles.toolBtn} style={{ padding: '2px 6px', fontSize: '14px' }}>+</button>
          </div>
          <div className={styles.explorerTree}>
            <FileTreeView
              nodes={fileTree}
              activeFile={activeFile}
              onSelect={handleOpenFile}
              depth={0}
            />
          </div>
        </div>

        {/* Editor */}
        <div className={styles.editorArea}>
          {openFiles.length > 0 && (
            <div className={styles.editorTabs}>
              {openFiles.map(f => {
                const name = f.split('/').pop() || f;
                return (
                  <button
                    key={f}
                    className={`${styles.editorTab} ${f === activeFile ? styles.active : ''}`}
                    onClick={() => setActiveFile(f)}
                  >
                    {name}
                    <span className={styles.tabClose} onClick={(e) => handleCloseFile(f, e)}>×</span>
                  </button>
                );
              })}
            </div>
          )}

          {activeFileData ? (
            <div className={styles.editorContent}>
              <div className={styles.lineNumbers}>
                {activeFileData.content.split('\n').map((_, i) => (
                  <div key={i}>{i + 1}</div>
                ))}
              </div>
              <div className={styles.codeContent}>
                {activeFileData.content}
              </div>
            </div>
          ) : (
            <div className={styles.emptyEditor}>
              <div style={{ fontSize: '32px', opacity: 0.3 }}>⌨</div>
              <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Claude Code Workspace</div>
              <div>Open a file from the explorer or use keyboard shortcuts</div>
              <div className={styles.shortcutGrid}>
                <span className={styles.shortcutKey}>⌘P</span>
                <span className={styles.shortcutDesc}>Quick Open File</span>
                <span className={styles.shortcutKey}>⌘⇧P</span>
                <span className={styles.shortcutDesc}>Command Palette</span>
                <span className={styles.shortcutKey}>⌘B</span>
                <span className={styles.shortcutDesc}>Toggle Sidebar</span>
                <span className={styles.shortcutKey}>⌘`</span>
                <span className={styles.shortcutDesc}>Toggle Terminal</span>
                <span className={styles.shortcutKey}>⌘⇧E</span>
                <span className={styles.shortcutDesc}>Focus Explorer</span>
                <span className={styles.shortcutKey}>⌘I</span>
                <span className={styles.shortcutDesc}>AI Assistant</span>
              </div>
            </div>
          )}

          {/* Terminal */}
          {terminalVisible && (
            <div className={styles.terminal} style={{ height: terminalHeight }}>
              <div className={styles.resizeHandle} />
              <div className={styles.terminalHeader}>
                <span className={styles.terminalTitle}>Terminal</span>
                <div className={styles.terminalTabs}>
                  <button className={`${styles.terminalTabBtn} ${styles.active}`}>zsh</button>
                  <button className={styles.terminalTabBtn}>+</button>
                </div>
                <button
                  className={styles.terminalToggle}
                  onClick={() => setTerminalVisible(false)}
                >
                  ×
                </button>
              </div>
              <div className={styles.terminalBody} ref={terminalRef}>
                {terminalEntries.map(entry => (
                  <div key={entry.id} className={styles.terminalEntry}>
                    <div>
                      <span className={styles.terminalPrompt}>~/project $ </span>
                      <span className={styles.terminalCmd}>{entry.command}</span>
                    </div>
                    <div className={`${styles.terminalOutput} ${entry.status === 'error' ? styles.error : ''}`}>
                      {entry.output}
                    </div>
                  </div>
                ))}
                <div className={styles.terminalInputLine}>
                  <span className={styles.terminalPrompt}>~/project $ </span>
                  <input
                    className={styles.terminalInput}
                    value={terminalInput}
                    onChange={e => setTerminalInput(e.target.value)}
                    onKeyDown={handleTerminalSubmit}
                    autoFocus
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Debug Panel */}
        <div className={`${styles.debugPanel} ${debugCollapsed ? styles.collapsed : ''}`}>
          <div className={styles.debugSection}>
            <div className={styles.debugSectionTitle}>
              Variables
            </div>
            <div className={styles.debugItem}>
              <span className={styles.debugKey}>count</span>
              <span className={styles.debugValue}>0</span>
            </div>
            <div className={styles.debugItem}>
              <span className={styles.debugKey}>isLoading</span>
              <span className={styles.debugValue}>false</span>
            </div>
            <div className={styles.debugItem}>
              <span className={styles.debugKey}>data</span>
              <span className={styles.debugValue}>{'{ items: [...] }'}</span>
            </div>
          </div>

          <div className={styles.debugSection}>
            <div className={styles.debugSectionTitle}>
              Watch
              <button className={styles.toolBtn} style={{ padding: '1px 6px', fontSize: '12px' }}>+</button>
            </div>
            {watchExpressions.map((expr, i) => (
              <div key={i} className={styles.debugItem}>
                <span className={styles.debugValue}>{expr}</span>
                <span style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>= undefined</span>
              </div>
            ))}
            <input
              className={styles.watchInput}
              placeholder="Add watch expression..."
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.target as HTMLInputElement).value) {
                  setWatchExpressions(prev => [...prev, (e.target as HTMLInputElement).value]);
                  (e.target as HTMLInputElement).value = '';
                }
              }}
            />
          </div>

          <div className={styles.debugSection}>
            <div className={styles.debugSectionTitle}>
              Breakpoints
            </div>
            {breakpoints.map((bp, i) => (
              <div key={i} className={styles.debugItem} style={{ cursor: 'pointer' }} onClick={() => handleOpenFile(bp.file)}>
                <span className={styles.breakpointDot} />
                <span className={styles.debugValue}>{bp.file}:{bp.line}</span>
              </div>
            ))}
          </div>

          <div className={styles.debugSection}>
            <div className={styles.debugSectionTitle}>Call Stack</div>
            <div className={styles.debugItem}>
              <span className={styles.debugValue} style={{ color: 'var(--text-tertiary)' }}>No active debug session</span>
            </div>
          </div>

          <div className={styles.debugSection}>
            <div className={styles.debugSectionTitle}>
              Performance
              <button className={styles.toolBtn} style={{ padding: '1px 6px', fontSize: '12px' }}>▶</button>
            </div>
            <div className={styles.debugItem}>
              <span className={styles.debugKey}>Render</span>
              <span className={styles.debugValue}>2.3ms</span>
            </div>
            <div className={styles.debugItem}>
              <span className={styles.debugKey}>Memory</span>
              <span className={styles.debugValue}>12.4 MB</span>
            </div>
            <div className={styles.debugItem}>
              <span className={styles.debugKey}>FPS</span>
              <span className={styles.debugValue}>60</span>
            </div>
          </div>
        </div>
      </div>

      {/* AI Assistant Dock */}
      {aiDockOpen && (
        <div className={styles.aiDock}>
          <div className={styles.aiDockHeader}>
            <span className={styles.aiDockTitle}>AI Assistant</span>
            <button className={styles.toolBtn} onClick={() => setAiDockOpen(false)}>×</button>
          </div>
          <div className={styles.aiDockBody}>
            Ask Claude about your code, get explanations, generate tests, refactor, or debug issues.
            <br /><br />
            <strong>Try:</strong>
            <ul style={{ paddingLeft: '16px', margin: '8px 0' }}>
              <li>"Explain this function"</li>
              <li>"Write tests for App.tsx"</li>
              <li>"Find potential bugs"</li>
              <li>"Refactor with better types"</li>
              <li>"Generate API documentation"</li>
            </ul>
          </div>
          <div className={styles.aiDockInput}>
            <input className={styles.aiDockTextarea} placeholder="Ask about your code..." />
            <button className={styles.aiDockSend}>↑</button>
          </div>
        </div>
      )}
    </div>
  );
}

// File tree recursive component
function FileTreeView({
  nodes,
  activeFile,
  onSelect,
  depth,
}: {
  nodes: FileNode[];
  activeFile: string | null;
  onSelect: (path: string) => void;
  depth: number;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['src', 'src/utils']));

  const toggle = (path: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  // Sort: directories first, then files
  const sorted = [...nodes].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <>
      {sorted.map(node => (
        <React.Fragment key={node.path}>
          <div
            className={`${styles.treeItem} ${node.path === activeFile ? styles.active : ''}`}
            style={{ paddingLeft: 8 + depth * 16 }}
            onClick={() => {
              if (node.type === 'directory') toggle(node.path);
              else onSelect(node.path);
            }}
          >
            <span className={styles.treeIcon}>
              {node.type === 'directory'
                ? expanded.has(node.path) ? '▾' : '▸'
                : getFileIcon(node.name)}
            </span>
            <span className={styles.treeName}>{node.name}</span>
          </div>
          {node.type === 'directory' && expanded.has(node.path) && node.children && (
            <FileTreeView
              nodes={node.children}
              activeFile={activeFile}
              onSelect={onSelect}
              depth={depth + 1}
            />
          )}
        </React.Fragment>
      ))}
    </>
  );
}

function getFileIcon(name: string): string {
  if (name.endsWith('.tsx') || name.endsWith('.ts')) return '⊡';
  if (name.endsWith('.json')) return '{ }';
  if (name.endsWith('.md')) return '◈';
  if (name.endsWith('.css')) return '#';
  if (name.endsWith('.html')) return '◇';
  return '○';
}

function getExtension(language?: string): string {
  const map: Record<string, string> = {
    typescript: 'ts',
    javascript: 'js',
    python: 'py',
    html: 'html',
    css: 'css',
    json: 'json',
    rust: 'rs',
    go: 'go',
    java: 'java',
  };
  return map[language || ''] || 'txt';
}
