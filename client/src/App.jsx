import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { useAuth } from './auth.jsx';
import ActivityPage from './pages/ActivityPage.jsx';
import ArchivePage from './pages/ArchivePage.jsx';
import AppearancePage from './pages/AppearancePage.jsx';
import ArticlesPage from './pages/ArticlesPage.jsx';
import AssignmentPage from './pages/AssignmentPage.jsx';
import CertificationHubPage from './pages/CertificationHubPage.jsx';
import CertificationsPage from './pages/CertificationsPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import ElearningPage from './pages/ElearningPage.jsx';
import ForumPage from './pages/ForumPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import SchedulePage from './pages/SchedulePage.jsx';
import ThreadPage from './pages/ThreadPage.jsx';
import UserManagementPage from './pages/UserManagementPage.jsx';

export default function App() {
  const { user, status } = useAuth();

  if (status === 'loading') {
    return (
      <div className="boot">
        <span className="boot__mark">EJ</span>
        <p className="boot__text">Loading your workspace…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/forum" replace />} />
      <Route element={<Layout />}>
        {/* Hiding the nav item is not enough — the API is admin-only, so a staff member
            typing the URL would only land on a page that cannot load anything. */}
        <Route
          path="/dashboard"
          element={user.role === 'admin' ? <DashboardPage /> : <Navigate to="/forum" replace />}
        />
        <Route path="/forum" element={<ForumPage />} />
        <Route path="/forum/:threadId" element={<ThreadPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/schedule" element={<SchedulePage />} />
        <Route path="/appearance" element={<AppearancePage />} />
        <Route path="/e-learning" element={<ElearningPage />} />
        <Route path="/e-learning/:assignmentId" element={<AssignmentPage />} />
        <Route path="/activity" element={<ActivityPage />} />
        <Route path="/archive" element={<ArchivePage />} />
        <Route path="/archive/:folderId" element={<ArchivePage />} />
        <Route path="/achievements/articles" element={<ArticlesPage />} />
        <Route path="/achievements/certifications" element={<CertificationsPage />} />
        <Route path="/achievements/certification-hub" element={<CertificationHubPage />} />
        <Route path="/user-management" element={<UserManagementPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/forum" replace />} />
    </Routes>
  );
}
