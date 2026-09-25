import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Users, PlusCircle, UserPlus, LogOut, Copy, Check, Shield } from 'lucide-react';
import { api } from '../../services/api';
import { Team, Event } from '../../types';
import { Modal } from '../../components/Modal';
import { useToast } from '../../context/ToastContext';
import { Skeleton } from '../../components/Skeleton';
import { EmptyState } from '../../components/EmptyState';

export const MyTeamsPage: React.FC = () => {
  const [teams, setTeams] = useState<Team[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const location = useLocation();
  const toast = useToast();

  // Create Team modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [teamName, setTeamName] = useState('');
  const [creating, setCreating] = useState(false);

  // Invite Member modal state
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteResult, setInviteResult] = useState<{ token: string; link: string } | null>(null);
  const [inviting, setInviting] = useState(false);
  const [copied, setCopied] = useState(false);

  // Full team details map
  const [selectedTeamDetails, setSelectedTeamDetails] = useState<Record<string, any>>({});

  const loadData = async () => {
    setLoading(true);
    try {
      const [teamsData, eventsData] = await Promise.all([
        api.getMyTeams(),
        api.getPublicEvents()
      ]);
      const loadedTeams: Team[] = teamsData.teams || [];
      setTeams(loadedTeams);
      setEvents(eventsData.events || []);

      // Load deep details for each team
      for (const t of loadedTeams) {
        api.getTeam(t.id).then((res) => {
          setSelectedTeamDetails((prev) => ({ ...prev, [t.id]: res.team }));
        });
      }
    } catch (err) {
      console.error('Failed to load teams', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Check if autoOpen was requested from Events page
    const state = location.state as any;
    if (state?.autoOpenCreate) {
      if (state.eventId) setSelectedEventId(state.eventId);
      setCreateModalOpen(true);
    }
  }, []);

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEventId || !teamName.trim()) {
      toast.error('Please select an event and provide a team name.');
      return;
    }

    setCreating(true);
    try {
      await api.createTeam({ event_id: selectedEventId, name: teamName.trim() });
      toast.success('Team formed successfully!');
      setCreateModalOpen(false);
      setTeamName('');
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create team');
    } finally {
      setCreating(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTeamId || !inviteEmail.trim()) {
      toast.error('Please provide a valid email address.');
      return;
    }

    setInviting(true);
    try {
      const res = await api.inviteMember(activeTeamId, inviteEmail.trim());
      setInviteResult({
        token: res.token,
        link: `${window.location.origin}${res.inviteLink}`
      });
      toast.success('Invitation generated!');
      setInviteEmail('');
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to send invite');
    } finally {
      setInviting(false);
    }
  };

  const handleLeaveTeam = async (teamId: string, teamName: string) => {
    if (!window.confirm(`Are you sure you want to leave team '${teamName}'?`)) return;

    try {
      const res = await api.leaveTeam(teamId);
      toast.info(res.message || 'You left the team.');
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to leave team');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ marginBottom: '0.35rem' }}>My Teams</h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            Manage team rosters, generate invitation codes, and coordinate with collaborators.
          </p>
        </div>

        <button onClick={() => setCreateModalOpen(true)} className="btn btn-primary">
          <PlusCircle size={16} />
          <span>Create New Team</span>
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <Skeleton height="200px" borderRadius="var(--radius-lg)" />
          <Skeleton height="200px" borderRadius="var(--radius-lg)" />
        </div>
      ) : teams.length === 0 ? (
        <EmptyState
          icon={<Users size={32} />}
          title="No Teams Yet"
          description="You are not currently part of any hackathon teams. Form a team to compete and build projects."
          actionText="Create Team Now"
          onAction={() => setCreateModalOpen(true)}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {teams.map((team) => {
            const details = selectedTeamDetails[team.id] || team;
            const members = details.members || [];

            return (
              <div key={team.id} className="card" style={{ padding: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                      <h2 style={{ fontSize: '1.6rem' }}>{team.name}</h2>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          padding: '0.2rem 0.5rem',
                          borderRadius: 'var(--radius-sm)',
                          background: 'rgba(99, 102, 241, 0.15)',
                          color: '#a5b4fc'
                        }}
                      >
                        {team.my_role || 'LEADER'}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                      Competing in <strong>{team.event_name}</strong>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <button
                      onClick={() => {
                        setActiveTeamId(team.id);
                        setInviteResult(null);
                        setInviteModalOpen(true);
                      }}
                      className="btn btn-secondary btn-sm"
                    >
                      <UserPlus size={15} />
                      <span>Invite Members</span>
                    </button>

                    <button
                      onClick={() => handleLeaveTeam(team.id, team.name)}
                      className="btn btn-danger btn-sm"
                    >
                      <LogOut size={15} />
                      <span>Leave Team</span>
                    </button>
                  </div>
                </div>

                {/* Team Code Callout */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.85rem 1.25rem',
                    background: 'rgba(0, 0, 0, 0.25)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-subtle)',
                    marginBottom: '1.5rem',
                    flexWrap: 'wrap',
                    gap: '0.75rem'
                  }}
                >
                  <div style={{ fontSize: '0.875rem' }}>
                    <span style={{ color: 'var(--text-muted)', marginRight: '0.5rem' }}>Team Invite Code:</span>
                    <code style={{ fontSize: '1.1rem', fontWeight: 700, color: '#a5b4fc', letterSpacing: '0.05em' }}>
                      {team.code}
                    </code>
                  </div>
                  <button
                    onClick={() => copyToClipboard(team.code)}
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                  >
                    {copied ? <Check size={14} style={{ color: 'var(--success)' }} /> : <Copy size={14} />}
                    <span>{copied ? 'Copied' : 'Copy Code'}</span>
                  </button>
                </div>

                {/* Members List */}
                <div>
                  <h3 style={{ fontSize: '1rem', marginBottom: '1rem', color: 'var(--text-secondary)' }}>
                    Team Roster ({members.length})
                  </h3>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                    {members.map((m: any) => (
                      <div
                        key={m.user_id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.75rem',
                          padding: '0.75rem 1rem',
                          borderRadius: 'var(--radius-md)',
                          background: 'rgba(255, 255, 255, 0.03)',
                          border: '1px solid var(--border-subtle)'
                        }}
                      >
                        <img
                          src={m.avatar_url || 'https://api.dicebear.com/7.x/bottts/svg?seed=user'}
                          alt={m.full_name}
                          style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>{m.full_name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{m.email}</div>
                        </div>
                        <span
                          style={{
                            fontSize: '0.6875rem',
                            fontWeight: 700,
                            padding: '0.15rem 0.45rem',
                            borderRadius: 'var(--radius-sm)',
                            background: m.role === 'LEADER' ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                            color: m.role === 'LEADER' ? '#a5b4fc' : 'var(--text-muted)'
                          }}
                        >
                          {m.role}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Create Team */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Create a New Hackathon Team"
      >
        <form onSubmit={handleCreateTeam}>
          <div className="form-group">
            <label className="form-label">Select Hackathon Event</label>
            <select
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              required
              className="form-select"
            >
              <option value="">-- Choose an Event --</option>
              {events.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Team Name</label>
            <input
              type="text"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="e.g. Neural Pioneers"
              required
              className="form-input"
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button
              type="button"
              onClick={() => setCreateModalOpen(false)}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button type="submit" disabled={creating} className="btn btn-primary">
              {creating ? 'Creating...' : 'Form Team'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Invite Teammates */}
      <Modal
        isOpen={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        title="Invite Teammates"
      >
        <form onSubmit={handleInvite}>
          <div className="form-group">
            <label className="form-label">Teammate Email Address</label>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="peer@example.com"
              required
              className="form-input"
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
            <button
              type="button"
              onClick={() => setInviteModalOpen(false)}
              className="btn btn-secondary"
            >
              Close
            </button>
            <button type="submit" disabled={inviting} className="btn btn-primary">
              {inviting ? 'Generating...' : 'Generate Invite'}
            </button>
          </div>
        </form>

        {inviteResult && (
          <div
            style={{
              marginTop: '1.5rem',
              padding: '1.25rem',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(0, 0, 0, 0.3)',
              border: '1px solid rgba(99, 102, 241, 0.3)'
            }}
          >
            <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#a5b4fc', marginBottom: '0.5rem' }}>
              Direct Invitation Link Generated:
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="text"
                readOnly
                value={inviteResult.link}
                className="form-input"
                style={{ fontSize: '0.8125rem' }}
              />
              <button
                onClick={() => copyToClipboard(inviteResult.link)}
                className="btn btn-secondary btn-sm"
              >
                Copy
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
