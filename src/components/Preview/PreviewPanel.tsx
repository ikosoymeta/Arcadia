import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { usePreview } from '../../store/PreviewContext';
import styles from './PreviewPanel.module.css';

interface PreviewPanelProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function PreviewPanel({ collapsed, onToggleCollapse }: PreviewPanelProps) {
  const { artifacts, activeArtifactId, setActiveArtifact } = usePreview();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const activeArtifact = artifacts.find(a => a.id === activeArtifactId);

  const handleCopy = async (content: string, id: string) => {
    await navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleOpenInNewTab = (html: string) => {
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  useEffect(() => {
    if (activeArtifact?.type === 'html' && iframeRef.current) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(activeArtifact.content);
        doc.close();
      }
    }
  }, [activeArtifact]);

  return (
    <div className={`${styles.previewPanel} ${collapsed ? styles.collapsed : ''}`}>
      <div className={styles.header}>
        <span className={styles.headerTitle}>Preview</span>
        <button className={styles.collapseBtn} onClick={onToggleCollapse}>
          ▷
        </button>
      </div>

      {artifacts.length > 0 && (
        <div className={styles.tabs}>
          {artifacts.map((artifact, i) => (
            <button
              key={artifact.id}
              className={`${styles.tab} ${artifact.id === activeArtifactId ? styles.active : ''}`}
              onClick={() => setActiveArtifact(artifact.id)}
            >
              {artifact.title || `Artifact ${i + 1}`}
            </button>
          ))}
        </div>
      )}

      <div className={styles.content}>
        {!activeArtifact ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>◎</div>
            <div>No preview yet</div>
            <div style={{ fontSize: '12px' }}>
              Send a message to Claude and code blocks<br />
              will appear here in real-time
            </div>
          </div>
        ) : activeArtifact.type === 'code' ? (
          <div className={styles.codeWrapper}>
            <div className={styles.codeHeader}>
              <span className={styles.codeLang}>{activeArtifact.language}</span>
              <button
                className={`${styles.copyBtn} ${copiedId === activeArtifact.id ? styles.copied : ''}`}
                onClick={() => handleCopy(activeArtifact.content, activeArtifact.id)}
              >
                {copiedId === activeArtifact.id ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <pre className={styles.codeBlock}>
              <div className={styles.lineNumbers}>
                <div className={styles.lineNums}>
                  {activeArtifact.content.split('\n').map((_, i) => (
                    <div key={i}>{i + 1}</div>
                  ))}
                </div>
                <code>{activeArtifact.content}</code>
              </div>
            </pre>
          </div>
        ) : activeArtifact.type === 'html' ? (
          <div className={styles.htmlWrapper}>
            <div className={styles.htmlHeader}>
              <span className={styles.htmlTitle}>HTML Preview</span>
              <div className={styles.htmlActions}>
                <button
                  className={styles.htmlBtn}
                  onClick={() => handleCopy(activeArtifact.content, activeArtifact.id)}
                >
                  {copiedId === activeArtifact.id ? 'Copied!' : 'Copy'}
                </button>
                <button
                  className={styles.htmlBtn}
                  onClick={() => handleOpenInNewTab(activeArtifact.content)}
                >
                  Open ↗
                </button>
              </div>
            </div>
            <iframe
              ref={iframeRef}
              className={styles.iframe}
              sandbox="allow-scripts allow-same-origin"
              title="HTML Preview"
            />
          </div>
        ) : (
          <div className={styles.markdownContent}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {activeArtifact.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
