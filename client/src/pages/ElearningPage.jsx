import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Icon } from '../components/Icons.jsx';
import {
  Avatar,
  EmptyState,
  Hero,
  Loading,
  Notice,
  Panel,
  SearchField,
  Split,
  relativeTime,
} from '../components/ui.jsx';

const VIEWED_KEY_PREFIX = 'elearning_viewed_';

function getViewedTimestamp(assignmentId) {
  try {
    return Number(localStorage.getItem(`${VIEWED_KEY_PREFIX}${assignmentId}`)) || 0;
  } catch {
    return 0;
  }
}

function markViewed(assignmentId) {
  try {
    localStorage.setItem(`${VIEWED_KEY_PREFIX}${assignmentId}`, String(Date.now()));
  } catch {}
}

function hasUnreadReplies(latestReplyAt, viewedAt) {
  if (!latestReplyAt) return false;
  const replyTime = new Date(latestReplyAt).getTime();
  return replyTime > viewedAt;
}

export default function ElearningPage() {
  const { user } = useAuth();
  // Creating an assignment is admin-only on the server (routes/elearning.js), so the
  // composer must not be offered to staff at all.
  const isAdmin = user?.role === 'admin';
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
  const [form, setForm] = useState({ title: '', description: '' });
  const [assignmentImage, setAssignmentImage] = useState(null);
  const [saving, setSaving] = useState(false);
  const [composerError, setComposerError] = useState('');
  const [, forceRender] = useState(0);

  const load = useCallback(async (term = '') => {
    setLoading(true);
    try {
      const query = term ? `?search=${encodeURIComponent(term)}` : '';
      const data = await api.get(`/elearning/assignments${query}`);
      setAssignments(data.assignments);
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

  useEffect(() => {
    function onFocus() {
      forceRender((n) => n + 1);
    }
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const heroStats = useMemo(
    () => [
      { label: 'assignments', value: assignments.length },
      {
        label: 'questions',
        value: assignments.reduce((total, a) => total + (a.questionCount || 0), 0),
      },
    ],
    [assignments]
  );

  const activeAssignments = useMemo(
    () => [...assignments].sort((a, b) => (b.questionCount || 0) - (a.questionCount || 0)).slice(0, 5),
    [assignments]
  );
  const busiestCount = activeAssignments[0]?.questionCount ?? 0;

  async function handleSearch(event) {
    event.preventDefault();
    await load(search.trim());
  }

  async function handleCreate(event) {
    event.preventDefault();
    setSaving(true);
    setComposerError('');
    try {
      const formData = new FormData();
      formData.append('title', form.title);
      formData.append('description', form.description);
      formData.append('questions', JSON.stringify([{ prompt: form.description || '' }]));
      if (assignmentImage) {
        formData.append('assignment_image', assignmentImage);
      }
      await api.upload('/elearning/assignments', formData);
      setForm({ title: '', description: '' });
      setAssignmentImage(null);
      setComposerOpen(false);
      await load(search.trim());
    } catch (createError) {
      setComposerError(createError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Hero
        eyebrow="Learning"
        title="E-Learning"
        lead={
          isAdmin
            ? 'Create assignments with questions, or join the discussion on existing ones.'
            : 'Open an assignment to read its questions and post your answers.'
        }
        chips={['Discussion', 'Threaded replies']}
        stats={heroStats}
        actions={
          isAdmin ? (
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => setComposerOpen((open) => !open)}
            >
              <Icon name={composerOpen ? 'close' : 'plus'} size={17} />
              {composerOpen ? 'Cancel' : 'New assignment'}
            </button>
          ) : null
        }
      />

      {isAdmin && composerOpen ? (
        <Panel title="Create assignment" subtitle="Add questions to get discussions started.">
          <form onSubmit={handleCreate}>
            <Notice tone="error">{composerError}</Notice>

            <label className="field">
              <span className="field__label">Title</span>
              <input
                className="input"
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder="Assignment title"
                maxLength={200}
                required
              />
            </label>

            <label className="field">
              <span className="field__label">Description</span>
              <textarea
                className="textarea"
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                placeholder="Assignment instructions"
                rows={3}
              />
            </label>

            <label className="field">
              <span className="field__label">Assignment photo (optional)</span>
              <label className="file-input">
                <Icon name="upload" size={18} />
                <span className="file-input__name">
                  {assignmentImage?.name ?? 'Choose a file'}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setAssignmentImage(e.target.files?.[0] ?? null)}
                />
              </label>
            </label>

            {assignmentImage && (
              <img
                src={URL.createObjectURL(assignmentImage)}
                alt=""
                style={{ maxWidth: '100%', borderRadius: 4, marginTop: 8, marginBottom: 12 }}
              />
            )}

            <div className="composer__actions">
              <button type="submit" className="btn btn--primary" disabled={saving}>
                {saving ? 'Creating…' : 'Post assignment'}
              </button>
            </div>
          </form>
        </Panel>
      ) : null}

      <div className="toolbar">
        <SearchField
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onSubmit={handleSearch}
          placeholder="Search assignments…"
          label="Search assignments"
        />
        <span className="toolbar__spacer" />
        <span className="toolbar__count">
          {loading ? 'loading…' : `${assignments.length} assignment${assignments.length === 1 ? '' : 's'}`}
        </span>
      </div>

      <Split
        aside={
          <Panel title="Most active" subtitle="Assignments with the most questions">
            {activeAssignments.length === 0 ? (
              <p className="muted">No assignments yet.</p>
            ) : (
              <div className="bars">
                {activeAssignments.map((assignment) => (
                  <Link className="bar-row" to={`/e-learning/${assignment.id}`} key={assignment.id}>
                    <span className="bar-row__head">
                      <span className="truncate">{assignment.title}</span>
                      <span className="bar-row__value">{assignment.questionCount || 0}</span>
                    </span>
                    <div className="progress-bar">
                      <div
                        className="progress-bar__fill"
                        style={{
                          width: `${busiestCount ? Math.round(((assignment.questionCount || 0) / busiestCount) * 100) : 0}%`,
                        }}
                      />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Panel>
        }
      >
        <Panel
          title="Assignments"
          subtitle="Newest first — open an assignment to read or answer questions."
        >
          <Notice tone="error">{error}</Notice>

          {loading ? (
            <Loading label="Loading assignments" />
          ) : assignments.length === 0 ? (
            <EmptyState
              icon="book"
              title="No assignments yet"
              hint="Be the first to create an assignment for your team."
            />
          ) : (
            <div className="thread-list">
              {assignments.map((assignment) => {
                const unread = hasUnreadReplies(
                  assignment.latestReplyAt,
                  getViewedTimestamp(assignment.id)
                );
                return (
                <article className="thread" key={assignment.id} style={{ position: 'relative' }}>
                  {unread && (
                    <span
                      aria-label="Ada balasan baru"
                      style={{
                        position: 'absolute',
                        top: 12,
                        right: 12,
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: '#FF5252',
                        boxShadow: '0 0 0 2px var(--panel-alt)',
                      }}
                    />
                  )}
                  <Avatar name={assignment.createdBy.name} size={40} />
                  <div className="thread__body">
                    <Link
                      to={`/e-learning/${assignment.id}`}
                      onClick={() => markViewed(assignment.id)}
                    >
                      <h3 className="thread__title">{assignment.title}</h3>
                    </Link>
                      {assignment.description && (
                        <p className="thread__excerpt prose">{assignment.description}</p>
                      )}
                      <div className="thread__meta">
                      <span>{assignment.createdBy.name}</span>
                      <span>· {relativeTime(new Date(assignment.createdAt))}</span>
                      {isAdmin && (
                        <>
                          <span>·</span>
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={async () => {
                              if (!confirm('Delete this assignment?')) return;
                              await api.del(`/elearning/assignments/${assignment.id}`);
                              await load(search.trim());
                            }}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="thread__stats">
                    <span className="thread__stat-value">{assignment.questionCount || 0}</span>
                    <span className="thread__stat-label">questions</span>
                  </div>
                </article>
                );
              })}
            </div>
          )}
        </Panel>
      </Split>

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
