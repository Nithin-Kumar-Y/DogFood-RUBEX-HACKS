import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  FolderGit2,
  Send,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  PlusCircle,
  Sparkles,
  ExternalLink
} from 'lucide-react';
import { api } from '../../services/api';
import { Team, Project } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { Badge } from '../../components/Badge';
import { CountdownTimer } from '../../components/CountdownTimer';
import { Skeleton } from '../../components/Skeleton';
import { EmptyState } from '../../components/EmptyState';

export const ParticipantDashboard: React.FC = () => {
  const { user } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getMyTeams(), api.getMyProjects()])
      .then(([teamsData, projectsData]) => {
        setTeams(teamsData.teams || []);
        setProjects(projectsData.projects || []);
      })
      .catch((err) => console.error('Failed to load participant dashboard', err))
      .finally(() => setLoading(false));
  }, []);

  const activeTeam = teams[0];
  const activeProject = projects.find((p) => p.team_id === activeTeam?.id) || projects[0];

  return (
    <div>
      {/* Welcome Banner */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ marginBottom: '0.35rem' }}>
          Welcome back, <span className="gradient-text">{user?.full_name}</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          Participant Workspace & Mission Control
        </p>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <Skeleton height="160px" borderRadius="var(--radius-lg)" />
          <div className="grid-cols-2">
            <Skeleton height="260px" borderRadius="var(--radius-lg)" />
            <Skeleton height="260px" borderRadius="var(--radius-lg)" />
          </div>
        </div>
      ) : teams.length === 0 ? (
        <EmptyState
          icon={<Users size={32} />}
          title="You haven't joined a hackathon team yet"
          description="Form a new team or enter an invite code to begin drafting your project submission."
          actionText="Create or Join a Team"
          onAction={() => (window.location.href = '/participant/teams')}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {/* Action Center Card: What is happening? What needs attention? Next action? */}
          <div
            className="card"
            style={{
              padding: '1.75rem 2rem',
              background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.85) 0%, rgba(15, 23, 42, 0.95) 100%)',
              border: '1px solid rgba(99, 102, 241, 0.35)',
              boxShadow: 'var(--shadow-lg), var(--shadow-glow)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--primary-light)',
                    color: '#a5b4fc',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <Sparkles size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.2rem' }}>Hackathon Status: {activeTeam.event_name}</h3>
                  <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                    Team: <strong>{activeTeam.name}</strong> (Code: <code>{activeTeam.code}</code>)
                  </span>
                </div>
              </div>

              {activeTeam.submission_deadline && (
                <CountdownTimer deadline={activeTeam.submission_deadline} />
              )}
            </div>

            {/* Next Action Box */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '1.25rem',
                padding: '1.25rem',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(0, 0, 0, 0.25)',
                border: '1px solid var(--border-subtle)'
              }}
            >
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
                  1. WHAT IS HAPPENING?
                </span>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                  Active event window is open. Submissions are being accepted until the deadline.
                </p>
              </div>

              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
                  2. WHAT NEEDS ATTENTION?
                </span>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                  {activeProject
                    ? activeProject.status === 'SUBMITTED'
                      ? '✓ Project is submitted! You can update notes before the deadline.'
                      : '⚠ Project draft is in progress. Ensure title, description, and links are added.'
                    : '⚠ No project created yet for your team.'}
                </p>
              </div>

              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
                  3. NEXT RECOMMENDED ACTION
                </span>
                <div style={{ marginTop: '0.35rem' }}>
                  {activeProject ? (
                    <Link
                      to={`/participant/projects/${activeProject.id}/edit`}
                      className="btn btn-primary btn-sm"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                    >
                      <span>{activeProject.status === 'SUBMITTED' ? 'Review Submission' : 'Edit & Submit Project'}</span>
                      <ArrowRight size={14} />
                    </Link>
                  ) : (
                    <Link
                      to="/participant/projects/new"
                      className="btn btn-primary btn-sm"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                    >
                      <span>Create Project Draft</span>
                      <PlusCircle size={14} />
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Quick Overview Grid: Active Team & Active Project */}
          <div className="grid-cols-2">
            {/* Team Card */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Users size={18} style={{ color: 'var(--primary)' }} />
                    <h3 style={{ fontSize: '1.125rem' }}>My Team: {activeTeam.name}</h3>
                  </div>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      background: 'rgba(99, 102, 241, 0.15)',
                      color: '#a5b4fc',
                      padding: '0.2rem 0.5rem',
                      borderRadius: 'var(--radius-sm)'
                    }}
                  >
                    {activeTeam.my_role || 'LEADER'}
                  </span>
                </div>

                <div style={{ marginBottom: '1.25rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                  Team Code for Teammates:{' '}
                  <strong style={{ color: '#fff', letterSpacing: '0.05em', background: 'rgba(255, 255, 255, 0.08)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                    {activeTeam.code}
                  </strong>
                </div>

                <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
                  Total Team Members: <strong>{activeTeam.member_count || 1}</strong>
                </p>
              </div>

              <div style={{ paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'flex-end' }}>
                <Link to="/participant/teams" className="btn btn-secondary btn-sm">
                  <span>Manage Team & Invites</span>
                  <ArrowRight size={14} />
                </Link>
              </div>
            </div>

            {/* Project Card */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <FolderGit2 size={18} style={{ color: 'var(--accent-purple)' }} />
                    <h3 style={{ fontSize: '1.125rem' }}>Project Submission</h3>
                  </div>
                  <Badge status={activeProject?.status || 'DRAFT'} />
                </div>

                {activeProject ? (
                  <div>
                    <h4 style={{ fontSize: '1.125rem', marginBottom: '0.35rem' }}>{activeProject.title}</h4>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', lineHeight: 1.5, marginBottom: '1rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {activeProject.description || 'No description added yet.'}
                    </p>
                    <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                      <span>Track: <strong>{activeProject.track_name || 'Unassigned'}</strong></span>
                      <span>Links: <strong>{activeProject.links?.length || 0}</strong></span>
                    </div>
                  </div>
                ) : (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                    No project drafted yet. Start drafting now to submit before the deadline!
                  </p>
                )}
              </div>

              <div style={{ paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                {activeProject ? (
                  <Link to={`/participant/projects/${activeProject.id}/edit`} className="btn btn-primary btn-sm">
                    <span>{activeProject.status === 'SUBMITTED' ? 'View Submission' : 'Edit Project'}</span>
                    <ArrowRight size={14} />
                  </Link>
                ) : (
                  <Link to="/participant/projects/new" className="btn btn-primary btn-sm">
                    <span>Create Project</span>
                    <PlusCircle size={14} />
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
