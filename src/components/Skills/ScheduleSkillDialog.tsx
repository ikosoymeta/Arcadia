import { useState, useEffect } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────
export interface SkillSchedule {
  id: string;
  skillId: string;
  skillName: string;
  skillPrompt: string;
  skillIcon: string;
  // Schedule
  frequency: 'daily' | 'weekdays' | 'weekly' | 'custom';
  time: string; // HH:MM
  customDays?: number[]; // 0=Sun, 1=Mon, ...
  // Vault write-back
  writeToVault: boolean;
  vaultPath: string; // e.g., "pulse.md", "session_log.md"
  vaultMode: 'append' | 'replace';
  // Notification
  sendNotification: boolean;
  notificationTarget: 'gchat' | 'toast' | 'both';
  // State
  enabled: boolean;
  lastRun: number | null;
  nextRun: number | null;
  runCount: number;
  createdAt: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  skill: { id: string; name: string; prompt: string; icon?: string } | null;
  existingSchedule?: SkillSchedule | null;
  onSave: (schedule: SkillSchedule) => void;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const VAULT_PRESETS = [
  { label: 'Daily Pulse', path: 'pulse.md', desc: 'Morning briefing & daily summary' },
  { label: 'Session Log', path: 'session_log.md', desc: 'Running log of all AI sessions' },
  { label: 'Meeting Notes', path: 'meeting_notes.md', desc: 'Meeting prep & follow-ups' },
  { label: 'Weekly Review', path: 'weekly_review.md', desc: 'End-of-week reflections' },
  { label: 'Custom Path', path: '', desc: 'Write to a custom file in your vault' },
];

const FREQUENCY_OPTIONS = [
  { value: 'daily', label: 'Every day', desc: 'Runs once every day at the time you set', icon: '📅' },
  { value: 'weekdays', label: 'Weekdays only', desc: 'Monday through Friday', icon: '💼' },
  { value: 'weekly', label: 'Once a week', desc: 'Pick which day of the week', icon: '📆' },
  { value: 'custom', label: 'Custom days', desc: 'Choose specific days', icon: '🎯' },
];

export default function ScheduleSkillDialog({ open, onClose, skill, existingSchedule, onSave }: Props) {
  const [step, setStep] = useState(1);
  const [frequency, setFrequency] = useState<'daily' | 'weekdays' | 'weekly' | 'custom'>(existingSchedule?.frequency || 'daily');
  const [time, setTime] = useState(existingSchedule?.time || '09:00');
  const [customDays, setCustomDays] = useState<number[]>(existingSchedule?.customDays || [1]); // default Monday
  const [writeToVault, setWriteToVault] = useState(existingSchedule?.writeToVault || false);
  const [vaultPath, setVaultPath] = useState(existingSchedule?.vaultPath || 'pulse.md');
  const [customVaultPath, setCustomVaultPath] = useState('');
  const [vaultMode, setVaultMode] = useState<'append' | 'replace'>(existingSchedule?.vaultMode || 'append');
  const [sendNotification, setSendNotification] = useState(existingSchedule?.sendNotification ?? true);
  const [notificationTarget, setNotificationTarget] = useState<'gchat' | 'toast' | 'both'>(existingSchedule?.notificationTarget || 'toast');

  useEffect(() => {
    if (existingSchedule) {
      setFrequency(existingSchedule.frequency);
      setTime(existingSchedule.time);
      setCustomDays(existingSchedule.customDays || [1]);
      setWriteToVault(existingSchedule.writeToVault);
      setVaultPath(existingSchedule.vaultPath);
      setVaultMode(existingSchedule.vaultMode);
      setSendNotification(existingSchedule.sendNotification);
      setNotificationTarget(existingSchedule.notificationTarget);
    }
    setStep(1);
  }, [existingSchedule, open]);

  if (!open || !skill) return null;

  const toggleDay = (day: number) => {
    setCustomDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort());
  };

  const getNextRunTime = (): number => {
    const now = new Date();
    const [h, m] = time.split(':').map(Number);
    const target = new Date();
    target.setHours(h, m, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);

    // Adjust for frequency
    if (frequency === 'weekdays') {
      while (target.getDay() === 0 || target.getDay() === 6) {
        target.setDate(target.getDate() + 1);
      }
    } else if (frequency === 'weekly') {
      const targetDay = customDays[0] || 1;
      while (target.getDay() !== targetDay) {
        target.setDate(target.getDate() + 1);
      }
    } else if (frequency === 'custom') {
      while (!customDays.includes(target.getDay())) {
        target.setDate(target.getDate() + 1);
      }
    }
    return target.getTime();
  };

  const getScheduleDescription = (): string => {
    const timeStr = new Date(`2000-01-01T${time}`).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    switch (frequency) {
      case 'daily': return `Every day at ${timeStr}`;
      case 'weekdays': return `Weekdays at ${timeStr}`;
      case 'weekly': return `Every ${DAYS[customDays[0] || 1]} at ${timeStr}`;
      case 'custom': return `${customDays.map(d => DAYS[d]).join(', ')} at ${timeStr}`;
    }
  };

  const handleSave = () => {
    const finalVaultPath = vaultPath === '' ? customVaultPath : vaultPath;
    const schedule: SkillSchedule = {
      id: existingSchedule?.id || 'sched-' + crypto.randomUUID().slice(0, 8),
      skillId: skill.id,
      skillName: skill.name,
      skillPrompt: skill.prompt,
      skillIcon: skill.icon || '🧩',
      frequency,
      time,
      customDays: frequency === 'custom' || frequency === 'weekly' ? customDays : undefined,
      writeToVault,
      vaultPath: writeToVault ? finalVaultPath : '',
      vaultMode,
      sendNotification,
      notificationTarget,
      enabled: true,
      lastRun: existingSchedule?.lastRun || null,
      nextRun: getNextRunTime(),
      runCount: existingSchedule?.runCount || 0,
      createdAt: existingSchedule?.createdAt || Date.now(),
    };
    onSave(schedule);
    onClose();
  };

  // ─── Styles ──────────────────────────────────────────────────────────────────
  const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
  };
  const dialogStyle: React.CSSProperties = {
    background: 'var(--bg-primary)', borderRadius: '16px', width: '520px', maxHeight: '85vh',
    overflow: 'auto', border: '1px solid var(--border)', boxShadow: '0 24px 48px rgba(0,0,0,0.3)',
  };
  const headerStyle: React.CSSProperties = {
    padding: '20px 24px 16px', borderBottom: '1px solid var(--border)',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  };
  const bodyStyle: React.CSSProperties = { padding: '20px 24px' };
  const footerStyle: React.CSSProperties = {
    padding: '16px 24px', borderTop: '1px solid var(--border)',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px', display: 'block',
  };
  const hintStyle: React.CSSProperties = {
    fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '4px',
  };
  const cardStyle = (selected: boolean): React.CSSProperties => ({
    padding: '12px 16px', borderRadius: '10px', cursor: 'pointer', transition: 'all 0.15s',
    border: `1.5px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
    background: selected ? 'rgba(99,102,241,0.08)' : 'var(--bg-secondary)',
  });
  const btnPrimary: React.CSSProperties = {
    padding: '10px 24px', background: 'var(--accent)', color: 'white', border: 'none',
    borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
  };
  const btnSecondary: React.CSSProperties = {
    padding: '10px 20px', background: 'var(--bg-secondary)', color: 'var(--text-secondary)',
    border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', cursor: 'pointer',
  };

  // ─── Step indicators ─────────────────────────────────────────────────────────
  const steps = [
    { num: 1, label: 'When' },
    { num: 2, label: 'Save to Vault' },
    { num: 3, label: 'Review' },
  ];

  return (
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '20px' }}>⏰</span>
              <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Schedule Skill
              </span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
              {skill.icon || '🧩'} {skill.name}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: '20px', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Step indicator */}
        <div style={{ padding: '12px 24px', display: 'flex', gap: '4px', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
          {steps.map((s, i) => (
            <div key={s.num} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div style={{
                width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '11px', fontWeight: 700,
                background: step >= s.num ? 'var(--accent)' : 'var(--bg-secondary)',
                color: step >= s.num ? 'white' : 'var(--text-tertiary)',
              }}>
                {step > s.num ? '✓' : s.num}
              </div>
              <span style={{ fontSize: '12px', color: step === s.num ? 'var(--text-primary)' : 'var(--text-tertiary)', fontWeight: step === s.num ? 600 : 400 }}>
                {s.label}
              </span>
              {i < steps.length - 1 && <div style={{ width: '24px', height: '1px', background: 'var(--border)', margin: '0 4px' }} />}
            </div>
          ))}
        </div>

        {/* Body */}
        <div style={bodyStyle}>
          {/* ─── Step 1: When ─────────────────────────────────────────────────── */}
          {step === 1 && (
            <div>
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                  How often should this run?
                </div>
                <div style={hintStyle}>Choose when Claude should automatically run this skill for you</div>
              </div>

              <div style={{ display: 'grid', gap: '8px', marginBottom: '20px' }}>
                {FREQUENCY_OPTIONS.map(opt => (
                  <div
                    key={opt.value}
                    onClick={() => setFrequency(opt.value as typeof frequency)}
                    style={cardStyle(frequency === opt.value)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '18px' }}>{opt.icon}</span>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{opt.label}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{opt.desc}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Custom days picker */}
              {(frequency === 'custom' || frequency === 'weekly') && (
                <div style={{ marginBottom: '20px' }}>
                  <label style={labelStyle}>{frequency === 'weekly' ? 'Which day?' : 'Which days?'}</label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {DAYS.map((day, i) => (
                      <button
                        key={day}
                        onClick={() => {
                          if (frequency === 'weekly') {
                            setCustomDays([i]);
                          } else {
                            toggleDay(i);
                          }
                        }}
                        style={{
                          flex: 1, padding: '8px 4px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                          cursor: 'pointer', transition: 'all 0.15s',
                          border: `1.5px solid ${customDays.includes(i) ? 'var(--accent)' : 'var(--border)'}`,
                          background: customDays.includes(i) ? 'rgba(99,102,241,0.12)' : 'var(--bg-secondary)',
                          color: customDays.includes(i) ? 'var(--accent)' : 'var(--text-tertiary)',
                        }}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Time picker */}
              <div>
                <label style={labelStyle}>What time?</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    style={{
                      padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)',
                      background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '14px',
                      fontFamily: 'inherit',
                    }}
                  />
                  <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                    Your local time ({Intl.DateTimeFormat().resolvedOptions().timeZone})
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ─── Step 2: Vault Write-back ──────────────────────────────────────── */}
          {step === 2 && (
            <div>
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                  Save results to your Second Brain?
                </div>
                <div style={hintStyle}>
                  When this skill runs, the output can be automatically saved to a file in your Google Drive workspace — building your personal knowledge base over time.
                </div>
              </div>

              {/* Toggle */}
              <div
                onClick={() => setWriteToVault(!writeToVault)}
                style={{
                  ...cardStyle(writeToVault),
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: '16px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '18px' }}>📁</span>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Write to vault</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Save output to your Google Drive PARA workspace</div>
                  </div>
                </div>
                <div style={{
                  width: '40px', height: '22px', borderRadius: '11px', position: 'relative', cursor: 'pointer',
                  background: writeToVault ? 'var(--accent)' : 'var(--bg-tertiary, #555)', transition: 'background 0.2s',
                }}>
                  <div style={{
                    width: '18px', height: '18px', borderRadius: '50%', background: 'white', position: 'absolute',
                    top: '2px', left: writeToVault ? '20px' : '2px', transition: 'left 0.2s',
                  }} />
                </div>
              </div>

              {writeToVault && (
                <>
                  {/* Vault path presets */}
                  <div style={{ marginBottom: '16px' }}>
                    <label style={labelStyle}>Where should it be saved?</label>
                    <div style={{ display: 'grid', gap: '6px' }}>
                      {VAULT_PRESETS.map(preset => (
                        <div
                          key={preset.path}
                          onClick={() => setVaultPath(preset.path)}
                          style={cardStyle(vaultPath === preset.path)}
                        >
                          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{preset.label}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                            {preset.path ? preset.path : 'Enter your own file path'} — {preset.desc}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Custom path input */}
                  {vaultPath === '' && (
                    <div style={{ marginBottom: '16px' }}>
                      <label style={labelStyle}>Custom file path</label>
                      <input
                        type="text"
                        value={customVaultPath}
                        onChange={(e) => setCustomVaultPath(e.target.value)}
                        placeholder="e.g., projects/my-project/notes.md"
                        style={{
                          width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)',
                          background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px',
                          fontFamily: 'inherit', boxSizing: 'border-box',
                        }}
                      />
                      <div style={hintStyle}>Relative to your Google Drive workspace root</div>
                    </div>
                  )}

                  {/* Write mode */}
                  <div style={{ marginBottom: '16px' }}>
                    <label style={labelStyle}>How should it write?</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <div onClick={() => setVaultMode('append')} style={{ ...cardStyle(vaultMode === 'append'), flex: 1, textAlign: 'center' as const }}>
                        <div style={{ fontSize: '16px', marginBottom: '4px' }}>📝</div>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>Append</div>
                        <div style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>Add to the end of the file (recommended)</div>
                      </div>
                      <div onClick={() => setVaultMode('replace')} style={{ ...cardStyle(vaultMode === 'replace'), flex: 1, textAlign: 'center' as const }}>
                        <div style={{ fontSize: '16px', marginBottom: '4px' }}>🔄</div>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>Replace</div>
                        <div style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>Overwrite the file each time</div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Notification toggle */}
              <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
                <div
                  onClick={() => setSendNotification(!sendNotification)}
                  style={{
                    ...cardStyle(sendNotification),
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '18px' }}>🔔</span>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Notify me when it runs</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Get a summary when this skill completes</div>
                    </div>
                  </div>
                  <div style={{
                    width: '40px', height: '22px', borderRadius: '11px', position: 'relative', cursor: 'pointer',
                    background: sendNotification ? 'var(--accent)' : 'var(--bg-tertiary, #555)', transition: 'background 0.2s',
                  }}>
                    <div style={{
                      width: '18px', height: '18px', borderRadius: '50%', background: 'white', position: 'absolute',
                      top: '2px', left: sendNotification ? '20px' : '2px', transition: 'left 0.2s',
                    }} />
                  </div>
                </div>

                {sendNotification && (
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                    {[
                      { value: 'toast', label: 'In-app toast', icon: '💬' },
                      { value: 'gchat', label: 'Google Chat', icon: '💬' },
                      { value: 'both', label: 'Both', icon: '📢' },
                    ].map(opt => (
                      <div
                        key={opt.value}
                        onClick={() => setNotificationTarget(opt.value as typeof notificationTarget)}
                        style={{ ...cardStyle(notificationTarget === opt.value), flex: 1, textAlign: 'center' as const, padding: '8px' }}
                      >
                        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)' }}>{opt.label}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── Step 3: Review ────────────────────────────────────────────────── */}
          {step === 3 && (
            <div>
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                  Review your automation
                </div>
                <div style={hintStyle}>Here's what will happen when this schedule is active</div>
              </div>

              {/* Summary card */}
              <div style={{
                background: 'var(--bg-secondary)', borderRadius: '12px', padding: '20px',
                border: '1px solid var(--border)', marginBottom: '16px',
              }}>
                {/* Skill */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '28px' }}>{skill.icon || '🧩'}</span>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>{skill.name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Automated skill</div>
                  </div>
                </div>

                {/* Schedule details */}
                <div style={{ display: 'grid', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '16px' }}>⏰</span>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Schedule</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{getScheduleDescription()}</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '16px' }}>📁</span>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Vault Write-back</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {writeToVault
                          ? `${vaultMode === 'append' ? 'Append to' : 'Replace'} ${vaultPath || customVaultPath} in Google Drive`
                          : 'Not saving to vault'}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '16px' }}>🔔</span>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Notifications</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {sendNotification
                          ? `Via ${notificationTarget === 'both' ? 'in-app toast + Google Chat' : notificationTarget === 'gchat' ? 'Google Chat' : 'in-app toast'}`
                          : 'No notifications'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* How it works */}
              <div style={{
                background: 'rgba(99,102,241,0.06)', borderRadius: '10px', padding: '14px 16px',
                border: '1px solid rgba(99,102,241,0.15)',
              }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent)', marginBottom: '8px' }}>
                  How it works
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  When the scheduled time arrives, ArcadIA will send the skill's prompt to Claude through your Second Brain bridge.
                  {writeToVault && ' The response will be saved to your Google Drive vault.'}
                  {sendNotification && ' You\'ll receive a notification with a brief summary.'}
                  {' '}You can pause or edit this schedule anytime from the Skills panel.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={footerStyle}>
          <button
            onClick={() => step > 1 ? setStep(step - 1) : onClose()}
            style={btnSecondary}
          >
            {step > 1 ? '← Back' : 'Cancel'}
          </button>
          <div style={{ display: 'flex', gap: '8px' }}>
            {step < 3 ? (
              <button onClick={() => setStep(step + 1)} style={btnPrimary}>
                Next →
              </button>
            ) : (
              <button onClick={handleSave} style={btnPrimary}>
                {existingSchedule ? '💾 Update Schedule' : '⏰ Activate Schedule'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
