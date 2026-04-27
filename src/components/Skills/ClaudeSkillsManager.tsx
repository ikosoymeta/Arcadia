import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getBridgeUrl, testBridgeConnection } from '../../services/bridge';

// ─── Skill Catalog — Top skills from Meta's Claude Templates ─────────────────
// Source: https://www.internalfb.com/claude-templates/skills

interface CatalogSkill {
  name: string;
  description: string;
  category: string;
  installs: string;
  usage: string;
  likes: number;
  author: string;
  icon: string;
  recommended?: boolean;
}

const SKILL_CATALOG: CatalogSkill[] = [
  { name: 'google-docs', description: 'Create, read, and edit Google Docs directly from Claude.', category: 'Productivity', installs: '13.6K', usage: '149.3K', likes: 135, author: '@thw', icon: '📄', recommended: true },
  { name: 'tasks', description: 'Manage your Tasks — create, update, complete, and organize to-dos.', category: 'Productivity', installs: '7.2K', usage: '136.2K', likes: 36, author: '@mhoyl', icon: '✅', recommended: true },
  { name: 'calendar', description: 'View and manage your Google Calendar events.', category: 'Productivity', installs: '11.3K', usage: '134.8K', likes: 24, author: '@mhoyl', icon: '📅', recommended: true },
  { name: 'gchat', description: 'Send and read Google Chat messages.', category: 'Productivity', installs: '10.0K', usage: '134.2K', likes: 45, author: '@aloukian', icon: '💬', recommended: true },
  { name: 'google-sheets', description: 'Create, read, and edit Google Sheets spreadsheets.', category: 'Productivity', installs: '3.0K', usage: '132.4K', likes: 20, author: '@thw', icon: '📊', recommended: true },
  { name: 'buck', description: 'Build, test, and manage Buck2 targets.', category: 'Code & Build', installs: '188', usage: '100.0K', likes: 18, author: '@ckonstad', icon: '🔨' },
  { name: 'diff-search', description: 'Search Phabricator diffs by author, reviewer, or keywords.', category: 'Code & Build', installs: '5.3K', usage: '96.8K', likes: 10, author: '@jcw', icon: '🔍' },
  { name: 'scuba', description: 'Query and analyze Scuba datasets.', category: 'Data & Analytics', installs: '2.3K', usage: '96.6K', likes: 41, author: '@obx_metrics', icon: '📈' },
  { name: 'gsd', description: 'Get stuff done — task management and workflow automation.', category: 'Productivity', installs: '744', usage: '95.7K', likes: 10, author: '@wlis', icon: '⚡' },
  { name: 'metamate-research', description: 'Research topics using MetaMate knowledge base.', category: 'Research', installs: '572', usage: '95.7K', likes: 15, author: '@jsd115', icon: '🔬' },
  { name: 'diff-comments', description: 'Read and write comments on Phabricator diffs.', category: 'Code & Build', installs: '734', usage: '94.2K', likes: 7, author: '@wlis', icon: '💭' },
  { name: 'workplace', description: 'Read and post on Workplace.', category: 'Productivity', installs: '4.7K', usage: '77.9K', likes: 27, author: '@daryal', icon: '🏢' },
  { name: 'deep-research', description: 'Conduct deep research across multiple sources and synthesize findings.', category: 'Research', installs: '2.3K', usage: '55.7K', likes: 54, author: '@fzamora', icon: '🧠', recommended: true },
  { name: 'google-slides-presentation', description: 'Create and edit Google Slides presentations.', category: 'Productivity', installs: '939', usage: '45.1K', likes: 12, author: '@vlassios', icon: '📽️', recommended: true },
  { name: 'create-wiki', description: 'Create and publish internal wiki pages.', category: 'Research', installs: '179', usage: '40.4K', likes: 7, author: '@mhoyl', icon: '📚', recommended: true },
  { name: 'google-drive', description: 'Browse and manage files in Google Drive.', category: 'Productivity', installs: '805', usage: '39.0K', likes: 6, author: '@thw', icon: '💾' },
  { name: 'google-docs-fast-reader', description: 'Quickly read and extract content from Google Docs.', category: 'Productivity', installs: '4.4K', usage: '37.7K', likes: 11, author: '@huanglei', icon: '📖', recommended: true },
  { name: 'wiki-query', description: 'Search and query internal wiki pages.', category: 'Research', installs: '683', usage: '31.3K', likes: 12, author: '@radotzki', icon: '🔎' },
  { name: 'visualize', description: 'Create charts, diagrams, and visualizations.', category: 'Visualization', installs: '2.4K', usage: '16.4K', likes: 112, author: '@alexahn', icon: '📉' },
  { name: 'skill-creator', description: 'Create new Claude skills interactively.', category: 'Meta Tools', installs: '938', usage: '14.3K', likes: 38, author: '@radotzki', icon: '🛠️' },
  { name: 'presto-query', description: 'Run Presto SQL queries on data warehouse tables.', category: 'Data & Analytics', installs: '2.7K', usage: '13.2K', likes: 27, author: '@datamate', icon: '🗃️' },
  { name: 'ci-signals', description: 'Check CI/CD signal status for diffs and builds.', category: 'Code & Build', installs: '1.5K', usage: '12.4K', likes: 10, author: '@jaejunku', icon: '🚦' },
  { name: 'daiquery', description: 'Run DaiQuery queries for data analysis.', category: 'Data & Analytics', installs: '782', usage: '11.0K', likes: 28, author: '@datamate', icon: '📋' },
  { name: 'excalidraw', description: 'Create Excalidraw diagrams and whiteboard sketches.', category: 'Visualization', installs: '471', usage: '9.4K', likes: 38, author: '@doronv', icon: '🎨' },
  { name: 'diff-review', description: 'Review Phabricator diffs with AI assistance.', category: 'Code & Build', installs: '496', usage: '7.4K', likes: 12, author: '@jhumph', icon: '👀' },
  { name: 'test-plan-finder', description: 'Find relevant test plans for your code changes.', category: 'Code & Build', installs: '49', usage: '7.0K', likes: 4, author: '@jrodal', icon: '🧪' },
  { name: 'claw-town', description: 'Interact with Claw Town for code exploration.', category: 'Meta Tools', installs: '233', usage: '6.8K', likes: 20, author: '@jessicafu', icon: '🦞' },
  { name: 'eng-psc-writer', description: 'Write engineering PSC (Performance Summary Cycle) documents.', category: 'Meta Tools', installs: '26', usage: '6.8K', likes: 9, author: '@weizhng', icon: '📝' },
  { name: 'python-at-meta', description: 'Python development best practices at Meta.', category: 'Code & Build', installs: '146', usage: '6.8K', likes: 6, author: '@kosievdmerwe', icon: '🐍' },
  { name: 'configerator', description: 'Read and manage Configerator configs.', category: 'Infrastructure', installs: '295', usage: '6.7K', likes: 3, author: '@noamler', icon: '⚙️' },
  { name: 'spec-driven-dev', description: 'Specification-driven development workflow.', category: 'Code & Build', installs: '21', usage: '6.3K', likes: 8, author: '@acon', icon: '📐' },
  { name: 'unidash', description: 'Create and query UniDash dashboards.', category: 'Data & Analytics', installs: '505', usage: '5.6K', likes: 27, author: '@datamate', icon: '📊' },
  { name: 'chronos-debug', description: 'Debug Chronos jobs and workflows.', category: 'Infrastructure', installs: '297', usage: '5.5K', likes: 5, author: '@shaya', icon: '⏱️' },
  { name: 'analytics-agent-handoff', description: 'Hand off analytics tasks to specialized agents.', category: 'Data & Analytics', installs: '168', usage: '5.2K', likes: 6, author: '@aayushahuja', icon: '🤝' },
  { name: 'submitting-diffs', description: 'Submit and manage Phabricator diffs.', category: 'Code & Build', installs: '321', usage: '5.1K', likes: 9, author: '@ofek', icon: '📤' },
  { name: 'conveyor', description: 'Manage Conveyor pipelines and jobs.', category: 'Infrastructure', installs: '168', usage: '4.7K', likes: 3, author: '@noamler', icon: '🏗️' },
  { name: 'testx-debug', description: 'Debug TestX test failures.', category: 'Infrastructure', installs: '75', usage: '4.4K', likes: 5, author: '@alexlopez', icon: '🐛' },
  { name: 'tupperware', description: 'Manage Tupperware containers and services.', category: 'Infrastructure', installs: '130', usage: '4.3K', likes: 5, author: '@noamler', icon: '📦' },
];

const CATALOG_CATEGORIES = ['All', 'Recommended', 'Productivity', 'Code & Build', 'Data & Analytics', 'Research', 'Visualization', 'Infrastructure', 'Meta Tools'];

interface InstalledSkill {
  name: string;
  dir: string;
  description: string;
  hasContent: boolean;
}

type SkillAction = 'idle' | 'installing' | 'uninstalling' | 'reading';

interface SkillActionState {
  [skillName: string]: SkillAction;
}

interface Props {
  onUseSkill?: (skillName: string, content: string) => void;
}

export function ClaudeSkillsManager({ onUseSkill }: Props) {
  const [bridgeConnected, setBridgeConnected] = useState<boolean | null>(null);
  const [installedSkills, setInstalledSkills] = useState<InstalledSkill[]>([]);
  const [installedNames, setInstalledNames] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('Recommended');
  const [activeTab, setActiveTab] = useState<'catalog' | 'installed' | 'custom'>('catalog');
  const [actionStates, setActionStates] = useState<SkillActionState>({});
  const [toast, setToast] = useState<string | null>(null);
  const [selectedSkillContent, setSelectedSkillContent] = useState<{ name: string; content: string; references: string[] } | null>(null);
  const [customFile, setCustomFile] = useState<File | null>(null);
  const [customSkillName, setCustomSkillName] = useState('');
  const [customInstalling, setCustomInstalling] = useState(false);
  const [batchInstalling, setBatchInstalling] = useState(false);
  const toastTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    toastTimeout.current = setTimeout(() => setToast(null), 4000);
  }, []);

  // ─── Check bridge connection and load installed skills ─────────────────────
  const loadInstalledSkills = useCallback(async () => {
    const bridgeUrl = getBridgeUrl();
    try {
      const conn = await testBridgeConnection(bridgeUrl);
      setBridgeConnected(conn.ok);
      if (!conn.ok) { setLoading(false); return; }

      const res = await fetch(`${bridgeUrl}/v1/secondbrain/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list-skills-detailed' }),
      });
      const data = await res.json();
      if (data.success && data.skills) {
        setInstalledSkills(data.skills);
        setInstalledNames(new Set(data.skills.map((s: InstalledSkill) => s.name)));
      }
    } catch (e) {
      console.error('Failed to load skills:', e);
      setBridgeConnected(false);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadInstalledSkills(); }, [loadInstalledSkills]);

  // ─── Install a single skill ────────────────────────────────────────────────
  const installSkill = useCallback(async (skillName: string) => {
    setActionStates(prev => ({ ...prev, [skillName]: 'installing' }));
    try {
      const bridgeUrl = getBridgeUrl();
      const res = await fetch(`${bridgeUrl}/v1/secondbrain/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'install-skill', skillName }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`✅ ${skillName} installed successfully`);
        await loadInstalledSkills();
      } else {
        showToast(`❌ Failed to install ${skillName}: ${data.stderr || data.error || 'Unknown error'}`);
      }
    } catch (e: any) {
      showToast(`❌ Error: ${e.message}`);
    }
    setActionStates(prev => ({ ...prev, [skillName]: 'idle' }));
  }, [loadInstalledSkills, showToast]);

  // ─── Uninstall a skill ─────────────────────────────────────────────────────
  const uninstallSkill = useCallback(async (skillName: string) => {
    setActionStates(prev => ({ ...prev, [skillName]: 'uninstalling' }));
    try {
      const bridgeUrl = getBridgeUrl();
      const res = await fetch(`${bridgeUrl}/v1/secondbrain/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'uninstall-skill', skillName }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`🗑️ ${skillName} uninstalled`);
        await loadInstalledSkills();
      } else {
        showToast(`❌ Failed to uninstall ${skillName}`);
      }
    } catch (e: any) {
      showToast(`❌ Error: ${e.message}`);
    }
    setActionStates(prev => ({ ...prev, [skillName]: 'idle' }));
  }, [loadInstalledSkills, showToast]);

  // ─── Read skill content ────────────────────────────────────────────────────
  const readSkillContent = useCallback(async (skillName: string) => {
    setActionStates(prev => ({ ...prev, [skillName]: 'reading' }));
    try {
      const bridgeUrl = getBridgeUrl();
      const res = await fetch(`${bridgeUrl}/v1/secondbrain/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'read-skill-content', skillName }),
      });
      const data = await res.json();
      if (data.success) {
        setSelectedSkillContent({ name: skillName, content: data.content, references: data.references || [] });
      } else {
        showToast(`❌ Could not read ${skillName}: ${data.error}`);
      }
    } catch (e: any) {
      showToast(`❌ Error: ${e.message}`);
    }
    setActionStates(prev => ({ ...prev, [skillName]: 'idle' }));
  }, [showToast]);

  // ─── Install custom .skill file ────────────────────────────────────────────
  const installCustomSkill = useCallback(async () => {
    if (!customFile || !customSkillName.trim()) {
      showToast('❌ Please provide a skill name and file');
      return;
    }
    setCustomInstalling(true);
    try {
      const buffer = await customFile.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
      const bridgeUrl = getBridgeUrl();
      const res = await fetch(`${bridgeUrl}/v1/secondbrain/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'install-custom-skill', skillName: customSkillName.trim(), fileContent: base64 }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`✅ Custom skill "${customSkillName}" installed`);
        setCustomFile(null);
        setCustomSkillName('');
        if (fileInputRef.current) fileInputRef.current.value = '';
        await loadInstalledSkills();
      } else {
        showToast(`❌ Failed: ${data.error}`);
      }
    } catch (e: any) {
      showToast(`❌ Error: ${e.message}`);
    }
    setCustomInstalling(false);
  }, [customFile, customSkillName, loadInstalledSkills, showToast]);

  // ─── Batch install recommended skills ──────────────────────────────────────
  const installRecommended = useCallback(async () => {
    const recommended = SKILL_CATALOG.filter(s => s.recommended && !installedNames.has(s.name));
    if (recommended.length === 0) {
      showToast('All recommended skills are already installed!');
      return;
    }
    setBatchInstalling(true);
    const names = recommended.map(s => s.name);
    try {
      const bridgeUrl = getBridgeUrl();
      const res = await fetch(`${bridgeUrl}/v1/secondbrain/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run-command', command: `claude-templates skill ${names.join(',')} install` }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`✅ Installed ${names.length} recommended skills`);
        await loadInstalledSkills();
      } else {
        showToast(`❌ Batch install failed: ${data.stderr || data.error || 'Unknown error'}`);
      }
    } catch (e: any) {
      showToast(`❌ Error: ${e.message}`);
    }
    setBatchInstalling(false);
  }, [installedNames, loadInstalledSkills, showToast]);

  // ─── Filter catalog ────────────────────────────────────────────────────────
  const filteredCatalog = SKILL_CATALOG.filter(s => {
    const matchesSearch = !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = activeCategory === 'All' || (activeCategory === 'Recommended' ? s.recommended : s.category === activeCategory);
    return matchesSearch && matchesCategory;
  });

  // ─── Styles ────────────────────────────────────────────────────────────────
  const styles = {
    container: { padding: '24px', maxWidth: '900px', margin: '0 auto', fontFamily: 'var(--font-sans, system-ui, -apple-system, sans-serif)' } as React.CSSProperties,
    header: { marginBottom: '24px' } as React.CSSProperties,
    title: { fontSize: '20px', fontWeight: 700, color: 'var(--foreground)', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' } as React.CSSProperties,
    subtitle: { fontSize: '13px', color: 'var(--muted-foreground)', marginTop: '6px' } as React.CSSProperties,
    tabs: { display: 'flex', gap: '4px', marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '0' } as React.CSSProperties,
    tab: (active: boolean) => ({ padding: '8px 16px', fontSize: '13px', fontWeight: active ? 600 : 400, color: active ? 'var(--foreground)' : 'var(--muted-foreground)', background: 'none', border: 'none', borderBottom: active ? '2px solid var(--primary)' : '2px solid transparent', cursor: 'pointer', transition: 'all 0.15s' }) as React.CSSProperties,
    searchRow: { display: 'flex', gap: '12px', marginBottom: '16px', alignItems: 'center' } as React.CSSProperties,
    searchInput: { flex: 1, padding: '8px 12px', fontSize: '13px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--background)', color: 'var(--foreground)', outline: 'none' } as React.CSSProperties,
    categories: { display: 'flex', gap: '6px', flexWrap: 'wrap' as const, marginBottom: '16px' } as React.CSSProperties,
    categoryPill: (active: boolean) => ({ padding: '4px 12px', fontSize: '12px', borderRadius: '20px', border: '1px solid var(--border)', background: active ? 'var(--primary)' : 'var(--background)', color: active ? 'var(--primary-foreground)' : 'var(--muted-foreground)', cursor: 'pointer', fontWeight: active ? 600 : 400, transition: 'all 0.15s' }) as React.CSSProperties,
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' } as React.CSSProperties,
    card: { border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', background: 'var(--card)', transition: 'all 0.2s', cursor: 'default' } as React.CSSProperties,
    cardHeader: { display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '8px' } as React.CSSProperties,
    cardIcon: { fontSize: '24px', lineHeight: 1, flexShrink: 0 } as React.CSSProperties,
    cardName: { fontSize: '14px', fontWeight: 600, color: 'var(--foreground)', margin: 0 } as React.CSSProperties,
    cardDesc: { fontSize: '12px', color: 'var(--muted-foreground)', lineHeight: 1.5, margin: '0 0 10px' } as React.CSSProperties,
    cardMeta: { display: 'flex', gap: '12px', fontSize: '11px', color: 'var(--muted-foreground)', marginBottom: '10px' } as React.CSSProperties,
    cardActions: { display: 'flex', gap: '8px', justifyContent: 'flex-end' } as React.CSSProperties,
    btn: (variant: 'primary' | 'secondary' | 'danger' | 'ghost') => {
      const base: React.CSSProperties = { padding: '6px 14px', fontSize: '12px', fontWeight: 500, borderRadius: '6px', border: 'none', cursor: 'pointer', transition: 'all 0.15s', display: 'inline-flex', alignItems: 'center', gap: '4px' };
      if (variant === 'primary') return { ...base, background: 'var(--primary)', color: 'var(--primary-foreground)' };
      if (variant === 'danger') return { ...base, background: 'transparent', color: '#ef4444', border: '1px solid #ef4444' };
      if (variant === 'ghost') return { ...base, background: 'transparent', color: 'var(--muted-foreground)' };
      return { ...base, background: 'var(--secondary)', color: 'var(--secondary-foreground)' };
    },
    badge: (type: 'installed' | 'recommended') => ({
      display: 'inline-block', padding: '2px 8px', fontSize: '10px', fontWeight: 600, borderRadius: '10px', letterSpacing: '0.3px',
      background: type === 'installed' ? 'rgba(34,197,94,0.15)' : 'rgba(59,130,246,0.15)',
      color: type === 'installed' ? '#22c55e' : '#3b82f6',
    }) as React.CSSProperties,
    emptyState: { textAlign: 'center' as const, padding: '48px 24px', color: 'var(--muted-foreground)' } as React.CSSProperties,
    overlay: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' } as React.CSSProperties,
    modal: { background: 'var(--card)', borderRadius: '16px', padding: '24px', maxWidth: '640px', width: '90%', maxHeight: '80vh', overflow: 'auto', border: '1px solid var(--border)' } as React.CSSProperties,
    codeBlock: { background: 'var(--secondary)', borderRadius: '8px', padding: '16px', fontSize: '12px', fontFamily: 'monospace', whiteSpace: 'pre-wrap' as const, lineHeight: 1.6, color: 'var(--foreground)', maxHeight: '400px', overflow: 'auto', border: '1px solid var(--border)' } as React.CSSProperties,
    disconnected: { textAlign: 'center' as const, padding: '48px', background: 'var(--card)', borderRadius: '16px', border: '1px solid var(--border)' } as React.CSSProperties,
    customSection: { padding: '24px', background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)' } as React.CSSProperties,
    fileInput: { padding: '8px', fontSize: '13px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--background)', color: 'var(--foreground)', width: '100%' } as React.CSSProperties,
    inputField: { padding: '8px 12px', fontSize: '13px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--background)', color: 'var(--foreground)', outline: 'none', width: '100%' } as React.CSSProperties,
    batchBtn: { padding: '8px 20px', fontSize: '13px', fontWeight: 600, borderRadius: '8px', border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s' } as React.CSSProperties,
    spinner: { display: 'inline-block', width: '14px', height: '14px', border: '2px solid transparent', borderTop: '2px solid currentColor', borderRadius: '50%', animation: 'spin 0.6s linear infinite' } as React.CSSProperties,
  };

  // ─── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={styles.container}>
        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--muted-foreground)' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔌</div>
          <div style={{ fontSize: '14px' }}>Connecting to bridge...</div>
        </div>
      </div>
    );
  }

  // ─── Bridge not connected ──────────────────────────────────────────────────
  if (bridgeConnected === false) {
    return (
      <div style={styles.container}>
        <div style={styles.disconnected}>
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>🔌</div>
          <h3 style={{ margin: '0 0 8px', color: 'var(--foreground)' }}>Bridge Not Connected</h3>
          <p style={{ color: 'var(--muted-foreground)', fontSize: '13px', marginBottom: '16px' }}>
            Connect your ArcadIA Bridge to manage Claude skills. Skills are installed on your devserver and used by Claude Code during conversations.
          </p>
          <button style={styles.btn('primary')} onClick={loadInstalledSkills}>
            🔄 Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Spinner keyframe */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.title}>
          <span>🧩</span> Claude Skills Manager
        </h2>
        <p style={styles.subtitle}>
          Browse, install, and manage Claude Code skills from Meta's skill catalog. Skills extend Claude's capabilities with specialized tools and workflows.
        </p>
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        <button style={styles.tab(activeTab === 'catalog')} onClick={() => setActiveTab('catalog')}>
          📦 Skill Catalog ({SKILL_CATALOG.length})
        </button>
        <button style={styles.tab(activeTab === 'installed')} onClick={() => setActiveTab('installed')}>
          ✅ Installed ({installedSkills.length})
        </button>
        <button style={styles.tab(activeTab === 'custom')} onClick={() => setActiveTab('custom')}>
          📁 Custom Skills
        </button>
      </div>

      {/* ═══ CATALOG TAB ═══ */}
      {activeTab === 'catalog' && (
        <>
          {/* Search + Batch Install */}
          <div style={styles.searchRow}>
            <input
              style={styles.searchInput}
              placeholder="Search skills..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <button
              style={{ ...styles.batchBtn, opacity: batchInstalling ? 0.7 : 1 }}
              onClick={installRecommended}
              disabled={batchInstalling}
            >
              {batchInstalling ? <><span style={styles.spinner} /> Installing...</> : '⚡ Install All Recommended'}
            </button>
          </div>

          {/* Categories */}
          <div style={styles.categories}>
            {CATALOG_CATEGORIES.map(cat => (
              <button key={cat} style={styles.categoryPill(activeCategory === cat)} onClick={() => setActiveCategory(cat)}>
                {cat}
              </button>
            ))}
          </div>

          {/* Skill Grid */}
          {filteredCatalog.length === 0 ? (
            <div style={styles.emptyState}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔍</div>
              <div>No skills match your search</div>
            </div>
          ) : (
            <div style={styles.grid}>
              {filteredCatalog.map(skill => {
                const installed = installedNames.has(skill.name);
                const action = actionStates[skill.name] || 'idle';
                return (
                  <div key={skill.name} style={{ ...styles.card, borderColor: installed ? 'rgba(34,197,94,0.3)' : undefined }}>
                    <div style={styles.cardHeader}>
                      <span style={styles.cardIcon}>{skill.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <h4 style={styles.cardName}>{skill.name}</h4>
                          {installed && <span style={styles.badge('installed')}>INSTALLED</span>}
                          {skill.recommended && !installed && <span style={styles.badge('recommended')}>RECOMMENDED</span>}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '2px' }}>by {skill.author}</div>
                      </div>
                    </div>
                    <p style={styles.cardDesc}>{skill.description}</p>
                    <div style={styles.cardMeta}>
                      <span>📥 {skill.installs}</span>
                      <span>📊 {skill.usage} uses</span>
                      <span>❤️ {skill.likes}</span>
                    </div>
                    <div style={styles.cardActions}>
                      {installed ? (
                        <>
                          <button style={styles.btn('ghost')} onClick={() => readSkillContent(skill.name)} disabled={action !== 'idle'}>
                            {action === 'reading' ? <span style={styles.spinner} /> : '📖'} View
                          </button>
                          <button style={styles.btn('danger')} onClick={() => uninstallSkill(skill.name)} disabled={action !== 'idle'}>
                            {action === 'uninstalling' ? <span style={styles.spinner} /> : '🗑️'} Uninstall
                          </button>
                        </>
                      ) : (
                        <button style={styles.btn('primary')} onClick={() => installSkill(skill.name)} disabled={action !== 'idle'}>
                          {action === 'installing' ? <><span style={styles.spinner} /> Installing...</> : '📥 Install'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ═══ INSTALLED TAB ═══ */}
      {activeTab === 'installed' && (
        <>
          <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: 'var(--muted-foreground)' }}>
              {installedSkills.length} skill{installedSkills.length !== 1 ? 's' : ''} installed on your devserver
            </span>
            <button style={styles.btn('secondary')} onClick={loadInstalledSkills}>
              🔄 Refresh
            </button>
          </div>

          {installedSkills.length === 0 ? (
            <div style={styles.emptyState}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>📭</div>
              <h3 style={{ margin: '0 0 8px', color: 'var(--foreground)' }}>No Skills Installed</h3>
              <p style={{ fontSize: '13px' }}>Browse the catalog and install skills to extend Claude's capabilities.</p>
              <button style={{ ...styles.btn('primary'), marginTop: '12px' }} onClick={() => setActiveTab('catalog')}>
                📦 Browse Catalog
              </button>
            </div>
          ) : (
            <div style={styles.grid}>
              {installedSkills.map(skill => {
                const catalogEntry = SKILL_CATALOG.find(c => c.name === skill.name);
                const action = actionStates[skill.name] || 'idle';
                return (
                  <div key={skill.name} style={{ ...styles.card, borderColor: 'rgba(34,197,94,0.3)' }}>
                    <div style={styles.cardHeader}>
                      <span style={styles.cardIcon}>{catalogEntry?.icon || '🧩'}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h4 style={styles.cardName}>{skill.name}</h4>
                        <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '2px' }}>{skill.dir}</div>
                      </div>
                    </div>
                    <p style={styles.cardDesc}>{skill.description || catalogEntry?.description || 'No description available'}</p>
                    <div style={styles.cardActions}>
                      <button style={styles.btn('ghost')} onClick={() => readSkillContent(skill.name)} disabled={action !== 'idle'}>
                        {action === 'reading' ? <span style={styles.spinner} /> : '📖'} View Content
                      </button>
                      {onUseSkill && skill.hasContent && (
                        <button style={styles.btn('secondary')} onClick={() => {
                          readSkillContent(skill.name);
                        }}>
                          💬 Use in Chat
                        </button>
                      )}
                      <button style={styles.btn('danger')} onClick={() => uninstallSkill(skill.name)} disabled={action !== 'idle'}>
                        {action === 'uninstalling' ? <span style={styles.spinner} /> : '🗑️'} Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ═══ CUSTOM SKILLS TAB ═══ */}
      {activeTab === 'custom' && (
        <div style={styles.customSection}>
          <h3 style={{ margin: '0 0 8px', fontSize: '16px', color: 'var(--foreground)' }}>📁 Install Custom Skill File</h3>
          <p style={{ fontSize: '13px', color: 'var(--muted-foreground)', marginBottom: '20px' }}>
            Upload a <code>.skill</code> file (ZIP archive containing SKILL.md and optional reference files) to install a custom skill that's not in the catalog.
            For example, the <strong>salesforce-content_v2.skill</strong> from Google Drive.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--foreground)', display: 'block', marginBottom: '4px' }}>Skill Name</label>
              <input
                ref={undefined}
                style={styles.inputField}
                placeholder="e.g., salesforce-content"
                value={customSkillName}
                onChange={e => setCustomSkillName(e.target.value)}
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--foreground)', display: 'block', marginBottom: '4px' }}>Skill File (.skill or .zip)</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".skill,.zip"
                style={styles.fileInput}
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setCustomFile(file);
                    if (!customSkillName) {
                      // Auto-fill name from filename
                      const name = file.name.replace(/\.(skill|zip)$/i, '').replace(/_v\d+$/i, '');
                      setCustomSkillName(name);
                    }
                  }
                }}
              />
            </div>
            <button
              style={{ ...styles.btn('primary'), padding: '10px 20px', fontSize: '14px', opacity: customInstalling || !customFile || !customSkillName ? 0.6 : 1 }}
              onClick={installCustomSkill}
              disabled={customInstalling || !customFile || !customSkillName.trim()}
            >
              {customInstalling ? <><span style={styles.spinner} /> Installing...</> : '📥 Install Custom Skill'}
            </button>
          </div>

          <div style={{ marginTop: '24px', padding: '16px', background: 'var(--secondary)', borderRadius: '8px', fontSize: '12px', color: 'var(--muted-foreground)' }}>
            <strong style={{ color: 'var(--foreground)' }}>How custom skills work:</strong>
            <ul style={{ margin: '8px 0 0', paddingLeft: '20px', lineHeight: 1.8 }}>
              <li>The .skill file is a ZIP archive containing a <code>SKILL.md</code> and optional <code>references/</code> folder</li>
              <li>It gets extracted to <code>~/.claude/skills/&lt;name&gt;/</code> on your devserver</li>
              <li>Claude Code automatically reads these skills during conversations</li>
              <li>You can share .skill files with teammates for consistent AI behavior</li>
            </ul>
          </div>
        </div>
      )}

      {/* ═══ SKILL CONTENT MODAL ═══ */}
      {selectedSkillContent && (
        <div style={styles.overlay} onClick={() => setSelectedSkillContent(null)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--foreground)' }}>
                📖 {selectedSkillContent.name}
              </h3>
              <button style={{ ...styles.btn('ghost'), fontSize: '18px' }} onClick={() => setSelectedSkillContent(null)}>✕</button>
            </div>
            {selectedSkillContent.references.length > 0 && (
              <div style={{ marginBottom: '12px', fontSize: '12px', color: 'var(--muted-foreground)' }}>
                📎 References: {selectedSkillContent.references.join(', ')}
              </div>
            )}
            <pre style={styles.codeBlock}>{selectedSkillContent.content}</pre>
            <div style={{ marginTop: '16px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button style={styles.btn('secondary')} onClick={() => {
                navigator.clipboard.writeText(selectedSkillContent.content);
                showToast('📋 Copied to clipboard');
              }}>
                📋 Copy
              </button>
              {onUseSkill && (
                <button style={styles.btn('primary')} onClick={() => {
                  onUseSkill(selectedSkillContent.name, selectedSkillContent.content);
                  setSelectedSkillContent(null);
                  showToast(`💬 Using ${selectedSkillContent.name} in chat`);
                }}>
                  💬 Use in Chat
                </button>
              )}
              <button style={styles.btn('ghost')} onClick={() => setSelectedSkillContent(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ TOAST ═══ */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '24px', right: '24px', padding: '12px 20px',
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px',
          fontSize: '13px', color: 'var(--foreground)', boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          zIndex: 2000, animation: 'slideUp 0.3s ease-out',
        }}>
          {toast}
        </div>
      )}
      <style>{`@keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
    </div>
  );
}

export default ClaudeSkillsManager;
