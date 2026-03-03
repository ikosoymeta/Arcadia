import React, { useState } from 'react';
import { useChat } from '../../store/ChatContext';
import { useConnection } from '../../store/ConnectionContext';
import type { ViewMode, Conversation, Folder } from '../../types';
import styles from './Sidebar.module.css';

interface SidebarProps {
  viewMode: ViewMode;
  onViewChange: (mode: ViewMode) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

// ─── Share / Export Modal ─────────────────────────────────────────────────────

function ShareModal({ conv, onClose }: { conv: Conversation; onClose: () => void }) {
  const { generateShareUrl, setVisibility } = useChat();
  const [copied, setCopied] = useState(false);

  const shareUrl = conv.shareUrl ?? generateShareUrl(conv.id);

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportMarkdown = () => {
    const lines: string[] = [`# ${conv.title}`, '', `*Exported from ArcadIA · ${new Date(conv.createdAt).toLocaleDateString()}*`, ''];
    for (const msg of conv.messages) {
      lines.push(`## ${msg.role === 'user' ? '👤 You' : '✦ Claude'}`);
      lines.push('');
      lines.push(msg.content);
      lines.push('');
      if (msg.artifacts) {
        for (const a of msg.artifacts) {
          lines.push(`\`\`\`${a.language ?? a.type}`);
          lines.push(a.content);
          lines.push('```');
          lines.push('');
        }
      }
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${conv.title.replace(/[^a-z0-9]/gi, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJSON = () => {
    const blob = new Blob([JSON.stringify(conv, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${conv.title.replace(/[^a-z0-9]/gi, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
    zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
  };
  const modal: React.CSSProperties = {
    background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '16px',
    width: '100%', maxWidth: '400px', overflow: 'hidden',
    boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
  };
  const section: React.CSSProperties = {
    padding: '16px 20px', borderBottom: '1px solid var(--border)',
  };
  const label: React.CSSProperties = {
    fontSize: '11px', fontWeight: 700, color: 'var(--text-tertiary)',
    textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px',
  };
  const btn: React.CSSProperties = {
    padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--border)',
    background: 'var(--bg-hover)', color: 'var(--text-secondary)', fontSize: '12px',
    cursor: 'pointer', fontWeight: 500, transition: 'all 0.15s',
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={{ ...section, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '15px' }}>Share Conversation</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '18px' }}>✕</button>
        </div>

        <div style={section}>
          <div style={label}>Visibility</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {(['private', 'team', 'public'] as const).map(v => (
              <button
                key={v}
                onClick={() => setVisibility(conv.id, v)}
                style={{
                  ...btn,
                  flex: 1,
                  background: conv.visibility === v ? 'var(--accent)' : 'var(--bg-hover)',
                  color: conv.visibility === v ? '#fff' : 'var(--text-secondary)',
                  borderColor: conv.visibility === v ? 'var(--accent)' : 'var(--border)',
                }}
              >
                {v === 'private' ? '🔒 Private' : v === 'team' ? '👥 Team' : '🌐 Public'}
              </button>
            ))}
          </div>
        </div>

        {conv.visibility !== 'private' && (
          <div style={section}>
            <div style={label}>Share Link</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                readOnly
                value={shareUrl}
                style={{
                  flex: 1, padding: '8px 12px', background: 'var(--bg-primary)',
                  border: '1px solid var(--border)', borderRadius: '8px',
                  color: 'var(--text-secondary)', fontSize: '12px', fontFamily: 'monospace', outline: 'none',
                }}
              />
              <button
                onClick={handleCopy}
                style={{
                  ...btn,
                  background: copied ? 'rgba(34,197,94,0.15)' : 'var(--bg-hover)',
                  color: copied ? '#22c55e' : 'var(--text-secondary)',
                  borderColor: copied ? 'rgba(34,197,94,0.3)' : 'var(--border)',
                  whiteSpace: 'nowrap',
                }}
              >
                {copied ? '✓ Copied!' : '📋 Copy'}
              </button>
            </div>
          </div>
        )}

        <div style={section}>
          <div style={label}>Export</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={handleExportMarkdown} style={{ ...btn, flex: 1 }}>📄 Markdown</button>
            <button onClick={handleExportJSON} style={{ ...btn, flex: 1 }}>📦 JSON</button>
          </div>
        </div>

        <div style={{ ...section, borderBottom: 'none' }}>
          <div style={label}>Stats</div>
          <div style={{ display: 'flex', gap: '16px' }}>
            {[
              { v: conv.messages.length, l: 'Messages' },
              { v: conv.messages.reduce((s, m) => s + (m.outputTokens ?? 0), 0).toLocaleString(), l: 'Tokens' },
              { v: new Date(conv.createdAt).toLocaleDateString(), l: 'Created' },
            ].map(s => (
              <div key={s.l} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>{s.v}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Move-to-Folder Modal ─────────────────────────────────────────────────────

function MoveModal({ conv, folders, onClose }: { conv: Conversation; folders: Folder[]; onClose: () => void }) {
  const { moveToFolder } = useChat();

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
    zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
  };
  const modal: React.CSSProperties = {
    background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '16px',
    width: '100%', maxWidth: '320px', overflow: 'hidden',
    boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '15px' }}>Move to Folder</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '18px' }}>✕</button>
        </div>
        <div style={{ padding: '8px' }}>
          {[{ id: null, name: '📁 No folder (root)' }, ...folders.map(f => ({ id: f.id, name: `📂 ${f.name}` }))].map(f => (
            <button
              key={f.id ?? 'root'}
              onClick={() => { moveToFolder(conv.id, f.id); onClose(); }}
              style={{
                display: 'block', width: '100%', padding: '10px 14px', background: conv.folderId === f.id ? 'var(--accent-dim)' : 'none',
                border: 'none', borderRadius: '8px', color: conv.folderId === f.id ? 'var(--accent)' : 'var(--text-secondary)',
                fontSize: '13px', cursor: 'pointer', textAlign: 'left', fontWeight: conv.folderId === f.id ? 600 : 400,
              }}
            >{f.name}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main Sidebar ─────────────────────────────────────────────────────────────

export function Sidebar({ viewMode, onViewChange, collapsed, onToggleCollapse }: SidebarProps) {
  const {
    conversations, folders, activeConversationId, chatMode, coworkTasks,
    createConversation, deleteConversation, renameConversation, setActiveConversation,
    togglePin, setVisibility, createFolder, toggleFolderExpand,
    deleteFolder, setFolderInstructions,
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
  const [shareConv, setShareConv] = useState<Conversation | null>(null);
  const [moveConv, setMoveConv] = useState<Conversation | null>(null);
  const [search, setSearch] = useState('');

  const handleNewChat = () => {
    const model = activeConnection?.model || 'claude-sonnet-4-20250514';
    const id = createConversation(model);
    setActiveConversation(id);
    onViewChange('chat');
  };

  // Filter conversations by search
  const filtered = search
    ? conversations.filter(c => c.title.toLowerCase().includes(search.toLowerCase()))
    : conversations;

  const pinnedConvs = filtered.filter(c => c.isPinned);
  const rootConvs = filtered.filter(c => !c.folderId && !c.isPinned);

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
    const conv = conversations.find(c => c.id === id);
    if (conv) setShareConv(conv);
    setContextMenu(null);
  };

  const getVisibilityIcon = (v: string) => {
    if (v === 'private') return '🔒';
    if (v === 'team') return '👥';
    return '🌐';
  };

  const navItems: { mode: ViewMode; icon: string; label: string }[] = [
    { mode: 'chat', icon: '💬', label: 'Chat' },
    { mode: 'code-workspace', icon: '⌨', label: 'Code' },
    { mode: 'skills', icon: '⚡', label: 'Skills' },
    { mode: 'team', icon: '👥', label: 'Team' },
    { mode: 'settings', icon: '⚙', label: 'Settings' },
    { mode: 'integrations', icon: '🔌', label: 'Integrations' },
    { mode: 'benchmarks', icon: '📊', label: 'Bench' },
    { mode: 'help', icon: '?', label: 'Help' },
  ];

  return (
    <div className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`}>
      <div className={styles.header}>
        <span className={styles.logo}>ArcadIA Editor</span>
        <button className={styles.collapseBtn} onClick={onToggleCollapse}>◁</button>
      </div>

      <nav className={styles.nav}>
        {navItems.map(item => (
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

      {/* New chat + new folder */}
      <div style={{ display: 'flex', gap: '6px', padding: '8px 12px 4px' }}>
        <button className={styles.newChatBtn} onClick={handleNewChat} style={{ flex: 1 }}>+ New Chat</button>
        <button
          onClick={() => setShowNewFolder(p => !p)}
          style={{
            padding: '8px 10px', background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            borderRadius: '8px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '14px',
          }}
          title="New folder"
        >📁</button>
      </div>

      {/* Search */}
      <div style={{ padding: '4px 12px 8px', position: 'relative' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search conversations..."
          style={{
            width: '100%', padding: '6px 28px 6px 10px', background: 'var(--bg-primary)',
            border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-secondary)',
            fontSize: '12px', outline: 'none', boxSizing: 'border-box',
          }}
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            style={{
              position: 'absolute', right: '20px', top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '12px',
            }}
          >✕</button>
        )}
      </div>

      {showNewFolder && (
        <div style={{ padding: '4px 12px 8px', display: 'flex', gap: '4px' }}>
          <input
            className={styles.renameInput}
            value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') setShowNewFolder(false); }}
            placeholder="Folder name..."
            autoFocus
            style={{
              flex: 1, padding: '6px 8px', background: 'var(--bg-primary)', border: '1px solid var(--accent)',
              borderRadius: '6px', color: 'var(--text-primary)', fontSize: '12px', outline: 'none',
            }}
          />
          <button
            onClick={handleCreateFolder}
            style={{
              padding: '6px 10px', background: 'var(--accent)', border: 'none',
              borderRadius: '6px', color: '#fff', cursor: 'pointer', fontSize: '12px',
            }}
          >✓</button>
        </div>
      )}

      <div className={styles.section}>
        {/* Pinned */}
        {pinnedConvs.length > 0 && (
          <>
            <div className={styles.sectionTitle}>📌 PINNED</div>
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
                onTogglePin={() => togglePin(conv.id)}
                onShare={() => handleShare(conv.id)}
                getVisibilityIcon={getVisibilityIcon}
              />
            ))}
          </>
        )}

        {/* Folders */}
        <div className={styles.sectionTitle} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>FOLDERS</span>
        </div>

        {folders.map(folder => {
          const folderConvs = filtered.filter(c => c.folderId === folder.id);
          return (
            <div key={folder.id}>
              <div
                className={styles.convItem}
                onClick={() => toggleFolderExpand(folder.id)}
                style={{ fontWeight: 600, fontSize: '12px' }}
              >
                <span style={{ width: '16px', textAlign: 'center', flexShrink: 0 }}>
                  {folder.isExpanded ? '▾' : '▸'}
                </span>
                <span className={styles.convTitle}>📂 {folder.name} ({folderConvs.length})</span>
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
                  style={{ opacity: folder.instructions ? 1 : undefined, color: folder.instructions ? 'var(--accent)' : undefined }}
                >⚙</button>
                <button
                  className={styles.convDelete}
                  onClick={(e) => { e.stopPropagation(); setConfirmDelete(folder.id); }}
                >×</button>
              </div>
              {editingFolderInstr === folder.id && (
                <div className={styles.folderInstrPanel}>
                  <textarea
                    className={styles.folderInstrTextarea}
                    value={folderInstrValue}
                    onChange={e => setFolderInstrValue(e.target.value)}
                    onBlur={() => { setFolderInstructions(folder.id, folderInstrValue); setEditingFolderInstr(null); }}
                    placeholder="Instructions for this folder..."
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
                  onTogglePin={() => togglePin(conv.id)}
                  onShare={() => handleShare(conv.id)}
                  getVisibilityIcon={getVisibilityIcon}
                  indent
                />
              ))}
              {folder.isExpanded && folderConvs.length === 0 && (
                <div style={{ padding: '6px 28px', fontSize: '11px', color: 'var(--text-tertiary)' }}>Empty folder</div>
              )}
            </div>
          );
        })}

        {/* Unfiled conversations */}
        <div className={styles.sectionTitle}>CONVERSATIONS</div>
        {rootConvs.length === 0 && !search && (
          <div className={styles.emptyState}>No conversations yet.<br />Start a new chat above.</div>
        )}
        {rootConvs.length === 0 && search && (
          <div className={styles.emptyState}>No results for "{search}"</div>
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
            onTogglePin={() => togglePin(conv.id)}
            onShare={() => handleShare(conv.id)}
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
              {conn.apiKey?.startsWith('mg-api-') && (
                <span style={{ fontSize: '10px', color: '#3b82f6', fontWeight: 600, marginLeft: 'auto' }}>MetaGen</span>
              )}
            </div>
          ))
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setContextMenu(null)} />
          <div style={{
            position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 100,
            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            borderRadius: '10px', padding: '4px', minWidth: '180px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}>
            {[
              { label: '✏️ Rename', action: () => { const c = conversations.find(c => c.id === contextMenu.id); if (c) startRename(c.id, c.title); }},
              { label: conversations.find(c => c.id === contextMenu.id)?.isPinned ? '📌 Unpin' : '📌 Pin to top', action: () => { togglePin(contextMenu.id); setContextMenu(null); }},
              { label: '🔗 Share / Export', action: () => handleShare(contextMenu.id) },
              { label: '📁 Move to folder', action: () => {
                const c = conversations.find(c => c.id === contextMenu.id);
                if (c) { setMoveConv(c); setContextMenu(null); }
              }},
              { label: '🔒 Make Private', action: () => { setVisibility(contextMenu.id, 'private'); setContextMenu(null); }},
              { label: '👥 Share with Team', action: () => { setVisibility(contextMenu.id, 'team'); setContextMenu(null); }},
              { label: '🌐 Make Public', action: () => { setVisibility(contextMenu.id, 'public'); setContextMenu(null); }},
              { label: '🗑 Delete', action: () => { setConfirmDelete(contextMenu.id); setContextMenu(null); }, danger: true },
            ].map(item => (
              <button
                key={item.label}
                onClick={item.action}
                style={{
                  display: 'block', width: '100%', padding: '8px 12px', background: 'none',
                  border: 'none', color: (item as { danger?: boolean }).danger ? '#ef4444' : 'var(--text-secondary)',
                  cursor: 'pointer', fontSize: '12px', textAlign: 'left', borderRadius: '6px',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 199, background: 'rgba(0,0,0,0.5)' }} onClick={() => setConfirmDelete(null)} />
          <div className={styles.confirmDialog}>
            <div className={styles.confirmIcon}>⚠</div>
            <div className={styles.confirmTitle}>Delete this item?</div>
            <div className={styles.confirmText}>This action cannot be undone.</div>
            <div className={styles.confirmActions}>
              <button className={styles.confirmCancel} onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className={styles.confirmDelete} onClick={() => {
                const isFolder = folders.some(f => f.id === confirmDelete);
                if (isFolder) deleteFolder(confirmDelete);
                else deleteConversation(confirmDelete);
                setConfirmDelete(null);
              }}>Delete</button>
            </div>
          </div>
        </>
      )}

      {/* Active Cowork tasks */}
      {chatMode === 'cowork' && coworkTasks.filter(t => t.status !== 'completed').length > 0 && (
        <div className={styles.coworkSection}>
          <div className={styles.sectionTitle}>Active Tasks</div>
          {coworkTasks.filter(t => t.status !== 'completed').slice(0, 5).map(task => (
            <div key={task.id} className={styles.coworkTaskItem}>
              <span className={`${styles.coworkDot} ${styles[task.status]}`} />
              <span className={styles.coworkTaskTitle}>{task.title}</span>
              <span className={styles.coworkTaskProgress}>
                {task.steps.filter(s => s.status === 'completed').length}/{task.steps.length}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Share Modal */}
      {shareConv && <ShareModal conv={shareConv} onClose={() => setShareConv(null)} />}

      {/* Move Modal */}
      {moveConv && <MoveModal conv={moveConv} folders={folders} onClose={() => setMoveConv(null)} />}
    </div>
  );
}

// ─── Conversation Item ────────────────────────────────────────────────────────

function ConvItem({
  conv, isActive, editingId, editValue, onSelect, onContextMenu, onDelete,
  onEditChange, onEditFinish, onTogglePin, onShare, getVisibilityIcon, indent,
}: {
  conv: Conversation;
  isActive: boolean;
  editingId: string | null;
  editValue: string;
  onSelect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDelete: () => void;
  onEditChange: (v: string) => void;
  onEditFinish: () => void;
  onTogglePin: () => void;
  onShare: () => void;
  getVisibilityIcon: (v: string) => string;
  indent?: boolean;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className={`${styles.convItem} ${isActive ? styles.active : ''}`}
      style={indent ? { paddingLeft: '28px' } : undefined}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
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
          <span className={styles.convTitle}>
            {conv.isPinned && <span style={{ marginRight: '3px', fontSize: '9px' }}>📌</span>}
            {conv.title}
          </span>
          {hovered && (
            <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
              <button
                className={styles.convActionBtn}
                onClick={e => { e.stopPropagation(); onTogglePin(); }}
                title={conv.isPinned ? 'Unpin' : 'Pin'}
                style={{ color: conv.isPinned ? '#f59e0b' : undefined }}
              >⭐</button>
              <button
                className={styles.convActionBtn}
                onClick={e => { e.stopPropagation(); onShare(); }}
                title="Share / Export"
              >🔗</button>
              <button
                className={styles.convDelete}
                onClick={e => { e.stopPropagation(); onDelete(); }}
                title="Delete"
              >×</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
