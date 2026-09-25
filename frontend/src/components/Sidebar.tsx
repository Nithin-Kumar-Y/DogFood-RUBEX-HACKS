import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Calendar,
  Users,
  FolderGit2,
  Send,
  User,
  Settings,
  ShieldAlert,
  Server,
  Award,
  Sparkles,
  Compass
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const Sidebar: React.FC = () => {
  const { user } = useAuth();
  if (!user) return null;

  const role = user.role;

  const participantLinks = [
    { to: '/participant/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
    { to: '/events', label: 'Explore Events', icon: <Compass size={18} /> },
    { to: '/participant/teams', label: 'My Teams', icon: <Users size={18} /> },
    { to: '/participant/projects', label: 'My Projects', icon: <FolderGit2 size={18} /> },
    { to: '/participant/submissions', label: 'Submissions', icon: <Send size={18} /> },
    { to: '/profile', label: 'Profile', icon: <User size={18} /> },
  ];

  const organizerLinks = [
    { to: '/organizer/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
    { to: '/organizer/events', label: 'Manage Events', icon: <Calendar size={18} /> },
    { to: '/organizer/submissions', label: 'Review Submissions', icon: <Send size={18} /> },
    { to: '/organizer/events/new', label: 'Create Event', icon: <Settings size={18} /> },
    { to: '/gallery', label: 'Public Gallery', icon: <Compass size={18} /> },
    { to: '/profile', label: 'Profile', icon: <User size={18} /> },
  ];

  const judgeLinks = [
    { to: '/judge/dashboard', label: 'Judge Dashboard', icon: <Award size={18} /> },
    { to: '/gallery', label: 'Browse Projects', icon: <FolderGit2 size={18} /> },
    { to: '/profile', label: 'Profile', icon: <User size={18} /> },
  ];

  const adminLinks = [
    { to: '/admin/dashboard', label: 'Admin Overview', icon: <ShieldAlert size={18} /> },
    { to: '/admin/users', label: 'User Directory', icon: <Users size={18} /> },
    { to: '/organizer/events', label: 'All Events', icon: <Calendar size={18} /> },
    { to: '/admin/system', label: 'System Health', icon: <Server size={18} /> },
    { to: '/profile', label: 'Profile', icon: <User size={18} /> },
  ];

  let links = participantLinks;
  if (role === 'ORGANIZER') links = organizerLinks;
  else if (role === 'JUDGE') links = judgeLinks;
  else if (role === 'ADMIN') links = adminLinks;

  return (
    <aside
      style={{
        width: '250px',
        background: '#0c1220',
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        padding: '1.5rem 1rem',
        flexShrink: 0
      }}
    >
      <div style={{ marginBottom: '1.5rem', paddingLeft: '0.75rem' }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
          {role} PORTAL
        </span>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flex: 1 }}>
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.625rem 0.875rem',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.875rem',
              fontWeight: 500,
              color: isActive ? '#ffffff' : 'var(--text-secondary)',
              background: isActive ? 'var(--primary-light)' : 'transparent',
              border: isActive ? '1px solid rgba(99, 102, 241, 0.3)' : '1px solid transparent',
              transition: 'all var(--transition-fast)'
            })}
          >
            {link.icon}
            <span>{link.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Tier Roadmap Mini Card */}
      <div
        style={{
          marginTop: 'auto',
          padding: '1rem',
          borderRadius: 'var(--radius-md)',
          background: 'rgba(99, 102, 241, 0.07)',
          border: '1px solid rgba(99, 102, 241, 0.2)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.25rem' }}>
          <Sparkles size={14} style={{ color: '#a5b4fc' }} />
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#a5b4fc' }}>TIER 1 ACTIVE</span>
        </div>
        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
          Core Registration, Teams, Projects, Deadline Submissions & Public Gallery active.
        </p>
      </div>
    </aside>
  );
};
