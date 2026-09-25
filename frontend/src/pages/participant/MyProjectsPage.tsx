import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FolderGit2, PlusCircle, ArrowRight, ExternalLink, Clock, CheckCircle2 } from 'lucide-react';
import { api } from '../../services/api';
import { Project } from '../../types';
import { Badge } from '../../components/Badge';
import { CountdownTimer } from '../../components/CountdownTimer';
import { Skeleton } from '../../components/Skeleton';
import { EmptyState } from '../../components/EmptyState';

export const MyProjectsPage: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getMyProjects()
      .then((data) => setProjects(data.projects || []))
      .catch((err) => console.error('Failed to load projects', err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ marginBottom: '0.35rem' }}>My Projects</h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            Draft your hackathon solutions, add demonstration links, and submit before deadlines.
          </p>
        </div>

        <Link to="/participant/projects/new" className="btn btn-primary">
          <PlusCircle size={16} />
          <span>New Project Submission</span>
        </Link>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <Skeleton height="180px" borderRadius="var(--radius-lg)" />
          <Skeleton height="180px" borderRadius="var(--radius-lg)" />
        </div>
      ) : projects.length === 0 ? (
        <EmptyState
          icon={<FolderGit2 size={32} />}
          title="No projects drafted yet"
          description="Create a project draft for your team to prepare your hackathon submission."
          actionText="Create Project Draft"
          onAction={() => (window.location.href = '/participant/projects/new')}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {projects.map((project) => (
            <div
              key={project.id}
              className="card card-hover"
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                padding: '1.75rem',
                gap: '1.25rem'
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span
                      style={{
                        fontSize: '0.8125rem',
                        fontWeight: 600,
                        padding: '0.2rem 0.5rem',
                        borderRadius: 'var(--radius-sm)',
                        background: 'rgba(99, 102, 241, 0.15)',
                        color: '#a5b4fc'
                      }}
                    >
                      {project.event_name}
                    </span>
                    <Badge status={project.status} />
                  </div>

                  {project.submission_deadline && (
                    <CountdownTimer deadline={project.submission_deadline} />
                  )}
                </div>

                <h3 style={{ fontSize: '1.4rem', marginBottom: '0.35rem' }}>{project.title}</h3>
                {project.tagline && (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
                    {project.tagline}
                  </p>
                )}

                <p
                  style={{
                    color: 'var(--text-muted)',
                    fontSize: '0.8125rem',
                    lineHeight: 1.5,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden'
                  }}
                >
                  {project.description}
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', gap: '1.25rem', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                  <span>Team: <strong>{project.team_name}</strong></span>
                  <span>Track: <strong>{project.track_name || 'General Track'}</strong></span>
                  <span>Links: <strong>{project.links?.length || 0}</strong></span>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <Link to={`/participant/projects/${project.id}/edit`} className="btn btn-primary btn-sm">
                    <span>{project.status === 'SUBMITTED' ? 'View / Update' : 'Edit Draft'}</span>
                    <ArrowRight size={14} />
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
