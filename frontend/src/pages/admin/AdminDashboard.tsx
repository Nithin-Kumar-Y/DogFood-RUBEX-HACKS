import React, { useEffect, useState } from 'react';
import { ShieldAlert, Users, Calendar, FolderGit2, Send, Server, Database, Activity } from 'lucide-react';
import { api } from '../../services/api';
import { StatCard } from '../../components/StatCard';
import { Skeleton } from '../../components/Skeleton';
import { Badge } from '../../components/Badge';

export const AdminDashboard: React.FC = () => {
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getAdminStats(), api.getAdminUsers({ limit: 50 })])
      .then(([statsData, usersData]) => {
        setStats(statsData.stats);
        setUsers(usersData.users || []);
      })
      .catch((err) => console.error('Failed to load admin stats', err))
      .finally(() => setLoading(false));
  }, []);

  const formatUptime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m ${Math.floor(seconds % 60)}s`;
  };

  const formatMemory = (bytes: number) => {
    return `${Math.round(bytes / 1024 / 1024)} MB`;
  };

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ marginBottom: '0.35rem' }}>System Administration</h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          Overall platform health, user directory, database state, and RBAC governance.
        </p>
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
          {/* Key Metrics */}
          <div className="grid-cols-4">
            <StatCard
              title="Registered Users"
              value={stats?.totalUsers || 0}
              subtext="Platform accounts"
              icon={<Users size={22} />}
            />
            <StatCard
              title="Total Hackathons"
              value={stats?.totalEvents || 0}
              subtext="Published & draft"
              icon={<Calendar size={22} />}
            />
            <StatCard
              title="Formed Teams"
              value={stats?.totalTeams || 0}
              subtext="Builder cohorts"
              icon={<FolderGit2 size={22} />}
            />
            <StatCard
              title="Verified Submissions"
              value={stats?.totalSubmissions || 0}
              subtext="Before deadlines"
              icon={<Send size={22} />}
            />
          </div>

          {/* System Health Diagnostics */}
          <div className="card" style={{ padding: '1.75rem' }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Server size={18} style={{ color: 'var(--primary)' }} />
              <span>Offline System Diagnostics</span>
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem' }}>
              <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>DATABASE ADAPTER</span>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--success)', marginTop: '0.2rem' }}>
                  {stats?.databaseType?.toUpperCase()} (ACID)
                </div>
              </div>

              <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>NODE RUNTIME</span>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.2rem' }}>
                  {stats?.nodeVersion}
                </div>
              </div>

              <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>SERVER UPTIME</span>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.2rem' }}>
                  {formatUptime(stats?.uptime || 0)}
                </div>
              </div>

              <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>HEAP MEMORY</span>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.2rem' }}>
                  {formatMemory(stats?.memoryUsage?.heapUsed || 0)}
                </div>
              </div>
            </div>
          </div>

          {/* User Directory Table */}
          <div className="card" style={{ padding: '1.75rem' }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Users size={18} style={{ color: 'var(--primary)' }} />
              <span>Platform User Directory ({users.length})</span>
            </h3>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>User</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Email</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Role</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Teams</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Created At</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                        <img
                          src={u.avatar_url || 'https://api.dicebear.com/7.x/bottts/svg?seed=user'}
                          alt={u.full_name}
                          style={{ width: '30px', height: '30px', borderRadius: '50%', objectFit: 'cover' }}
                        />
                        <span style={{ fontWeight: 600 }}>{u.full_name}</span>
                      </td>
                      <td style={{ padding: '0.85rem 1rem', color: 'var(--text-secondary)' }}>{u.email}</td>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <span
                          style={{
                            fontSize: '0.6875rem',
                            fontWeight: 700,
                            padding: '0.2rem 0.5rem',
                            borderRadius: 'var(--radius-sm)',
                            background:
                              u.role === 'ADMIN'
                                ? 'rgba(244, 63, 94, 0.2)'
                                : u.role === 'ORGANIZER'
                                ? 'rgba(99, 102, 241, 0.2)'
                                : 'rgba(255, 255, 255, 0.08)',
                            color:
                              u.role === 'ADMIN'
                                ? 'var(--danger)'
                                : u.role === 'ORGANIZER'
                                ? '#a5b4fc'
                                : 'var(--text-secondary)'
                          }}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td style={{ padding: '0.85rem 1rem', color: 'var(--text-muted)' }}>
                        {u.team_count || 0} teams
                      </td>
                      <td style={{ padding: '0.85rem 1rem', color: 'var(--text-muted)' }}>
                        {new Date(u.created_at).toLocaleDateString()}
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
