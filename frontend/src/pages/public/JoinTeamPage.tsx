import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Users, ArrowRight, CheckCircle2 } from 'lucide-react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

export const JoinTeamPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const tokenParam = searchParams.get('token') || '';
  const codeParam = searchParams.get('code') || '';

  const [inputVal, setInputVal] = useState(tokenParam || codeParam);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal.trim()) {
      toast.error('Please enter an invitation token or team code.');
      return;
    }

    if (!user) {
      toast.info('Please sign in or create an account first to join a team.');
      navigate('/login', { state: { from: { pathname: `/teams/join?token=${inputVal}` } } });
      return;
    }

    setLoading(true);
    try {
      const res = await api.joinTeam({ token: inputVal.trim(), code: inputVal.trim() });
      toast.success(res.message || 'Joined team successfully!');
      navigate('/participant/teams');
    } catch (err: any) {
      toast.error(err.message || 'Failed to join team');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '480px', margin: '3rem auto' }}>
      <div className="card" style={{ padding: '2.5rem 2rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: 'var(--radius-full)',
              background: 'var(--primary-light)',
              color: 'var(--primary)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1rem'
            }}
          >
            <Users size={26} />
          </div>
          <h2 style={{ fontSize: '1.75rem', marginBottom: '0.35rem' }}>Join Hackathon Team</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Enter your team invitation token or team code to collaborate with your peers.
          </p>
        </div>

        <form onSubmit={handleJoin}>
          <div className="form-group">
            <label className="form-label">Invitation Token or Team Code</label>
            <input
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              placeholder="e.g. NF-9082 or a3f98c..."
              required
              className="form-input"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '0.5rem', padding: '0.75rem' }}
          >
            <span>{loading ? 'Validating...' : 'Accept & Join Team'}</span>
            <ArrowRight size={16} />
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
          Looking for your existing teams?{' '}
          <Link to="/participant/teams" style={{ color: 'var(--primary)', fontWeight: 600 }}>
            View My Teams
          </Link>
        </div>
      </div>
    </div>
  );
};
