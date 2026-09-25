import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Save,
  Send,
  Plus,
  Trash2,
  ExternalLink,
  Github,
  AlertTriangle,
  CheckCircle2,
  Clock
} from 'lucide-react';
import { api } from '../../services/api';
import { Project, Team, Track, ProjectLink } from '../../types';
import { Badge } from '../../components/Badge';
import { CountdownTimer } from '../../components/CountdownTimer';
import { Modal } from '../../components/Modal';
import { useToast } from '../../context/ToastContext';
import { Skeleton } from '../../components/Skeleton';

export const ProjectEditorPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);

  // Form fields
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [title, setTitle] = useState('');
  const [tagline, setTagline] = useState('');
  const [description, setDescription] = useState('');
  const [trackId, setTrackId] = useState('');
  const [links, setLinks] = useState<ProjectLink[]>([
    { title: 'GitHub Repository', url: '', type: 'GITHUB' }
  ]);
  const [status, setStatus] = useState<'DRAFT' | 'SUBMITTED' | 'LOCKED'>('DRAFT');
  const [submissionDeadline, setSubmissionDeadline] = useState<string>('');
  const [submissionNotes, setSubmissionNotes] = useState('');

  // Confirmation Modal
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);

  const toast = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    loadInitialData();
  }, [id]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const teamsRes = await api.getMyTeams();
      const myTeams: Team[] = teamsRes.teams || [];
      setTeams(myTeams);

      if (!isNew && id) {
        const projectRes = await api.getProject(id);
        const p: Project = projectRes.project;
        setTitle(p.title || '');
        setTagline(p.tagline || '');
        setDescription(p.description || '');
        setSelectedTeamId(p.team_id || '');
        setTrackId(p.track_id || '');
        setStatus(p.status || 'DRAFT');
        setSubmissionDeadline(p.submission_deadline || '');
        if (p.links && p.links.length > 0) {
          setLinks(p.links);
        }

        // Fetch tracks for the event
        if (p.event_id) {
          api.getEvent(p.event_id).then((eData) => {
            setTracks(eData.event?.tracks || []);
          });
        }
      } else if (myTeams.length > 0) {
        setSelectedTeamId(myTeams[0].id);
        setSubmissionDeadline(myTeams[0].submission_deadline || '');
        if (myTeams[0].event_id) {
          api.getEvent(myTeams[0].event_id).then((eData) => {
            setTracks(eData.event?.tracks || []);
          });
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to load project details');
    } finally {
      setLoading(false);
    }
  };

  const handleAddLink = () => {
    setLinks([...links, { title: '', url: '', type: 'OTHER' }]);
  };

  const handleRemoveLink = (idx: number) => {
    setLinks(links.filter((_, i) => i !== idx));
  };

  const handleLinkChange = (idx: number, field: keyof ProjectLink, val: string) => {
    const updated = [...links];
    (updated[idx] as any)[field] = val;
    setLinks(updated);
  };

  const handleSaveDraft = async () => {
    if (!selectedTeamId) {
      toast.error('Please select a team.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        team_id: selectedTeamId,
        title: title || 'Untitled Project',
        tagline,
        description,
        track_id: trackId || undefined,
        links: links.filter((l) => l.url.trim() !== '')
      };

      const res = await api.saveDraft(payload, isNew ? undefined : id);
      toast.success('Draft saved successfully!');
      if (isNew && res.project?.id) {
        navigate(`/participant/projects/${res.project.id}/edit`, { replace: true });
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to save draft');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitFinal = async () => {
    // Client-side pre-validation
    if (!title || title.trim().length < 3) {
      toast.error('A project title (at least 3 characters) is required.');
      return;
    }
    if (!description || description.trim().length < 20) {
      toast.error('A detailed project description (at least 20 characters) is required.');
      return;
    }
    const validLinks = links.filter((l) => l.url && l.url.trim());
    if (validLinks.length === 0) {
      toast.error('At least one project link (e.g. GitHub or Live Demo) is required to submit.');
      return;
    }

    setConfirmModalOpen(true);
  };

  const executeSubmission = async () => {
    setSubmitting(true);
    try {
      // 1. First save all current draft changes
      const payload = {
        team_id: selectedTeamId,
        title,
        tagline,
        description,
        track_id: trackId || undefined,
        links: links.filter((l) => l.url.trim() !== '')
      };

      const saveRes = await api.saveDraft(payload, isNew ? undefined : id);
      const targetProjectId = isNew ? saveRes.project?.id : id;

      // 2. Perform submission with backend deadline validation
      const submitRes = await api.submitProject(targetProjectId, { notes: submissionNotes });
      toast.success(submitRes.message || 'Project submitted successfully!');
      setStatus('SUBMITTED');
      setConfirmModalOpen(false);
      navigate('/participant/dashboard');
    } catch (err: any) {
      toast.error(err.message || 'Submission failed');
    } finally {
      setSubmitting(false);
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
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <Link
          to="/participant/projects"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}
        >
          <ArrowLeft size={16} />
          <span>Back to Projects</span>
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Badge status={status} />
          {submissionDeadline && <CountdownTimer deadline={submissionDeadline} />}
        </div>
      </div>

      <div className="card" style={{ padding: '2.5rem 2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '1.25rem' }}>
          <div>
            <h1 style={{ fontSize: '1.75rem', marginBottom: '0.25rem' }}>
              {isNew ? 'Create Project Submission' : 'Edit Project Submission'}
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              Save drafts at any time. Submit when ready before the deadline.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={handleSaveDraft}
              disabled={saving}
              className="btn btn-secondary"
            >
              <Save size={16} />
              <span>{saving ? 'Saving...' : 'Save Draft'}</span>
            </button>

            <button
              onClick={handleSubmitFinal}
              className="btn btn-primary"
            >
              <Send size={16} />
              <span>{status === 'SUBMITTED' ? 'Resubmit Project' : 'Submit Project'}</span>
            </button>
          </div>
        </div>

        {/* Team Selector (Only if new) */}
        {isNew && (
          <div className="form-group">
            <label className="form-label">Associated Team</label>
            <select
              value={selectedTeamId}
              onChange={(e) => {
                setSelectedTeamId(e.target.value);
                const tm = teams.find((t) => t.id === e.target.value);
                if (tm) {
                  setSubmissionDeadline(tm.submission_deadline || '');
                  if (tm.event_id) {
                    api.getEvent(tm.event_id).then((eData) => setTracks(eData.event?.tracks || []));
                  }
                }
              }}
              required
              className="form-select"
            >
              <option value="">-- Select Your Team --</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.event_name})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Project Title */}
        <div className="form-group">
          <label className="form-label">Project Title *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. AutoDev: Self-Healing Code Assistant"
            required
            className="form-input"
            style={{ fontSize: '1.1rem', fontWeight: 600 }}
          />
        </div>

        {/* Tagline */}
        <div className="form-group">
          <label className="form-label">Short Tagline</label>
          <input
            type="text"
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            placeholder="A one-sentence elevator pitch of what your project achieves..."
            className="form-input"
          />
        </div>

        {/* Track Selection */}
        <div className="form-group">
          <label className="form-label">Competition Track</label>
          <select
            value={trackId}
            onChange={(e) => setTrackId(e.target.value)}
            className="form-select"
          >
            <option value="">-- General Hackathon Track --</option>
            {tracks.map((track) => (
              <option key={track.id} value={track.id}>
                {track.name}
              </option>
            ))}
          </select>
        </div>

        {/* Project Description */}
        <div className="form-group">
          <label className="form-label">Comprehensive Description * (Minimum 20 characters)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Detail your problem statement, technical architecture, offline implementation, key features, and future roadmap..."
            rows={7}
            required
            className="form-textarea"
          />
        </div>

        {/* Project Links Section */}
        <div style={{ marginTop: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div>
              <label className="form-label" style={{ marginBottom: 0 }}>Project Links *</label>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Include at least 1 verified link (GitHub repository, live demo, video, or presentation slides).
              </span>
            </div>
            <button
              type="button"
              onClick={handleAddLink}
              className="btn btn-secondary btn-sm"
            >
              <Plus size={14} />
              <span>Add Link</span>
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {links.map((link, idx) => (
              <div key={idx} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <select
                  value={link.type}
                  onChange={(e) => handleLinkChange(idx, 'type', e.target.value)}
                  className="form-select"
                  style={{ width: '150px' }}
                >
                  <option value="GITHUB">GitHub</option>
                  <option value="DEMO">Live Demo</option>
                  <option value="VIDEO">Video Demo</option>
                  <option value="SLIDES">Slides</option>
                  <option value="OTHER">Other</option>
                </select>

                <input
                  type="text"
                  placeholder="Link Title (e.g. Source Code)"
                  value={link.title}
                  onChange={(e) => handleLinkChange(idx, 'title', e.target.value)}
                  className="form-input"
                  style={{ width: '180px' }}
                />

                <input
                  type="url"
                  placeholder="https://github.com/org/repo"
                  value={link.url}
                  onChange={(e) => handleLinkChange(idx, 'url', e.target.value)}
                  required
                  className="form-input"
                  style={{ flex: 1 }}
                />

                {links.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveLink(idx)}
                    className="btn btn-ghost btn-sm"
                    style={{ color: 'var(--danger)', padding: '0.5rem' }}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      <Modal
        isOpen={confirmModalOpen}
        onClose={() => setConfirmModalOpen(false)}
        title="Confirm Official Hackathon Submission"
      >
        <div>
          <div
            style={{
              padding: '1rem',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(99, 102, 241, 0.1)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              marginBottom: '1.25rem'
            }}
          >
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              You are about to submit <strong>{title}</strong>. The backend will record your submission timestamp and verify that the deadline has not expired.
            </p>
          </div>

          <div className="form-group">
            <label className="form-label">Submission Notes (Optional)</label>
            <textarea
              value={submissionNotes}
              onChange={(e) => setSubmissionNotes(e.target.value)}
              placeholder="e.g. Any special instructions for judges or organizers..."
              rows={3}
              className="form-textarea"
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button
              type="button"
              onClick={() => setConfirmModalOpen(false)}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              onClick={executeSubmission}
              disabled={submitting}
              className="btn btn-primary"
            >
              {submitting ? 'Submitting...' : 'Confirm Submission'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
