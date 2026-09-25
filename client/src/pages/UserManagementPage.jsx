import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { Icon } from '../components/Icons.jsx';
import { DropdownMenu } from '../components/DropdownMenu.jsx';
import { EmptyState, Hero, Loading, Notice, Panel, RoleBadge, SectionHead } from '../components/ui.jsx';

const ROLES = ['admin', 'staff'];

export default function UserManagementPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [builderOpen, setBuilderOpen] = useState(false);
  const [form, setForm] = useState({
    username: '',
    fullName: '',
    email: '',
    password: '',
    role: 'staff',
  });
  const [saving, setSaving] = useState(false);
  const [builderError, setBuilderError] = useState('');

  const [editingUser, setEditingUser] = useState(null);
  const [roleForm, setRoleForm] = useState({ role: '' });

  const [resettingUser, setResettingUser] = useState(null);
  const [passwordForm, setPasswordForm] = useState({ password: '' });
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');
  const [resetting, setResetting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/users');
      setUsers(data.users);
      setError('');
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function resetForm() {
    setForm({ username: '', fullName: '', email: '', password: '', role: 'staff' });
    setBuilderError('');
  }

  async function handleCreate(event) {
    event.preventDefault();
    setSaving(true);
    setBuilderError('');
    try {
      await api.post('/users', form);
      resetForm();
      setBuilderOpen(false);
      await load();
    } catch (createError) {
      setBuilderError(createError.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRoleChange(event) {
    event.preventDefault();
    try {
      await api.put(`/users/${editingUser.id}/role`, { role: roleForm.role });
      setEditingUser(null);
      setRoleForm({ role: '' });
      await load();
    } catch (roleError) {
      setError(roleError.message);
    }
  }

  async function handleDelete(id, name) {
    if (!window.confirm(`Deactivate user "${name}"?`)) return;
    try {
      await api.del(`/users/${id}`);
      await load();
    } catch (deleteError) {
      setError(deleteError.message);
    }
  }

  async function handlePasswordReset(event) {
    event.preventDefault();
    setResetting(true);
    setResetError('');
    setResetSuccess('');
    try {
      await api.post(`/users/${resettingUser.id}/password`, passwordForm);
      setResetSuccess(
        `Password updated for ${resettingUser.fullName}. Share the new password with them directly.`
      );
      setPasswordForm({ password: '' });
      setResettingUser(null);
    } catch (resetFailure) {
      setResetError(resetFailure.message);
    } finally {
      setResetting(false);
    }
  }

  const activeUsers = users.filter((user) => user.isActive);

  return (
    <>
      <Hero
        eyebrow="Admin"
        title="User Management"
        lead="Create users, assign roles (admin or staff), and deactivate accounts. This section is for administrators only."
        chips={['Users', 'Roles', 'Admin-only']}
        stats={[
          { label: 'users', value: users.length },
          { label: 'admins', value: users.filter((u) => u.role === 'admin').length },
        ]}
        actions={
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => setBuilderOpen((open) => !open)}
          >
            <Icon name={builderOpen ? 'close' : 'plus'} size={17} />
            {builderOpen ? 'Cancel' : 'New user'}
          </button>
        }
      />

      <Notice tone="error">{error}</Notice>
      <Notice tone="success">{resetSuccess}</Notice>

      {builderOpen ? (
        <Panel title="Create user" subtitle="Add a new staff member or admin account.">
          <form onSubmit={handleCreate}>
            <Notice tone="error">{builderError}</Notice>

            <div className="form-grid">
              <label className="field field--wide">
                <span className="field__label">Username</span>
                <input
                  className="input"
                  value={form.username}
                  onChange={(event) => setForm({ ...form, username: event.target.value })}
                  maxLength={64}
                  required
                />
              </label>

              <label className="field">
                <span className="field__label">Full name</span>
                <input
                  className="input"
                  value={form.fullName}
                  onChange={(event) => setForm({ ...form, fullName: event.target.value })}
                  maxLength={128}
                  required
                />
              </label>

              <label className="field">
                <span className="field__label">Email (optional)</span>
                <input
                  className="input"
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                  maxLength={190}
                />
              </label>

              <label className="field">
                <span className="field__label">Password</span>
                <input
                  className="input"
                  type="password"
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                  minLength={8}
                  required
                />
              </label>
            </div>

            <label className="field" style={{ maxWidth: 180 }}>
              <span className="field__label">Role</span>
              <select
                className="select"
                value={form.role}
                onChange={(event) => setForm({ ...form, role: event.target.value })}
              >
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </label>

            <button type="submit" className="btn btn--primary" disabled={saving}>
              {saving ? 'Creating…' : 'Create user'}
            </button>
          </form>
        </Panel>
      ) : null}

      <SectionHead
        eyebrow="Active users"
        title="Active users"
        hint={loading
          ? 'Loading…'
          : `${activeUsers.length} active user${activeUsers.length === 1 ? '' : 's'}`}
      />

      {loading ? (
        <Loading label="Loading users" />
      ) : activeUsers.length === 0 ? (
        <Panel>
          <EmptyState
            icon="users"
            title="No active users"
            hint="No user accounts have been created yet."
          />
        </Panel>
      ) : (
        <div className="course-grid">
          {activeUsers.map((user) => (
            <article className="course-card" key={user.id}>
              <div className="course-card__top">
                <span className="course-card__mark">
                  <Icon name="user" size={22} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 className="course-card__title">{user.fullName}</h3>
                  <p className="course-card__meta">
                    <span>@{user.username}</span>
                    {user.email ? <span>· {user.email}</span> : null}
                  </p>
                </div>
                <RoleBadge role={user.role} />
              </div>

              <div className="course-card__foot">
                <span className="meta">{user.schemaName.replace('ej_user_', 'schema ')}</span>
                <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
                  <DropdownMenu
                    trigger={
                      <button
                        type="button"
                        className="btn btn--outline btn--sm"
                        style={{ minWidth: 36, height: 36, padding: 0, justifyContent: 'center' }}
                        aria-label="More actions"
                      >
                        <Icon name="dots" size={20} />
                      </button>
                    }
                    placement="bottom-end"
                  >
                    <button
                      type="button"
                      className="dropdown__item"
                      style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                      onClick={() => {
                        setEditingUser(user);
                        setRoleForm({ role: user.role });
                      }}
                    >
                      <Icon name="edit" size={16} />
                      Edit role
                    </button>
                    <button
                      type="button"
                      className="dropdown__item"
                      style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                      onClick={() => {
                        setResettingUser(user);
                        setPasswordForm({ password: '' });
                        setResetError('');
                        setResetSuccess('');
                      }}
                    >
                      <Icon name="key" size={16} />
                      Reset password
                    </button>
                    <button
                      type="button"
                      className="dropdown__item dropdown__item--danger"
                      style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                      onClick={() => handleDelete(user.id, user.fullName)}
                    >
                      <Icon name="trash" size={16} />
                      Delete
                    </button>
                  </DropdownMenu>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {editingUser ? (
        <Panel title="Edit role" subtitle={`Change the role for ${editingUser.fullName}`}>
          <form onSubmit={handleRoleChange}>
            <Notice tone="error">{error}</Notice>

            <label className="field" style={{ maxWidth: 180 }}>
              <span className="field__label">Role</span>
              <select
                className="select"
                value={roleForm.role}
                onChange={(event) => setRoleForm({ role: event.target.value })}
                required
              >
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </label>

            <div className="row" style={{ gap: 8, marginTop: 16 }}>
              <button type="submit" className="btn btn--primary">
                Save role
              </button>
              <button
                type="button"
                className="btn btn--outline btn--sm"
                onClick={() => {
                  setEditingUser(null);
                  setRoleForm({ role: '' });
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </Panel>
      ) : null}

      {resettingUser ? (
        <Panel
          title="Reset password"
          subtitle={`Set a new password for ${resettingUser.fullName} (@${resettingUser.username})`}
        >
          <form onSubmit={handlePasswordReset}>
            <Notice tone="error">{resetError}</Notice>

            <label className="field" style={{ maxWidth: 320 }}>
              <span className="field__label">New password</span>
              <input
                className="input"
                type="password"
                value={passwordForm.password}
                onChange={(event) => setPasswordForm({ password: event.target.value })}
                minLength={8}
                autoComplete="new-password"
                required
              />
            </label>
            <p className="meta">
              At least 8 characters. The user can change it later from their Profile page.
            </p>

            <div className="row" style={{ gap: 8, marginTop: 16 }}>
              <button type="submit" className="btn btn--primary" disabled={resetting}>
                {resetting ? 'Saving…' : 'Save password'}
              </button>
              <button
                type="button"
                className="btn btn--outline btn--sm"
                onClick={() => {
                  setResettingUser(null);
                  setPasswordForm({ password: '' });
                  setResetError('');
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </Panel>
      ) : null}
    </>
  );
}
