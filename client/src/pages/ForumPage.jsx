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
  RoleBadge,
  SearchField,
  Split,
  relativeTime,
} from '../components/ui.jsx';

export default function ForumPage() {
  const { user } = useAuth();
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState({ title: '', body: '' });
  const [saving, setSaving] = useState(false);
  const [composerError, setComposerError] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

  async function handleDelete(threadId, title) {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    setDeleteLoading(true);
    try {
      await api.del(`/forum/threads/${threadId}`);
      await load(search.trim());
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleteLoading(false);
    }
  }

  const load = useCallback(async (term = '') => {
    setLoading(true);
    try {
      const query = term ? `?search=${encodeURIComponent(term)}` : '';
      const data = await api.get(`/forum/threads${query}`);
      setThreads(data.threads);
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

  const heroStats = useMemo(
    () => [
      { label: 'threads', value: threads.length },
      {
        label: 'replies',
        value: threads.reduce((total, thread) => total + thread.replyCount, 0),
      },
      { label: 'voices', value: new Set(threads.map((thread) => thread.author.id)).size },
    ],
    [threads]
  );

  const activeThreads = useMemo(
    () => [...threads].sort((a, b) => b.replyCount - a.replyCount).slice(0, 5),
    [threads]
  );
  const busiestCount = activeThreads[0]?.replyCount ?? 0;

  async function handleSearch(event) {
    event.preventDefault();
    await load(search.trim());
  }

  async function handleCreate(event) {
    event.preventDefault();
    setSaving(true);
    setComposerError('');
    try {
      await api.post('/forum/threads', draft);
      setDraft({ title: '', body: '' });
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
        eyebrow="Community"
        title="Forum"
        lead="Start a discussion or jump into an existing conversation. Replies keep their thread of context, so one question can grow into a whole debate."
        chips={['Discussion', 'Threaded replies']}
        stats={heroStats}
        actions={
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => setComposerOpen((open) => !open)}
          >
            <Icon name={composerOpen ? 'close' : 'plus'} size={17} />
            {composerOpen ? 'Cancel' : 'New discussion'}
          </button>
        }
      />

      {composerOpen ? (
        <Panel title="Start a discussion" subtitle="Give your team enough context to answer well.">
          <form onSubmit={handleCreate}>
            <Notice tone="error">{composerError}</Notice>

            <label className="field">
              <span className="field__label">Title</span>
              <input
                className="input"
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                placeholder="What would you like to discuss?"
                maxLength={200}
                required
              />
            </label>

            <label className="field">
              <span className="field__label">Message</span>
              <textarea
                className="textarea"
                value={draft.body}
                onChange={(event) => setDraft({ ...draft, body: event.target.value })}
                placeholder="Share the details, context, or question…"
                required
              />
            </label>

            <div className="composer__actions">
              <button type="submit" className="btn btn--primary" disabled={saving}>
                {saving ? 'Posting…' : 'Post discussion'}
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
          placeholder="Search discussions…"
          label="Search discussions"
        />
        <span className="toolbar__spacer" />
        <span className="toolbar__count">
          {loading ? 'loading…' : `${threads.length} thread${threads.length === 1 ? '' : 's'}`}
        </span>
      </div>

      <Split
        aside={
          <Panel title="Most active" subtitle="Threads with the most replies">
            {activeThreads.length === 0 ? (
              <p className="muted">No discussions to rank yet.</p>
            ) : (
              <div className="bars">
                {activeThreads.map((thread) => (
                  <Link className="bar-row" to={`/forum/${thread.id}`} key={thread.id}>
                    <span className="bar-row__head">
                      <span className="truncate">{thread.title}</span>
                      <span className="bar-row__value">{thread.replyCount}</span>
                    </span>
                    <div className="progress-bar">
                      <div
                        className="progress-bar__fill"
                        style={{
                          width: `${busiestCount ? Math.round((thread.replyCount / busiestCount) * 100) : 0}%`,
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
          title="Discussions"
          subtitle="Newest first — open a thread to read or answer it."
        >
          <Notice tone="error">{error}</Notice>

          {loading ? (
            <Loading label="Loading discussions" />
          ) : threads.length === 0 ? (
            <EmptyState
              icon="forum"
              title="No discussions yet"
              hint="Be the first to start a conversation with your team."
            />
          ) : (
            <div className="thread-list">
              {threads.map((thread) => (
                <article className="thread" key={thread.id}>
                  <Avatar name={thread.author.name} size={40} />
                  <div className="thread__body">
                    <Link to={`/forum/${thread.id}`}>
                      <h3 className="thread__title">{thread.title}</h3>
                    </Link>
                    <p className="thread__excerpt prose">{thread.body}</p>
                    <div className="thread__meta">
                      <span>{thread.author.name}</span>
                      <RoleBadge role={thread.author.role} />
                      <span>· {relativeTime(thread.createdAt)}</span>
                      {user?.role === 'admin' && (
                        <>
                          <span>·</span>
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={async () => handleDelete(thread.id, thread.title)}
                            disabled={deleteLoading}
                          >
                            <Icon name="trash" size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="thread__stats">
                    <span className="thread__stat-value">{thread.replyCount}</span>
                    <span className="thread__stat-label">replies</span>
                  </div>
                </article>
              ))}
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
