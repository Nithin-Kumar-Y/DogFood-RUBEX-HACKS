import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Calendar, Users, Award, Clock, ArrowRight, PlusCircle, Layers } from 'lucide-react';
import { api } from '../../services/api';
import { Event } from '../../types';
import { CountdownTimer } from '../../components/CountdownTimer';
import { Skeleton } from '../../components/Skeleton';
import { useAuth } from '../../context/AuthContext';

export const PublicEventsPage: React.FC = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    api.getPublicEvents()
      .then((data) => setEvents(data.events || []))
      .catch((err) => console.error('Failed to load events', err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ marginBottom: '0.5rem' }}>Hackathons & Challenges</h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            Register your team, select specialized tracks, and compete for community bounties.
          </p>
        </div>

        {user?.role === 'ORGANIZER' && (
          <Link to="/organizer/events/new" className="btn btn-primary">
            <PlusCircle size={16} />
            <span>Create New Hackathon</span>
          </Link>
        )}
      </div>

      {loading ? (
        <div className="grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height="280px" borderRadius="var(--radius-lg)" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
          <p style={{ color: 'var(--text-secondary)' }}>No published hackathons at the moment.</p>
        </div>
      ) : (
        <div className="grid-cols-2">
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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
                  <CountdownTimer deadline={event.submission_deadline} />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Organized by {event.organizer_name}
                  </span>
                </div>

                <h3 style={{ fontSize: '1.35rem', marginBottom: '0.5rem' }}>
                  {event.name}
                </h3>

                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.5, marginBottom: '1.25rem' }}>
                  {event.description}
                </p>

                {/* Dates & Timeline */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.8125rem', color: 'var(--text-muted)', background: 'rgba(0, 0, 0, 0.2)', padding: '0.75rem', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Calendar size={14} style={{ color: 'var(--primary)' }} />
                    <span>Start: {new Date(event.start_date).toLocaleDateString()}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Clock size={14} style={{ color: 'var(--warning)' }} />
                    <span>Submission Deadline: {new Date(event.submission_deadline).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                  <span><strong>{event.team_count || 0}</strong> teams</span>
                  <span><strong>{event.submission_count || 0}</strong> submissions</span>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  {user ? (
                    <button
                      onClick={() => navigate('/participant/teams', { state: { autoOpenCreate: true, eventId: event.id } })}
                      className="btn btn-primary btn-sm"
                    >
                      Join / Create Team
                    </button>
                  ) : (
                    <Link to="/login" className="btn btn-primary btn-sm">
                      Login to Register
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
