import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Icon } from '../components/Icons.jsx';
import {
  Avatar,
  Panel,
  EmptyState,
  Hero,
  Loading,
  Notice,
  RoleBadge,
  relativeTime,
} from '../components/ui.jsx';

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'link';
  }
}

export default function ArticlesPage() {
  const { user } = useAuth();

  const [view, setView] = useState('mine');
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ title: '', url: '', description: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/articles');
      setArticles(data.articles);
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

  // The API returns every member's articles, so "Mine" has to narrow that list down
  // here — it is also what makes the delete button safe to show (the API only lets the
  // author delete their own article).
  const visible = useMemo(
    () =>
      view === 'mine' ? articles.filter((article) => article.author?.id === user?.id) : articles,
    [articles, view, user]
  );

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await api.post('/articles', form);
      setForm({ title: '', url: '', description: '' });
      setFormOpen(false);
      await load();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id, title) {
    if (!confirm(`Delete "${title}"?`)) return;
    await api.del(`/articles/${id}`);
    await load();
  }

  return (
    <>
      <Hero
        eyebrow="Content"
        title="Articles"
        lead="Share links, write posts, or discuss with your team."
        stats={[
          { label: 'Total', value: articles.length },
        ]}
        actions={
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => setFormOpen((open) => !open)}
          >
            <Icon name={formOpen ? 'close' : 'plus'} size={17} />
            {formOpen ? 'Cancel' : 'New article'}
          </button>
        }
      />

      {formOpen ? (
        <Panel title="New article">
          <form onSubmit={handleSubmit}>
            <label className="field">
              <span className="field__label">Title</span>
              <input
                className="input"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Article title"
                required
              />
            </label>

            <label className="field">
              <span className="field__label">URL</span>
              <input
                className="input"
                type="url"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://example.com/article"
              />
            </label>

            <label className="field">
              <span className="field__label">Description</span>
              <textarea
                className="textarea"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Write your thoughts"
                rows={6}
              />
            </label>

            <button type="submit" className="btn btn--primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </form>
        </Panel>
      ) : null}

      <div className="toolbar">
        <span className="toolbar__count">
          {loading
            ? 'loading…'
            : `${visible.length} article${visible.length === 1 ? '' : 's'}`}
        </span>
        <span className="toolbar__spacer" />
        <button
          type="button"
          className={`btn btn--ghost btn--sm ${view === 'mine' ? 'is-active' : ''}`}
          onClick={() => setView('mine')}
        >
          Mine
        </button>
        <button
          type="button"
          className={`btn btn--ghost btn--sm ${view === 'all' ? 'is-active' : ''}`}
          onClick={() => setView('all')}
        >
          All
        </button>
      </div>

      <Notice tone="error">{error}</Notice>

      {loading ? (
        <Loading label="Loading articles" />
      ) : visible.length === 0 ? (
        <EmptyState
          icon="book"
          title={view === 'mine' ? 'You have no articles yet' : 'No articles yet'}
          hint={
            view === 'mine'
              ? 'Create your first article, or switch to All to see what the team has shared.'
              : 'No articles to show'
          }
        />
      ) : (
        <div className="articles-grid">
          {visible.map((article, idx) => (
            <div
              key={article.id || `article-${idx}`}
              className="article-card"
              style={{ animationDelay: `${Math.min(idx * 50, 300)}ms` }}
            >
              <div className="article-card__content">
                <div className="article-card__header">
                  <Avatar name={article.author?.name || 'User'} size={40} />
                  <div className="article-card__meta">
                    <span className="article-card__author">{article.author?.name || 'Anonymous'}</span>
                    <RoleBadge role={article.author?.role || 'user'} />
                    <span className="article-card__time">{relativeTime(article.createdAt)}</span>
                  </div>
                </div>

                <h3 className="article-card__title">
                  {article.url ? (
                    <a href={article.url} target="_blank" rel="noopener noreferrer">
                      {article.title}
                    </a>
                  ) : (
                    article.title
                  )}
                </h3>

                {article.description && (
                  <p className="article-card__body">
                    {article.description.slice(0, 150)}
                    {article.description.length > 150 ? '…' : ''}
                  </p>
                )}

                <div className="article-card__footer">
                  <span className="article-card__host">
                    <Icon name="external" size={12} />
                    {article.url ? hostOf(article.url) : 'Local article'}
                  </span>
                  {article.author?.id === user?.id && (
                    <button
                      type="button"
                      className="article-card__delete"
                      onClick={() => handleDelete(article.id, article.title)}
                      title="Delete"
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
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
