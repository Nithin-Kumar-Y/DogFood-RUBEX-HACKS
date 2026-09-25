import React from 'react';
import { User, Mail, Shield, Calendar, LogOut, Sparkles } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const ProfilePage: React.FC = () => {
  const { user, logout, switchDemoAccount } = useAuth();
  if (!user) return null;

  return (
    <div style={{ maxWidth: '650px', margin: '0 auto' }}>
      <div className="card" style={{ padding: '2.5rem 2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', marginBottom: '2rem' }}>
          <img
            src={user.avatar_url || 'https://api.dicebear.com/7.x/bottts/svg?seed=user'}
            alt={user.full_name}
            style={{ width: '72px', height: '72px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--primary)' }}
          />
          <div>
            <h1 style={{ fontSize: '1.75rem', marginBottom: '0.25rem' }}>{user.full_name}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  padding: '0.2rem 0.55rem',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--primary-light)',
                  color: '#a5b4fc'
                }}
              >
                {user.role}
              </span>
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{user.email}</span>
            </div>
          </div>
        </div>

        {user.bio && (
          <div style={{ marginBottom: '2rem', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-md)' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>BIO</span>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{user.bio}</p>
          </div>
        )}

        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '1.5rem', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '1rem' }}>
            <Sparkles size={16} style={{ color: '#a5b4fc' }} />
            <h3 style={{ fontSize: '1rem' }}>Simulate Different Role Workflows</h3>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
            <button onClick={() => switchDemoAccount('ORGANIZER')} className="btn btn-secondary btn-sm">
              Switch to Organizer (Elena)
            </button>
            <button onClick={() => switchDemoAccount('ALICE')} className="btn btn-secondary btn-sm">
              Switch to Participant Lead (Alice)
            </button>
            <button onClick={() => switchDemoAccount('BOB')} className="btn btn-secondary btn-sm">
              Switch to Participant Member (Bob)
            </button>
            <button onClick={() => switchDemoAccount('JUDGE')} className="btn btn-secondary btn-sm">
              Switch to Judge (Marcus)
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={logout} className="btn btn-danger btn-sm">
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
};
