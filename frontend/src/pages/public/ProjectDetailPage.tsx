import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Github, Users, Award, Calendar, CheckCircle, Clock } from 'lucide-react';
import { api } from '../../services/api';
import { Project } from '../../types';
import { Badge } from '../../components/Badge';
import { Skeleton } from '../../components/Skeleton';

export const ProjectDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api.getGalleryProjectDetails(id)
      .then((data) => setProject(data.project))
      .catch((err) => setError(err.message || 'Failed to load project details'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        <Skeleton height="36px" width="200px" style={{ marginBottom: '1.5rem' }} />
        <Skeleton height="280px" borderRadius="var(--radius-lg)" style={{ marginBottom: '1.5rem' }} />
        <Skeleton height="180px" borderRadius="var(--radius-lg)" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="card" style={{ maxWidth: '600px', margin: '3rem auto', textAlign: 'center', padding: '3rem' }}>
        <h3 style={{ marginBottom: '0.75rem', color: 'var(--danger)' }}>Project Not Found</h3>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
          {error || 'This project does not exist or has not been publicly submitted yet.'}
        </p>
        <Link to="/gallery" className="btn btn-secondary">
          <ArrowLeft size={16} />
          <span>Return to Gallery</span>
        </Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '950px', margin: '0 auto' }}>
      {/* Back button */}
      <Link
        to="/gallery"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          color: 'var(--text-secondary)',
          fontSize: '0.875rem',
          marginBottom: '1.5rem'
        }}
      >
        <ArrowLeft size={16} />
        <span>Back to Gallery</span>
      </Link>

      {/* Main Project Header Card */}
      <div className="card" style={{ padding: '2rem', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize: '0.8125rem',
              padding: '0.25rem 0.65rem',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(99, 102, 241, 0.15)',
              color: '#a5b4fc',
              fontWeight: 600
            }}
          >
            {project.track_name || 'General Track'}
          </span>
          <Badge status={project.status} />
          {project.submitted_at && (
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <CheckCircle size={14} style={{ color: 'var(--success)' }} />
              Submitted {new Date(project.submitted_at).toLocaleDateString()}
            </span>
          )}
        </div>

        <h1 style={{ fontSize: '2.4rem', marginBottom: '0.5rem' }}>{project.title}</h1>

        {project.tagline && (
          <p style={{ fontSize: '1.125rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', fontWeight: 500 }}>
            {project.tagline}
          </p>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-subtle)', flexWrap: 'wrap' }}>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>HACKATHON</span>
            <Link to={`/events/${project.event_slug || project.event_id}`} style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9375rem' }}>
              {project.event_name}
            </Link>
          </div>

          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>TEAM</span>
            <span style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{project.team_name}</span>
          </div>

          {/* Links */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.75rem' }}>
            {project.links?.map((link) => (
              <a
                key={link.id || link.url}
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="btn btn-secondary btn-sm"
              >
                {link.type === 'GITHUB' ? <Github size={15} /> : <ExternalLink size={15} />}
                <span>{link.title}</span>
              </a>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>
        {/* Left Column: Project Description */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <div className="card" style={{ padding: '2rem' }}>
            <h3 style={{ marginBottom: '1.25rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.75rem' }}>
              About the Project
            </h3>
            <div style={{ color: 'var(--text-secondary)', lineHeight: 1.7, fontSize: '0.9375rem', whiteSpace: 'pre-wrap' }}>
              {project.description}
            </div>
          </div>

          {project.submission_notes && (
            <div className="card" style={{ padding: '1.5rem' }}>
              <h4 style={{ fontSize: '0.9375rem', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
                Submission Notes
              </h4>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', fontStyle: 'italic' }}>
                "{project.submission_notes}"
              </p>
            </div>
          )}
        </div>

        {/* Right Column: Team Roster */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="card">
            <h3 style={{ fontSize: '1.125rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Users size={18} style={{ color: 'var(--primary)' }} />
              <span>Team Members</span>
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {project.team_members?.map((member) => (
                <div
                  key={member.user_id || member.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.5rem 0',
                    borderBottom: '1px solid var(--border-subtle)'
                  }}
                >
                  <img
                    src={member.avatar_url || 'https://api.dicebear.com/7.x/bottts/svg?seed=user'}
                    alt={member.full_name}
                    style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover' }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>{member.full_name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {member.bio || (member.role === 'LEADER' ? 'Team Leader' : 'Team Member')}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: '0.6875rem',
                      fontWeight: 700,
                      padding: '0.15rem 0.45rem',
                      borderRadius: 'var(--radius-sm)',
                      background: member.role === 'LEADER' ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                      color: member.role === 'LEADER' ? '#a5b4fc' : 'var(--text-muted)'
                    }}
                  >
                    {member.role}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
