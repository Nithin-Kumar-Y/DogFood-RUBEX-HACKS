import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Send, Filter, ExternalLink, Calendar, Users, CheckCircle2 } from 'lucide-react';
import { api } from '../../services/api';
import { SubmissionRecord, Event } from '../../types';
import { Badge } from '../../components/Badge';
import { Skeleton } from '../../components/Skeleton';
import { EmptyState } from '../../components/EmptyState';

export const SubmissionsReviewPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const eventIdParam = searchParams.get('eventId') || '';

  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState(eventIdParam);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getOrganizerEvents().then((d) => setEvents(d.events || []));
  }, []);

  useEffect(() => {
    setLoading(true);
    api.listSubmissions({ eventId: selectedEventId || undefined })
      .then((data) => setSubmissions(data.submissions || []))
      .catch((err) => console.error('Failed to load submissions', err))
      .finally(() => setLoading(false));
  }, [selectedEventId]);

  const handleFilterChange = (eId: string) => {
    setSelectedEventId(eId);
    if (eId) setSearchParams({ eventId: eId });
    else setSearchParams({});
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ marginBottom: '0.35rem' }}>Submissions Review</h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            Examine validated project submissions received before the deadline.
          </p>
        </div>

        {/* Filter Dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Filter size={16} style={{ color: 'var(--text-muted)' }} />
          <select
            value={selectedEventId}
            onChange={(e) => handleFilterChange(e.target.value)}
            className="form-select"
            style={{ width: 'auto', minWidth: '220px' }}
          >
            <option value="">All Managed Events</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <Skeleton height="350px" borderRadius="var(--radius-lg)" />
      ) : submissions.length === 0 ? (
        <EmptyState
          icon={<Send size={32} />}
          title="No Submissions Received Yet"
          description={
            selectedEventId
              ? 'No projects have been submitted for this specific event yet.'
              : 'None of your active hackathons have received submissions yet.'
          }
        />
      ) : (
        <div className="card" style={{ padding: '1.5rem', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '0.85rem 1rem' }}>Project Title</th>
                <th style={{ padding: '0.85rem 1rem' }}>Team</th>
                <th style={{ padding: '0.85rem 1rem' }}>Event & Track</th>
                <th style={{ padding: '0.85rem 1rem' }}>Submitter</th>
                <th style={{ padding: '0.85rem 1rem' }}>Submitted At</th>
                <th style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((sub) => (
                <tr key={sub.submission_id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '1rem', fontWeight: 600 }}>
                    <Link to={`/gallery/${sub.project_id}`} style={{ color: 'var(--text-primary)' }}>
                      {sub.project_title}
                    </Link>
                    {sub.tagline && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                        {sub.tagline}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>
                    {sub.team_name}
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <div style={{ fontWeight: 500 }}>{sub.event_name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#a5b4fc' }}>
                      {sub.track_name || 'General Track'}
                    </div>
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <div>{sub.submitter_name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{sub.submitter_email}</div>
                  </td>
                  <td style={{ padding: '1rem', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <CheckCircle2 size={14} style={{ color: 'var(--success)' }} />
                      <span>{new Date(sub.submitted_at).toLocaleString()}</span>
                    </div>
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    <Link to={`/gallery/${sub.project_id}`} className="btn btn-secondary btn-sm">
                      <span>Inspect Project</span>
                      <ExternalLink size={14} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
