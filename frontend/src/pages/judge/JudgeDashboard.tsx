import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Award, Compass, Sparkles, Layers, CheckCircle2, Clock, FileText } from 'lucide-react';
import { api } from '../../services/api';
import { Event } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { CountdownTimer } from '../../components/CountdownTimer';
import { Skeleton } from '../../components/Skeleton';

export const JudgeDashboard: React.FC = () => {
  const { user } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getPublicEvents()
      .then((data) => setEvents(data.events || []))
      .catch((err) => console.error('Failed to load judge events', err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ marginBottom: '0.35rem' }}>
          Judge Portal: <span className="gradient-text">{user?.full_name}</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          Assigned evaluations and hackathon judging overview.
        </p>
      </div>

      {/* Tier 2 Extension Blueprint Notice Card */}
      <div
        className="card"
        style={{
          padding: '2rem',
          marginBottom: '2rem',
          background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.85) 0%, rgba(15, 23, 42, 0.95) 100%)',
          border: '1px solid rgba(139, 92, 246, 0.4)',
          boxShadow: 'var(--shadow-lg)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <div
            style={{
              padding: '0.5rem',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(139, 92, 246, 0.2)',
              color: 'var(--accent-purple)'
            }}
          >
            <Sparkles size={24} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.25rem' }}>Tier 2 Judging Engine Architecture Ready</h3>
            <span style={{ fontSize: '0.8125rem', color: '#a5b4fc', fontWeight: 600 }}>
              Tier 1 Core Active — Evaluation Phase Commences After Submission Deadline
            </span>
          </div>
        </div>

        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9375rem', lineHeight: 1.6, marginBottom: '1.25rem' }}>
          In accordance with the DOGFOOD specification, the submission and registration pipeline (Tier 1) is fully implemented. The judging engine modules, rubric schema, and assignment interfaces are defined in <code>JUDGING.md</code> and <code>backend/src/modules/judging/</code>.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
            <CheckCircle2 size={16} style={{ color: 'var(--success)' }} />
            <span>Weighted Rubrics (Ready)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
            <CheckCircle2 size={16} style={{ color: 'var(--success)' }} />
            <span>Batch Judge Assignment (Ready)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
            <CheckCircle2 size={16} style={{ color: 'var(--success)' }} />
            <span>Score Normalization (Ready)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
            <CheckCircle2 size={16} style={{ color: 'var(--success)' }} />
            <span>Audit Trail & CSV Export (Ready)</span>
          </div>
        </div>
      </div>

      {/* Current Hackathons in Submission Phase */}
      <div className="card" style={{ padding: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h3>Current Hackathons (Submission Phase)</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              Submissions will become available for scored rubric evaluation once the submission window closes.
            </p>
          </div>

          <Link to="/gallery" className="btn btn-primary btn-sm">
            <Compass size={15} />
            <span>Inspect Public Gallery</span>
          </Link>
        </div>

        {loading ? (
          <Skeleton height="150px" borderRadius="var(--radius-md)" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {events.map((event) => (
              <div
                key={event.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '1rem 1.25rem',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid var(--border-subtle)',
                  flexWrap: 'wrap',
                  gap: '1rem'
                }}
              >
                <div>
                  <h4 style={{ fontSize: '1.05rem', marginBottom: '0.25rem' }}>{event.name}</h4>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                    Total Submissions Received: <strong>{event.submission_count || 0}</strong>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <CountdownTimer deadline={event.submission_deadline} />
                  <Link to="/gallery" className="btn btn-secondary btn-sm">
                    Preview Entries
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
