import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Layers, LogOut, ChevronDown, User as UserIcon, Shield, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types';

export const Navbar: React.FC = () => {
  const { user, logout, switchDemoAccount } = useAuth();
  const navigate = useNavigate();
  const [demoMenuOpen, setDemoMenuOpen] = useState(false);

  const handleDemoSwitch = async (role: UserRole | 'ALICE' | 'BOB') => {
    setDemoMenuOpen(false);
    await switchDemoAccount(role);
    if (role === 'ORGANIZER') navigate('/organizer/dashboard');
    else if (role === 'ADMIN') navigate('/admin/dashboard');
    else if (role === 'JUDGE') navigate('/judge/dashboard');
    else navigate('/participant/dashboard');
  };

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        height: '68px',
        background: 'rgba(9, 13, 22, 0.85)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 2rem'
      }}
    >
      {/* Brand */}
      <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div
          style={{
            width: '38px',
            height: '38px',
            borderRadius: 'var(--radius-md)',
            background: 'linear-gradient(135deg, var(--primary) 0%, var(--accent-purple) 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            boxShadow: 'var(--shadow-glow)'
          }}
        >
          <Layers size={22} />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.03em' }}>
              DOGFOOD
            </span>
            <span
              style={{
                fontSize: '0.65rem',
                fontWeight: 700,
                background: 'var(--primary-light)',
                color: '#a5b4fc',
                padding: '0.15rem 0.4rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid rgba(99, 102, 241, 0.3)'
              }}
            >
              TIER 1
            </span>
          </div>
        </div>
      </Link>

      {/* Center Navigation */}
      <nav style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        <Link to="/events" style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-secondary)' }}>
          Events
        </Link>
        <Link to="/gallery" style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-secondary)' }}>
          Public Gallery
        </Link>
      </nav>

      {/* Right Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        {/* Quick Demo Switcher */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setDemoMenuOpen(!demoMenuOpen)}
            className="btn btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', borderColor: 'rgba(99, 102, 241, 0.4)' }}
          >
            <Sparkles size={14} style={{ color: '#a5b4fc' }} />
            <span>Switch Role Demo</span>
            <ChevronDown size={14} />
          </button>

          {demoMenuOpen && (
            <div
              style={{
                position: 'absolute',
                top: '120%',
                right: 0,
                width: '260px',
                background: '#131b2e',
                border: '1px solid var(--border-card)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-lg)',
                padding: '0.5rem',
                zIndex: 100,
                animation: 'slideUp 0.15s ease-out'
              }}
            >
              <div style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                ONE-CLICK DEMO ACCOUNTS
              </div>
              <button
                onClick={() => handleDemoSwitch('ORGANIZER')}
                style={{ width: '100%', textAlign: 'left', padding: '0.5rem 0.6rem', background: 'none', border: 'none', color: '#fff', fontSize: '0.8125rem', cursor: 'pointer', borderRadius: 'var(--radius-sm)' }}
                className="btn-ghost"
              >
                Organizer (Elena Rostova)
              </button>
              <button
                onClick={() => handleDemoSwitch('ALICE')}
                style={{ width: '100%', textAlign: 'left', padding: '0.5rem 0.6rem', background: 'none', border: 'none', color: '#fff', fontSize: '0.8125rem', cursor: 'pointer', borderRadius: 'var(--radius-sm)' }}
                className="btn-ghost"
              >
                Participant: Team Lead (Alice Chen)
              </button>
              <button
                onClick={() => handleDemoSwitch('BOB')}
                style={{ width: '100%', textAlign: 'left', padding: '0.5rem 0.6rem', background: 'none', border: 'none', color: '#fff', fontSize: '0.8125rem', cursor: 'pointer', borderRadius: 'var(--radius-sm)' }}
                className="btn-ghost"
              >
                Participant: Member (Bob Martinez)
              </button>
              <button
                onClick={() => handleDemoSwitch('JUDGE')}
                style={{ width: '100%', textAlign: 'left', padding: '0.5rem 0.6rem', background: 'none', border: 'none', color: '#fff', fontSize: '0.8125rem', cursor: 'pointer', borderRadius: 'var(--radius-sm)' }}
                className="btn-ghost"
              >
                Judge (Marcus Sterling)
              </button>
              <button
                onClick={() => handleDemoSwitch('ADMIN')}
                style={{ width: '100%', textAlign: 'left', padding: '0.5rem 0.6rem', background: 'none', border: 'none', color: '#fff', fontSize: '0.8125rem', cursor: 'pointer', borderRadius: 'var(--radius-sm)' }}
                className="btn-ghost"
              >
                Admin (Alex Vance)
              </button>
            </div>
          )}
        </div>

        {user ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <Link
              to={
                user.role === 'ORGANIZER'
                  ? '/organizer/dashboard'
                  : user.role === 'ADMIN'
                  ? '/admin/dashboard'
                  : user.role === 'JUDGE'
                  ? '/judge/dashboard'
                  : '/participant/dashboard'
              }
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.625rem',
                background: 'rgba(255, 255, 255, 0.05)',
                padding: '0.4rem 0.75rem',
                borderRadius: 'var(--radius-full)',
                border: '1px solid var(--border-subtle)'
              }}
            >
              <img
                src={user.avatar_url || 'https://api.dicebear.com/7.x/bottts/svg?seed=user'}
                alt={user.full_name}
                style={{ width: '26px', height: '26px', borderRadius: '50%', objectFit: 'cover' }}
              />
              <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{user.full_name}</span>
              <span
                style={{
                  fontSize: '0.6875rem',
                  padding: '0.15rem 0.45rem',
                  borderRadius: 'var(--radius-full)',
                  background: 'var(--primary-light)',
                  color: '#a5b4fc',
                  fontWeight: 700
                }}
              >
                {user.role}
              </span>
            </Link>

            <button
              onClick={logout}
              className="btn btn-ghost btn-sm"
              title="Logout"
              style={{ color: 'var(--text-muted)' }}
            >
              <LogOut size={16} />
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Link to="/login" className="btn btn-ghost btn-sm">
              Log In
            </Link>
            <Link to="/register" className="btn btn-primary btn-sm">
              Sign Up
            </Link>
          </div>
        )}
      </div>
    </header>
  );
};
