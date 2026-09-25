import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Icon } from '../components/Icons.jsx';
import { Avatar, Hero, Notice, Panel, RoleBadge, formatDate } from '../components/ui.jsx';

export default function ProfilePage() {
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();

  const [details, setDetails] = useState({ fullName: user.fullName, email: user.email ?? '' });
  const [detailsState, setDetailsState] = useState({ busy: false, error: '', success: '' });

  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [passwordState, setPasswordState] = useState({ busy: false, error: '', success: '' });

  async function saveDetails(event) {
    event.preventDefault();
    setDetailsState({ busy: true, error: '', success: '' });
    try {
      const data = await api.patch('/profile', details);
      setUser(data.user);
      setDetailsState({ busy: false, error: '', success: 'Profile updated.' });
    } catch (error) {
      setDetailsState({ busy: false, error: error.message, success: '' });
    }
  }

  async function savePassword(event) {
    event.preventDefault();
    if (passwords.newPassword !== passwords.confirm) {
      setPasswordState({ busy: false, error: 'New password and confirmation do not match.', success: '' });
      return;
    }

    setPasswordState({ busy: true, error: '', success: '' });
    try {
      await api.post('/profile/password', {
        currentPassword: passwords.currentPassword,
        newPassword: passwords.newPassword,
      });
      setPasswords({ currentPassword: '', newPassword: '', confirm: '' });
      setPasswordState({ busy: false, error: '', success: 'Password changed.' });
    } catch (error) {
      setPasswordState({ busy: false, error: error.message, success: '' });
    }
  }

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <>
      <Hero
        eyebrow="Account"
        title={user.fullName}
        lead="Your identity, credentials, and session in this workspace."
        chips={['Identity', 'Security']}
        markPlain
        mark={<Avatar name={user.fullName} size={80} />}
        stats={[
          { label: 'role', value: user.role },
          { label: 'joined', value: formatDate(user.createdAt).slice(0, 4) },
        ]}
        actions={
          <button type="button" className="btn btn--outline" onClick={handleLogout}>
            <Icon name="logout" size={16} />
            Log out
          </button>
        }
      />

      <div className="toolbar">
        <span className="row" style={{ gap: 10 }}>
          <RoleBadge role={user.role} />
          <span className="meta">@{user.username}</span>
          <span className="meta">member since {formatDate(user.createdAt)}</span>
        </span>
      </div>

      <div className="grid-two">
        <Panel title="Details" subtitle="Name and contact information.">
          <form onSubmit={saveDetails}>
            <Notice tone="error">{detailsState.error}</Notice>
            <Notice tone="success">{detailsState.success}</Notice>

            <label className="field">
              <span className="field__label">Full name</span>
              <input
                className="input"
                value={details.fullName}
                onChange={(event) => setDetails({ ...details, fullName: event.target.value })}
                maxLength={128}
                required
              />
            </label>

            <label className="field">
              <span className="field__label">Email</span>
              <input
                className="input"
                type="email"
                value={details.email}
                onChange={(event) => setDetails({ ...details, email: event.target.value })}
                maxLength={256}
              />
            </label>

            <button type="submit" className="btn btn--primary" disabled={detailsState.busy}>
              {detailsState.busy ? 'Saving…' : 'Save changes'}
            </button>
          </form>
        </Panel>

        <Panel title="Change password" subtitle="Update your credentials.">
          <form onSubmit={savePassword}>
            <Notice tone="error">{passwordState.error}</Notice>
            <Notice tone="success">{passwordState.success}</Notice>

            <label className="field">
              <span className="field__label">Current password</span>
              <input
                className="input"
                type="password"
                value={passwords.currentPassword}
                onChange={(event) => setPasswords({ ...passwords, currentPassword: event.target.value })}
                required
              />
            </label>

            <label className="field">
              <span className="field__label">New password</span>
              <input
                className="input"
                type="password"
                value={passwords.newPassword}
                onChange={(event) => setPasswords({ ...passwords, newPassword: event.target.value })}
                minLength={8}
                required
              />
            </label>

            <label className="field">
              <span className="field__label">Confirm new password</span>
              <input
                className="input"
                type="password"
                value={passwords.confirm}
                onChange={(event) => setPasswords({ ...passwords, confirm: event.target.value })}
                minLength={8}
                required
              />
            </label>

            <button type="submit" className="btn btn--primary" disabled={passwordState.busy}>
              {passwordState.busy ? 'Updating…' : 'Update password'}
            </button>
          </form>
        </Panel>
      </div>

      <button
        type="button"
        className="scroll-to-bottom"
        title="Scroll to bottom"
        onClick={() => {
          window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        }}
      >
        <Icon name="down" size={16} />
      </button>
    </>
  );
}
