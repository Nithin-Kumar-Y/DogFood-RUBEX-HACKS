import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Compass,
  Award,
  Users,
  ShieldCheck,
  ArrowRight,
  Sparkles,
  Calendar,
  Layers,
  Terminal,
  Clock
} from 'lucide-react';
import { api } from '../../services/api';
import { Event } from '../../types';
import { CountdownTimer } from '../../components/CountdownTimer';
import { Skeleton } from '../../components/Skeleton';

export const HomePage: React.FC = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getPublicEvents({ limit: 3 })
      .then((data) => setEvents(data.events || []))
      .catch((err) => console.error('Failed to load events', err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      {/* Hero Section */}
      <section
        style={{
          padding: '4rem 0 3rem',
          textAlign: 'center',
          maxWidth: '900px',
          margin: '0 auto',
          position: 'relative'
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.35rem 0.9rem',
            borderRadius: 'var(--radius-full)',
            background: 'rgba(99, 102, 241, 0.12)',
            border: '1px solid rgba(99, 102, 241, 0.3)',
            color: '#a5b4fc',
            fontSize: '0.8125rem',
            fontWeight: 600,
            marginBottom: '1.5rem'
          }}
        >
          <Sparkles size={15} />
          <span>DOGFOOD Platform — Tier 1 Core Active</span>
        </div>

        <h1 style={{ fontSize: '3.25rem', fontWeight: 800, marginBottom: '1.25rem', lineHeight: 1.15 }}>
          The Self-Hostable <span className="gradient-text">Hackathon Engine</span> Built for Real Builders
        </h1>

        <p style={{ fontSize: '1.1875rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '2.25rem' }}>
          Open-source, offline-first platform for hackathon registration, team formation, project drafts, backend deadline enforcement, and public project discovery.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <Link to="/events" className="btn btn-primary btn-lg">
            <span>Explore Hackathons</span>
            <ArrowRight size={18} />
          </Link>
          <Link to="/gallery" className="btn btn-secondary btn-lg">
            <span>Browse Public Gallery</span>
            <Compass size={18} />
          </Link>
        </div>
      </section>

      {/* Feature Highlights Grid */}
      <section style={{ margin: '3.5rem 0' }}>
        <div className="grid-cols-3">
          <div className="card card-hover">
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(99, 102, 241, 0.15)',
                color: 'var(--primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '1rem'
              }}
            >
              <Terminal size={22} />
            </div>
            <h3 style={{ fontSize: '1.125rem', marginBottom: '0.5rem' }}>Offline-First & Self-Hostable</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.5 }}>
              Runs 100% locally with Docker Compose. Zero cloud vendor lock-in, zero external dependencies, embedded relational database.
            </p>
          </div>

          <div className="card card-hover">
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(16, 185, 129, 0.15)',
                color: 'var(--success)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '1rem'
              }}
            >
              <Clock size={22} />
            </div>
            <h3 style={{ fontSize: '1.125rem', marginBottom: '0.5rem' }}>Strict Deadline Enforcement</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.5 }}>
              Submissions are strictly validated and locked on the backend. No late bypasses or hidden client-side tricks.
            </p>
          </div>

          <div className="card card-hover">
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(139, 92, 246, 0.15)',
                color: 'var(--accent-purple)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '1rem'
              }}
            >
              <ShieldCheck size={22} />
            </div>
            <h3 style={{ fontSize: '1.125rem', marginBottom: '0.5rem' }}>Backend RBAC Isolation</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.5 }}>
              Robust role separation for Participants, Organizers, Judges, and Admins enforced via server-side guards.
            </p>
          </div>
        </div>
      </section>

      {/* Featured Hackathons Section */}
      <section style={{ margin: '4rem 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <div>
            <h2>Active Hackathons</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              Explore live competitions and register your team.
            </p>
          </div>
          <Link to="/events" className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span>View All</span>
            <ArrowRight size={15} />
          </Link>
        </div>

        {loading ? (
          <div className="grid-cols-2">
            <Skeleton height="240px" borderRadius="var(--radius-lg)" />
            <Skeleton height="240px" borderRadius="var(--radius-lg)" />
          </div>
        ) : events.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
            <p style={{ color: 'var(--text-secondary)' }}>No published events currently available.</p>
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
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                    <CountdownTimer deadline={event.submission_deadline} />
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Organized by {event.organizer_name}
                    </span>
                  </div>

                  <h3 style={{ fontSize: '1.35rem', marginBottom: '0.5rem' }}>
                    {event.name}
                  </h3>

                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {event.description}
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', gap: '1.25rem', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                    <span><strong>{event.team_count || 0}</strong> teams</span>
                    <span><strong>{event.project_count || 0}</strong> projects</span>
                    <span><strong>{event.submission_count || 0}</strong> submitted</span>
                  </div>
                  <Link to={`/events/${event.slug || event.id}`} className="btn btn-primary btn-sm">
                    <span>View Event</span>
                    <ArrowRight size={14} />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
