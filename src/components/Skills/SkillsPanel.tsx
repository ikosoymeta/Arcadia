import { useState, useEffect, useCallback, useRef } from 'react';
import type { Skill } from '../../types';
import { storage } from '../../services/storage';
import ScheduleSkillDialog from './ScheduleSkillDialog';
import { ClaudeSkillsManager } from './ClaudeSkillsManager';
import type { SkillSchedule } from './ScheduleSkillDialog';
import { getSchedules, saveSchedule, deleteSchedule, toggleSchedule, getScheduleLabel, formatNextRun, startScheduleEngine, getRunHistory } from '../../services/scheduler';
import type { ScheduleRunEntry } from '../../services/scheduler';

// ─── Emoji icons for skill categories ─────────────────────────────────────────
const CATEGORY_ICONS: Record<string, string> = {
  'Writing': '✍️',
  'Code': '💻',
  'Research': '🔍',
  'Data': '📊',
  'Communication': '💬',
  'Productivity': '⚡',
  'Creative': '🎨',
  'Custom': '🧩',
};

const EMOJI_PICKER = [
  '✍️', '💻', '🔍', '📊', '💬', '⚡', '🎨', '🧩',
  '📝', '📧', '📋', '🎯', '🧠', '💡', '🔧', '📦',
  '🚀', '🛡️', '📖', '🎓', '🏗️', '🔬', '📐', '🎭',
  '🤖', '📱', '🌐', '💼', '🗂️', '📈', '🔑', '✅',
];

const CATEGORIES = ['All', 'Writing', 'Code', 'Research', 'Data', 'Communication', 'Productivity', 'Creative', 'Custom'];

// ─── Sample skills (friendly, non-technical) ─────────────────────────────────
const SAMPLE_SKILLS: Skill[] = [
  {
    id: 'sk-1',
    name: 'Meeting Notes Cleanup',
    description: 'Turn messy meeting notes into a clean summary with action items, decisions, and next steps.',
    prompt: 'Clean up these meeting notes and organize them into sections: Summary, Key Decisions, Action Items (with owners), and Next Steps.\n\nMeeting notes:\n[PASTE YOUR NOTES HERE]',
    category: 'Productivity',
    tags: ['meetings', 'notes', 'summary'],
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now(),
    createdBy: 'ArcadIA',
    usageCount: 24,
    isPublic: true,
  },
  {
    id: 'sk-2',
    name: 'Professional Email Writer',
    description: 'Draft a polished professional email from a rough idea or bullet points.',
    prompt: 'Write a professional email based on these details:\n\nTo: [RECIPIENT]\nPurpose: [WHAT YOU WANT TO SAY]\nTone: [formal/friendly/urgent]\n\nMake it clear, concise, and professional.',
    category: 'Communication',
    tags: ['email', 'writing', 'professional'],
    createdAt: Date.now() - 172800000,
    updatedAt: Date.now(),
    createdBy: 'ArcadIA',
    usageCount: 31,
    isPublic: true,
  },
  {
    id: 'sk-3',
    name: 'Data Explainer',
    description: 'Explain data or numbers in plain English — great for reports and presentations.',
    prompt: 'Explain the following data in plain English. Highlight the key takeaways, trends, and anything surprising. Write it so anyone can understand.\n\nData:\n[PASTE DATA OR NUMBERS HERE]',
    category: 'Data',
    tags: ['data', 'analysis', 'explain'],
    createdAt: Date.now() - 259200000,
    updatedAt: Date.now(),
    createdBy: 'ArcadIA',
    usageCount: 15,
    isPublic: true,
  },
  {
    id: 'sk-4',
    name: 'Research Summary',
    description: 'Summarize a topic into key points with pros, cons, and recommendations.',
    prompt: 'Research and summarize the following topic. Include:\n1. Overview (2-3 sentences)\n2. Key points\n3. Pros and cons\n4. Your recommendation\n\nTopic: [YOUR TOPIC]',
    category: 'Research',
    tags: ['research', 'summary', 'analysis'],
    createdAt: Date.now() - 345600000,
    updatedAt: Date.now(),
    createdBy: 'ArcadIA',
    usageCount: 19,
    isPublic: true,
  },
  {
    id: 'sk-5',
    name: 'Writing Improver',
    description: 'Make any text clearer, more engaging, and better structured.',
    prompt: 'Improve the following text. Make it:\n- Clearer and easier to read\n- More engaging\n- Better structured\n- Free of grammar issues\n\nKeep the original meaning and tone.\n\nText:\n[PASTE YOUR TEXT HERE]',
    category: 'Writing',
    tags: ['writing', 'editing', 'improve'],
    createdAt: Date.now() - 432000000,
    updatedAt: Date.now(),
    createdBy: 'ArcadIA',
    usageCount: 42,
    isPublic: true,
  },
  {
    id: 'sk-6',
    name: 'Code Explainer',
    description: 'Explain what a piece of code does in simple terms anyone can understand.',
    prompt: 'Explain this code in simple terms. Assume I\'m not a programmer. Tell me:\n1. What it does (in one sentence)\n2. How it works (step by step, in plain English)\n3. When you\'d use it\n\nCode:\n[PASTE CODE HERE]',
    category: 'Code',
    tags: ['code', 'explain', 'learning'],
    createdAt: Date.now() - 518400000,
    updatedAt: Date.now(),
    createdBy: 'ArcadIA',
    usageCount: 28,
    isPublic: true,
  },
];

// ─── Share encoding/decoding ──────────────────────────────────────────────────
function encodeSkillForShare(skill: Skill): string {
  const shareData = {
    n: skill.name,
    d: skill.description,
    p: skill.prompt,
    c: skill.category,
    t: skill.tags,
    i: skill.icon || '',
  };
  return btoa(encodeURIComponent(JSON.stringify(shareData)));
}

function decodeSkillFromShare(encoded: string): Partial<Skill> | null {
  try {
    const json = decodeURIComponent(atob(encoded));
    const data = JSON.parse(json);
    return {
      name: data.n || '',
      description: data.d || '',
      prompt: data.p || '',
      category: data.c || 'Custom',
      tags: data.t || [],
      icon: data.i || undefined,
    };
  } catch {
    return null;
  }
}

// ─── Alias for clarity ────────────────────────────────────────────────────────
type SkillWithIcon = Skill;

// ─── Wizard Steps ─────────────────────────────────────────────────────────────
type WizardStep = 'basics' | 'prompt' | 'customize' | 'preview';

const WIZARD_STEPS: { id: WizardStep; label: string; icon: string }[] = [
  { id: 'basics', label: 'Name & Description', icon: '1' },
  { id: 'prompt', label: 'Instructions', icon: '2' },
  { id: 'customize', label: 'Customize', icon: '3' },
  { id: 'preview', label: 'Preview & Save', icon: '4' },
];

// ─── Prompt Templates ─────────────────────────────────────────────────────────
const PROMPT_TEMPLATES = [
  { label: 'Start from scratch', icon: '📝', prompt: '' },
  { label: 'Summarize something', icon: '📋', prompt: 'Summarize the following in a clear, structured way:\n\n[PASTE CONTENT HERE]' },
  { label: 'Write or improve text', icon: '✍️', prompt: 'Help me write/improve the following:\n\nPurpose: [WHAT IT\'S FOR]\nTone: [formal/casual/friendly]\n\nContent:\n[PASTE OR DESCRIBE WHAT YOU NEED]' },
  { label: 'Analyze data or info', icon: '📊', prompt: 'Analyze the following and give me key insights:\n\n[PASTE DATA OR INFORMATION HERE]\n\nFocus on: [WHAT YOU WANT TO KNOW]' },
  { label: 'Answer questions about a topic', icon: '🎓', prompt: 'You are an expert on [TOPIC]. Answer questions about it in a clear, helpful way. Use examples when possible.\n\nQuestion: [ASK YOUR QUESTION]' },
  { label: 'Step-by-step guide', icon: '🗺️', prompt: 'Create a step-by-step guide for:\n\n[WHAT YOU WANT TO DO]\n\nMake each step clear and actionable. Include tips for common mistakes.' },
];

export function SkillsPanel() {
  // ─── State ──────────────────────────────────────────────────────────────────
  const [skills, setSkills] = useState<SkillWithIcon[]>(() => {
    const saved = storage.getSkills() as SkillWithIcon[];
    return saved.length > 0 ? saved : SAMPLE_SKILLS;
  });
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [activeTab, setActiveTab] = useState<'all' | 'mine' | 'community' | 'claude-skills'>('all');
  const [selectedSkill, setSelectedSkill] = useState<SkillWithIcon | null>(null);
  const [editingSkill, setEditingSkill] = useState<SkillWithIcon | null>(null);

  // Wizard state
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>('basics');
  const [draft, setDraft] = useState({
    name: '',
    description: '',
    prompt: '',
    category: 'Custom',
    tags: '',
    icon: '🧩',
  });

  // Share state
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [shareSkill, setShareSkill] = useState<SkillWithIcon | null>(null);
  const [shareCode, setShareCode] = useState('');
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importCode, setImportCode] = useState('');
  const [importError, setImportError] = useState('');
  const [importPreview, setImportPreview] = useState<Partial<Skill> | null>(null);
  const [copiedShare, setCopiedShare] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const toastTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Schedule state
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [scheduleSkill, setScheduleSkill] = useState<SkillWithIcon | null>(null);
  const [schedules, setSchedules] = useState<SkillSchedule[]>(getSchedules);
  const [runHistory, setRunHistory] = useState<ScheduleRunEntry[]>(getRunHistory);
  const [showScheduleTab, setShowScheduleTab] = useState(false);

  // Start scheduler engine
  useEffect(() => {
    startScheduleEngine();
    const handleChange = () => { setSchedules(getSchedules()); };
    const handleRun = () => { setRunHistory(getRunHistory()); };
    document.addEventListener('arcadia:schedules-changed', handleChange);
    document.addEventListener('arcadia:schedule-run', handleRun);
    return () => {
      document.removeEventListener('arcadia:schedules-changed', handleChange);
      document.removeEventListener('arcadia:schedule-run', handleRun);
    };
  }, []);

  // Onboarding state — dismissable, remembered in localStorage
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return localStorage.getItem('arcadia-skills-onboarding-dismissed') !== 'true';
  });
  const dismissOnboarding = () => {
    setShowOnboarding(false);
    localStorage.setItem('arcadia-skills-onboarding-dismissed', 'true');
  };

  // ─── Persistence ────────────────────────────────────────────────────────────
  useEffect(() => { storage.saveSkills(skills); }, [skills]);

  // ─── Toast helper ───────────────────────────────────────────────────────────
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    toastTimeout.current = setTimeout(() => setToast(null), 3000);
  }, []);

  // ─── Filtering ──────────────────────────────────────────────────────────────
  const filtered = skills.filter(s => {
    const matchesSearch = !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.description.toLowerCase().includes(search.toLowerCase()) || s.tags.some(t => t.toLowerCase().includes(search.toLowerCase()));
    const matchesCategory = activeCategory === 'All' || s.category === activeCategory;
    const matchesTab = activeTab === 'all' || (activeTab === 'mine' && s.createdBy === 'You') || (activeTab === 'community' && s.createdBy !== 'You');
    return matchesSearch && matchesCategory && matchesTab;
  });

  // ─── Wizard handlers ───────────────────────────────────────────────────────
  const openWizard = (existingSkill?: SkillWithIcon) => {
    if (existingSkill) {
      setEditingSkill(existingSkill);
      setDraft({
        name: existingSkill.name,
        description: existingSkill.description,
        prompt: existingSkill.prompt,
        category: existingSkill.category,
        tags: existingSkill.tags.join(', '),
        icon: existingSkill.icon || CATEGORY_ICONS[existingSkill.category] || '🧩',
      });
    } else {
      setEditingSkill(null);
      setDraft({ name: '', description: '', prompt: '', category: 'Custom', tags: '', icon: '🧩' });
    }
    setWizardStep('basics');
    setShowWizard(true);
  };

  const closeWizard = () => {
    setShowWizard(false);
    setEditingSkill(null);
  };

  const saveSkill = () => {
    if (!draft.name.trim() || !draft.prompt.trim()) return;

    if (editingSkill) {
      setSkills(prev => prev.map(s => s.id === editingSkill.id ? {
        ...s,
        name: draft.name.trim(),
        description: draft.description.trim(),
        prompt: draft.prompt.trim(),
        category: draft.category,
        tags: draft.tags.split(',').map(t => t.trim()).filter(Boolean),
        icon: draft.icon,
        updatedAt: Date.now(),
      } : s));
      // Notify SecondBrainPanel about the update
      document.dispatchEvent(new CustomEvent('arcadia:skill-changed'));
      showToast('Skill updated! Slash command updated in Second Brain.');
    } else {
      const newSkill: SkillWithIcon = {
        id: 'sk-' + crypto.randomUUID().slice(0, 8),
        name: draft.name.trim(),
        description: draft.description.trim(),
        prompt: draft.prompt.trim(),
        category: draft.category,
        tags: draft.tags.split(',').map(t => t.trim()).filter(Boolean),
        icon: draft.icon,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdBy: 'You',
        usageCount: 0,
        isPublic: false,
      };
      setSkills(prev => [newSkill, ...prev]);
      // Dispatch event so SecondBrainPanel picks up the new skill as a slash command
      document.dispatchEvent(new CustomEvent('arcadia:skill-changed', { detail: newSkill }));
      showToast('Skill created! It\'s now available as a slash command in Second Brain.');
    }
    closeWizard();
  };

  const deleteSkill = (id: string) => {
    setSkills(prev => prev.filter(s => s.id !== id));
    if (selectedSkill?.id === id) setSelectedSkill(null);
    document.dispatchEvent(new CustomEvent('arcadia:skill-changed'));
    showToast('Skill deleted');
  };

  const useSkill = (skill: SkillWithIcon) => {
    navigator.clipboard.writeText(skill.prompt);
    setSkills(prev => prev.map(s => s.id === skill.id ? { ...s, usageCount: s.usageCount + 1 } : s));
    showToast('Prompt copied to clipboard! Paste it in any chat.');
  };

  // ─── Share handlers ─────────────────────────────────────────────────────────
  const openShare = (skill: SkillWithIcon) => {
    setShareSkill(skill);
    setShareCode(encodeSkillForShare(skill));
    setCopiedShare(false);
    setShowShareDialog(true);
  };

  const copyShareCode = () => {
    navigator.clipboard.writeText(shareCode);
    setCopiedShare(true);
    setTimeout(() => setCopiedShare(false), 2000);
  };

  const copyShareUrl = () => {
    const url = `${window.location.origin}${window.location.pathname}#import-skill=${shareCode}`;
    navigator.clipboard.writeText(url);
    showToast('Share link copied!');
  };

  // ─── Import handlers ────────────────────────────────────────────────────────
  const openImport = () => {
    setImportCode('');
    setImportError('');
    setImportPreview(null);
    setShowImportDialog(true);
  };

  const handleImportCodeChange = (code: string) => {
    setImportCode(code);
    setImportError('');
    setImportPreview(null);

    // Try to extract code from URL
    let rawCode = code.trim();
    const urlMatch = rawCode.match(/#import-skill=(.+)$/);
    if (urlMatch) rawCode = urlMatch[1];

    if (rawCode.length > 10) {
      const decoded = decodeSkillFromShare(rawCode);
      if (decoded && decoded.name) {
        setImportPreview(decoded);
      } else {
        setImportError('This doesn\'t look like a valid skill code. Ask the person who shared it to send it again.');
      }
    }
  };

  const confirmImport = () => {
    if (!importPreview) return;
    const newSkill: SkillWithIcon = {
      id: 'sk-' + crypto.randomUUID().slice(0, 8),
      name: importPreview.name || 'Imported Skill',
      description: importPreview.description || '',
      prompt: importPreview.prompt || '',
      category: importPreview.category || 'Custom',
      tags: importPreview.tags || [],
      icon: (importPreview as any).icon || '🧩',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdBy: 'You',
      usageCount: 0,
      isPublic: false,
    };
    setSkills(prev => [newSkill, ...prev]);
    setShowImportDialog(false);
    showToast(`"${newSkill.name}" imported! Find it in My Skills.`);
  };

  // ─── Check for import link on mount ─────────────────────────────────────────
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#import-skill=')) {
      const code = hash.replace('#import-skill=', '');
      const decoded = decodeSkillFromShare(code);
      if (decoded && decoded.name) {
        setImportCode(code);
        setImportPreview(decoded);
        setShowImportDialog(true);
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    }
  }, []);

  // ─── Wizard step validation ─────────────────────────────────────────────────
  const canAdvance = (step: WizardStep): boolean => {
    switch (step) {
      case 'basics': return draft.name.trim().length > 0;
      case 'prompt': return draft.prompt.trim().length > 0;
      case 'customize': return true;
      case 'preview': return draft.name.trim().length > 0 && draft.prompt.trim().length > 0;
      default: return false;
    }
  };

  const nextStep = () => {
    const idx = WIZARD_STEPS.findIndex(s => s.id === wizardStep);
    if (idx < WIZARD_STEPS.length - 1) setWizardStep(WIZARD_STEPS[idx + 1].id);
  };

  const prevStep = () => {
    const idx = WIZARD_STEPS.findIndex(s => s.id === wizardStep);
    if (idx > 0) setWizardStep(WIZARD_STEPS[idx - 1].id);
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', padding: '24px 24px 80px', height: '100vh', overflow: 'auto' }}>
      {/* Toast notification */}
      {toast && (
        <div style={{
          position: 'fixed', top: '20px', right: '20px', zIndex: 10000,
          padding: '12px 20px', background: 'var(--accent)', color: 'white',
          borderRadius: '10px', fontSize: '13px', fontWeight: 500,
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)', animation: 'slideInRight 0.3s ease',
        }}>
          {toast}
        </div>
      )}

      {/* ─── Header ──────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <span style={{ fontSize: '24px' }}>🧠</span>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Second Brain Skills</h1>
        </div>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
          Your brain is great at having ideas — but terrible at remembering everything. Skills are the specific things your Second Brain can do for you.
        </p>
      </div>

      {/* ─── Onboarding / Explainer ─────────────────────────────────────── */}
      {showOnboarding && (
        <div style={{
          marginBottom: '24px', padding: '24px', background: 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(139,92,246,0.06) 100%)',
          border: '1px solid rgba(99,102,241,0.2)', borderRadius: '14px', position: 'relative',
        }}>
          <button
            onClick={dismissOnboarding}
            style={{
              position: 'absolute', top: '12px', right: '12px', background: 'none',
              border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '16px',
              padding: '4px 8px', borderRadius: '6px',
            }}
            title="Dismiss"
          >
            ✕
          </button>

          {/* The Analogy */}
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
            💡 What is a "Second Brain"?
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 16px', maxWidth: '640px' }}>
            Imagine you hired a super-organized personal assistant. Instead of relying on your memory for meeting notes, project ideas, and useful links,
            your Second Brain <strong style={{ color: 'var(--text-primary)' }}>remembers everything and finds it instantly</strong> when you need it.
          </p>

          {/* Core capabilities */}
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '10px' }}>
            Your Second Brain can:
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px', marginBottom: '20px' }}>
            {[
              { icon: '📝', title: 'Capture', text: 'Save notes, articles, and ideas so you never lose them' },
              { icon: '📂', title: 'Organize', text: 'Sort everything into categories that actually make sense' },
              { icon: '🔍', title: 'Retrieve', text: 'Find that thing you saved 3 months ago in seconds' },
              { icon: '🧩', title: 'Connect', text: 'Spot patterns between your ideas you might have missed' },
            ].map((cap, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '12px 14px',
                background: 'var(--bg-secondary)', borderRadius: '10px', border: '1px solid var(--border)',
              }}>
                <span style={{ fontSize: '18px', flexShrink: 0, marginTop: '1px' }}>{cap.icon}</span>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '2px' }}>{cap.title}</div>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{cap.text}</span>
                </div>
              </div>
            ))}
          </div>

          {/* AI Skills table */}
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '10px' }}>
            With AI, your Second Brain gains these skills:
          </div>
          <div style={{
            marginBottom: '20px', borderRadius: '10px', overflow: 'hidden',
            border: '1px solid var(--border)', background: 'var(--bg-secondary)',
          }}>
            {[
              { skill: '🧠 Memory', desc: 'Remembers your preferences, past conversations, and context' },
              { skill: '📝 Summarization', desc: 'Condenses long documents into key takeaways' },
              { skill: '📂 Organization', desc: 'Helps structure your thoughts and notes' },
              { skill: '🔍 Research', desc: 'Digs through information and brings back what\'s relevant' },
              { skill: '💬 Retrieval', desc: 'Ask "what did we discuss about X?" and get an answer' },
            ].map((row, i) => (
              <div key={i} style={{
                display: 'flex', gap: '12px', padding: '10px 14px',
                borderBottom: i < 4 ? '1px solid var(--border)' : 'none',
                alignItems: 'center',
              }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', minWidth: '140px', flexShrink: 0 }}>{row.skill}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{row.desc}</div>
              </div>
            ))}
          </div>

          {/* Bottom line */}
          <div style={{
            padding: '12px 16px', background: 'rgba(99,102,241,0.06)', borderRadius: '10px',
            border: '1px solid rgba(99,102,241,0.12)', marginBottom: '16px',
          }}>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>
              <strong style={{ color: 'var(--text-primary)' }}>The bottom line:</strong> A Second Brain isn't about replacing your thinking —
              it's about <strong style={{ color: 'var(--text-primary)' }}>never losing a good idea again</strong>. It's like going from sticky notes scattered everywhere…
              to having a brilliant librarian who knows exactly where everything is.
            </p>
          </div>

          {/* CTA */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => openWizard()}
              style={{
                padding: '10px 20px', background: 'var(--accent)', color: 'white',
                border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '13px',
                fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px',
              }}
            >
              ✨ Create My First Skill
            </button>
            <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
              or browse the library below to try one
            </span>
          </div>
        </div>
      )}

      {/* ─── Collapsed onboarding hint (after dismissal, if no custom skills yet) */}
      {!showOnboarding && skills.filter(s => s.createdBy === 'You').length === 0 && (
        <div style={{
          marginBottom: '16px', padding: '10px 16px', background: 'var(--bg-secondary)',
          border: '1px solid var(--border)', borderRadius: '10px',
          display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            💡 <strong style={{ color: 'var(--text-primary)' }}>Tip:</strong> Skills are reusable prompts that save you time — like recipes for your Second Brain.
            <button
              onClick={() => setShowOnboarding(true)}
              style={{
                background: 'none', border: 'none', color: 'var(--accent)',
                cursor: 'pointer', fontSize: '13px', textDecoration: 'underline', padding: '0 4px',
              }}
            >
              Learn more
            </button>
          </span>
          <button
            onClick={() => openWizard()}
            style={{
              padding: '6px 14px', background: 'var(--accent)', color: 'white',
              border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '12px',
              fontWeight: 600, whiteSpace: 'nowrap',
            }}
          >
            + Create Skill
          </button>
        </div>
      )}

      {/* ─── Action Bar ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <input
          style={{
            flex: 1, minWidth: '200px', padding: '10px 14px',
            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            borderRadius: '10px', color: 'var(--text-primary)', fontSize: '13px', outline: 'none',
          }}
          placeholder="Search skills..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button
          onClick={() => openWizard()}
          style={{
            padding: '10px 20px', background: 'var(--accent)', color: 'white',
            border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '13px',
            fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px',
            transition: 'all 0.15s',
          }}
        >
          <span style={{ fontSize: '16px' }}>+</span> Create Skill
        </button>
        <button
          onClick={openImport}
          style={{
            padding: '10px 16px', background: 'var(--bg-secondary)', color: 'var(--text-secondary)',
            border: '1px solid var(--border)', borderRadius: '10px', cursor: 'pointer',
            fontSize: '13px', fontWeight: 500, transition: 'all 0.15s',
          }}
        >
          Import
        </button>
        <button
          onClick={() => setShowScheduleTab(true)}
          style={{
            padding: '10px 16px', background: schedules.length > 0 ? 'rgba(245,158,11,0.1)' : 'var(--bg-secondary)',
            color: schedules.length > 0 ? '#f59e0b' : 'var(--text-secondary)',
            border: `1px solid ${schedules.length > 0 ? 'rgba(245,158,11,0.25)' : 'var(--border)'}`,
            borderRadius: '10px', cursor: 'pointer',
            fontSize: '13px', fontWeight: 500, transition: 'all 0.15s',
            display: 'flex', alignItems: 'center', gap: '6px',
          }}
        >
          ⏰ Scheduled{schedules.length > 0 && ` (${schedules.filter(s => s.enabled).length})`}
        </button>
      </div>

      {/* ─── Tabs ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '0', marginBottom: '16px', borderBottom: '1px solid var(--border)' }}>
        {([
          { id: 'all' as const, label: 'All Skills', count: skills.length },
          { id: 'mine' as const, label: 'My Skills', count: skills.filter(s => s.createdBy === 'You').length },
          { id: 'community' as const, label: 'Library', count: skills.filter(s => s.createdBy !== 'You').length },
          { id: 'claude-skills' as const, label: '🧩 Claude Skills', count: null },
        ]).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 18px', background: 'none', border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
              color: activeTab === tab.id ? 'var(--accent)' : 'var(--text-secondary)',
              fontSize: '13px', fontWeight: activeTab === tab.id ? 600 : 400,
              cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            {tab.label} {tab.count !== null && <span style={{ opacity: 0.6, fontSize: '11px' }}>({tab.count})</span>}
          </button>
        ))}
      </div>

      {/* ─── Claude Skills Manager (full-page replacement) ─────────────── */}
      {activeTab === 'claude-skills' && (
        <ClaudeSkillsManager />
      )}

      {/* ─── Category Filter ─────────────────────────────────────────────── */}
      {activeTab !== 'claude-skills' && <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            style={{
              padding: '6px 14px',
              background: cat === activeCategory ? 'var(--accent-dim)' : 'var(--bg-secondary)',
              color: cat === activeCategory ? 'var(--accent)' : 'var(--text-secondary)',
              border: '1px solid ' + (cat === activeCategory ? 'var(--accent)' : 'var(--border)'),
              borderRadius: '20px', cursor: 'pointer', fontSize: '12px',
              transition: 'all 0.15s',
            }}
          >
            {cat !== 'All' && <span style={{ marginRight: '4px' }}>{CATEGORY_ICONS[cat] || ''}</span>}
            {cat}
          </button>
        ))}
      </div>}

       {/* ─── Library intro hint ─────────────────────────────────────────── */}
      {activeTab === 'community' && (
        <div style={{
          marginBottom: '14px', padding: '10px 14px', background: 'var(--bg-secondary)',
          borderRadius: '10px', border: '1px solid var(--border)',
          fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6,
        }}>
          📚 These are ready-to-use skills built by the ArcadIA team. Click any card to see what it does, then <strong style={{ color: 'var(--text-primary)' }}>Duplicate & Edit</strong> to make it your own.
        </div>
      )}

      {/* ─── Skills Grid ─────────────────────────────────────────────── */}
      {activeTab !== 'claude-skills' && (filtered.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '60px 20px', color: 'var(--text-tertiary)',
        }}>
          {activeTab === 'mine' ? (
            <>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>✨</div>
              <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>You haven't created any skills yet</div>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: '400px', margin: '0 auto 20px' }}>
                Skills let you save your best prompts and reuse them instantly.
                Think of something you ask Claude to do often — that's a great first skill.
              </p>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button
                  onClick={() => openWizard()}
                  style={{
                    padding: '10px 20px', background: 'var(--accent)', color: 'white',
                    border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
                  }}
                >
                  + Create My First Skill
                </button>
                <button
                  onClick={() => setActiveTab('community')}
                  style={{
                    padding: '10px 20px', background: 'var(--bg-secondary)', color: 'var(--text-secondary)',
                    border: '1px solid var(--border)', borderRadius: '10px', cursor: 'pointer', fontSize: '13px',
                  }}
                >
                  Browse Library
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>🔍</div>
              <div style={{ fontSize: '15px', fontWeight: 500, marginBottom: '6px' }}>No skills found</div>
              <div style={{ fontSize: '13px' }}>Try a different search or category.</div>
            </>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
          {filtered.map(skill => (
            <div
              key={skill.id}
              onClick={() => setSelectedSkill(selectedSkill?.id === skill.id ? null : skill)}
              style={{
                padding: '16px', background: 'var(--bg-secondary)',
                border: '1px solid ' + (selectedSkill?.id === skill.id ? 'var(--accent)' : 'var(--border)'),
                borderRadius: '12px', cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <span style={{ fontSize: '20px' }}>{(skill as SkillWithIcon).icon || CATEGORY_ICONS[skill.category] || '🧩'}</span>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>{skill.name}</div>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '10px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any, overflow: 'hidden' }}>
                {skill.description}
              </div>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
                {skill.tags.slice(0, 3).map(t => (
                  <span key={t} style={{ padding: '2px 8px', background: 'var(--bg-hover)', borderRadius: '10px', fontSize: '10px', color: 'var(--text-secondary)' }}>{t}</span>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--text-tertiary)' }}>
                <span>Used {skill.usageCount}x</span>
                <span style={{ padding: '2px 8px', background: skill.createdBy === 'You' ? 'rgba(99,102,241,0.1)' : 'var(--bg-hover)', borderRadius: '8px', color: skill.createdBy === 'You' ? 'var(--accent)' : 'var(--text-tertiary)' }}>
                  {skill.createdBy === 'You' ? 'My Skill' : skill.createdBy}
                </span>
              </div>
            </div>
          ))}        </div>
      ))}

          {/* ─── Selected Skill Detail (Overlay) ───────────────────────── */}
      {selectedSkill && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedSkill(null); }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 8000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
          }}
        >
        <div style={{
          padding: '24px', background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          borderRadius: '16px', maxWidth: '560px', width: '100%', maxHeight: '80vh', overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '24px' }}>{(selectedSkill as SkillWithIcon).icon || CATEGORY_ICONS[selectedSkill.category] || '🧩'}</span>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>{selectedSkill.name}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>by {selectedSkill.createdBy} · Used {selectedSkill.usageCount} times</div>
              </div>
            </div>
            <button
              onClick={() => setSelectedSkill(null)}
              style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '18px', padding: '4px 8px' }}
            >
              ✕
            </button>
          </div>

          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: 1.5 }}>
            {selectedSkill.description}
          </div>

          <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '6px' }}>
            What Claude will do:
          </div>
          <pre style={{
            padding: '14px', background: 'var(--bg-primary)', border: '1px solid var(--border)',
            borderRadius: '10px', fontSize: '12px', color: 'var(--text-primary)',
            whiteSpace: 'pre-wrap', lineHeight: 1.6, marginBottom: '16px', fontFamily: 'inherit',
          }}>
            {selectedSkill.prompt}
          </pre>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={() => useSkill(selectedSkill)}
              style={{
                padding: '10px 20px', background: 'var(--accent)', color: 'white',
                border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '13px',
                fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px',
              }}
            >
              📋 Copy Prompt
            </button>
            <button
              onClick={() => {
                // Navigate to Second Brain and test this skill
                const slugName = selectedSkill.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
                const cmd = `/skill-${slugName}`;
                document.dispatchEvent(new CustomEvent('arcadia:skill-test', { detail: { command: cmd, prompt: selectedSkill.prompt, name: selectedSkill.name, icon: (selectedSkill as SkillWithIcon).icon || '🧩' } }));
                document.dispatchEvent(new CustomEvent('arcadia:navigate', { detail: 'secondbrain' }));
                setSelectedSkill(null);
              }}
              style={{
                padding: '10px 20px', background: '#22c55e', color: 'white',
                border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '13px',
                fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px',
              }}
            >
              🧪 Test in Second Brain
            </button>
            <button
              onClick={() => openShare(selectedSkill)}
              style={{
                padding: '10px 16px', background: 'var(--bg-primary)', color: 'var(--text-secondary)',
                border: '1px solid var(--border)', borderRadius: '10px', cursor: 'pointer',
                fontSize: '13px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px',
              }}
            >
              🔗 Share
            </button>
            <button
              onClick={() => {
                setScheduleSkill(selectedSkill);
                setShowScheduleDialog(true);
              }}
              style={{
                padding: '10px 16px', background: 'rgba(245,158,11,0.1)', color: '#f59e0b',
                border: '1px solid rgba(245,158,11,0.25)', borderRadius: '10px', cursor: 'pointer',
                fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px',
              }}
            >
              ⏰ Schedule
            </button>
            {selectedSkill.createdBy === 'You' && (
              <>
                <button
                  onClick={() => openWizard(selectedSkill)}
                  style={{
                    padding: '10px 16px', background: 'var(--bg-primary)', color: 'var(--text-secondary)',
                    border: '1px solid var(--border)', borderRadius: '10px', cursor: 'pointer',
                    fontSize: '13px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px',
                  }}
                >
                  ✏️ Edit
                </button>
                <button
                  onClick={() => { if (confirm('Delete this skill? This cannot be undone.')) deleteSkill(selectedSkill.id); }}
                  style={{
                    padding: '10px 16px', background: 'rgba(239,68,68,0.08)', color: 'var(--error, #ef4444)',
                    border: '1px solid rgba(239,68,68,0.2)', borderRadius: '10px', cursor: 'pointer',
                    fontSize: '13px', fontWeight: 500,
                  }}
                >
                  Delete
                </button>
              </>
            )}
            {selectedSkill.createdBy !== 'You' && (
              <button
                onClick={() => {
                  const clone: SkillWithIcon = {
                    ...selectedSkill,
                    id: 'sk-' + crypto.randomUUID().slice(0, 8),
                    name: selectedSkill.name + ' (My Copy)',
                    createdBy: 'You',
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    usageCount: 0,
                    isPublic: false,
                  };
                  setSkills(prev => [clone, ...prev]);
                  showToast('Skill duplicated to My Skills — you can now customize it!');
                }}
                style={{
                  padding: '10px 16px', background: 'var(--bg-primary)', color: 'var(--text-secondary)',
                  border: '1px solid var(--border)', borderRadius: '10px', cursor: 'pointer',
                  fontSize: '13px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px',
                }}
              >
                📄 Duplicate & Edit
              </button>
            )}
          </div>
        </div>
        </div>
      )}

      {/* ─── Create/Edit Wizard Dialog ───────────────────────────────────── */}
      {showWizard && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
          }}
          onClick={e => { if (e.target === e.currentTarget) closeWizard(); }}
        >
          <div style={{
            background: 'var(--bg-primary)', borderRadius: '16px', width: '100%', maxWidth: '640px',
            maxHeight: '85vh', overflow: 'auto', border: '1px solid var(--border)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
          }}>
            {/* Wizard header */}
            <div style={{
              padding: '20px 24px 16px', borderBottom: '1px solid var(--border)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  {editingSkill ? 'Edit Skill' : 'Create a New Skill'}
                </h2>
                <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: '4px 0 0' }}>
                  {editingSkill ? 'Update your skill settings' : 'Build a reusable prompt in a few simple steps'}
                </p>
              </div>
              <button
                onClick={closeWizard}
                style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '20px', padding: '4px' }}
              >
                ✕
              </button>
            </div>

            {/* Step indicators */}
            <div style={{ display: 'flex', gap: '0', padding: '0 24px', borderBottom: '1px solid var(--border)' }}>
              {WIZARD_STEPS.map((step, i) => {
                const currentIdx = WIZARD_STEPS.findIndex(s => s.id === wizardStep);
                const isActive = step.id === wizardStep;
                const isDone = i < currentIdx;
                return (
                  <button
                    key={step.id}
                    onClick={() => { if (isDone || isActive) setWizardStep(step.id); }}
                    style={{
                      flex: 1, padding: '12px 8px', background: 'none', border: 'none',
                      borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                      color: isActive ? 'var(--accent)' : isDone ? 'var(--text-secondary)' : 'var(--text-tertiary)',
                      fontSize: '12px', fontWeight: isActive ? 600 : 400, cursor: isDone || isActive ? 'pointer' : 'default',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                      transition: 'all 0.15s', opacity: (!isDone && !isActive) ? 0.5 : 1,
                    }}
                  >
                    <span style={{
                      width: '20px', height: '20px', borderRadius: '50%', display: 'flex',
                      alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700,
                      background: isDone ? 'var(--accent)' : isActive ? 'var(--accent-dim)' : 'var(--bg-secondary)',
                      color: isDone ? 'white' : isActive ? 'var(--accent)' : 'var(--text-tertiary)',
                    }}>
                      {isDone ? '✓' : step.icon}
                    </span>
                    <span style={{ display: 'none' }}>{step.label}</span>
                    {step.label}
                  </button>
                );
              })}
            </div>

            {/* Step content */}
            <div style={{ padding: '24px' }}>
              {/* Step 1: Basics */}
              {wizardStep === 'basics' && (
                <div>
                  <div style={{
                    marginBottom: '20px', padding: '12px 16px', background: 'rgba(99,102,241,0.06)',
                    borderRadius: '10px', border: '1px solid rgba(99,102,241,0.12)',
                  }}>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      💡 <strong style={{ color: 'var(--text-primary)' }}>Think of a task you do often</strong> — like cleaning up notes, writing emails, or explaining data.
                      Give it a name and a short description so you can find it later.
                    </div>
                  </div>
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                      What should we call this skill? *
                    </label>
                    <input
                      value={draft.name}
                      onChange={e => setDraft(p => ({ ...p, name: e.target.value }))}
                      placeholder="e.g., Meeting Notes Cleanup, Email Drafter, Bug Report Writer"
                      style={{
                        width: '100%', padding: '12px 14px', background: 'var(--bg-secondary)',
                        border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--text-primary)',
                        fontSize: '14px', outline: 'none', boxSizing: 'border-box',
                      }}
                      autoFocus
                    />
                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                      Pick a short, descriptive name so you can find it later
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                      What does it do?
                    </label>
                    <textarea
                      value={draft.description}
                      onChange={e => setDraft(p => ({ ...p, description: e.target.value }))}
                      placeholder="Describe what this skill helps with in a sentence or two..."
                      rows={2}
                      style={{
                        width: '100%', padding: '12px 14px', background: 'var(--bg-secondary)',
                        border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--text-primary)',
                        fontSize: '13px', outline: 'none', resize: 'vertical', fontFamily: 'inherit',
                        boxSizing: 'border-box', lineHeight: 1.5,
                      }}
                    />
                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                      This helps you and others understand what the skill is for
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2: Prompt / Instructions */}
              {wizardStep === 'prompt' && (
                <div>
                  <div style={{
                    marginBottom: '16px', padding: '12px 16px', background: 'rgba(99,102,241,0.06)',
                    borderRadius: '10px', border: '1px solid rgba(99,102,241,0.12)',
                  }}>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      💡 <strong style={{ color: 'var(--text-primary)' }}>This is the heart of your skill.</strong> Write instructions like you'd explain the task to a helpful assistant.
                      For example: <em>"Summarize these meeting notes into key decisions and action items."</em>
                    </div>
                  </div>
                  {!draft.prompt && (
                    <div style={{ marginBottom: '20px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '10px' }}>
                        Pick a template to get started, or write your own:
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px' }}>
                        {PROMPT_TEMPLATES.map(tmpl => (
                          <button
                            key={tmpl.label}
                            onClick={() => setDraft(p => ({ ...p, prompt: tmpl.prompt }))}
                            style={{
                              padding: '12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                              borderRadius: '10px', cursor: 'pointer', textAlign: 'left',
                              transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '8px',
                            }}
                          >
                            <span style={{ fontSize: '18px' }}>{tmpl.icon}</span>
                            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{tmpl.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                      Instructions for Claude *
                    </label>
                    <textarea
                      value={draft.prompt}
                      onChange={e => setDraft(p => ({ ...p, prompt: e.target.value }))}
                      placeholder={'Write what you want Claude to do when this skill is used.\n\nTip: Use [BRACKETS] for parts the user fills in each time.\n\nExample:\n"Summarize the following text in 3 bullet points:\n[PASTE TEXT HERE]"'}
                      rows={8}
                      style={{
                        width: '100%', padding: '14px', background: 'var(--bg-secondary)',
                        border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--text-primary)',
                        fontSize: '13px', outline: 'none', resize: 'vertical', fontFamily: 'inherit',
                        boxSizing: 'border-box', lineHeight: 1.6, minHeight: '160px',
                      }}
                    />
                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '6px', lineHeight: 1.5 }}>
                      <strong>Tip:</strong> The more specific your instructions, the better the results.
                      Use <code style={{ background: 'var(--bg-secondary)', padding: '1px 4px', borderRadius: '3px' }}>[BRACKETS]</code> for parts that change each time (like the text to summarize).
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Customize */}
              {wizardStep === 'customize' && (
                <div>
                  <div style={{
                    marginBottom: '16px', padding: '12px 16px', background: 'rgba(99,102,241,0.06)',
                    borderRadius: '10px', border: '1px solid rgba(99,102,241,0.12)',
                  }}>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      🎨 <strong style={{ color: 'var(--text-primary)' }}>Make it yours!</strong> Choose an icon, category, and tags so your skill is easy to find and looks great.
                    </div>
                  </div>
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
                      Pick an icon
                    </label>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {EMOJI_PICKER.map(emoji => (
                        <button
                          key={emoji}
                          onClick={() => setDraft(p => ({ ...p, icon: emoji }))}
                          style={{
                            width: '40px', height: '40px', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', fontSize: '20px', borderRadius: '10px',
                            border: draft.icon === emoji ? '2px solid var(--accent)' : '1px solid var(--border)',
                            background: draft.icon === emoji ? 'var(--accent-dim)' : 'var(--bg-secondary)',
                            cursor: 'pointer', transition: 'all 0.1s',
                          }}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                      Category
                    </label>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {CATEGORIES.filter(c => c !== 'All').map(cat => (
                        <button
                          key={cat}
                          onClick={() => setDraft(p => ({ ...p, category: cat }))}
                          style={{
                            padding: '8px 14px',
                            background: draft.category === cat ? 'var(--accent-dim)' : 'var(--bg-secondary)',
                            color: draft.category === cat ? 'var(--accent)' : 'var(--text-secondary)',
                            border: '1px solid ' + (draft.category === cat ? 'var(--accent)' : 'var(--border)'),
                            borderRadius: '20px', cursor: 'pointer', fontSize: '12px',
                            transition: 'all 0.15s',
                          }}
                        >
                          {CATEGORY_ICONS[cat] || ''} {cat}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                      Tags <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>(optional — helps with search)</span>
                    </label>
                    <input
                      value={draft.tags}
                      onChange={e => setDraft(p => ({ ...p, tags: e.target.value }))}
                      placeholder="e.g., email, writing, professional"
                      style={{
                        width: '100%', padding: '10px 14px', background: 'var(--bg-secondary)',
                        border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--text-primary)',
                        fontSize: '13px', outline: 'none', boxSizing: 'border-box',
                      }}
                    />
                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                      Separate tags with commas
                    </div>
                  </div>
                </div>
              )}

              {/* Step 4: Preview */}
              {wizardStep === 'preview' && (
                <div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                    Here's how your skill will look. Make sure everything is right, then save it.
                  </div>

                  {/* Preview card */}
                  <div style={{
                    padding: '20px', background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                    borderRadius: '12px', marginBottom: '20px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                      <span style={{ fontSize: '28px' }}>{draft.icon}</span>
                      <div>
                        <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {draft.name || 'Untitled Skill'}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                          {draft.category} · by You
                        </div>
                      </div>
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '12px' }}>
                      {draft.description || 'No description'}
                    </div>
                    <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      Instructions:
                    </div>
                    <pre style={{
                      padding: '12px', background: 'var(--bg-primary)', border: '1px solid var(--border)',
                      borderRadius: '8px', fontSize: '12px', color: 'var(--text-primary)',
                      whiteSpace: 'pre-wrap', lineHeight: 1.5, fontFamily: 'inherit', maxHeight: '200px', overflow: 'auto',
                    }}>
                      {draft.prompt || 'No instructions yet'}
                    </pre>
                    {draft.tags && (
                      <div style={{ display: 'flex', gap: '4px', marginTop: '10px', flexWrap: 'wrap' }}>
                        {draft.tags.split(',').map(t => t.trim()).filter(Boolean).map(t => (
                          <span key={t} style={{ padding: '2px 8px', background: 'var(--bg-hover)', borderRadius: '10px', fontSize: '10px', color: 'var(--text-secondary)' }}>{t}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Wizard footer */}
            <div style={{
              padding: '16px 24px', borderTop: '1px solid var(--border)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <button
                onClick={wizardStep === 'basics' ? closeWizard : prevStep}
                style={{
                  padding: '10px 18px', background: 'var(--bg-secondary)', color: 'var(--text-secondary)',
                  border: '1px solid var(--border)', borderRadius: '10px', cursor: 'pointer',
                  fontSize: '13px', fontWeight: 500,
                }}
              >
                {wizardStep === 'basics' ? 'Cancel' : '← Back'}
              </button>

              {wizardStep === 'preview' ? (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={saveSkill}
                    disabled={!canAdvance('preview')}
                    style={{
                      padding: '10px 24px', background: canAdvance('preview') ? 'var(--accent)' : 'var(--bg-tertiary)',
                      color: canAdvance('preview') ? 'white' : 'var(--text-tertiary)',
                      border: 'none', borderRadius: '10px', cursor: canAdvance('preview') ? 'pointer' : 'default',
                      fontSize: '13px', fontWeight: 600,
                    }}
                  >
                    {editingSkill ? '💾 Save Changes' : '✨ Create Skill'}
                  </button>
                  {!editingSkill && (
                    <button
                      onClick={() => {
                        if (!draft.name.trim() || !draft.prompt.trim()) return;
                        const slugName = draft.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
                        const cmd = `/skill-${slugName}`;
                        saveSkill();
                        setTimeout(() => {
                          document.dispatchEvent(new CustomEvent('arcadia:skill-test', { detail: { command: cmd, prompt: draft.prompt.trim(), name: draft.name.trim(), icon: draft.icon } }));
                          document.dispatchEvent(new CustomEvent('arcadia:navigate', { detail: 'secondbrain' }));
                        }, 100);
                      }}
                      disabled={!canAdvance('preview')}
                      style={{
                        padding: '10px 20px', background: canAdvance('preview') ? '#22c55e' : 'var(--bg-tertiary)',
                        color: canAdvance('preview') ? 'white' : 'var(--text-tertiary)',
                        border: 'none', borderRadius: '10px', cursor: canAdvance('preview') ? 'pointer' : 'default',
                        fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px',
                      }}
                    >
                      🧪 Create & Test
                    </button>
                  )}
                </div>
              ) : (
                <button
                  onClick={nextStep}
                  disabled={!canAdvance(wizardStep)}
                  style={{
                    padding: '10px 24px',
                    background: canAdvance(wizardStep) ? 'var(--accent)' : 'var(--bg-tertiary)',
                    color: canAdvance(wizardStep) ? 'white' : 'var(--text-tertiary)',
                    border: 'none', borderRadius: '10px',
                    cursor: canAdvance(wizardStep) ? 'pointer' : 'default',
                    fontSize: '13px', fontWeight: 600,
                  }}
                >
                  Next →
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Share Dialog ─────────────────────────────────────────────────── */}
      {showShareDialog && shareSkill && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
          }}
          onClick={e => { if (e.target === e.currentTarget) setShowShareDialog(false); }}
        >
          <div style={{
            background: 'var(--bg-primary)', borderRadius: '16px', width: '100%', maxWidth: '480px',
            border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
          }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Share Skill</h2>
                <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: '2px 0 0' }}>
                  Share "{shareSkill.name}" with others
                </p>
              </div>
              <button onClick={() => setShowShareDialog(false)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '18px' }}>✕</button>
            </div>

            <div style={{ padding: '20px 24px' }}>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: 1.5 }}>
                Anyone with this link or code can import your skill into their ArcadIA.
              </div>

              {/* Share link */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                  🔗 Share Link
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    readOnly
                    value={`${window.location.origin}${window.location.pathname}#import-skill=${shareCode.slice(0, 20)}...`}
                    style={{
                      flex: 1, padding: '10px 12px', background: 'var(--bg-secondary)',
                      border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-secondary)',
                      fontSize: '12px', outline: 'none',
                    }}
                  />
                  <button
                    onClick={copyShareUrl}
                    style={{
                      padding: '10px 16px', background: 'var(--accent)', color: 'white',
                      border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '12px',
                      fontWeight: 600, whiteSpace: 'nowrap',
                    }}
                  >
                    Copy Link
                  </button>
                </div>
              </div>

              {/* Share code */}
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                  📋 Share Code
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '6px' }}>
                  Send this code to someone — they can paste it in the Import dialog
                </div>
                <div style={{ position: 'relative' }}>
                  <textarea
                    readOnly
                    value={shareCode}
                    rows={3}
                    style={{
                      width: '100%', padding: '10px 12px', background: 'var(--bg-secondary)',
                      border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-secondary)',
                      fontSize: '11px', outline: 'none', fontFamily: 'monospace', resize: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  <button
                    onClick={copyShareCode}
                    style={{
                      position: 'absolute', top: '8px', right: '8px',
                      padding: '4px 10px', background: copiedShare ? 'var(--accent)' : 'var(--bg-primary)',
                      color: copiedShare ? 'white' : 'var(--text-secondary)',
                      border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer',
                      fontSize: '11px', fontWeight: 500,
                    }}
                  >
                    {copiedShare ? '✓ Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Import Dialog ────────────────────────────────────────────────── */}
      {showImportDialog && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
          }}
          onClick={e => { if (e.target === e.currentTarget) setShowImportDialog(false); }}
        >
          <div style={{
            background: 'var(--bg-primary)', borderRadius: '16px', width: '100%', maxWidth: '480px',
            border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
          }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Import a Skill</h2>
                <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: '2px 0 0' }}>
                  Paste a share link or code from someone
                </p>
              </div>
              <button onClick={() => setShowImportDialog(false)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '18px' }}>✕</button>
            </div>

            <div style={{ padding: '20px 24px' }}>
              <textarea
                value={importCode}
                onChange={e => handleImportCodeChange(e.target.value)}
                placeholder="Paste the share link or code here..."
                rows={3}
                autoFocus
                style={{
                  width: '100%', padding: '12px 14px', background: 'var(--bg-secondary)',
                  border: '1px solid ' + (importError ? 'var(--error, #ef4444)' : 'var(--border)'),
                  borderRadius: '10px', color: 'var(--text-primary)', fontSize: '13px',
                  outline: 'none', fontFamily: 'inherit', resize: 'none', boxSizing: 'border-box',
                }}
              />

              {importError && (
                <div style={{ fontSize: '12px', color: 'var(--error, #ef4444)', marginTop: '8px' }}>
                  {importError}
                </div>
              )}

              {importPreview && (
                <div style={{
                  marginTop: '16px', padding: '16px', background: 'var(--bg-secondary)',
                  border: '1px solid var(--accent)', borderRadius: '12px',
                }}>
                  <div style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 600, marginBottom: '8px' }}>
                    ✓ Skill found!
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span style={{ fontSize: '20px' }}>{(importPreview as any).icon || '🧩'}</span>
                    <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {importPreview.name}
                    </div>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {importPreview.description}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '6px' }}>
                    Category: {importPreview.category} · Tags: {importPreview.tags?.join(', ') || 'none'}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setShowImportDialog(false)}
                  style={{
                    padding: '10px 18px', background: 'var(--bg-secondary)', color: 'var(--text-secondary)',
                    border: '1px solid var(--border)', borderRadius: '10px', cursor: 'pointer', fontSize: '13px',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmImport}
                  disabled={!importPreview}
                  style={{
                    padding: '10px 20px',
                    background: importPreview ? 'var(--accent)' : 'var(--bg-tertiary)',
                    color: importPreview ? 'white' : 'var(--text-tertiary)',
                    border: 'none', borderRadius: '10px',
                    cursor: importPreview ? 'pointer' : 'default',
                    fontSize: '13px', fontWeight: 600,
                  }}
                >
                  Import Skill
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Schedule Dialog ───────────────────────────────────────────────────── */}
      <ScheduleSkillDialog
        open={showScheduleDialog}
        onClose={() => { setShowScheduleDialog(false); setScheduleSkill(null); }}
        skill={scheduleSkill}
        existingSchedule={scheduleSkill ? schedules.find(s => s.skillId === scheduleSkill.id) : null}
        onSave={(schedule) => {
          saveSchedule(schedule);
          setSchedules(getSchedules());
          showToast(`⏰ ${schedule.skillName} scheduled — ${getScheduleLabel(schedule)}`);
        }}
      />

      {/* ─── Scheduled Skills Panel (overlay) ───────────────────────────────── */}
      {showScheduleTab && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={e => { if (e.target === e.currentTarget) setShowScheduleTab(false); }}
        >
          <div style={{
            background: 'var(--bg-primary)', borderRadius: '16px', width: '100%', maxWidth: '600px',
            maxHeight: '80vh', overflow: 'auto', border: '1px solid var(--border)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
          }}>
            {/* Header */}
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>⏰ Scheduled Skills</h2>
                <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: '4px 0 0' }}>
                  {schedules.filter(s => s.enabled).length} active · {schedules.length} total
                </p>
              </div>
              <button onClick={() => setShowScheduleTab(false)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '20px' }}>✕</button>
            </div>

            {/* Schedule list */}
            <div style={{ padding: '16px 24px' }}>
              {schedules.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                  <div style={{ fontSize: '40px', marginBottom: '12px' }}>⏰</div>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>No scheduled skills yet</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
                    Open any skill and click "⏰ Schedule" to set it up to run automatically.
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '10px' }}>
                  {schedules.map(sched => (
                    <div key={sched.id} style={{
                      padding: '14px 16px', borderRadius: '10px', border: '1px solid var(--border)',
                      background: sched.enabled ? 'var(--bg-secondary)' : 'rgba(100,100,100,0.05)',
                      opacity: sched.enabled ? 1 : 0.6,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                          <span style={{ fontSize: '22px' }}>{sched.skillIcon}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{sched.skillName}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                              {getScheduleLabel(sched)}
                              {sched.writeToVault && <span> · → {sched.vaultPath}</span>}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--accent)', marginTop: '3px' }}>
                              Next: {formatNextRun(sched.nextRun)}
                              {sched.lastRun && <span style={{ color: 'var(--text-tertiary)' }}> · Last: {new Date(sched.lastRun).toLocaleString()}</span>}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          {/* Toggle */}
                          <div
                            onClick={() => { toggleSchedule(sched.id); setSchedules(getSchedules()); }}
                            style={{
                              width: '36px', height: '20px', borderRadius: '10px', position: 'relative', cursor: 'pointer',
                              background: sched.enabled ? 'var(--accent)' : 'var(--bg-tertiary, #555)', transition: 'background 0.2s',
                            }}
                          >
                            <div style={{
                              width: '16px', height: '16px', borderRadius: '50%', background: 'white', position: 'absolute',
                              top: '2px', left: sched.enabled ? '18px' : '2px', transition: 'left 0.2s',
                            }} />
                          </div>
                          {/* Delete */}
                          <button
                            onClick={() => { deleteSchedule(sched.id); setSchedules(getSchedules()); showToast('Schedule removed'); }}
                            style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '14px', padding: '4px' }}
                            title="Delete schedule"
                          >
                            🗑
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Recent runs */}
              {runHistory.length > 0 && (
                <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '10px' }}>Recent Runs</div>
                  <div style={{ display: 'grid', gap: '6px' }}>
                    {runHistory.slice(0, 10).map((run, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px',
                        borderRadius: '8px', background: 'var(--bg-secondary)', fontSize: '12px',
                      }}>
                        <span>{run.skillIcon}</span>
                        <span style={{ color: run.status === 'success' ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
                          {run.status === 'success' ? '✓' : '✗'}
                        </span>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{run.skillName}</span>
                        <span style={{ color: 'var(--text-tertiary)', marginLeft: 'auto' }}>
                          {new Date(run.timestamp).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Animation styles ──────────────────────────────────────────────────── */}
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}