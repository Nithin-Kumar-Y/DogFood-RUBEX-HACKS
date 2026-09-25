import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { UserRole } from './types';

// Pages
import { HomePage } from './pages/public/HomePage';
import { PublicGalleryPage } from './pages/public/PublicGalleryPage';
import { ProjectDetailPage } from './pages/public/ProjectDetailPage';
import { PublicEventsPage } from './pages/public/PublicEventsPage';
import { LoginPage } from './pages/public/LoginPage';
import { RegisterPage } from './pages/public/RegisterPage';
import { JoinTeamPage } from './pages/public/JoinTeamPage';

import { ParticipantDashboard } from './pages/participant/ParticipantDashboard';
import { MyTeamsPage } from './pages/participant/MyTeamsPage';
import { MyProjectsPage } from './pages/participant/MyProjectsPage';
import { ProjectEditorPage } from './pages/participant/ProjectEditorPage';

import { OrganizerDashboard } from './pages/organizer/OrganizerDashboard';
import { OrganizerEventsPage } from './pages/organizer/OrganizerEventsPage';
import { EventEditorPage } from './pages/organizer/EventEditorPage';
import { SubmissionsReviewPage } from './pages/organizer/SubmissionsReviewPage';

import { JudgeDashboard } from './pages/judge/JudgeDashboard';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { ProfilePage } from './pages/profile/ProfilePage';

// Route Guards
const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <div style={{ padding: '3rem', textAlign: 'center' }}>Loading session...</div>;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

const RequireRole: React.FC<{ roles: UserRole[]; children: React.ReactNode }> = ({ roles, children }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div style={{ padding: '3rem', textAlign: 'center' }}>Verifying permissions...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== 'ADMIN' && !roles.includes(user.role)) {
    // Redirect to the user's primary portal if unauthorized
    if (user.role === 'ORGANIZER') return <Navigate to="/organizer/dashboard" replace />;
    if (user.role === 'JUDGE') return <Navigate to="/judge/dashboard" replace />;
    return <Navigate to="/participant/dashboard" replace />;
  }

  return <>{children}</>;
};

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  return (
    <div className="app-container">
      {user && <Sidebar />}
      <div className="main-layout">
        <Navbar />
        <main className="content-area">{children}</main>
      </div>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Layout>
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<HomePage />} />
              <Route path="/events" element={<PublicEventsPage />} />
              <Route path="/events/:idOrSlug" element={<PublicEventsPage />} />
              <Route path="/gallery" element={<PublicGalleryPage />} />
              <Route path="/gallery/:id" element={<ProjectDetailPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/teams/join" element={<JoinTeamPage />} />

              {/* Participant Routes */}
              <Route
                path="/participant/dashboard"
                element={
                  <RequireAuth>
                    <ParticipantDashboard />
                  </RequireAuth>
                }
              />
              <Route
                path="/participant/teams"
                element={
                  <RequireAuth>
                    <MyTeamsPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/participant/projects"
                element={
                  <RequireAuth>
                    <MyProjectsPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/participant/projects/new"
                element={
                  <RequireAuth>
                    <ProjectEditorPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/participant/projects/:id/edit"
                element={
                  <RequireAuth>
                    <ProjectEditorPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/participant/submissions"
                element={
                  <RequireAuth>
                    <MyProjectsPage />
                  </RequireAuth>
                }
              />

              {/* Organizer Routes */}
              <Route
                path="/organizer/dashboard"
                element={
                  <RequireRole roles={['ORGANIZER']}>
                    <OrganizerDashboard />
                  </RequireRole>
                }
              />
              <Route
                path="/organizer/events"
                element={
                  <RequireRole roles={['ORGANIZER']}>
                    <OrganizerEventsPage />
                  </RequireRole>
                }
              />
              <Route
                path="/organizer/events/new"
                element={
                  <RequireRole roles={['ORGANIZER']}>
                    <EventEditorPage />
                  </RequireRole>
                }
              />
              <Route
                path="/organizer/events/:id/edit"
                element={
                  <RequireRole roles={['ORGANIZER']}>
                    <EventEditorPage />
                  </RequireRole>
                }
              />
              <Route
                path="/organizer/submissions"
                element={
                  <RequireRole roles={['ORGANIZER']}>
                    <SubmissionsReviewPage />
                  </RequireRole>
                }
              />

              {/* Judge Routes */}
              <Route
                path="/judge/dashboard"
                element={
                  <RequireRole roles={['JUDGE']}>
                    <JudgeDashboard />
                  </RequireRole>
                }
              />

              {/* Admin Routes */}
              <Route
                path="/admin/dashboard"
                element={
                  <RequireRole roles={['ADMIN']}>
                    <AdminDashboard />
                  </RequireRole>
                }
              />
              <Route
                path="/admin/users"
                element={
                  <RequireRole roles={['ADMIN']}>
                    <AdminDashboard />
                  </RequireRole>
                }
              />
              <Route
                path="/admin/system"
                element={
                  <RequireRole roles={['ADMIN']}>
                    <AdminDashboard />
                  </RequireRole>
                }
              />

              {/* User Profile */}
              <Route
                path="/profile"
                element={
                  <RequireAuth>
                    <ProfilePage />
                  </RequireAuth>
                }
              />

              {/* Catch-all redirect to Home */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Layout>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
};
export default App;
