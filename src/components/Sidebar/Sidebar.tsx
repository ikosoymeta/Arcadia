import React from 'react';
import { useChat } from '../../store/ChatContext';
import { useConnection } from '../../store/ConnectionContext';
import type { ViewMode } from '../../types';
import styles from './Sidebar.module.css';

interface SidebarProps {
  viewMode: ViewMode;
  onViewChange: (mode: ViewMode) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function Sidebar({ viewMode, onViewChange, collapsed, onToggleCollapse }: SidebarProps) {
  const {
    conversations,
    activeConversationId,
    createConversation,
    deleteConversation,
    setActiveConversation,
  } = useChat();
  const { connections, activeConnection } = useConnection();

  const handleNewChat = () => {
    const model = activeConnection?.model || 'claude-sonnet-4-20250514';
    createConversation(model);
    onViewChange('chat');
  };

  return (
    <div className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`}>
      <div className={styles.header}>
        <span className={styles.logo}>Claude Editor</span>
        <button className={styles.collapseBtn} onClick={onToggleCollapse} title="Collapse sidebar">
          ◁
        </button>
      </div>

      <nav className={styles.nav}>
        <button
          className={`${styles.navBtn} ${viewMode === 'chat' ? styles.active : ''}`}
          onClick={() => onViewChange('chat')}
        >
          <span className={styles.navIcon}>💬</span>
          Chat
        </button>
        <button
          className={`${styles.navBtn} ${viewMode === 'code-workspace' ? styles.active : ''}`}
          onClick={() => onViewChange('code-workspace')}
        >
          <span className={styles.navIcon}>⌨</span>
          Code
        </button>
        <button
          className={`${styles.navBtn} ${viewMode === 'settings' ? styles.active : ''}`}
          onClick={() => onViewChange('settings')}
        >
          <span className={styles.navIcon}>⚙</span>
          Settings
        </button>
        <button
          className={`${styles.navBtn} ${viewMode === 'benchmarks' ? styles.active : ''}`}
          onClick={() => onViewChange('benchmarks')}
        >
          <span className={styles.navIcon}>📊</span>
          Bench
        </button>
      </nav>

      <button className={styles.newChatBtn} onClick={handleNewChat}>
        + New Chat
      </button>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Conversations</div>
        {conversations.length === 0 ? (
          <div className={styles.emptyState}>
            No conversations yet.<br />Start a new chat above.
          </div>
        ) : (
          conversations.map(conv => (
            <div
              key={conv.id}
              className={`${styles.convItem} ${conv.id === activeConversationId ? styles.active : ''}`}
              onClick={() => {
                setActiveConversation(conv.id);
                onViewChange('chat');
              }}
            >
              <span className={styles.convTitle}>{conv.title}</span>
              <button
                className={styles.convDelete}
                onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                title="Delete"
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>

      <div className={styles.connSection}>
        <div className={styles.sectionTitle}>Connections</div>
        {connections.length === 0 ? (
          <div
            className={styles.connItem}
            onClick={() => onViewChange('settings')}
            style={{ cursor: 'pointer' }}
          >
            <span style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>
              + Add API connection
            </span>
          </div>
        ) : (
          connections.map(conn => (
            <div
              key={conn.id}
              className={styles.connItem}
              onClick={() => onViewChange('settings')}
            >
              <span className={`${styles.statusDot} ${styles[conn.status]}`} />
              <span className={styles.connLabel}>{conn.label}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
