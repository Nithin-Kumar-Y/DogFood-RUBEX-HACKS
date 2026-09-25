import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar,
  Users,
  FolderGit2,
  Send,
  PlusCircle,
  ArrowRight,
  Clock,
  Sparkles,
  Compass,
  CheckCircle2
} from 'lucide-react';
import { api } from '../../services/api';
import { Event } from '../../types';
import { StatCard } from '../../components/StatCard';
import { CountdownTimer } from '../../components/CountdownTimer';
import { Skeleton } from '../../components/Skeleton';
import { Badge } from '../../components/Badge';

export const OrganizerDashboard: React.FC = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [submissionsCount, setSubmissionsCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getOrganizerEvents(),
      api.listSubmissions({ limit: 1 })
    ])
      .then(([eventsData, subData]) => {
        setEvents(eventsData.events || []);
        setSubmissionsCount(subData.pagination?.total || 0);
      })
      .catch((err) => console.error('Failed to load organizer dashboard', err))
      .finally(() => setLoading(false));
  }, []);

  const totalTeams = events.reduce((acc, e) => acc + (e.team_count || 0), 0);
  const totalProjects = events.reduce((acc, e) => acc + (e.project_count || 0), 0);
  const activeEvents = events.filter((e) => e.status === 'PUBLISHED');

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ marginBottom: '0.35rem' }}>Organizer Command Center</h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            Real-time telemetry, deadline schedules, and submission reviews for your hackathons.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Link to="/organizer/events/new" className="btn btn-primary">
            <PlusCircle size={16} />
            <span>Create Hackathon</span>
          </Link>
          <Link to="/organizer/submissions" className="btn btn-secondary">
            <Send size={16} />
            <span>Review Submissions</span>
          </Link>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} height="120px" borderRadius="var(--radius-lg)" />
            ))}
          </div>
          <Skeleton height="300px" borderRadius="var(--radius-lg)" />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {/* Key Metrics Grid */}
          <div className="grid-cols-4">
            <StatCard
              title="Active Hackathons"
              value={activeEvents.length}
              subtext={`${events.length} total created`}
              icon={<Calendar size={22} />}
            />
            <StatCard
              title="Registered Teams"
              value={totalTeams}
              subtext="Across all events"
              icon={<Users size={22} />}
            />
            <StatCard
              title="Drafted Projects"
              value={totalProjects}
              subtext="Teams currently building"
              icon={<FolderGit2 size={22} />}
            />
            <StatCard
              title="Official Submissions"
              value={submissionsCount}
              subtext="Submitted before deadline"
              icon={<CheckCircle2 size={22} />}
            />
          </div>

          {/* Active Hackathons Overview Table */}
          <div className="card" style={{ padding: '1.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <h3>Managed Hackathons</h3>
              <Link to="/organizer/events" className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span>View All Events</span>
                <ArrowRight size={14} />
              </Link>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>Event Name</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Submission Deadline</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Teams</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Submissions</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr
                      key={event.id}
                      style={{ borderBottom: '1px solid var(--border-subtle)' }}
                    >
                      <td style={{ padding: '1rem', fontWeight: 600 }}>
                        <Link to={`/organizer/events/${event.id}/edit`} style={{ color: 'var(--text-primary)' }}>
                          {event.name}
                        </Link>
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <Badge status={event.status} />
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <CountdownTimer deadline={event.submission_deadline} />
                      </td>
                      <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>
                        <strong>{event.team_count || 0}</strong> teams
                      </td>
                      <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>
                        <strong>{event.submission_count || 0}</strong> submitted
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                          <Link to={`/organizer/events/${event.id}/edit`} className="btn btn-secondary btn-sm">
                            Edit
                          </Link>
                          <Link to={`/organizer/submissions?eventId=${event.id}`} className="btn btn-primary btn-sm">
                            Submissions
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
