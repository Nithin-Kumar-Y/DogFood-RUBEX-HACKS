import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Filter, ExternalLink, Github, ChevronLeft, ChevronRight, Compass } from 'lucide-react';
import { api } from '../../services/api';
import { Project, Event } from '../../types';
import { Badge } from '../../components/Badge';
import { Skeleton } from '../../components/Skeleton';
import { EmptyState } from '../../components/EmptyState';

export const PublicGalleryPage: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedEvent, setSelectedEvent] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Load events for filter dropdown
  useEffect(() => {
    api.getPublicEvents().then((data) => setEvents(data.events || []));
  }, []);

  const loadProjects = async () => {
    setLoading(true);
    try {
      const data = await api.getGalleryProjects({
        search,
        eventId: selectedEvent || undefined,
        page,
        limit: 9
      });
      setProjects(data.projects || []);
      setTotalPages(data.pagination?.totalPages || 1);
      setTotalCount(data.pagination?.total || 0);
    } catch (err) {
      console.error('Failed to load gallery projects', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, [page, selectedEvent]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadProjects();
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ marginBottom: '0.5rem' }}>Public Project Gallery</h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          Explore validated hackathon submissions, view live demos, and inspect open-source code repositories.
        </p>
      </div>

      {/* Filter and Search Bar */}
      <div
        className="card"
        style={{
          display: 'flex',
          gap: '1rem',
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: '2rem',
          padding: '1rem 1.25rem'
        }}
      >
        <form onSubmit={handleSearchSubmit} style={{ flex: 1, minWidth: '260px', display: 'flex', gap: '0.5rem' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search
              size={18}
              style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
            />
            <input
              type="text"
              placeholder="Search projects by title, description, team..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-input"
              style={{ paddingLeft: '2.5rem' }}
            />
          </div>
          <button type="submit" className="btn btn-secondary">
            Search
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Filter size={16} style={{ color: 'var(--text-muted)' }} />
          <select
            value={selectedEvent}
            onChange={(e) => {
              setSelectedEvent(e.target.value);
              setPage(1);
            }}
            className="form-select"
            style={{ width: 'auto', minWidth: '200px' }}
          >
            <option value="">All Hackathon Events</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Project Grid */}
      {loading ? (
        <div className="grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} height="280px" borderRadius="var(--radius-lg)" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <EmptyState
          icon={<Compass size={28} />}
          title="No projects found"
          description={
            search || selectedEvent
              ? 'Try modifying your search query or removing the event filter.'
              : 'There are currently no submitted projects in the gallery.'
          }
          actionText={search || selectedEvent ? 'Clear Filters' : undefined}
          onAction={() => {
            setSearch('');
            setSelectedEvent('');
            setPage(1);
          }}
        />
      ) : (
        <>
          <div style={{ marginBottom: '1rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            Showing <strong>{projects.length}</strong> of <strong>{totalCount}</strong> submitted projects
          </div>

          <div className="grid-cols-3">
            {projects.map((project) => (
              <div
                key={project.id}
                className="card card-hover"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  padding: '1.5rem',
                  gap: '1.25rem'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {project.track_name ? (
                      <span
                        style={{
                          fontSize: '0.75rem',
                          padding: '0.2rem 0.5rem',
                          borderRadius: 'var(--radius-sm)',
                          background: 'rgba(99, 102, 241, 0.12)',
                          color: '#a5b4fc',
                          fontWeight: 600
                        }}
                      >
                        {project.track_name}
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>General Track</span>
                    )}

                    <Badge status="SUBMITTED" />
                  </div>

                  <h3 style={{ fontSize: '1.25rem', marginBottom: '0.35rem' }}>
                    <Link to={`/gallery/${project.id}`} style={{ color: 'inherit' }}>
                      {project.title}
                    </Link>
                  </h3>

                  {project.tagline && (
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', fontWeight: 500, marginBottom: '0.75rem' }}>
                      {project.tagline}
                    </p>
                  )}

                  <p
                    style={{
                      color: 'var(--text-muted)',
                      fontSize: '0.8125rem',
                      lineHeight: 1.5,
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden'
                    }}
                  >
                    {project.description}
                  </p>
                </div>

                <div>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                    Built by <strong>{project.team_name}</strong>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '0.75rem', borderTop: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      {project.links?.map((link) => (
                        <a
                          key={link.id || link.url}
                          href={link.url}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-ghost"
                          style={{
                            padding: '0.35rem',
                            borderRadius: 'var(--radius-sm)',
                            color: 'var(--text-secondary)',
                            display: 'flex',
                            alignItems: 'center'
                          }}
                          title={link.title}
                        >
                          {link.type === 'GITHUB' ? <Github size={16} /> : <ExternalLink size={16} />}
                        </a>
                      ))}
                    </div>

                    <Link to={`/gallery/${project.id}`} className="btn btn-secondary btn-sm">
                      Details
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginTop: '2.5rem' }}>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="btn btn-secondary btn-sm"
              >
                <ChevronLeft size={16} />
                <span>Previous</span>
              </button>

              <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                Page {page} of {totalPages}
              </span>

              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="btn btn-secondary btn-sm"
              >
                <span>Next</span>
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
