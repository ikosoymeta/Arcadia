import React, { useState } from 'react';
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
    folders,
    activeConversationId,
    chatMode,
    coworkTasks,
    createConversation,
    deleteConversation,
    renameConversation,
    setActiveConversation,
    togglePin,
    setVisibility,
    generateShareUrl,
    createFolder,
    toggleFolderExpand,
    deleteFolder,
    setFolderInstructions,
  } = useChat();
  const { connections, activeConnection } = useConnection();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [editingFolderInstr, setEditingFolderInstr] = useState<string | null>(null);
  const [folderInstrValue, setFolderInstrValue] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const handleNewChat = () => {
    const model = activeConnection?.model || 'claude-sonnet-4-20250514';
    createConversation(model);
    onViewChange('chat');
  };

  const pinnedConvs = conversations.filter(c => c.isPinned);
  const rootConvs = conversations.filter(c => !c.folderId && !c.isPinned);

  const startRename = (id: string, currentTitle: string) => {
    setEditingId(id);
    setEditValue(currentTitle);
    setContextMenu(null);
  };

  const finishRename = () => {
    if (editingId && editValue.trim()) {
      renameConversation(editingId, editValue.trim());
    }
    setEditingId(null);
  };

  const handleContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    setContextMenu({ id, x: e.clientX, y: e.clientY });
  };

  const handleCreateFolder = () => {
    if (newFolderName.trim()) {
      createFolder(newFolderName.trim());
      setNewFolderName('');
      setShowNewFolder(false);
    }
  };

  const handleShare = (id: string) => {
    const url = generateShareUrl(id);
    navigator.clipboard.writeText(url);
    setContextMenu(null);
  };

  const getVisibilityIcon = (v: string) => {
    if (v === 'private') return '🔒';
    if (v === 'team') return '👥';
    return '🌐';
  };

  return (
    <div className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`}>
      <div className={styles.header}>
        <span className={styles.logo}>ArcadIA Editor</span>
        <button className={styles.collapseBtn} onClick={onToggleCollapse}>◁</button>
      </div>

      <nav className={styles.nav}>
        {[
          { mode: 'chat' as ViewMode, icon: '💬', label: 'Chat' },
          { mode: 'code-workspace' as ViewMode, icon: '⌨', label: 'Code' },
          { mode: 'skills' as ViewMode, icon: '⚡', label: 'Skills' },
          { mode: 'team' as ViewMode, icon: '👥', label: 'Team' },
          { mode: 'settings' as ViewMode, icon: '⚙', label: 'Settings' },
          { mode: 'benchmarks' as ViewMode, icon: '📊', label: 'Bench' },
          { mode: 'help' as ViewMode, icon: '?', label: 'Help' },
        ].map(item => (
          <button
            key={item.mode}
            className={`${styles.navBtn} ${viewMode === item.mode ? styles.active : ''}`}
            onClick={() => onViewChange(item.mode)}
          >
            <span className={styles.navIcon}>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      <button className={styles.newChatBtn} onClick={handleNewChat}>+ New Chat</button>

      <div className={styles.section}>
        {/* Pinned */}
        {pinnedConvs.length > 0 && (
          <>
            <div className={styles.sectionTitle}>Pinned</div>
            {pinnedConvs.map(conv => (
              <ConvItem
                key={conv.id}
                conv={conv}
                isActive={conv.id === activeConversationId}
                editingId={editingId}
                editValue={editValue}
                onSelect={() => { setActiveConversation(conv.id); onViewChange('chat'); }}
                onContextMenu={(e) => handleContextMenu(e, conv.id)}
                onDelete={() => setConfirmDelete(conv.id)}
                onEditChange={setEditValue}
                onEditFinish={finishRename}
                getVisibilityIcon={getVisibilityIcon}
              />
            ))}
          </>
        )}

        {/* Folders */}
        <div className={styles.sectionTitle} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Folders</span>
          <button
            onClick={() => setShowNewFolder(p => !p)}
            style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '14px' }}
          >
            +
          </button>
        </div>

        {showNewFolder && (
          <div style={{ padding: '4px 8px', display: 'flex', gap: '4px' }}>
            <input
              className={styles.renameInput}
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
              onBlur={handleCreateFolder}
              placeholder="Folder name..."
              autoFocus
              style={{
                flex: 1, padding: '6px 8px', background: 'var(--bg-primary)', border: '1px solid var(--accent)',
                borderRadius: '4px', color: 'var(--text-primary)', fontSize: '12px', outline: 'none',
              }}
            />
          </div>
        )}

        {folders.map(folder => {
          const folderConvs = conversations.filter(c => c.folderId === folder.id);
          return (
            <div key={folder.id}>
              <div
                className={styles.convItem}
                onClick={() => toggleFolderExpand(folder.id)}
                style={{ fontWeight: 600, fontSize: '12px' }}
              >
                <span style={{ width: '16px', textAlign: 'center' }}>
                  {folder.isExpanded ? '\u25BE' : '\u25B8'}
                </span>
                <span className={styles.convTitle}>{folder.name} ({folderConvs.length})</span>
                <button
                  className={styles.folderInstrBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (editingFolderInstr === folder.id) {
                      setEditingFolderInstr(null);
                    } else {
                      setEditingFolderInstr(folder.id);
                      setFolderInstrValue(folder.instructions || '');
                    }
                  }}
                  title="Folder instructions"
                  style={{
                    opacity: folder.instructions ? 1 : undefined,
                    color: folder.instructions ? 'var(--accent)' : undefined,
                  }}
                >&#x2699;</button>
                <button
                  className={styles.convDelete}
                  onClick={(e) => { e.stopPropagation(); setConfirmDelete(folder.id); }}
                >&times;</button>
              </div>
              {/* Folder instructions editor */}
              {editingFolderInstr === folder.id && (
                <div className={styles.folderInstrPanel}>
                  <textarea
                    className={styles.folderInstrTextarea}
                    value={folderInstrValue}
                    onChange={e => setFolderInstrValue(e.target.value)}
                    onBlur={() => {
                      setFolderInstructions(folder.id, folderInstrValue);
                      setEditingFolderInstr(null);
                    }}
                    placeholder="Instructions for this folder (e.g., 'Use Python', 'Output in JSON')..."
                    autoFocus
                    rows={2}
                  />
                </div>
              )}
              {folder.isExpanded && folderConvs.map(conv => (
                <ConvItem
                  key={conv.id}
                  conv={conv}
                  isActive={conv.id === activeConversationId}
                  editingId={editingId}
                  editValue={editValue}
                  onSelect={() => { setActiveConversation(conv.id); onViewChange('chat'); }}
                  onContextMenu={(e) => handleContextMenu(e, conv.id)}
                  onDelete={() => setConfirmDelete(conv.id)}
                  onEditChange={setEditValue}
                  onEditFinish={finishRename}
                  getVisibilityIcon={getVisibilityIcon}
                  indent
                />
              ))}
            </div>
          );
        })}

        {/* Unfiled conversations */}
        <div className={styles.sectionTitle}>Conversations</div>
        {rootConvs.length === 0 && (
          <div className={styles.emptyState}>No conversations yet.<br />Start a new chat above.</div>
        )}
        {rootConvs.map(conv => (
          <ConvItem
            key={conv.id}
            conv={conv}
            isActive={conv.id === activeConversationId}
            editingId={editingId}
            editValue={editValue}
            onSelect={() => { setActiveConversation(conv.id); onViewChange('chat'); }}
            onContextMenu={(e) => handleContextMenu(e, conv.id)}
            onDelete={() => setConfirmDelete(conv.id)}
            onEditChange={setEditValue}
            onEditFinish={finishRename}
            getVisibilityIcon={getVisibilityIcon}
          />
        ))}
      </div>

      {/* Connections */}
      <div className={styles.connSection}>
        <div className={styles.sectionTitle}>Connections</div>
        {connections.length === 0 ? (
          <div className={styles.connItem} onClick={() => onViewChange('settings')} style={{ cursor: 'pointer' }}>
            <span style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>+ Add API connection</span>
          </div>
        ) : (
          connections.map(conn => (
            <div key={conn.id} className={styles.connItem} onClick={() => onViewChange('settings')}>
              <span className={`${styles.statusDot} ${styles[conn.status]}`} />
              <span className={styles.connLabel}>{conn.label}</span>
            </div>
          ))
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 99 }}
            onClick={() => setContextMenu(null)}
          />
          <div
            style={{
              position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 100,
              background: 'var(--bg-secondary)', border: '1px solid var(--border)',
              borderRadius: '8px', padding: '4px', minWidth: '160px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            }}
          >
            {[
              { label: 'Rename', action: () => { const c = conversations.find(c => c.id === contextMenu.id); if (c) startRename(c.id, c.title); }},
              { label: 'Pin / Unpin', action: () => { togglePin(contextMenu.id); setContextMenu(null); }},
              { label: 'Share (copy URL)', action: () => handleShare(contextMenu.id) },
              { label: 'Make Private', action: () => { setVisibility(contextMenu.id, 'private'); setContextMenu(null); }},
              { label: 'Share with Team', action: () => { setVisibility(contextMenu.id, 'team'); setContextMenu(null); }},
              { label: 'Make Public', action: () => { setVisibility(contextMenu.id, 'public'); setContextMenu(null); }},
              { label: 'Delete', action: () => { setConfirmDelete(contextMenu.id); setContextMenu(null); }, danger: true },
            ].map(item => (
              <button
                key={item.label}
                onClick={item.action}
                style={{
                  display: 'block', width: '100%', padding: '8px 12px', background: 'none',
                  border: 'none', color: (item as any).danger ? 'var(--error)' : 'var(--text-secondary)',
                  cursor: 'pointer', fontSize: '12px', textAlign: 'left', borderRadius: '4px',
                }}
                onMouseEnter={e => (e.target as HTMLElement).style.background = 'var(--bg-hover)'}
                onMouseLeave={e => (e.target as HTMLElement).style.background = 'none'}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Delete confirmation dialog (Cowork-inspired permission prompt) */}
      {confirmDelete && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 199, background: 'rgba(0,0,0,0.5)' }}
            onClick={() => setConfirmDelete(null)}
          />
          <div className={styles.confirmDialog}>
            <div className={styles.confirmIcon}>&#x26A0;</div>
            <div className={styles.confirmTitle}>Delete this item?</div>
            <div className={styles.confirmText}>
              This action cannot be undone. All associated data will be permanently removed.
            </div>
            <div className={styles.confirmActions}>
              <button
                className={styles.confirmCancel}
                onClick={() => setConfirmDelete(null)}
              >
                Cancel
              </button>
              <button
                className={styles.confirmDelete}
                onClick={() => {
                  // Check if it's a folder or conversation
                  const isFolder = folders.some(f => f.id === confirmDelete);
                  if (isFolder) {
                    deleteFolder(confirmDelete);
                  } else {
                    deleteConversation(confirmDelete);
                  }
                  setConfirmDelete(null);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </>
      )}

      {/* Active Cowork tasks */}
      {chatMode === 'cowork' && coworkTasks.filter(t => t.status !== 'completed').length > 0 && (
        <div className={styles.coworkSection}>
          <div className={styles.sectionTitle}>Active Tasks</div>
          {coworkTasks
            .filter(t => t.status !== 'completed')
            .slice(0, 5)
            .map(task => (
              <div key={task.id} className={styles.coworkTaskItem}>
                <span className={`${styles.coworkDot} ${styles[task.status]}`} />
                <span className={styles.coworkTaskTitle}>{task.title}</span>
                <span className={styles.coworkTaskProgress}>
                  {task.steps.filter(s => s.status === 'completed').length}/{task.steps.length}
                </span>
              </div>
            ))
          }
        </div>
      )}
    </div>
  );
}

// Conversation list item sub-component
function ConvItem({
  conv, isActive, editingId, editValue, onSelect, onContextMenu, onDelete, onEditChange, onEditFinish, getVisibilityIcon, indent,
}: {
  conv: any; isActive: boolean; editingId: string | null; editValue: string;
  onSelect: () => void; onContextMenu: (e: React.MouseEvent) => void;
  onDelete: () => void; onEditChange: (v: string) => void; onEditFinish: () => void;
  getVisibilityIcon: (v: string) => string; indent?: boolean;
}) {
  return (
    <div
      className={`${styles.convItem} ${isActive ? styles.active : ''}`}
      style={indent ? { paddingLeft: '28px' } : undefined}
      onClick={onSelect}
      onContextMenu={onContextMenu}
    >
      {editingId === conv.id ? (
        <input
          value={editValue}
          onChange={e => onEditChange(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onEditFinish()}
          onBlur={onEditFinish}
          autoFocus
          style={{
            flex: 1, padding: '2px 6px', background: 'var(--bg-primary)', border: '1px solid var(--accent)',
            borderRadius: '4px', color: 'var(--text-primary)', fontSize: '12px', outline: 'none',
          }}
          onClick={e => e.stopPropagation()}
        />
      ) : (
        <>
          <span style={{ fontSize: '10px', opacity: 0.6, flexShrink: 0 }}>
            {getVisibilityIcon(conv.visibility)}
          </span>
          <span className={styles.convTitle}>{conv.title}</span>
          <button className={styles.convDelete} onClick={(e) => { e.stopPropagation(); onDelete(); }}>×</button>
        </>
      )}
    </div>
  );
}
