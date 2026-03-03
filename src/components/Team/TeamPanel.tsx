import React, { useState, useEffect } from 'react';
import type { TeamPod, PodMember } from '../../types';
import { storage } from '../../services/storage';

const SAMPLE_TEAMS: TeamPod[] = [
  {
    id: 'pod-1', name: 'Frontend Pod', description: 'Frontend engineering team working on React applications',
    members: [
      { userId: 'u1', name: 'You', role: 'admin', joinedAt: Date.now() },
      { userId: 'u2', name: 'Alice Chen', role: 'member', joinedAt: Date.now() - 86400000 },
      { userId: 'u3', name: 'Bob Smith', role: 'member', joinedAt: Date.now() - 172800000 },
      { userId: 'ai-1', name: 'Claude (Sonnet)', role: 'member', joinedAt: Date.now(), isAiAgent: true, agentType: 'claude-sonnet' },
    ],
    createdAt: Date.now() - 604800000, ownerId: 'u1',
  },
];

export function TeamPanel() {
  const [teams, setTeams] = useState<TeamPod[]>(() => {
    const saved = storage.getTeams();
    return saved.length > 0 ? saved : SAMPLE_TEAMS;
  });
  const [selectedTeam, setSelectedTeam] = useState<TeamPod | null>(teams[0] || null);
  const [showCreate, setShowCreate] = useState(false);
  const [newTeam, setNewTeam] = useState({ name: '', description: '' });
  const [newMember, setNewMember] = useState('');

  useEffect(() => { storage.saveTeams(teams); }, [teams]);

  const handleCreateTeam = () => {
    if (!newTeam.name) return;
    const team: TeamPod = {
      id: crypto.randomUUID(),
      name: newTeam.name,
      description: newTeam.description,
      members: [{ userId: 'u1', name: 'You', role: 'admin', joinedAt: Date.now() }],
      createdAt: Date.now(),
      ownerId: 'u1',
    };
    setTeams(prev => [...prev, team]);
    setSelectedTeam(team);
    setNewTeam({ name: '', description: '' });
    setShowCreate(false);
  };

  const handleAddMember = (teamId: string) => {
    if (!newMember.trim()) return;
    const member: PodMember = {
      userId: crypto.randomUUID(),
      name: newMember.trim(),
      role: 'member',
      joinedAt: Date.now(),
    };
    setTeams(prev => prev.map(t => t.id === teamId ? { ...t, members: [...t.members, member] } : t));
    setSelectedTeam(prev => prev?.id === teamId ? { ...prev, members: [...prev.members, member] } : prev);
    setNewMember('');
  };

  const handleAddAiAgent = (teamId: string) => {
    const agent: PodMember = {
      userId: `ai-${crypto.randomUUID().slice(0, 8)}`,
      name: 'Claude (AI Agent)',
      role: 'member',
      joinedAt: Date.now(),
      isAiAgent: true,
      agentType: 'claude-sonnet',
    };
    setTeams(prev => prev.map(t => t.id === teamId ? { ...t, members: [...t.members, agent] } : t));
    setSelectedTeam(prev => prev?.id === teamId ? { ...prev, members: [...prev.members, agent] } : prev);
  };

  const handleRemoveMember = (teamId: string, userId: string) => {
    setTeams(prev => prev.map(t =>
      t.id === teamId ? { ...t, members: t.members.filter(m => m.userId !== userId) } : t
    ));
    setSelectedTeam(prev =>
      prev?.id === teamId ? { ...prev, members: prev.members.filter(m => m.userId !== userId) } : prev
    );
  };

  const css = {
    panel: { maxWidth: '800px', margin: '0 auto', padding: '24px', height: '100vh', overflow: 'auto' } as React.CSSProperties,
    title: { fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' } as React.CSSProperties,
    subtitle: { fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '20px' } as React.CSSProperties,
    card: (selected: boolean) => ({ padding: '16px', background: 'var(--bg-secondary)', border: '1px solid ' + (selected ? 'var(--accent)' : 'var(--border)'), borderRadius: '12px', cursor: 'pointer', marginBottom: '8px', transition: 'all 0.15s' }) as React.CSSProperties,
    cardName: { fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' } as React.CSSProperties,
    cardDesc: { fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' } as React.CSSProperties,
    cardMeta: { fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '8px' } as React.CSSProperties,
    detail: { padding: '20px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', marginTop: '16px' } as React.CSSProperties,
    memberRow: { display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '8px', transition: 'background 0.1s' } as React.CSSProperties,
    avatar: (isAi: boolean) => ({ width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 600, background: isAi ? 'linear-gradient(135deg, #d97706, #f59e0b)' : 'var(--accent)', color: 'white', flexShrink: 0 }) as React.CSSProperties,
    memberInfo: { flex: 1 } as React.CSSProperties,
    memberName: { fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' } as React.CSSProperties,
    memberRole: { fontSize: '11px', color: 'var(--text-tertiary)' } as React.CSSProperties,
    btn: { padding: '10px 20px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 } as React.CSSProperties,
    input: { flex: 1, padding: '10px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '13px', outline: 'none' } as React.CSSProperties,
    removeBtn: { background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: '4px 8px', fontSize: '14px', borderRadius: '4px' } as React.CSSProperties,
    authBanner: { padding: '16px', background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: '12px', marginBottom: '20px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 } as React.CSSProperties,
  };

  return (
    <div style={css.panel}>
      <div style={css.title}>Team Pods</div>
      <div style={css.subtitle}>Manage your pods of humans and AI agents. Collaborate in shared conversation spaces.</div>

      <div style={css.authBanner}>
        <strong style={{ color: 'var(--accent)' }}>Meta SSO Authentication</strong><br />
        Team access is controlled via Meta SSO. Members are authenticated through your organization's identity provider.
        Content visibility is managed by ownership and team membership.
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button style={css.btn} onClick={() => setShowCreate(p => !p)}>+ Create Pod</button>
      </div>

      {showCreate && (
        <div style={{ ...css.detail, marginBottom: '16px', marginTop: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>New Pod</div>
          <div style={{ marginBottom: '10px' }}>
            <input style={{ ...css.input, width: '100%', marginBottom: '8px', boxSizing: 'border-box' as const }} value={newTeam.name} onChange={e => setNewTeam(p => ({ ...p, name: e.target.value }))} placeholder="Pod name" />
            <input style={{ ...css.input, width: '100%', boxSizing: 'border-box' as const }} value={newTeam.description} onChange={e => setNewTeam(p => ({ ...p, description: e.target.value }))} placeholder="Description" />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button style={css.btn} onClick={handleCreateTeam}>Create</button>
            <button style={{ ...css.btn, background: 'var(--bg-primary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }} onClick={() => setShowCreate(false)}>Cancel</button>
          </div>
        </div>
      )}

      {teams.map(team => (
        <div key={team.id} style={css.card(selectedTeam?.id === team.id)} onClick={() => setSelectedTeam(team)}>
          <div style={css.cardName}>{team.name}</div>
          <div style={css.cardDesc}>{team.description}</div>
          <div style={css.cardMeta}>
            {team.members.length} members ({team.members.filter(m => m.isAiAgent).length} AI agents)
          </div>
        </div>
      ))}

      {selectedTeam && (
        <div style={css.detail}>
          <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>
            {selectedTeam.name} - Members
          </div>

          {selectedTeam.members.map(member => (
            <div key={member.userId} style={css.memberRow}>
              <div style={css.avatar(!!member.isAiAgent)}>
                {member.isAiAgent ? 'AI' : member.name.charAt(0)}
              </div>
              <div style={css.memberInfo}>
                <div style={css.memberName}>
                  {member.name}
                  {member.isAiAgent && <span style={{ fontSize: '10px', color: 'var(--accent)', marginLeft: '6px', background: 'var(--accent-dim)', padding: '2px 6px', borderRadius: '8px' }}>AI Agent</span>}
                </div>
                <div style={css.memberRole}>{member.role} · Joined {new Date(member.joinedAt).toLocaleDateString()}</div>
              </div>
              {member.userId !== 'u1' && (
                <button style={css.removeBtn} onClick={() => handleRemoveMember(selectedTeam.id, member.userId)}>x</button>
              )}
            </div>
          ))}

          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <input style={css.input} value={newMember} onChange={e => setNewMember(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddMember(selectedTeam.id)} placeholder="Add member by name..." />
            <button style={css.btn} onClick={() => handleAddMember(selectedTeam.id)}>Add</button>
            <button style={{ ...css.btn, background: 'linear-gradient(135deg, #d97706, #f59e0b)' }} onClick={() => handleAddAiAgent(selectedTeam.id)}>+ AI Agent</button>
          </div>

          <div style={{ marginTop: '16px', fontSize: '12px', color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
            <strong>Access Control:</strong> Pod admins can manage members. Content shared with this pod is visible to all members.
            Use conversation visibility settings (Private / Team / Public) to control access.
          </div>
        </div>
      )}
    </div>
  );
}
