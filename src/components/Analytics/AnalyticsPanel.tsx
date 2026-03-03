import { useState, useMemo, useCallback } from 'react';
import { useChat } from '../../store/ChatContext';
import type { Conversation } from '../../types';
import {
  computeAnalytics,
  dismissAnnouncement,
  exportAnalyticsCSV,
  getActiveUsersForPeriod,
  type AnalyticsData,
  type DailyTokenUsage,
  type SystemAnnouncement,
} from '../../services/analytics';
import styles from './Analytics.module.css';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

const TYPE_COLORS = [
  '#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#14b8a6', '#f97316', '#a855f7',
  '#64748b', '#84cc16', '#e11d48', '#0ea5e9', '#d946ef',
];

const ANNOUNCEMENT_ICONS: Record<string, string> = {
  upgrade: '🚀',
  maintenance: '🔧',
  issue: '⚠️',
  feature: '✨',
  info: 'ℹ️',
};

type TabId = 'overview' | 'usage' | 'requests' | 'content' | 'users' | 'performance' | 'status';

// ─── Token Usage Chart ───────────────────────────────────────────────────────

function TokenUsageChart({ data, period }: { data: DailyTokenUsage[]; period: '7d' | '14d' | '30d' }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const sliced = useMemo(() => {
    const days = period === '7d' ? 7 : period === '14d' ? 14 : 30;
    return data.slice(-days);
  }, [data, period]);

  const maxTokens = useMemo(() => Math.max(1, ...sliced.map(d => d.totalTokens)), [sliced]);

  return (
    <div>
      <div className={styles.chartArea}>
        {sliced.map((day, i) => {
          const heightPct = Math.max(1, (day.totalTokens / maxTokens) * 100);
          return (
            <div
              key={day.date}
              className={`${styles.chartBar} ${styles.chartBarTotal}`}
              style={{ height: `${heightPct}%` }}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              {hoveredIdx === i && (
                <div className={styles.tooltip}>
                  <div className={styles.tooltipDate}>{formatDate(day.date)}</div>
                  <div className={styles.tooltipRow}>
                    <span>Input:</span>
                    <span className={styles.tooltipValue}>{formatNumber(day.inputTokens)}</span>
                  </div>
                  <div className={styles.tooltipRow}>
                    <span>Output:</span>
                    <span className={styles.tooltipValue}>{formatNumber(day.outputTokens)}</span>
                  </div>
                  <div className={styles.tooltipRow}>
                    <span>Total:</span>
                    <span className={styles.tooltipValue}>{formatNumber(day.totalTokens)}</span>
                  </div>
                  <div className={styles.tooltipRow}>
                    <span>Requests:</span>
                    <span className={styles.tooltipValue}>{day.requestCount}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className={styles.chartLabels}>
        {sliced.filter((_, i) => {
          if (period === '7d') return true;
          if (period === '14d') return i % 2 === 0;
          return i % 5 === 0;
        }).map(day => (
          <span key={day.date} className={styles.chartLabel}>{formatDate(day.date)}</span>
        ))}
      </div>
      <div className={styles.chartLegend}>
        <div className={styles.legendItem}>
          <div className={styles.legendDot} style={{ background: 'var(--accent)' }} />
          <span>Total Tokens</span>
        </div>
      </div>
    </div>
  );
}

// ─── Request Count Chart ─────────────────────────────────────────────────────

function RequestCountChart({ data, period }: { data: DailyTokenUsage[]; period: '7d' | '14d' | '30d' }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const sliced = useMemo(() => {
    const days = period === '7d' ? 7 : period === '14d' ? 14 : 30;
    return data.slice(-days);
  }, [data, period]);

  const maxReqs = useMemo(() => Math.max(1, ...sliced.map(d => d.requestCount)), [sliced]);

  return (
    <div>
      <div className={styles.chartArea}>
        {sliced.map((day, i) => {
          const heightPct = Math.max(1, (day.requestCount / maxReqs) * 100);
          return (
            <div
              key={day.date}
              className={`${styles.chartBar} ${styles.chartBarRequests}`}
              style={{ height: `${heightPct}%` }}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              {hoveredIdx === i && (
                <div className={styles.tooltip}>
                  <div className={styles.tooltipDate}>{formatDate(day.date)}</div>
                  <div className={styles.tooltipRow}>
                    <span>Requests:</span>
                    <span className={styles.tooltipValue}>{day.requestCount}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className={styles.chartLabels}>
        {sliced.filter((_, i) => {
          if (period === '7d') return true;
          if (period === '14d') return i % 2 === 0;
          return i % 5 === 0;
        }).map(day => (
          <span key={day.date} className={styles.chartLabel}>{formatDate(day.date)}</span>
        ))}
      </div>
    </div>
  );
}

// ─── User Activity Chart ─────────────────────────────────────────────────────

function UserActivityChart({ data }: { data: AnalyticsData }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const maxUsers = useMemo(() => Math.max(1, ...data.userActivity.map(d => d.activeUsers)), [data.userActivity]);

  return (
    <div>
      <div className={styles.chartArea}>
        {data.userActivity.map((day, i) => {
          const heightPct = Math.max(1, (day.activeUsers / maxUsers) * 100);
          return (
            <div
              key={day.date}
              className={`${styles.chartBar} ${styles.chartBarUsers}`}
              style={{ height: `${heightPct}%` }}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              {hoveredIdx === i && (
                <div className={styles.tooltip}>
                  <div className={styles.tooltipDate}>{formatDate(day.date)}</div>
                  <div className={styles.tooltipRow}>
                    <span>Active Users:</span>
                    <span className={styles.tooltipValue}>{day.activeUsers}</span>
                  </div>
                  <div className={styles.tooltipRow}>
                    <span>Sessions:</span>
                    <span className={styles.tooltipValue}>{day.sessions}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className={styles.chartLabels}>
        {data.userActivity.filter((_, i) => i % 5 === 0).map(day => (
          <span key={day.date} className={styles.chartLabel}>{formatDate(day.date)}</span>
        ))}
      </div>
    </div>
  );
}

// ─── Main Analytics Panel ────────────────────────────────────────────────────

export function AnalyticsPanel() {
  const { conversations } = useChat();
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [tokenPeriod, setTokenPeriod] = useState<'7d' | '14d' | '30d'>('7d');
  const [requestPeriod, setRequestPeriod] = useState<'7d' | '14d' | '30d'>('7d');
  const [, setRefresh] = useState(0);

  const analytics = useMemo(() => computeAnalytics(conversations), [conversations]);

  const userCounts = useMemo(() => ({
    daily: getActiveUsersForPeriod('daily'),
    weekly: getActiveUsersForPeriod('weekly'),
    monthly: getActiveUsersForPeriod('monthly'),
    lifetime: getActiveUsersForPeriod('lifetime'),
  }), []);

  const handleDismiss = useCallback((id: string) => {
    dismissAnnouncement(id);
    setRefresh(r => r + 1);
  }, []);

  const handleExport = useCallback(() => {
    const csv = exportAnalyticsCSV(analytics);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `arcadia-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [analytics]);

  const handleNavigate = useCallback((target: string) => {
    if (target === 'Go to Settings') {
      document.dispatchEvent(new CustomEvent('arcadia:navigate', { detail: 'settings' }));
    }
  }, []);

  const todayUsage = analytics.dailyTokenUsage[analytics.dailyTokenUsage.length - 1];

  const tabs: { id: TabId; label: string; icon: string }[] = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'usage', label: 'Token Usage', icon: '🔢' },
    { id: 'requests', label: 'Requests', icon: '📋' },
    { id: 'content', label: 'Content', icon: '📝' },
    { id: 'users', label: 'Users', icon: '👥' },
    { id: 'performance', label: 'Performance', icon: '⚡' },
    { id: 'status', label: 'Status', icon: '📡' },
  ];

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.title}>
          <span className={styles.titleIcon}>📊</span>
          Analytics & Status
        </div>
        <div className={styles.headerActions}>
          <button className={styles.exportBtn} onClick={handleExport}>
            ⬇ Export CSV
          </button>
        </div>
      </div>

      {/* Announcements Banner (always visible if any) */}
      {analytics.announcements.length > 0 && activeTab !== 'status' && (
        <div style={{ marginBottom: '20px' }}>
          {analytics.announcements.slice(0, 2).map(ann => (
            <AnnouncementCard
              key={ann.id}
              announcement={ann}
              onDismiss={handleDismiss}
              onAction={handleNavigate}
            />
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className={styles.tabs}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ─── Overview Tab ───────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <>
          {/* Top-level metrics */}
          <div className={styles.metricsGrid}>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>Today's Tokens</div>
              <div className={styles.metricValue}>{formatNumber(todayUsage?.totalTokens ?? 0)}</div>
              <div className={styles.metricSub}>
                {formatNumber(todayUsage?.inputTokens ?? 0)} in / {formatNumber(todayUsage?.outputTokens ?? 0)} out
              </div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>Today's Requests</div>
              <div className={styles.metricValue}>{todayUsage?.requestCount ?? 0}</div>
              <div className={styles.metricSub}>prompts sent today</div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>Total Conversations</div>
              <div className={styles.metricValue}>{analytics.lifetimeStats.totalConversations}</div>
              <div className={styles.metricSub}>{analytics.lifetimeStats.totalMessages} messages</div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>Lifetime Tokens</div>
              <div className={styles.metricValue}>{formatNumber(analytics.lifetimeStats.totalTokens)}</div>
              <div className={styles.metricSub}>over {analytics.lifetimeStats.daysActive} days</div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>Active Users (Today)</div>
              <div className={styles.metricValue}>{userCounts.daily}</div>
              <div className={styles.metricSub}>across all sessions</div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>Content Created</div>
              <div className={styles.metricValue}>{analytics.contentStats.totalArtifacts}</div>
              <div className={styles.metricSub}>code blocks & artifacts</div>
            </div>
          </div>

          {/* Token usage chart */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}>
                <span className={styles.sectionIcon}>📈</span>
                Daily Token Usage
              </div>
              <div className={styles.periodSelector}>
                {(['7d', '14d', '30d'] as const).map(p => (
                  <button
                    key={p}
                    className={`${styles.periodBtn} ${tokenPeriod === p ? styles.periodBtnActive : ''}`}
                    onClick={() => setTokenPeriod(p)}
                  >{p}</button>
                ))}
              </div>
            </div>
            <TokenUsageChart data={analytics.dailyTokenUsage} period={tokenPeriod} />
          </div>

          {/* Top request types */}
          {analytics.requestTypes.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <div className={styles.sectionTitle}>
                  <span className={styles.sectionIcon}>📋</span>
                  Top Request Types
                </div>
              </div>
              <div className={styles.typesList}>
                {analytics.requestTypes.slice(0, 5).map((rt, i) => (
                  <div key={rt.type} className={styles.typeRow}>
                    <span className={styles.typeLabel}>{rt.type}</span>
                    <div className={styles.typeBarBg}>
                      <div
                        className={styles.typeBarFill}
                        style={{
                          width: `${rt.percentage}%`,
                          background: TYPE_COLORS[i % TYPE_COLORS.length],
                        }}
                      />
                    </div>
                    <span className={styles.typeCount}>{rt.count}</span>
                    <span className={styles.typePercent}>{rt.percentage}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ─── Token Usage Tab ────────────────────────────────────────────────── */}
      {activeTab === 'usage' && (
        <>
          <div className={styles.metricsGrid}>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>Today</div>
              <div className={styles.metricValue}>{formatNumber(todayUsage?.totalTokens ?? 0)}</div>
              <div className={styles.metricSub}>{todayUsage?.requestCount ?? 0} requests</div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>This Week</div>
              <div className={styles.metricValue}>
                {formatNumber(analytics.dailyTokenUsage.slice(-7).reduce((s, d) => s + d.totalTokens, 0))}
              </div>
              <div className={styles.metricSub}>
                {analytics.dailyTokenUsage.slice(-7).reduce((s, d) => s + d.requestCount, 0)} requests
              </div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>This Month</div>
              <div className={styles.metricValue}>
                {formatNumber(analytics.dailyTokenUsage.reduce((s, d) => s + d.totalTokens, 0))}
              </div>
              <div className={styles.metricSub}>
                {analytics.dailyTokenUsage.reduce((s, d) => s + d.requestCount, 0)} requests
              </div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>Avg Tokens/Request</div>
              <div className={styles.metricValue}>{formatNumber(analytics.contentStats.averageTokensPerRequest)}</div>
              <div className={styles.metricSub}>across all conversations</div>
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}>
                <span className={styles.sectionIcon}>📈</span>
                Token Consumption Over Time
              </div>
              <div className={styles.periodSelector}>
                {(['7d', '14d', '30d'] as const).map(p => (
                  <button
                    key={p}
                    className={`${styles.periodBtn} ${tokenPeriod === p ? styles.periodBtnActive : ''}`}
                    onClick={() => setTokenPeriod(p)}
                  >{p}</button>
                ))}
              </div>
            </div>
            <TokenUsageChart data={analytics.dailyTokenUsage} period={tokenPeriod} />
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}>
                <span className={styles.sectionIcon}>📊</span>
                Daily Request Volume
              </div>
              <div className={styles.periodSelector}>
                {(['7d', '14d', '30d'] as const).map(p => (
                  <button
                    key={p}
                    className={`${styles.periodBtn} ${requestPeriod === p ? styles.periodBtnActive : ''}`}
                    onClick={() => setRequestPeriod(p)}
                  >{p}</button>
                ))}
              </div>
            </div>
            <RequestCountChart data={analytics.dailyTokenUsage} period={requestPeriod} />
          </div>
        </>
      )}

      {/* ─── Requests Tab ───────────────────────────────────────────────────── */}
      {activeTab === 'requests' && (
        <>
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}>
                <span className={styles.sectionIcon}>📋</span>
                Request Type Breakdown
              </div>
            </div>
            {analytics.requestTypes.length > 0 ? (
              <div className={styles.typesList}>
                {analytics.requestTypes.map((rt, i) => (
                  <div key={rt.type} className={styles.typeRow}>
                    <span className={styles.typeLabel}>{rt.type}</span>
                    <div className={styles.typeBarBg}>
                      <div
                        className={styles.typeBarFill}
                        style={{
                          width: `${rt.percentage}%`,
                          background: TYPE_COLORS[i % TYPE_COLORS.length],
                        }}
                      />
                    </div>
                    <span className={styles.typeCount}>{rt.count}</span>
                    <span className={styles.typePercent}>{rt.percentage}%</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>📋</div>
                <div className={styles.emptyTitle}>No requests yet</div>
                <div className={styles.emptyDesc}>Start chatting with Claude to see request type analytics.</div>
              </div>
            )}
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}>
                <span className={styles.sectionIcon}>🔥</span>
                Most Popular Prompts
              </div>
            </div>
            {analytics.popularPrompts.length > 0 ? (
              <table className={styles.promptsTable}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Prompt</th>
                    <th>Category</th>
                    <th>Uses</th>
                    <th>Last Used</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.popularPrompts.map((p, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600, color: 'var(--text-tertiary)' }}>{i + 1}</td>
                      <td className={styles.promptText}>{p.prompt}</td>
                      <td><span className={styles.categoryBadge}>{p.category}</span></td>
                      <td className={styles.promptCount}>{p.count}</td>
                      <td style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>{timeAgo(p.lastUsed)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>🔥</div>
                <div className={styles.emptyTitle}>No prompts tracked yet</div>
                <div className={styles.emptyDesc}>Popular prompts will appear here as you use ArcadIA.</div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ─── Content Tab ────────────────────────────────────────────────────── */}
      {activeTab === 'content' && (
        <>
          <div className={styles.metricsGrid}>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>Total Prompts</div>
              <div className={styles.metricValue}>{analytics.contentStats.totalPrompts}</div>
              <div className={styles.metricSub}>user messages sent</div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>Total Responses</div>
              <div className={styles.metricValue}>{analytics.contentStats.totalResponses}</div>
              <div className={styles.metricSub}>Claude responses received</div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>Artifacts Created</div>
              <div className={styles.metricValue}>{analytics.contentStats.totalArtifacts}</div>
              <div className={styles.metricSub}>code blocks, HTML, files</div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>Avg Response Length</div>
              <div className={styles.metricValue}>{formatNumber(analytics.contentStats.averageResponseLength)}</div>
              <div className={styles.metricSub}>characters per response</div>
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}>
                <span className={styles.sectionIcon}>🏗️</span>
                Content by Type
              </div>
            </div>
            <div className={styles.contentGrid}>
              <div className={styles.contentCard}>
                <div className={styles.contentCardTitle}>Artifacts by Type</div>
                {Object.keys(analytics.contentStats.artifactsByType).length > 0 ? (
                  Object.entries(analytics.contentStats.artifactsByType)
                    .sort(([, a], [, b]) => b - a)
                    .map(([type, count]) => (
                      <div key={type} className={styles.artifactRow}>
                        <span className={styles.artifactType}>{type}</span>
                        <span className={styles.artifactCount}>{count}</span>
                      </div>
                    ))
                ) : (
                  <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', padding: '12px 0' }}>
                    No artifacts created yet. Ask Claude to write code or create content.
                  </div>
                )}
              </div>
              <div className={styles.contentCard}>
                <div className={styles.contentCardTitle}>Conversation Stats</div>
                <div className={styles.artifactRow}>
                  <span className={styles.artifactType}>Total Conversations</span>
                  <span className={styles.artifactCount}>{analytics.lifetimeStats.totalConversations}</span>
                </div>
                <div className={styles.artifactRow}>
                  <span className={styles.artifactType}>Total Messages</span>
                  <span className={styles.artifactCount}>{analytics.lifetimeStats.totalMessages}</span>
                </div>
                <div className={styles.artifactRow}>
                  <span className={styles.artifactType}>Avg Messages/Conv</span>
                  <span className={styles.artifactCount}>
                    {analytics.lifetimeStats.totalConversations > 0
                      ? Math.round(analytics.lifetimeStats.totalMessages / analytics.lifetimeStats.totalConversations)
                      : 0}
                  </span>
                </div>
                <div className={styles.artifactRow}>
                  <span className={styles.artifactType}>Avg Tokens/Request</span>
                  <span className={styles.artifactCount}>{formatNumber(analytics.contentStats.averageTokensPerRequest)}</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ─── Users Tab ──────────────────────────────────────────────────────── */}
      {activeTab === 'users' && (
        <>
          <div className={styles.activityGrid}>
            <div className={styles.activityCard}>
              <div className={styles.activityPeriod}>Daily</div>
              <div className={styles.activityValue}>{userCounts.daily}</div>
              <div className={styles.activityLabel}>active users</div>
            </div>
            <div className={styles.activityCard}>
              <div className={styles.activityPeriod}>Weekly</div>
              <div className={styles.activityValue}>{userCounts.weekly}</div>
              <div className={styles.activityLabel}>active users</div>
            </div>
            <div className={styles.activityCard}>
              <div className={styles.activityPeriod}>Monthly</div>
              <div className={styles.activityValue}>{userCounts.monthly}</div>
              <div className={styles.activityLabel}>active users</div>
            </div>
            <div className={styles.activityCard}>
              <div className={styles.activityPeriod}>Lifetime</div>
              <div className={styles.activityValue}>{userCounts.lifetime}</div>
              <div className={styles.activityLabel}>total users</div>
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}>
                <span className={styles.sectionIcon}>👥</span>
                Daily Active Users (Last 30 Days)
              </div>
            </div>
            <UserActivityChart data={analytics} />
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}>
                <span className={styles.sectionIcon}>ℹ️</span>
                About User Metrics
              </div>
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              User activity metrics are aggregated from session data. Individual user names are not tracked
              or displayed to protect privacy. All data is stored locally on your device and is never sent
              to external servers. The metrics shown represent usage patterns across all sessions on this browser.
            </div>
          </div>
        </>
      )}

      {/* ─── Performance Tab ──────────────────────────────────────────────── */}
      {activeTab === 'performance' && (
        <PerformanceTab conversations={conversations} />
      )}

      {/* ─── Status Tab ─────────────────────────────────────────────────────── */}
      {activeTab === 'status' && (
        <>
          <div className={styles.metricsGrid}>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>System Status</div>
              <div className={styles.metricValue} style={{ color: '#22c55e', fontSize: '20px' }}>● Operational</div>
              <div className={styles.metricSub}>All systems running normally</div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>App Version</div>
              <div className={styles.metricValue} style={{ fontSize: '20px' }}>2.1.0</div>
              <div className={styles.metricSub}>Latest release</div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>Bridge Status</div>
              <div className={styles.metricValue} style={{ fontSize: '20px' }}>v1.0</div>
              <div className={styles.metricSub}>ArcadIA Bridge</div>
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}>
                <span className={styles.sectionIcon}>📢</span>
                Announcements & Updates
              </div>
            </div>
            {analytics.announcements.length > 0 ? (
              <div className={styles.announcementsList}>
                {analytics.announcements.map(ann => (
                  <AnnouncementCard
                    key={ann.id}
                    announcement={ann}
                    onDismiss={handleDismiss}
                    onAction={handleNavigate}
                  />
                ))}
              </div>
            ) : (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>📢</div>
                <div className={styles.emptyTitle}>No announcements</div>
                <div className={styles.emptyDesc}>System updates and announcements will appear here.</div>
              </div>
            )}
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}>
                <span className={styles.sectionIcon}>🔄</span>
                Recent Changes
              </div>
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
              <div style={{ marginBottom: '12px' }}>
                <strong style={{ color: 'var(--text-primary)' }}>v2.1.0</strong> — Analytics Dashboard
                <div style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>Added comprehensive analytics with token tracking, request type analysis, popular prompts, and system status page.</div>
              </div>
              <div style={{ marginBottom: '12px' }}>
                <strong style={{ color: 'var(--text-primary)' }}>v2.0.0</strong> — ArcadIA Editor Launch
                <div style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>Dual-mode interface (Simple + Engineer), bridge connectivity, code workspace, skills, team collaboration.</div>
              </div>
              <div>
                <strong style={{ color: 'var(--text-primary)' }}>v1.0.0</strong> — Initial Release
                <div style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>Basic Claude chat interface with streaming support.</div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Performance Tab Component ───────────────────────────────────────────

interface PerfMetrics {
  avgTtft: number;
  minTtft: number;
  maxTtft: number;
  avgResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  avgTokensPerSec: number;
  totalRequests: number;
  successRate: number;
  p50ResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  dailyPerf: { date: string; avgTtft: number; avgResponseTime: number; avgTps: number; count: number }[];
}

function computePerfMetrics(conversations: Conversation[]): PerfMetrics {
  const ttfts: number[] = [];
  const responseTimes: number[] = [];
  const tpsValues: number[] = [];
  const dailyMap: Record<string, { ttfts: number[]; responseTimes: number[]; tps: number[] }> = {};
  let totalMsgs = 0;
  let successMsgs = 0;

  for (const conv of conversations) {
    for (const msg of conv.messages) {
      if (msg.role !== 'assistant') continue;
      totalMsgs++;

      const dateKey = new Date(msg.timestamp).toISOString().slice(0, 10);
      if (!dailyMap[dateKey]) dailyMap[dateKey] = { ttfts: [], responseTimes: [], tps: [] };

      if (msg.content && msg.content.length > 0) successMsgs++;

      if (msg.ttft != null && msg.ttft > 0) {
        ttfts.push(msg.ttft);
        dailyMap[dateKey].ttfts.push(msg.ttft);
      }
      if (msg.totalTime != null && msg.totalTime > 0) {
        responseTimes.push(msg.totalTime);
        dailyMap[dateKey].responseTimes.push(msg.totalTime);
      }
      if (msg.outputTokens != null && msg.totalTime != null && msg.totalTime > 0) {
        const tps = Math.round(msg.outputTokens / (msg.totalTime / 1000));
        if (tps > 0) {
          tpsValues.push(tps);
          dailyMap[dateKey].tps.push(tps);
        }
      }
    }
  }

  const avg = (arr: number[]) => arr.length > 0 ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : 0;
  const percentile = (arr: number[], p: number) => {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  };

  // Build daily performance for last 14 days
  const dailyPerf: PerfMetrics['dailyPerf'] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateKey = d.toISOString().slice(0, 10);
    const day = dailyMap[dateKey];
    dailyPerf.push({
      date: dateKey,
      avgTtft: day ? avg(day.ttfts) : 0,
      avgResponseTime: day ? avg(day.responseTimes) : 0,
      avgTps: day ? avg(day.tps) : 0,
      count: day ? day.responseTimes.length : 0,
    });
  }

  return {
    avgTtft: avg(ttfts),
    minTtft: ttfts.length > 0 ? Math.min(...ttfts) : 0,
    maxTtft: ttfts.length > 0 ? Math.max(...ttfts) : 0,
    avgResponseTime: avg(responseTimes),
    minResponseTime: responseTimes.length > 0 ? Math.min(...responseTimes) : 0,
    maxResponseTime: responseTimes.length > 0 ? Math.max(...responseTimes) : 0,
    avgTokensPerSec: avg(tpsValues),
    totalRequests: totalMsgs,
    successRate: totalMsgs > 0 ? Math.round((successMsgs / totalMsgs) * 100) : 100,
    p50ResponseTime: percentile(responseTimes, 50),
    p95ResponseTime: percentile(responseTimes, 95),
    p99ResponseTime: percentile(responseTimes, 99),
    dailyPerf,
  };
}

function PerformanceTab({ conversations }: { conversations: Conversation[] }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const perf = useMemo(() => computePerfMetrics(conversations), [conversations]);

  const fmtMs = (ms: number) => {
    if (ms === 0) return '—';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const maxRT = Math.max(1, ...perf.dailyPerf.map(d => d.avgResponseTime));
  const maxTps = Math.max(1, ...perf.dailyPerf.map(d => d.avgTps));

  const hasData = perf.totalRequests > 0;

  return (
    <>
      {/* Top-level performance metrics */}
      <div className={styles.metricsGrid}>
        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>Avg TTFB</div>
          <div className={styles.metricValue} style={{ color: perf.avgTtft < 1000 ? '#22c55e' : perf.avgTtft < 3000 ? '#f59e0b' : '#ef4444' }}>
            {fmtMs(perf.avgTtft)}
          </div>
          <div className={styles.metricSub}>Time to first byte</div>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>Avg Response Time</div>
          <div className={styles.metricValue}>{fmtMs(perf.avgResponseTime)}</div>
          <div className={styles.metricSub}>End-to-end latency</div>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>Throughput</div>
          <div className={styles.metricValue}>{perf.avgTokensPerSec > 0 ? `${perf.avgTokensPerSec}` : '—'}</div>
          <div className={styles.metricSub}>avg tokens/second</div>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>Success Rate</div>
          <div className={styles.metricValue} style={{ color: perf.successRate >= 95 ? '#22c55e' : '#f59e0b' }}>
            {perf.successRate}%
          </div>
          <div className={styles.metricSub}>{perf.totalRequests} total requests</div>
        </div>
      </div>

      {/* Latency Breakdown */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTitle}>
            <span className={styles.sectionIcon}>⏱️</span>
            Latency Breakdown
          </div>
        </div>
        {hasData ? (
          <div className={styles.contentGrid}>
            <div className={styles.contentCard}>
              <div className={styles.contentCardTitle}>TTFB (Time to First Byte)</div>
              <div className={styles.artifactRow}>
                <span className={styles.artifactType}>Average</span>
                <span className={styles.artifactCount}>{fmtMs(perf.avgTtft)}</span>
              </div>
              <div className={styles.artifactRow}>
                <span className={styles.artifactType}>Minimum</span>
                <span className={styles.artifactCount}>{fmtMs(perf.minTtft)}</span>
              </div>
              <div className={styles.artifactRow}>
                <span className={styles.artifactType}>Maximum</span>
                <span className={styles.artifactCount}>{fmtMs(perf.maxTtft)}</span>
              </div>
            </div>
            <div className={styles.contentCard}>
              <div className={styles.contentCardTitle}>Response Time Percentiles</div>
              <div className={styles.artifactRow}>
                <span className={styles.artifactType}>p50 (Median)</span>
                <span className={styles.artifactCount}>{fmtMs(perf.p50ResponseTime)}</span>
              </div>
              <div className={styles.artifactRow}>
                <span className={styles.artifactType}>p95</span>
                <span className={styles.artifactCount}>{fmtMs(perf.p95ResponseTime)}</span>
              </div>
              <div className={styles.artifactRow}>
                <span className={styles.artifactType}>p99</span>
                <span className={styles.artifactCount}>{fmtMs(perf.p99ResponseTime)}</span>
              </div>
              <div className={styles.artifactRow}>
                <span className={styles.artifactType}>Min / Max</span>
                <span className={styles.artifactCount}>{fmtMs(perf.minResponseTime)} / {fmtMs(perf.maxResponseTime)}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>⏱️</div>
            <div className={styles.emptyTitle}>No performance data yet</div>
            <div className={styles.emptyDesc}>Send messages to Claude to start collecting performance metrics.</div>
          </div>
        )}
      </div>

      {/* Response Time Trend Chart */}
      {hasData && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>
              <span className={styles.sectionIcon}>📈</span>
              Response Time Trend (14 Days)
            </div>
          </div>
          <div className={styles.chartArea}>
            {perf.dailyPerf.map((day, i) => {
              const heightPct = day.avgResponseTime > 0 ? Math.max(2, (day.avgResponseTime / maxRT) * 100) : 0;
              return (
                <div
                  key={day.date}
                  className={styles.chartBar}
                  style={{
                    height: `${heightPct}%`,
                    background: day.avgResponseTime > 0
                      ? day.avgResponseTime < 3000 ? 'linear-gradient(to top, #22c55e, rgba(34, 197, 94, 0.6))'
                      : day.avgResponseTime < 10000 ? 'linear-gradient(to top, #f59e0b, rgba(245, 158, 11, 0.6))'
                      : 'linear-gradient(to top, #ef4444, rgba(239, 68, 68, 0.6))'
                      : 'var(--bg-tertiary)',
                  }}
                  onMouseEnter={() => setHoveredIdx(i)}
                  onMouseLeave={() => setHoveredIdx(null)}
                >
                  {hoveredIdx === i && day.count > 0 && (
                    <div className={styles.tooltip}>
                      <div className={styles.tooltipDate}>{formatDate(day.date)}</div>
                      <div className={styles.tooltipRow}>
                        <span>Avg Response:</span>
                        <span className={styles.tooltipValue}>{fmtMs(day.avgResponseTime)}</span>
                      </div>
                      <div className={styles.tooltipRow}>
                        <span>Avg TTFB:</span>
                        <span className={styles.tooltipValue}>{fmtMs(day.avgTtft)}</span>
                      </div>
                      <div className={styles.tooltipRow}>
                        <span>Avg TPS:</span>
                        <span className={styles.tooltipValue}>{day.avgTps} tok/s</span>
                      </div>
                      <div className={styles.tooltipRow}>
                        <span>Requests:</span>
                        <span className={styles.tooltipValue}>{day.count}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className={styles.chartLabels}>
            {perf.dailyPerf.filter((_, i) => i % 2 === 0).map(day => (
              <span key={day.date} className={styles.chartLabel}>{formatDate(day.date)}</span>
            ))}
          </div>
          <div className={styles.chartLegend}>
            <div className={styles.legendItem}>
              <div className={styles.legendDot} style={{ background: '#22c55e' }} />
              <span>&lt; 3s</span>
            </div>
            <div className={styles.legendItem}>
              <div className={styles.legendDot} style={{ background: '#f59e0b' }} />
              <span>3–10s</span>
            </div>
            <div className={styles.legendItem}>
              <div className={styles.legendDot} style={{ background: '#ef4444' }} />
              <span>&gt; 10s</span>
            </div>
          </div>
        </div>
      )}

      {/* Throughput Chart */}
      {hasData && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>
              <span className={styles.sectionIcon}>🚀</span>
              Throughput (Tokens/Second) — 14 Days
            </div>
          </div>
          <div className={styles.chartArea}>
            {perf.dailyPerf.map((day, i) => {
              const heightPct = day.avgTps > 0 ? Math.max(2, (day.avgTps / maxTps) * 100) : 0;
              return (
                <div
                  key={day.date}
                  className={`${styles.chartBar} ${styles.chartBarTotal}`}
                  style={{ height: `${heightPct}%` }}
                  onMouseEnter={() => setHoveredIdx(100 + i)}
                  onMouseLeave={() => setHoveredIdx(null)}
                >
                  {hoveredIdx === 100 + i && day.count > 0 && (
                    <div className={styles.tooltip}>
                      <div className={styles.tooltipDate}>{formatDate(day.date)}</div>
                      <div className={styles.tooltipRow}>
                        <span>Avg TPS:</span>
                        <span className={styles.tooltipValue}>{day.avgTps} tok/s</span>
                      </div>
                      <div className={styles.tooltipRow}>
                        <span>Requests:</span>
                        <span className={styles.tooltipValue}>{day.count}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className={styles.chartLabels}>
            {perf.dailyPerf.filter((_, i) => i % 2 === 0).map(day => (
              <span key={day.date} className={styles.chartLabel}>{formatDate(day.date)}</span>
            ))}
          </div>
        </div>
      )}

      {/* Performance Tips */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTitle}>
            <span className={styles.sectionIcon}>💡</span>
            Performance Tips
          </div>
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          <div style={{ marginBottom: '10px' }}>
            <strong style={{ color: 'var(--text-primary)' }}>TTFB (Time to First Byte)</strong> — The time from sending your prompt until the first token arrives. Lower is better. Affected by model load, prompt complexity, and network latency.
          </div>
          <div style={{ marginBottom: '10px' }}>
            <strong style={{ color: 'var(--text-primary)' }}>Response Time</strong> — Total end-to-end time from prompt submission to full response. Includes TTFB + token generation time. Longer prompts and responses naturally take more time.
          </div>
          <div style={{ marginBottom: '10px' }}>
            <strong style={{ color: 'var(--text-primary)' }}>Throughput (Tokens/sec)</strong> — How fast Claude generates output tokens. Higher is better. Varies by model and server load.
          </div>
          <div>
            <strong style={{ color: 'var(--text-primary)' }}>Percentiles</strong> — p50 is the median response time, p95 covers 95% of requests, and p99 covers 99%. High p99 values may indicate occasional slow requests.
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Announcement Card Component ─────────────────────────────────────────────

function AnnouncementCard({
  announcement,
  onDismiss,
  onAction,
}: {
  announcement: SystemAnnouncement;
  onDismiss: (id: string) => void;
  onAction: (target: string) => void;
}) {
  const severityClass =
    announcement.severity === 'critical' ? styles.announcementSeverityCritical :
    announcement.severity === 'high' ? styles.announcementSeverityHigh :
    announcement.severity === 'medium' ? styles.announcementSeverityMedium :
    styles.announcementSeverityLow;

  return (
    <div className={`${styles.announcement} ${severityClass}`}>
      <span className={styles.announcementIcon}>
        {ANNOUNCEMENT_ICONS[announcement.type] ?? 'ℹ️'}
      </span>
      <div className={styles.announcementBody}>
        <div className={styles.announcementTitle}>{announcement.title}</div>
        <div className={styles.announcementMessage}>{announcement.message}</div>
        <div className={styles.announcementMeta}>
          <span className={styles.announcementTime}>{timeAgo(announcement.timestamp)}</span>
          {announcement.actionLabel && (
            <button
              className={styles.announcementAction}
              onClick={() => onAction(announcement.actionLabel!)}
            >
              {announcement.actionLabel}
            </button>
          )}
        </div>
      </div>
      <button className={styles.dismissBtn} onClick={() => onDismiss(announcement.id)} title="Dismiss">
        ✕
      </button>
    </div>
  );
}
