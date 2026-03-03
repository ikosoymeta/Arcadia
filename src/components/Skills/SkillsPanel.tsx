import React, { useState, useEffect } from 'react';
import type { Skill } from '../../types';
import { storage } from '../../services/storage';

const SAMPLE_SKILLS: Skill[] = [
  {
    id: 'sk-1', name: 'React Component Generator', description: 'Generate a production-ready React component with TypeScript, props interface, and CSS modules.',
    prompt: 'Create a React component called [NAME] with the following props: [PROPS]. Use TypeScript, CSS modules, and include proper type annotations.',
    category: 'Code Generation', tags: ['react', 'typescript', 'frontend'],
    createdAt: Date.now() - 86400000, updatedAt: Date.now(), createdBy: 'System', usageCount: 12, isPublic: true,
  },
  {
    id: 'sk-2', name: 'API Documentation Writer', description: 'Generate comprehensive API documentation from endpoint descriptions.',
    prompt: 'Write API documentation for the following endpoints: [ENDPOINTS]. Include request/response examples, error codes, and authentication requirements.',
    category: 'Documentation', tags: ['api', 'docs', 'rest'],
    createdAt: Date.now() - 172800000, updatedAt: Date.now(), createdBy: 'System', usageCount: 8, isPublic: true,
  },
  {
    id: 'sk-3', name: 'Code Review Assistant', description: 'Analyze code for bugs, security issues, performance problems, and style violations.',
    prompt: 'Review the following code. Check for: 1) Bugs and logic errors 2) Security vulnerabilities 3) Performance issues 4) Style and best practices. Provide specific line-by-line feedback.',
    category: 'Code Review', tags: ['review', 'quality', 'security'],
    createdAt: Date.now() - 259200000, updatedAt: Date.now(), createdBy: 'System', usageCount: 25, isPublic: true,
  },
  {
    id: 'sk-4', name: 'Test Generator', description: 'Generate unit and integration tests for given functions or components.',
    prompt: 'Write comprehensive tests for the following code using [FRAMEWORK]. Include edge cases, error scenarios, and mocking where appropriate.',
    category: 'Testing', tags: ['testing', 'jest', 'vitest'],
    createdAt: Date.now() - 345600000, updatedAt: Date.now(), createdBy: 'System', usageCount: 15, isPublic: true,
  },
  {
    id: 'sk-5', name: 'SQL Query Builder', description: 'Generate optimized SQL queries from natural language descriptions.',
    prompt: 'Write an SQL query that: [DESCRIPTION]. Optimize for performance. Include indexes if needed.',
    category: 'Data', tags: ['sql', 'database', 'query'],
    createdAt: Date.now() - 432000000, updatedAt: Date.now(), createdBy: 'System', usageCount: 7, isPublic: true,
  },
];

const CATEGORIES = ['All', 'Code Generation', 'Documentation', 'Code Review', 'Testing', 'Data', 'Custom'];

export function SkillsPanel() {
  const [skills, setSkills] = useState<Skill[]>(() => {
    const saved = storage.getSkills();
    return saved.length > 0 ? saved : SAMPLE_SKILLS;
  });
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [newSkill, setNewSkill] = useState({ name: '', description: '', prompt: '', category: 'Custom', tags: '' });

  useEffect(() => { storage.saveSkills(skills); }, [skills]);

  const filtered = skills.filter(s => {
    const matchesSearch = !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.tags.some(t => t.includes(search.toLowerCase()));
    const matchesCategory = activeCategory === 'All' || s.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const handleCreate = () => {
    if (!newSkill.name || !newSkill.prompt) return;
    const skill: Skill = {
      id: crypto.randomUUID(),
      ...newSkill,
      tags: newSkill.tags.split(',').map(t => t.trim()).filter(Boolean),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdBy: 'You',
      usageCount: 0,
      isPublic: false,
    };
    setSkills(prev => [skill, ...prev]);
    setNewSkill({ name: '', description: '', prompt: '', category: 'Custom', tags: '' });
    setShowCreate(false);
  };

  const handleDelete = (id: string) => {
    setSkills(prev => prev.filter(s => s.id !== id));
    if (selectedSkill?.id === id) setSelectedSkill(null);
  };

  const handleUse = (skill: Skill) => {
    navigator.clipboard.writeText(skill.prompt);
    setSkills(prev => prev.map(s => s.id === skill.id ? { ...s, usageCount: s.usageCount + 1 } : s));
  };

  const css = {
    panel: { maxWidth: '900px', margin: '0 auto', padding: '24px', height: '100vh', overflow: 'auto' } as React.CSSProperties,
    title: { fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' } as React.CSSProperties,
    subtitle: { fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '20px' } as React.CSSProperties,
    topBar: { display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' as const } as React.CSSProperties,
    searchInput: { flex: 1, minWidth: '200px', padding: '10px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--text-primary)', fontSize: '13px', outline: 'none' } as React.CSSProperties,
    createBtn: { padding: '10px 20px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 } as React.CSSProperties,
    cats: { display: 'flex', gap: '6px', marginBottom: '20px', flexWrap: 'wrap' as const } as React.CSSProperties,
    catBtn: (active: boolean) => ({ padding: '6px 14px', background: active ? 'var(--accent-dim)' : 'var(--bg-secondary)', color: active ? 'var(--accent)' : 'var(--text-secondary)', border: '1px solid ' + (active ? 'var(--accent)' : 'var(--border)'), borderRadius: '20px', cursor: 'pointer', fontSize: '12px' }) as React.CSSProperties,
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' } as React.CSSProperties,
    card: (selected: boolean) => ({ padding: '16px', background: 'var(--bg-secondary)', border: '1px solid ' + (selected ? 'var(--accent)' : 'var(--border)'), borderRadius: '12px', cursor: 'pointer', transition: 'all 0.15s' }) as React.CSSProperties,
    cardName: { fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' } as React.CSSProperties,
    cardDesc: { fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4, marginBottom: '8px' } as React.CSSProperties,
    cardMeta: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--text-tertiary)' } as React.CSSProperties,
    tags: { display: 'flex', gap: '4px', flexWrap: 'wrap' as const } as React.CSSProperties,
    tag: { padding: '2px 8px', background: 'var(--bg-hover)', borderRadius: '10px', fontSize: '10px', color: 'var(--text-secondary)' } as React.CSSProperties,
    detail: { padding: '20px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', marginTop: '16px' } as React.CSSProperties,
    field: { marginBottom: '12px' } as React.CSSProperties,
    label: { display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '4px' } as React.CSSProperties,
    input: { width: '100%', padding: '10px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '13px', outline: 'none', boxSizing: 'border-box' as const } as React.CSSProperties,
    textarea: { width: '100%', padding: '10px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '13px', outline: 'none', resize: 'vertical' as const, minHeight: '80px', fontFamily: 'inherit', boxSizing: 'border-box' as const } as React.CSSProperties,
    btnRow: { display: 'flex', gap: '8px', marginTop: '12px' } as React.CSSProperties,
  };

  return (
    <div style={css.panel}>
      <div style={css.title}>Skills Library</div>
      <div style={css.subtitle}>Reusable prompts and workflows. Create from conversation results or build custom skills your team can discover and use.</div>

      <div style={css.topBar}>
        <input style={css.searchInput} placeholder="Search skills by name or tag..." value={search} onChange={e => setSearch(e.target.value)} />
        <button style={css.createBtn} onClick={() => setShowCreate(p => !p)}>+ Create Skill</button>
      </div>

      <div style={css.cats}>
        {CATEGORIES.map(cat => (
          <button key={cat} style={css.catBtn(cat === activeCategory)} onClick={() => setActiveCategory(cat)}>{cat}</button>
        ))}
      </div>

      {showCreate && (
        <div style={css.detail}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>Create New Skill</div>
          <div style={css.field}><label style={css.label}>Name</label><input style={css.input} value={newSkill.name} onChange={e => setNewSkill(p => ({ ...p, name: e.target.value }))} placeholder="My Skill" /></div>
          <div style={css.field}><label style={css.label}>Description</label><input style={css.input} value={newSkill.description} onChange={e => setNewSkill(p => ({ ...p, description: e.target.value }))} placeholder="What does this skill do?" /></div>
          <div style={css.field}><label style={css.label}>Prompt Template</label><textarea style={css.textarea} value={newSkill.prompt} onChange={e => setNewSkill(p => ({ ...p, prompt: e.target.value }))} placeholder="Write the prompt template. Use [PLACEHOLDERS] for variable parts." /></div>
          <div style={css.field}><label style={css.label}>Tags (comma-separated)</label><input style={css.input} value={newSkill.tags} onChange={e => setNewSkill(p => ({ ...p, tags: e.target.value }))} placeholder="react, typescript, frontend" /></div>
          <div style={css.btnRow}>
            <button style={css.createBtn} onClick={handleCreate}>Save Skill</button>
            <button style={{ ...css.createBtn, background: 'var(--bg-primary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }} onClick={() => setShowCreate(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div style={css.grid}>
        {filtered.map(skill => (
          <div key={skill.id} style={css.card(selectedSkill?.id === skill.id)} onClick={() => setSelectedSkill(skill)}>
            <div style={css.cardName}>{skill.name}</div>
            <div style={css.cardDesc}>{skill.description}</div>
            <div style={css.tags}>{skill.tags.map(t => <span key={t} style={css.tag}>{t}</span>)}</div>
            <div style={{ ...css.cardMeta, marginTop: '8px' }}>
              <span>Used {skill.usageCount}x</span>
              <span>{skill.isPublic ? 'Public' : 'Private'}</span>
            </div>
          </div>
        ))}
      </div>

      {selectedSkill && (
        <div style={css.detail}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>{selectedSkill.name}</div>
            <button style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '16px' }} onClick={() => setSelectedSkill(null)}>x</button>
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>{selectedSkill.description}</div>
          <div style={css.label}>Prompt Template</div>
          <pre style={{ padding: '12px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: 1.5, marginBottom: '12px' }}>{selectedSkill.prompt}</pre>
          <div style={css.btnRow}>
            <button style={css.createBtn} onClick={() => handleUse(selectedSkill)}>Copy Prompt</button>
            <button style={{ ...css.createBtn, background: 'rgba(239,68,68,0.1)', color: 'var(--error)', border: '1px solid rgba(239,68,68,0.2)' }} onClick={() => handleDelete(selectedSkill.id)}>Delete</button>
          </div>
        </div>
      )}
    </div>
  );
}
