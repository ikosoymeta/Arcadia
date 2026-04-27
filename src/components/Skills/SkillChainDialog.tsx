import { useState, useEffect } from 'react';
import { getSchedules, saveSchedule, calculateNextRun } from '../../services/scheduler';
import type { SkillSchedule } from './ScheduleSkillDialog';

// ─── Types ──────────────────────────────────────────────────────────────────
interface ChainStep {
  id: string;
  type: 'slash' | 'skill';
  command: string;
  label: string;
  icon: string;
  delayMinutes: number; // delay after previous step
}

export interface SkillChain {
  id: string;
  name: string;
  description: string;
  steps: ChainStep[];
  createdAt: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  availableCommands: { command: string; label: string; icon: string; type: 'slash' | 'skill' }[];
}

const CHAINS_KEY = 'arcadia-skill-chains';

export function getChains(): SkillChain[] {
  try { return JSON.parse(localStorage.getItem(CHAINS_KEY) || '[]'); }
  catch { return []; }
}

export function saveChains(chains: SkillChain[]): void {
  localStorage.setItem(CHAINS_KEY, JSON.stringify(chains));
  document.dispatchEvent(new CustomEvent('arcadia:chains-changed'));
}

// ─── Preset Chains ──────────────────────────────────────────────────────────
const PRESET_CHAINS = [
  {
    name: '🌅 Morning Routine',
    description: 'Start your day: sync context, plan your day, then save to vault',
    steps: [
      { command: '/daily-brief', label: 'Daily Brief', icon: '🌅', type: 'slash' as const, delayMinutes: 0 },
      { command: '/add-context', label: 'Sync Context', icon: '📎', type: 'slash' as const, delayMinutes: 1 },
    ],
  },
  {
    name: '🌙 End of Day Wrap-up',
    description: 'Capture decisions, process notes, preview tomorrow',
    steps: [
      { command: '/eod', label: 'End of Day', icon: '🌙', type: 'slash' as const, delayMinutes: 0 },
      { command: '/add-context', label: 'Save Context', icon: '📎', type: 'slash' as const, delayMinutes: 2 },
    ],
  },
  {
    name: '📊 Weekly Review',
    description: 'Review the week, capture wins, set next week priorities',
    steps: [
      { command: '/eow', label: 'End of Week', icon: '📊', type: 'slash' as const, delayMinutes: 0 },
      { command: '/deep-research', label: 'Research Insights', icon: '🔍', type: 'slash' as const, delayMinutes: 3 },
    ],
  },
];

// ─── Component ──────────────────────────────────────────────────────────────
export function SkillChainDialog({ open, onClose, availableCommands }: Props) {
  const [view, setView] = useState<'list' | 'create' | 'edit'>('list');
  const [chains, setChains] = useState<SkillChain[]>(getChains);
  const [editChain, setEditChain] = useState<SkillChain | null>(null);

  // Create form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState<ChainStep[]>([]);
  const [showCommandPicker, setShowCommandPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const handler = () => setChains(getChains());
    document.addEventListener('arcadia:chains-changed', handler);
    return () => document.removeEventListener('arcadia:chains-changed', handler);
  }, []);

  if (!open) return null;

  const resetForm = () => {
    setName('');
    setDescription('');
    setSteps([]);
    setEditChain(null);
    setShowCommandPicker(false);
    setSearchQuery('');
  };

  const addStep = (cmd: typeof availableCommands[0]) => {
    setSteps(prev => [...prev, {
      id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      type: cmd.type,
      command: cmd.command,
      label: cmd.label,
      icon: cmd.icon,
      delayMinutes: prev.length === 0 ? 0 : 1,
    }]);
    setShowCommandPicker(false);
    setSearchQuery('');
  };

  const removeStep = (id: string) => {
    setSteps(prev => prev.filter(s => s.id !== id));
  };

  const moveStep = (idx: number, dir: -1 | 1) => {
    const newSteps = [...steps];
    const target = idx + dir;
    if (target < 0 || target >= newSteps.length) return;
    [newSteps[idx], newSteps[target]] = [newSteps[target], newSteps[idx]];
    setSteps(newSteps);
  };

  const updateDelay = (id: string, minutes: number) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, delayMinutes: Math.max(0, minutes) } : s));
  };

  const saveChain = () => {
    const chain: SkillChain = {
      id: editChain?.id || `chain-${Date.now()}`,
      name: name.trim(),
      description: description.trim(),
      steps,
      createdAt: editChain?.createdAt || Date.now(),
    };
    const all = getChains();
    const idx = all.findIndex(c => c.id === chain.id);
    if (idx >= 0) all[idx] = chain; else all.push(chain);
    saveChains(all);
    resetForm();
    setView('list');
  };

  const deleteChain = (id: string) => {
    saveChains(getChains().filter(c => c.id !== id));
  };

  const startEdit = (chain: SkillChain) => {
    setEditChain(chain);
    setName(chain.name);
    setDescription(chain.description);
    setSteps(chain.steps);
    setView('edit');
  };

  const usePreset = (preset: typeof PRESET_CHAINS[0]) => {
    setName(preset.name);
    setDescription(preset.description);
    setSteps(preset.steps.map(s => ({
      ...s,
      id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    })));
    setView('create');
  };

  const scheduleChain = (chain: SkillChain) => {
    // Create a combined schedule for the chain
    const combinedPrompt = chain.steps.map((s, i) =>
      `Step ${i + 1}: ${s.command}${s.delayMinutes > 0 ? ` (wait ${s.delayMinutes}min)` : ''}`
    ).join('\n');

    const schedule: SkillSchedule = {
      id: `sched-chain-${Date.now()}`,
      skillId: chain.id,
      skillName: `⛓ ${chain.name}`,
      skillIcon: '⛓',
      skillPrompt: combinedPrompt,
      frequency: 'daily',
      time: '09:00',
      customDays: [],
      enabled: true,
      writeToVault: false,
      vaultPath: '',
      vaultMode: 'append',
      sendNotification: true,
      notificationTarget: 'toast',
      createdAt: Date.now(),
      nextRun: 0,
      lastRun: null,
      runCount: 0,
    };
    schedule.nextRun = calculateNextRun(schedule);
    saveSchedule(schedule);
    document.dispatchEvent(new CustomEvent('arcadia:toast', {
      detail: { type: 'success', title: '⛓ Chain Scheduled', message: `${chain.name} will run daily at 9:00 AM` },
    }));
  };

  const runChainNow = (chain: SkillChain) => {
    // Execute chain steps sequentially via bridge
    const executeSteps = async () => {
      for (let i = 0; i < chain.steps.length; i++) {
        const step = chain.steps[i];
        if (step.delayMinutes > 0 && i > 0) {
          await new Promise(r => setTimeout(r, step.delayMinutes * 60000));
        }
        document.dispatchEvent(new CustomEvent('arcadia:execute-command', {
          detail: { command: step.command, source: 'chain' },
        }));
        // Small delay between commands for processing
        await new Promise(r => setTimeout(r, 2000));
      }
    };
    executeSteps();
    document.dispatchEvent(new CustomEvent('arcadia:toast', {
      detail: { type: 'info', title: '⛓ Running Chain', message: `${chain.name} — ${chain.steps.length} steps` },
    }));
    onClose();
  };

  const filteredCommands = searchQuery
    ? availableCommands.filter(c => c.command.toLowerCase().includes(searchQuery.toLowerCase()) || c.label.toLowerCase().includes(searchQuery.toLowerCase()))
    : availableCommands;

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) { resetForm(); setView('list'); onClose(); } }}
    >
      <div style={{
        background: 'var(--bg-primary)', borderRadius: '16px', width: '580px',
        maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
        border: '1px solid var(--border)', boxShadow: '0 12px 48px rgba(0,0,0,0.4)',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: '10px',
        }}>
          {view !== 'list' && (
            <button
              onClick={() => { resetForm(); setView('list'); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '14px' }}
            >←</button>
          )}
          <span style={{ fontSize: '18px' }}>⛓</span>
          <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>
            {view === 'list' ? 'Skill Chains' : view === 'create' ? 'Create Chain' : 'Edit Chain'}
          </span>
          <button
            onClick={() => { resetForm(); setView('list'); onClose(); }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-tertiary)', fontSize: '18px', padding: '4px',
            }}
          >×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {/* ─── List View ──────────────────────────────────────────── */}
          {view === 'list' && (
            <>
              {/* Explainer */}
              <div style={{
                padding: '14px 16px', borderRadius: '10px', marginBottom: '16px',
                background: 'linear-gradient(135deg, rgba(129,140,248,0.08), rgba(168,85,247,0.08))',
                border: '1px solid rgba(129,140,248,0.15)',
              }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                  What are Skill Chains?
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                  A chain runs multiple skills in sequence — like a recipe. The output of each step flows into the next.
                  For example: <strong>Sync context → Plan your day → Save to vault</strong>.
                </div>
              </div>

              {/* Preset templates */}
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                Quick Start Templates
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '20px' }}>
                {PRESET_CHAINS.map((preset, i) => (
                  <div
                    key={i}
                    onClick={() => usePreset(preset)}
                    style={{
                      padding: '10px 14px', borderRadius: '10px', cursor: 'pointer',
                      border: '1px solid var(--border)', background: 'var(--bg-secondary)',
                      display: 'flex', alignItems: 'center', gap: '10px', transition: 'all 0.15s',
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#818cf8'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{preset.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>{preset.description}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {preset.steps.map((s, j) => (
                        <span key={j} style={{
                          fontSize: '14px', width: '28px', height: '28px', borderRadius: '50%',
                          background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>{s.icon}</span>
                      ))}
                    </div>
                    <span style={{ fontSize: '11px', color: '#818cf8', fontWeight: 600 }}>Use →</span>
                  </div>
                ))}
              </div>

              {/* Custom chains */}
              {chains.length > 0 && (
                <>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                    My Chains ({chains.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
                    {chains.map(chain => (
                      <div key={chain.id} style={{
                        padding: '12px 14px', borderRadius: '10px',
                        border: '1px solid var(--border)', background: 'var(--bg-secondary)',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>{chain.name}</span>
                          <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', background: 'var(--bg-primary)', padding: '2px 8px', borderRadius: '4px' }}>
                            {chain.steps.length} steps
                          </span>
                        </div>
                        {chain.description && (
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '8px' }}>{chain.description}</div>
                        )}
                        {/* Step pills */}
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
                          {chain.steps.map((step, i) => (
                            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                              <span style={{
                                fontSize: '10px', padding: '2px 8px', borderRadius: '6px',
                                background: 'rgba(129,140,248,0.1)', color: '#818cf8',
                              }}>{step.icon} {step.label}</span>
                              {i < chain.steps.length - 1 && <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>→</span>}
                            </span>
                          ))}
                        </div>
                        {/* Actions */}
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            onClick={() => runChainNow(chain)}
                            style={{
                              fontSize: '11px', fontWeight: 600, padding: '4px 12px', borderRadius: '6px',
                              border: 'none', cursor: 'pointer', background: '#818cf8', color: '#fff',
                            }}
                          >▶ Run Now</button>
                          <button
                            onClick={() => scheduleChain(chain)}
                            style={{
                              fontSize: '11px', fontWeight: 600, padding: '4px 12px', borderRadius: '6px',
                              border: '1px solid var(--border)', cursor: 'pointer', background: 'transparent', color: 'var(--text-secondary)',
                            }}
                          >⏰ Schedule</button>
                          <button
                            onClick={() => startEdit(chain)}
                            style={{
                              fontSize: '11px', fontWeight: 600, padding: '4px 12px', borderRadius: '6px',
                              border: '1px solid var(--border)', cursor: 'pointer', background: 'transparent', color: 'var(--text-secondary)',
                            }}
                          >✏️ Edit</button>
                          <button
                            onClick={() => deleteChain(chain.id)}
                            style={{
                              fontSize: '11px', fontWeight: 600, padding: '4px 12px', borderRadius: '6px',
                              border: '1px solid var(--border)', cursor: 'pointer', background: 'transparent', color: '#ef4444',
                            }}
                          >🗑</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Create button */}
              <button
                onClick={() => setView('create')}
                style={{
                  width: '100%', padding: '12px', borderRadius: '10px', cursor: 'pointer',
                  border: '2px dashed var(--border)', background: 'transparent',
                  color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600,
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#818cf8'; (e.currentTarget as HTMLElement).style.color = '#818cf8'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; }}
              >
                + Create Custom Chain
              </button>
            </>
          )}

          {/* ─── Create / Edit View ────────────────────────────────── */}
          {(view === 'create' || view === 'edit') && (
            <>
              {/* Name */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                  Chain Name
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Morning Routine, Weekly Review..."
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: '8px',
                    border: '1px solid var(--border)', background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)', fontSize: '13px', outline: 'none',
                  }}
                />
              </div>

              {/* Description */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                  Description <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>optional</span>
                </label>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What does this chain do?"
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: '8px',
                    border: '1px solid var(--border)', background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)', fontSize: '13px', outline: 'none',
                  }}
                />
              </div>

              {/* Steps */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>
                  Steps <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>— drag to reorder, each step runs after the previous one</span>
                </label>

                {steps.length === 0 ? (
                  <div style={{
                    padding: '24px', borderRadius: '10px', textAlign: 'center',
                    border: '2px dashed var(--border)', background: 'var(--bg-secondary)',
                  }}>
                    <div style={{ fontSize: '24px', marginBottom: '8px' }}>🔗</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                      Add your first step — click the button below to choose a command or skill
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {steps.map((step, idx) => (
                      <div key={step.id}>
                        {/* Delay indicator between steps */}
                        {idx > 0 && (
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '4px 0 4px 20px', color: 'var(--text-tertiary)',
                          }}>
                            <span style={{ fontSize: '12px' }}>↓</span>
                            <span style={{ fontSize: '10px' }}>wait</span>
                            <input
                              type="number"
                              min={0}
                              max={60}
                              value={step.delayMinutes}
                              onChange={(e) => updateDelay(step.id, parseInt(e.target.value) || 0)}
                              style={{
                                width: '40px', padding: '2px 4px', borderRadius: '4px',
                                border: '1px solid var(--border)', background: 'var(--bg-secondary)',
                                color: 'var(--text-primary)', fontSize: '11px', textAlign: 'center',
                              }}
                            />
                            <span style={{ fontSize: '10px' }}>min</span>
                          </div>
                        )}
                        {/* Step card */}
                        <div style={{
                          padding: '10px 12px', borderRadius: '8px',
                          border: '1px solid var(--border)', background: 'var(--bg-secondary)',
                          display: 'flex', alignItems: 'center', gap: '10px',
                        }}>
                          <span style={{
                            fontSize: '10px', fontWeight: 700, color: 'var(--text-tertiary)',
                            width: '20px', textAlign: 'center',
                          }}>{idx + 1}</span>
                          <span style={{ fontSize: '16px' }}>{step.icon}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{step.label}</div>
                            <div style={{ fontSize: '10px', color: '#818cf8', fontFamily: 'monospace' }}>{step.command}</div>
                          </div>
                          <span style={{
                            fontSize: '9px', padding: '2px 6px', borderRadius: '4px',
                            background: step.type === 'skill' ? 'rgba(34,197,94,0.1)' : 'rgba(129,140,248,0.1)',
                            color: step.type === 'skill' ? '#22c55e' : '#818cf8',
                          }}>{step.type}</span>
                          <div style={{ display: 'flex', gap: '2px' }}>
                            <button
                              onClick={() => moveStep(idx, -1)}
                              disabled={idx === 0}
                              style={{
                                background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer',
                                color: idx === 0 ? 'var(--border)' : 'var(--text-tertiary)', fontSize: '12px', padding: '2px',
                              }}
                            >↑</button>
                            <button
                              onClick={() => moveStep(idx, 1)}
                              disabled={idx === steps.length - 1}
                              style={{
                                background: 'none', border: 'none', cursor: idx === steps.length - 1 ? 'default' : 'pointer',
                                color: idx === steps.length - 1 ? 'var(--border)' : 'var(--text-tertiary)', fontSize: '12px', padding: '2px',
                              }}
                            >↓</button>
                            <button
                              onClick={() => removeStep(step.id)}
                              style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: '#ef4444', fontSize: '12px', padding: '2px',
                              }}
                            >×</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add step button / picker */}
                {showCommandPicker ? (
                  <div style={{
                    marginTop: '8px', borderRadius: '10px', border: '1px solid var(--border)',
                    background: 'var(--bg-secondary)', overflow: 'hidden',
                  }}>
                    <input
                      autoFocus
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search commands and skills..."
                      style={{
                        width: '100%', padding: '10px 12px', border: 'none',
                        borderBottom: '1px solid var(--border)', background: 'transparent',
                        color: 'var(--text-primary)', fontSize: '12px', outline: 'none',
                      }}
                    />
                    <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                      {filteredCommands.map((cmd, i) => (
                        <div
                          key={i}
                          onClick={() => addStep(cmd)}
                          style={{
                            padding: '8px 12px', cursor: 'pointer', display: 'flex',
                            alignItems: 'center', gap: '8px', transition: 'background 0.1s',
                          }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-primary)'; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                        >
                          <span style={{ fontSize: '14px' }}>{cmd.icon}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{cmd.label}</div>
                            <div style={{ fontSize: '10px', color: '#818cf8', fontFamily: 'monospace' }}>{cmd.command}</div>
                          </div>
                          <span style={{
                            fontSize: '9px', padding: '2px 6px', borderRadius: '4px',
                            background: cmd.type === 'skill' ? 'rgba(34,197,94,0.1)' : 'rgba(129,140,248,0.1)',
                            color: cmd.type === 'skill' ? '#22c55e' : '#818cf8',
                          }}>{cmd.type}</span>
                        </div>
                      ))}
                      {filteredCommands.length === 0 && (
                        <div style={{ padding: '16px', textAlign: 'center', fontSize: '12px', color: 'var(--text-tertiary)' }}>
                          No matching commands found
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => { setShowCommandPicker(false); setSearchQuery(''); }}
                      style={{
                        width: '100%', padding: '8px', border: 'none', borderTop: '1px solid var(--border)',
                        background: 'transparent', color: 'var(--text-tertiary)', fontSize: '11px',
                        cursor: 'pointer',
                      }}
                    >Cancel</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowCommandPicker(true)}
                    style={{
                      marginTop: '8px', width: '100%', padding: '10px', borderRadius: '8px',
                      border: '2px dashed var(--border)', background: 'transparent',
                      color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600,
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#818cf8'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
                  >
                    + Add Step
                  </button>
                )}
              </div>

              {/* Preview */}
              {steps.length >= 2 && (
                <div style={{
                  padding: '12px 14px', borderRadius: '10px', marginBottom: '16px',
                  background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '8px' }}>
                    CHAIN PREVIEW
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    {steps.map((step, i) => (
                      <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{
                          fontSize: '11px', padding: '4px 10px', borderRadius: '6px',
                          background: 'rgba(129,140,248,0.1)', color: '#818cf8', fontWeight: 600,
                        }}>{step.icon} {step.label}</span>
                        {i < steps.length - 1 && (
                          <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>
                            →{step.delayMinutes > 0 ? ` ${steps[i + 1]?.delayMinutes}m →` : ''}
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '6px' }}>
                    Total estimated time: {steps.reduce((sum, s) => sum + s.delayMinutes, 0) + steps.length * 0.5} minutes
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {(view === 'create' || view === 'edit') && (
          <div style={{
            padding: '12px 20px', borderTop: '1px solid var(--border)',
            display: 'flex', gap: '8px', justifyContent: 'flex-end',
          }}>
            <button
              onClick={() => { resetForm(); setView('list'); }}
              style={{
                padding: '8px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                border: '1px solid var(--border)', background: 'transparent',
                color: 'var(--text-secondary)', cursor: 'pointer',
              }}
            >Cancel</button>
            <button
              onClick={saveChain}
              disabled={!name.trim() || steps.length < 2}
              style={{
                padding: '8px 20px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                border: 'none', cursor: !name.trim() || steps.length < 2 ? 'not-allowed' : 'pointer',
                background: !name.trim() || steps.length < 2 ? 'var(--bg-secondary)' : '#818cf8',
                color: !name.trim() || steps.length < 2 ? 'var(--text-tertiary)' : '#fff',
              }}
            >{view === 'edit' ? 'Save Changes' : 'Create Chain'}</button>
          </div>
        )}
      </div>
    </div>
  );
}
