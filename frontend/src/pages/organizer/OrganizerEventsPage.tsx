import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PlusCircle, Calendar, Eye, EyeOff, Edit, Send } from 'lucide-react';
import { api } from '../../services/api';
import { Event } from '../../types';
import { Badge } from '../../components/Badge';
import { CountdownTimer } from '../../components/CountdownTimer';
import { useToast } from '../../context/ToastContext';
import { Skeleton } from '../../components/Skeleton';
import { EmptyState } from '../../components/EmptyState';

export const OrganizerEventsPage: React.FC = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  const loadEvents = async () => {
    setLoading(true);
    try {
      const data = await api.getOrganizerEvents();
      setEvents(data.events || []);
    } catch (err) {
      console.error('Failed to load organizer events', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, []);

  const handleTogglePublish = async (id: string, currentStatus: string) => {
    try {
      const res = await api.togglePublishEvent(id);
      toast.success(`Event status updated to ${res.status}`);
      loadEvents();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update event status');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ marginBottom: '0.35rem' }}>Manage Hackathons</h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            Configure tracks, prizes, dates, deadlines, and publish status.
          </p>
        </div>

        <Link to="/organizer/events/new" className="btn btn-primary">
          <PlusCircle size={16} />
          <span>Create New Hackathon</span>
        </Link>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <Skeleton height="180px" borderRadius="var(--radius-lg)" />
          <Skeleton height="180px" borderRadius="var(--radius-lg)" />
        </div>
      ) : events.length === 0 ? (
        <EmptyState
          icon={<Calendar size={32} />}
          title="No Hackathons Created"
          description="Create your first hackathon competition to establish tracks, prizes, and deadlines."
          actionText="Create Hackathon"
          onAction={() => (window.location.href = '/organizer/events/new')}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {events.map((event) => (
            <div
              key={event.id}
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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Badge status={event.status} />
                    <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                      Slug: <code>{event.slug}</code>
                    </span>
                  </div>

                  <CountdownTimer deadline={event.submission_deadline} />
                </div>

                <h3 style={{ fontSize: '1.4rem', marginBottom: '0.5rem' }}>{event.name}</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.5, marginBottom: '1rem' }}>
                  {event.description}
                </p>

                <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.8125rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                  <span>Start: <strong>{new Date(event.start_date).toLocaleDateString()}</strong></span>
                  <span>Deadline: <strong>{new Date(event.submission_deadline).toLocaleString()}</strong></span>
                  <span>End: <strong>{new Date(event.end_date).toLocaleDateString()}</strong></span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', gap: '1.25rem', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                  <span>Teams: <strong>{event.team_count || 0}</strong></span>
                  <span>Projects: <strong>{event.project_count || 0}</strong></span>
                  <span>Submissions: <strong>{event.submission_count || 0}</strong></span>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button
                    onClick={() => handleTogglePublish(event.id, event.status)}
                    className="btn btn-secondary btn-sm"
                  >
                    {event.status === 'PUBLISHED' ? <EyeOff size={15} /> : <Eye size={15} />}
                    <span>{event.status === 'PUBLISHED' ? 'Unpublish' : 'Publish Event'}</span>
                  </button>

                  <Link to={`/organizer/events/${event.id}/edit`} className="btn btn-secondary btn-sm">
                    <Edit size={15} />
                    <span>Edit Event</span>
                  </Link>

                  <Link to={`/organizer/submissions?eventId=${event.id}`} className="btn btn-primary btn-sm">
                    <Send size={15} />
                    <span>View Submissions</span>
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
