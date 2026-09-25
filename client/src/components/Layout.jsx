import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Icon } from './Icons.jsx';
import { Avatar, RoleBadge } from './ui.jsx';

const PRIMARY_NAV = [
  // Admin-only, and first in the list: it is the overview an admin opens the workspace on.
  { to: '/dashboard', label: 'Dashboard', icon: 'chart', adminOnly: true },
  { to: '/forum', label: 'Forum', icon: 'forum' },
  { to: '/profile', label: 'Profile', icon: 'user' },
  { to: '/schedule', label: 'Schedule & Task', icon: 'calendar' },
  { to: '/appearance', label: 'Appearance', icon: 'palette' },
  { to: '/e-learning', label: 'E-Learning', icon: 'book' },
  { to: '/activity', label: 'Activity History', icon: 'history' },
  { to: '/archive', label: 'Archive', icon: 'archive', adminOnly: true },
  { to: '/user-management', label: 'User Management', icon: 'users', adminOnly: true },
];

const ACHIEVEMENT_NAV = [
  { to: '/achievements/certifications', label: 'Certification', icon: 'certificate' },
  { to: '/achievements/certification-hub', label: 'Certification Hub', icon: 'award' },
  { to: '/achievements/articles', label: 'Artikel', icon: 'article' },
];

function crumbFor(pathname) {
  if (pathname.startsWith('/dashboard')) return 'Dashboard';
  if (pathname.startsWith('/forum/')) return 'Forum / Discussion';
  if (pathname.startsWith('/forum')) return 'Forum';
  if (pathname.startsWith('/profile')) return 'Profile';
  if (pathname.startsWith('/schedule')) return 'Schedule & Task';
  if (pathname.startsWith('/appearance')) return 'Appearance';
  if (pathname.startsWith('/e-learning/')) return 'E-Learning / Assignment';
  if (pathname.startsWith('/e-learning')) return 'E-Learning';
  if (pathname.startsWith('/activity')) return 'Activity History';
  if (pathname.startsWith('/user-management')) return 'User Management';
  if (pathname.startsWith('/achievements/certifications')) return 'Achievement / Certification';
  if (pathname.startsWith('/achievements/certification-hub')) return 'Achievement / Certification Hub';
  if (pathname.startsWith('/achievements/articles')) return 'Achievement / Artikel';
  if (pathname.startsWith('/archive')) return 'Archive';
  return 'Workspace';
}

export default function Layout() {
  const { user, preferences, applyPreferences, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [navOpen, setNavOpen] = useState(false);
  const [achievementsOpen, setAchievementsOpen] = useState(
    location.pathname.startsWith('/achievements')
  );

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (location.pathname.startsWith('/achievements')) setAchievementsOpen(true);
  }, [location.pathname]);

  async function toggleTheme() {
    const nextTheme = preferences.theme === 'dark' ? 'light' : 'dark';
    applyPreferences({ theme: nextTheme });
    try {
      await api.put('/appearance', { ...preferences, theme: nextTheme });
    } catch {
      applyPreferences({ theme: preferences.theme });
    }
  }

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className={`shell${navOpen ? ' is-open' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar__brand">
          <span className="sidebar__mark">EJ</span>
          <div>
            <p className="sidebar__name">E-Journey</p>
            <p className="sidebar__tagline">Staff Workspace</p>
          </div>
        </div>

        <nav className="sidebar__nav">
          <p className="sidebar__section-label">Workspace</p>
          {PRIMARY_NAV.map((item) => {
            if (item.adminOnly && user.role !== 'admin') return null;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}
              >
                <Icon name={item.icon} />
                <span className="nav-link__label">{item.label}</span>
              </NavLink>
            );
          })}

          <p className="sidebar__section-label">Achievement</p>
          <div className="nav-group">
            <button
              type="button"
              className="nav-group__toggle"
              onClick={() => setAchievementsOpen((open) => !open)}
              aria-expanded={achievementsOpen}
            >
              <Icon name="award" />
              <span className="nav-link__label">Achievement</span>
              <Icon
                name="chevron"
                size={16}
                className={`nav-group__caret${achievementsOpen ? ' is-open' : ''}`}
              />
            </button>

            {achievementsOpen ? (
              <div className="nav-group__items">
                {ACHIEVEMENT_NAV.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}
                  >
                    <Icon name={item.icon} size={16} />
                    <span className="nav-link__label">{item.label}</span>
                  </NavLink>
                ))}
              </div>
            ) : null}
          </div>
        </nav>

        <div className="sidebar__footer">
          <Avatar name={user.fullName} size={38} />
          <div className="sidebar__identity">
            <p className="sidebar__identity-name">{user.fullName}</p>
            <p className="sidebar__identity-role">{user.role}</p>
          </div>
          <button
            type="button"
            className="icon-button icon-button--ghost"
            onClick={handleLogout}
            title="Log out"
            aria-label="Log out"
          >
            <Icon name="logout" size={17} />
          </button>
        </div>
      </aside>

      <button
        type="button"
        className="scrim"
        aria-label="Close navigation"
        onClick={() => setNavOpen(false)}
      />

      <div className="shell__main">
        <header className="topbar">
          <button
            type="button"
            className="icon-button sidebar-toggle"
            onClick={() => setNavOpen(true)}
            aria-label="Open navigation"
          >
            <Icon name="menu" />
          </button>

          <span className="topbar__crumb">{crumbFor(location.pathname)}</span>
          <span className="topbar__spacer" />

          <button
            type="button"
            className="icon-button"
            onClick={toggleTheme}
            title={preferences.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label="Toggle colour mode"
          >
            <Icon name={preferences.theme === 'dark' ? 'sun' : 'moon'} size={17} />
          </button>
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
