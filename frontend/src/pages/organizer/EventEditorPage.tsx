import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Save, Plus, Trash2, Calendar, Award, Layers } from 'lucide-react';
import { api } from '../../services/api';
import { Track, Prize } from '../../types';
import { useToast } from '../../context/ToastContext';
import { Skeleton } from '../../components/Skeleton';

export const EventEditorPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form Fields
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [submissionDeadline, setSubmissionDeadline] = useState('');
  const [status, setStatus] = useState<'DRAFT' | 'PUBLISHED' | 'ARCHIVED'>('DRAFT');

  // Tracks & Prizes
  const [tracks, setTracks] = useState<Array<{ name: string; description: string }>>([
    { name: 'Core Innovation', description: 'Projects focused on foundational problem solving.' }
  ]);
  const [prizes, setPrizes] = useState<Array<{ name: string; description: string; amount: string; rank: number }>>([
    { name: 'First Place', description: 'Overall winner', amount: '$5,000', rank: 1 }
  ]);

  const toast = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isNew && id) {
      api.getEvent(id)
        .then((data) => {
          const e = data.event;
          setName(e.name || '');
          setSlug(e.slug || '');
          setDescription(e.description || '');
          setBannerUrl(e.banner_url || '');
          setStartDate(e.start_date ? e.start_date.substring(0, 16) : '');
          setEndDate(e.end_date ? e.end_date.substring(0, 16) : '');
          setSubmissionDeadline(e.submission_deadline ? e.submission_deadline.substring(0, 16) : '');
          setStatus(e.status || 'DRAFT');

          if (e.tracks && e.tracks.length > 0) {
            setTracks(e.tracks.map((t: Track) => ({ name: t.name, description: t.description || '' })));
          }
          if (e.prizes && e.prizes.length > 0) {
            setPrizes(e.prizes.map((p: Prize) => ({ name: p.name, description: p.description || '', amount: p.amount || '', rank: p.rank || 1 })));
          }
        })
        .catch((err) => toast.error(err.message || 'Failed to load event'))
        .finally(() => setLoading(false));
    } else {
      // Default dates for new event
      const now = new Date();
      const end = new Date(now.getTime() + 7 * 86400000);
      const deadline = new Date(now.getTime() + 5 * 86400000);

      setStartDate(now.toISOString().substring(0, 16));
      setEndDate(end.toISOString().substring(0, 16));
      setSubmissionDeadline(deadline.toISOString().substring(0, 16));
      setLoading(false);
    }
  }, [id, isNew]);

  const handleAddTrack = () => {
    setTracks([...tracks, { name: '', description: '' }]);
  };

  const handleRemoveTrack = (index: number) => {
    setTracks(tracks.filter((_, i) => i !== index));
  };

  const handleAddPrize = () => {
    setPrizes([...prizes, { name: '', description: '', amount: '', rank: prizes.length + 1 }]);
  };

  const handleRemovePrize = (index: number) => {
    setPrizes(prizes.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name || !description || !startDate || !endDate || !submissionDeadline) {
      toast.error('Please fill in all required fields.');
      return;
    }

    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    const deadline = new Date(submissionDeadline).getTime();

    if (start >= end) {
      toast.error('Start date must be strictly before end date.');
      return;
    }
    if (deadline < start || deadline > end) {
      toast.error('Submission deadline must be between start date and end date.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name,
        slug: slug || undefined,
        description,
        banner_url: bannerUrl || undefined,
        start_date: new Date(startDate).toISOString(),
        end_date: new Date(endDate).toISOString(),
        submission_deadline: new Date(submissionDeadline).toISOString(),
        status,
        tracks: tracks.filter((t) => t.name.trim() !== ''),
        prizes: prizes.filter((p) => p.name.trim() !== '')
      };

      if (isNew) {
        await api.createEvent(payload);
        toast.success('Hackathon event created successfully!');
      } else {
        await api.updateEvent(id!, payload);
        toast.success('Event updated successfully!');
      }

      navigate('/organizer/events');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save event');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: '850px', margin: '0 auto' }}>
        <Skeleton height="36px" width="200px" style={{ marginBottom: '1.5rem' }} />
        <Skeleton height="400px" borderRadius="var(--radius-lg)" />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '850px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <Link
          to="/organizer/events"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}
        >
          <ArrowLeft size={16} />
          <span>Back to Events</span>
        </Link>
      </div>

      <div className="card" style={{ padding: '2.5rem 2rem' }}>
        <div style={{ marginBottom: '2rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '1.25rem' }}>
          <h1 style={{ fontSize: '1.75rem', marginBottom: '0.25rem' }}>
            {isNew ? 'Create New Hackathon Event' : 'Edit Hackathon Event'}
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Define timeline schedules, tracks, prizes, and publication status.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {/* General Info */}
          <div className="form-group">
            <label className="form-label">Event Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Autonomous AI Hackathon 2026"
              required
              className="form-input"
            />
          </div>

          <div className="grid-cols-2">
            <div className="form-group">
              <label className="form-label">URL Slug (Optional)</label>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="ai-hackathon-2026"
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Publication Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="form-select"
              >
                <option value="DRAFT">DRAFT (Hidden from Public)</option>
                <option value="PUBLISHED">PUBLISHED (Live for Participants)</option>
                <option value="ARCHIVED">ARCHIVED</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Event Description *</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the challenge goals, rules, and participant expectations..."
              rows={4}
              required
              className="form-textarea"
            />
          </div>

          {/* Dates & Timeline */}
          <div style={{ margin: '2rem 0' }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Calendar size={18} style={{ color: 'var(--primary)' }} />
              <span>Event Timeline & Deadlines</span>
            </h3>

            <div className="grid-cols-3">
              <div className="form-group">
                <label className="form-label">Start Date & Time *</label>
                <input
                  type="datetime-local"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Submission Deadline *</label>
                <input
                  type="datetime-local"
                  value={submissionDeadline}
                  onChange={(e) => setSubmissionDeadline(e.target.value)}
                  required
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">End Date & Time *</label>
                <input
                  type="datetime-local"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                  className="form-input"
                />
              </div>
            </div>
          </div>

          {/* Tracks Section */}
          <div style={{ margin: '2rem 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Layers size={18} style={{ color: 'var(--accent-purple)' }} />
                <span>Specialized Tracks</span>
              </h3>
              <button
                type="button"
                onClick={handleAddTrack}
                className="btn btn-secondary btn-sm"
              >
                <Plus size={14} />
                <span>Add Track</span>
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {tracks.map((t, idx) => (
                <div key={idx} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  <input
                    type="text"
                    placeholder="Track Name (e.g. Agentic Systems)"
                    value={t.name}
                    onChange={(e) => {
                      const updated = [...tracks];
                      updated[idx].name = e.target.value;
                      setTracks(updated);
                    }}
                    required
                    className="form-input"
                    style={{ width: '240px' }}
                  />
                  <input
                    type="text"
                    placeholder="Track description..."
                    value={t.description}
                    onChange={(e) => {
                      const updated = [...tracks];
                      updated[idx].description = e.target.value;
                      setTracks(updated);
                    }}
                    className="form-input"
                    style={{ flex: 1 }}
                  />
                  {tracks.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveTrack(idx)}
                      className="btn btn-ghost btn-sm"
                      style={{ color: 'var(--danger)' }}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Prizes Section */}
          <div style={{ margin: '2rem 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Award size={18} style={{ color: 'var(--warning)' }} />
                <span>Prizes & Awards</span>
              </h3>
              <button
                type="button"
                onClick={handleAddPrize}
                className="btn btn-secondary btn-sm"
              >
                <Plus size={14} />
                <span>Add Prize</span>
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {prizes.map((p, idx) => (
                <div key={idx} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  <input
                    type="text"
                    placeholder="Prize Title (e.g. Grand Champion)"
                    value={p.name}
                    onChange={(e) => {
                      const updated = [...prizes];
                      updated[idx].name = e.target.value;
                      setPrizes(updated);
                    }}
                    required
                    className="form-input"
                    style={{ width: '220px' }}
                  />
                  <input
                    type="text"
                    placeholder="Amount (e.g. $10,000)"
                    value={p.amount}
                    onChange={(e) => {
                      const updated = [...prizes];
                      updated[idx].amount = e.target.value;
                      setPrizes(updated);
                    }}
                    className="form-input"
                    style={{ width: '140px' }}
                  />
                  <input
                    type="text"
                    placeholder="Description..."
                    value={p.description}
                    onChange={(e) => {
                      const updated = [...prizes];
                      updated[idx].description = e.target.value;
                      setPrizes(updated);
                    }}
                    className="form-input"
                    style={{ flex: 1 }}
                  />
                  {prizes.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemovePrize(idx)}
                      className="btn btn-ghost btn-sm"
                      style={{ color: 'var(--danger)' }}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Submit Action */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-subtle)' }}>
            <Link to="/organizer/events" className="btn btn-secondary">
              Cancel
            </Link>
            <button type="submit" disabled={saving} className="btn btn-primary">
              <Save size={16} />
              <span>{saving ? 'Saving Event...' : isNew ? 'Create Event' : 'Save Changes'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
