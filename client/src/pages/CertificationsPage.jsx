import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';
import { Icon } from '../components/Icons.jsx';
import {
  Avatar,
  EmptyState,
  Hero,
  Loading,
  Notice,
  Panel,
  relativeTime,
} from '../components/ui.jsx';

function initials(text) {
  if (!text) return '';
  return text
    .split(/[\s-]+/)
    .map((s) => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export default function CertificationsPage() {
  const { user } = useAuth();
  const [certifications, setCertifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ name: '', issuer: '', credentialId: '', issuedDate: '', expiryDate: '' });
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/certifications');
      setCertifications(data.certifications);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('name', form.name);
      formData.append('issuer', form.issuer);
      formData.append('credentialId', form.credentialId);
      formData.append('issuedDate', form.issuedDate);
      formData.append('expiryDate', form.expiryDate);
      if (file) formData.append('file', file);
      await api.upload('/certifications', formData);
      setForm({ name: '', issuer: '', credentialId: '', issuedDate: '', expiryDate: '' });
      setFile(null);
      setFormOpen(false);
      await load();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id, name) {
    if (!confirm(`Delete "${name}"?`)) return;
    await api.del(`/certifications/${id}`);
    await load();
  }

  return (
    <>
      <Hero
        eyebrow="Achievements"
        title="Certifications"
        lead="Track your professional credentials and certifications."
        actions={
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => setFormOpen((open) => !open)}
          >
            <Icon name={formOpen ? 'close' : 'plus'} size={17} />
            {formOpen ? 'Cancel' : 'Upload certification'}
          </button>
        }
      />

      {formOpen ? (
        <Panel title="Upload certification">
          <form onSubmit={handleSubmit}>
            <label className="field">
              <span className="field__label">Certification name</span>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. AWS Solutions Architect"
                required
              />
            </label>

            <label className="field">
              <span className="field__label">Issuer</span>
              <input
                className="input"
                value={form.issuer}
                onChange={(e) => setForm({ ...form, issuer: e.target.value })}
                placeholder="e.g. Amazon Web Services"
              />
            </label>

            <label className="field">
              <span className="field__label">Credential ID (optional)</span>
              <input
                className="input"
                value={form.credentialId}
                onChange={(e) => setForm({ ...form, credentialId: e.target.value })}
                placeholder="Credential or certificate ID"
              />
            </label>

            <label className="field">
              <span className="field__label">Issued date</span>
              <input
                className="input"
                type="date"
                value={form.issuedDate}
                onChange={(e) => setForm({ ...form, issuedDate: e.target.value })}
                required
              />
            </label>

            <label className="field">
              <span className="field__label">Expires (optional)</span>
              <input
                className="input"
                type="date"
                value={form.expiryDate}
                onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
              />
            </label>

            <label className="field">
              <span className="field__label">Certificate file (PDF/image)</span>
              <input
                className="input"
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>

            <button type="submit" className="btn btn--primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </form>
        </Panel>
      ) : null}

      <Notice tone="error">{error}</Notice>

      {loading ? (
        <Loading label="Loading certifications" />
      ) : certifications.length === 0 ? (
        <Panel>
          <EmptyState
            icon="certificate"
            title="No certifications yet"
            hint="Upload your first certification to build your achievement record."
          />
        </Panel>
      ) : (
        <div className="cert-grid">
          {certifications.map((certification, index) => (
            <article
              className="cert-card"
              key={certification.id}
              style={{ animationDelay: `${Math.min(index * 45, 260)}ms` }}
            >
              <span className="cert-card__seal" aria-hidden="true">
                {initials(certification.issuer || certification.name)}
              </span>

              <div className="cert-card__body">
                <h3 className="cert-card__name">{certification.name}</h3>
                <p className="cert-card__issuer">{certification.issuer || 'issuer not set'}</p>

                <div className="cert-card__facts">
                  <div className="cert-card__fact">
                    <p className="cert-card__fact-label">Credential</p>
                    <p className="cert-card__fact-value truncate">
                      {certification.credentialId || '—'}
                    </p>
                  </div>
                  <div className="cert-card__fact">
                    <p className="cert-card__fact-label">Issued</p>
                    <p className="cert-card__fact-value">{formatDate(certification.issuedDate)}</p>
                  </div>
                  <div className="cert-card__fact">
                    <p className="cert-card__fact-label">Expires</p>
                    <p className="cert-card__fact-value">{formatDate(certification.expiryDate)}</p>
                  </div>
                </div>

                <div className="cert-card__actions">
                  {certification.filePath ? (
                    <a
                      className="btn btn--outline btn--sm"
                      href={certification.filePath}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View
                    </a>
                  ) : (
                    <span className="muted">No file attached</span>
                  )}
                  <button
                    type="button"
                    className="btn btn--danger btn--sm"
                    onClick={() => handleDelete(certification.id, certification.name)}
                  >
                    <Icon name="trash" size={14} />
                    Delete
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

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
function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString();
}
