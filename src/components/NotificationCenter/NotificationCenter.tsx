import { useState, useEffect, useRef, useCallback } from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────
export interface Notification {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  source?: string; // 'scheduler', 'skill', 'system'
  actionLabel?: string;
  actionEvent?: string;
}

const STORAGE_KEY = 'arcadia-notifications';
const MAX_NOTIFICATIONS = 50;

// ─── Storage ────────────────────────────────────────────────────────────────
function getNotifications(): Notification[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { return []; }
}

function saveNotifications(notifications: Notification[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
}

export function addNotification(n: Omit<Notification, 'id' | 'timestamp' | 'read'>): void {
  const notifications = getNotifications();
  notifications.unshift({
    ...n,
    id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    read: false,
  });
  if (notifications.length > MAX_NOTIFICATIONS) notifications.length = MAX_NOTIFICATIONS;
  saveNotifications(notifications);
  document.dispatchEvent(new CustomEvent('arcadia:notification-added'));
}

// ─── Component ──────────────────────────────────────────────────────────────
export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>(getNotifications);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const panelRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter(n => !n.read).length;

  // Refresh on new notifications
  useEffect(() => {
    const handler = () => setNotifications(getNotifications());
    document.addEventListener('arcadia:notification-added', handler);
    document.addEventListener('arcadia:schedule-run', handler);
    return () => {
      document.removeEventListener('arcadia:notification-added', handler);
      document.removeEventListener('arcadia:schedule-run', handler);
    };
  }, []);

  // Listen for toast events and add them as notifications
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        addNotification({
          type: detail.type || 'info',
          title: detail.title || 'Notification',
          message: detail.message || '',
          source: 'scheduler',
        });
        setNotifications(getNotifications());
      }
    };
    document.addEventListener('arcadia:toast', handler);
    return () => document.removeEventListener('arcadia:toast', handler);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const markAllRead = useCallback(() => {
    const updated = notifications.map(n => ({ ...n, read: true }));
    saveNotifications(updated);
    setNotifications(updated);
  }, [notifications]);

  const markRead = useCallback((id: string) => {
    const updated = notifications.map(n => n.id === id ? { ...n, read: true } : n);
    saveNotifications(updated);
    setNotifications(updated);
  }, [notifications]);

  const clearAll = useCallback(() => {
    saveNotifications([]);
    setNotifications([]);
  }, []);

  const filtered = filter === 'unread' ? notifications.filter(n => !n.read) : notifications;

  const typeIcon = (type: string) => {
    switch (type) {
      case 'success': return '✓';
      case 'error': return '✗';
      case 'warning': return '⚠';
      default: return 'ℹ';
    }
  };

  const typeColor = (type: string) => {
    switch (type) {
      case 'success': return '#22c55e';
      case 'error': return '#ef4444';
      case 'warning': return '#f59e0b';
      default: return '#818cf8';
    }
  };

  const formatTime = (ts: number) => {
    const diff = Date.now() - ts;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <div ref={panelRef} style={{ position: 'relative' }}>
      {/* Bell button */}
      <button
        onClick={() => { setOpen(o => !o); if (!open) setNotifications(getNotifications()); }}
        title="Notifications"
        style={{
          background: 'none', border: 'none', cursor: 'pointer', position: 'relative',
          padding: '6px 8px', borderRadius: '8px', fontSize: '16px', color: 'var(--text-secondary)',
          transition: 'all 0.15s',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-secondary)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
      >
        🔔
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: '2px', right: '2px',
            background: '#ef4444', color: '#fff', fontSize: '9px', fontWeight: 700,
            minWidth: '16px', height: '16px', borderRadius: '8px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 4px', lineHeight: 1, border: '2px solid var(--bg-primary)',
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: '4px',
          width: '380px', maxHeight: '480px', overflow: 'hidden',
          background: 'var(--bg-primary)', border: '1px solid var(--border)',
          borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          display: 'flex', flexDirection: 'column', zIndex: 1000,
        }}>
          {/* Header */}
          <div style={{
            padding: '12px 16px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>
              Notifications
              {unreadCount > 0 && (
                <span style={{
                  fontSize: '11px', fontWeight: 500, background: 'rgba(239,68,68,0.12)',
                  color: '#ef4444', padding: '2px 8px', borderRadius: '10px', marginLeft: '8px',
                }}>{unreadCount} new</span>
              )}
            </span>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                style={{
                  fontSize: '11px', color: '#818cf8', background: 'none', border: 'none',
                  cursor: 'pointer', padding: '4px 8px', borderRadius: '6px',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(129,140,248,0.1)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
              >Mark all read</button>
            )}
            {notifications.length > 0 && (
              <button
                onClick={clearAll}
                style={{
                  fontSize: '11px', color: 'var(--text-tertiary)', background: 'none', border: 'none',
                  cursor: 'pointer', padding: '4px 8px', borderRadius: '6px',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-secondary)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
              >Clear all</button>
            )}
          </div>

          {/* Filter tabs */}
          <div style={{ display: 'flex', gap: '4px', padding: '8px 16px', borderBottom: '1px solid var(--border)' }}>
            {(['all', 'unread'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  fontSize: '11px', fontWeight: 600, padding: '4px 12px', borderRadius: '6px',
                  border: 'none', cursor: 'pointer', textTransform: 'capitalize',
                  background: filter === f ? 'var(--bg-secondary)' : 'transparent',
                  color: filter === f ? 'var(--text-primary)' : 'var(--text-tertiary)',
                }}
              >{f}{f === 'unread' && unreadCount > 0 ? ` (${unreadCount})` : ''}</button>
            ))}
          </div>

          {/* Notification list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: '28px', marginBottom: '8px' }}>🔕</div>
                <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>
                  {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                  Scheduled skills and system events will appear here
                </div>
              </div>
            ) : (
              filtered.slice(0, 30).map(n => (
                <div
                  key={n.id}
                  onClick={() => markRead(n.id)}
                  style={{
                    padding: '10px 16px', cursor: 'pointer', display: 'flex', gap: '10px',
                    alignItems: 'flex-start', transition: 'background 0.1s',
                    background: n.read ? 'transparent' : 'rgba(129,140,248,0.04)',
                    borderLeft: n.read ? '3px solid transparent' : `3px solid ${typeColor(n.type)}`,
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-secondary)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = n.read ? 'transparent' : 'rgba(129,140,248,0.04)'; }}
                >
                  {/* Status dot */}
                  <div style={{
                    width: '24px', height: '24px', borderRadius: '50%', flexShrink: 0,
                    background: `${typeColor(n.type)}15`, color: typeColor(n.type),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '11px', fontWeight: 700, marginTop: '1px',
                  }}>{typeIcon(n.type)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{n.title}</span>
                      {!n.read && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#818cf8', flexShrink: 0 }} />}
                      <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginLeft: 'auto', flexShrink: 0 }}>{formatTime(n.timestamp)}</span>
                    </div>
                    <div style={{
                      fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.5',
                      overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box',
                      WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
                    }}>{n.message}</div>
                    {n.source && (
                      <span style={{
                        fontSize: '9px', color: 'var(--text-tertiary)', background: 'var(--bg-secondary)',
                        padding: '1px 6px', borderRadius: '4px', marginTop: '4px', display: 'inline-block',
                      }}>{n.source}</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
