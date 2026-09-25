import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { Icon } from '../components/Icons.jsx';
import { Notice } from '../components/ui.jsx';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(username.trim(), password);
      navigate('/forum', { replace: true });
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <section className="auth__brand">
        <span className="auth__mark">EJ</span>

        <div>
          <span className="auth__eyebrow">Visual ideation workspace</span>
          <h1 className="auth__display">E-Journey</h1>
          <p className="auth__copy">
            One workspace for team discussion, scheduling, learning assignments, and the
            achievements you collect along the way.
          </p>
          <div className="auth__chips">
            <span className="auth__chip">Forum</span>
            <span className="auth__chip">Schedule</span>
            <span className="auth__chip">E-Learning</span>
            <span className="auth__chip">Achievement</span>
          </div>
        </div>

        <p className="auth__meta">Staff Workspace · Secure sign-in required</p>
      </section>

      <section className="auth__panel">
        <form className="auth__form" onSubmit={handleSubmit}>
          <h2 className="auth__title">Sign in</h2>
          <p className="auth__subtitle">Use your E-Journey account to continue.</p>

          <Notice tone="error">{error}</Notice>

          <label className="field">
            <span className="field__label">Username</span>
            <input
              className="input"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              autoFocus
              required
            />
          </label>

          <label className="field">
            <span className="field__label">Password</span>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
            <Icon name="logout" size={17} />
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </section>
    </div>
  );
}
