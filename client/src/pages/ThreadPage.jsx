import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
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
  formatDate,
  relativeTime,
} from '../components/ui.jsx';

const countNested = (nodes) => nodes.length;

function excerpt(text, max = 80) {
  const clean = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

function formatDateTime(d) {
  return new Date(d).toLocaleString();
}

export default function ThreadPage() {
  const { threadId } = useParams();
  const { user } = useAuth();

  const [thread, setThread] = useState(null);
  const [replies, setReplies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [replyText, setReplyText] = useState('');
  const [replyTarget, setReplyTarget] = useState(null);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get(`/forum/threads/${threadId}`);
      setThread(data.thread);
      setReplies(data.replies);
      setError('');
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => {
    load();
  }, [load]);

  const replyIndex = useMemo(() => new Map(replies.map((r) => [r.id, r])), [replies]);
  // The API hands back every reply as one flat list, while renderNode already draws
  // each node's children recursively. Seeding the root with the flat list re-renders
  // every nested answer, so only parentless replies are allowed at the root.
  const rootReplies = useMemo(
    () => replies.filter((reply) => !reply.parentReplyId || !replyIndex.has(reply.parentReplyId)),
    [replies, replyIndex]
  );
  // Mirrors the API rule in routes/forum.js: the author may delete their own
  // discussion, and an admin may delete any. `thread.author.id` is always a number,
  // so the old `=== null` check made this button unreachable.
  const canDelete = useMemo(
    () => Boolean(user) && (user.id === thread?.author.id || user.role === 'admin'),
    [thread, user]
  );

  function jumpToReply(id) {
    const element = document.getElementById(`reply-${id}`);
    if (!element) return;
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    setError('');
    try {
      const textToSubmit = replyText;
      const targetToReply = replyTarget?.id ?? null;
      await api.post(`/forum/threads/${threadId}/replies`, {
        body: textToSubmit,
        parentReplyId: targetToReply,
      });
      setReplyText('');
      setReplyTarget(null);
      await load();
    } catch (replyError) {
      setError(replyError.message);
    } finally {
      setSending(false);
    }
  }

  function composer({ inline = false, replyingTo = null }) {
    return (
      <form
        key={inline ? 'inline' : 'root'}
        className={`composer${inline ? ' composer--inline' : ' composer--root'}`}
        onSubmit={handleSubmit}
      >
        {replyingTo ? (
          <p className="composer__target">
            Replying to <span>@{replyingTo.authorName}</span>
          </p>
        ) : (
          <p className="composer__label">New reply to this discussion</p>
        )}

        <textarea
          className="composer__input"
          value={replyText}
          onChange={(event) => setReplyText(event.target.value)}
          placeholder={
            replyingTo
              ? `Reply to ${replyingTo.authorName}…`
              : 'Start your reply...'
          }
          rows={3}
          required
        />

        <div className="composer__actions">
          {inline ? (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                setReplyTarget(null);
                setReplyText('');
              }}
            >
              Cancel
            </button>
          ) : null}
          <button
            type="submit"
            className="btn btn--primary btn--sm"
            disabled={sending || !replyText.trim()}
          >
            {sending ? 'Posting…' : 'Reply'}
          </button>
        </div>
      </form>
    );
  }

  function renderNode(node, depth) {
    const parent = node.parentReplyId ? replyIndex.get(node.parentReplyId) : null;
    const children = replies.filter(r => r.parentReplyId === node.id);
    const isTarget = replyTarget?.id === node.id;

    return (
      <div className="tweet-thread" key={node.id}>
        <article
          className="tweet"
          id={`reply-${node.id}`}
        >
          <Avatar name={node.authorName} size={40} />
          <div className="tweet__body">
            <header className="tweet__head">
              <span className="tweet__name">{node.authorName}</span>
              <RoleBadge role={node.authorRole} />
              <span className="tweet__handle">@{node.authorUsername}</span>
              <span className="tweet__handle" title={formatDate(node.createdAt)}>
                · {relativeTime(node.createdAt)}
              </span>
            </header>

            {parent ? (
              <button
                type="button"
                className="tweet__reply-to"
                onClick={() => jumpToReply(parent.id)}
                title={`Jump to ${parent.authorName}'s comment`}
              >
                <Icon name="back" size={13} />
                <strong>@{parent.authorName?.toLowerCase().replace(/\s+/g, '')}</strong>
                <span>"{excerpt(parent.body)}"</span>
              </button>
            ) : null}

            <p className="tweet__text prose">{node.body}</p>

            <footer className="tweet__actions">
              <button type="button" className="tweet__action" onClick={() => setReplyTarget(node)}>
                <Icon name="forum" size={14} />
                Reply
              </button>
              {children.length ? (
                <span className="tweet__stat">
                  {children.length} {children.length === 1 ? 'reply' : 'replies'}
                </span>
              ) : null}
            </footer>
          </div>
        </article>

        {isTarget ? composer({ inline: true, replyingTo: node }) : null}

        {children.length ? (
          <div
            className={`tweet-thread__children${
              depth >= 3 ? ' tweet-thread__children--flat' : ''
            }`}
          >
            {children.map((child) => renderNode(child, depth + 1))}
          </div>
        ) : null}
      </div>
    );
  }

  async function handleDelete() {
    if (!confirm('Delete this discussion?')) return;
    try {
      await api.del(`/forum/threads/${threadId}`);
      window.location.href = '/forum';
    } catch (deleteError) {
      // Without this the rejection was unhandled and a refused delete looked like
      // a dead button.
      setError(deleteError.message);
    }
  }

  if (loading) return <Loading label="Loading discussion" />;
  if (!thread) return <EmptyState icon="forum" title="Discussion not found" />;

  return (
    <>
      <Hero
        eyebrow="Discussion"
        title={thread.title}
        lead={`Posted by ${thread.author.name}`}
        chips={['Threaded replies', 'Real-time discussion']}
        stats={[
          { label: 'replies', value: replies.length },
        ]}
        mark={<Avatar name={thread.author.name} size={48} />}
        markPlain
      />

      <Notice tone="error">{error}</Notice>

      <Panel
        title="Discussion"
        actions={
          canDelete ? (
            <button type="button" className="btn btn--danger btn--sm" onClick={handleDelete}>
              <Icon name="trash" size={14} />
              Delete
            </button>
          ) : null
        }
      >
        <article className="post-hero">
          <div className="tweet tweet--head">
            <Avatar name={thread.author.name} size={46} />
            <div className="tweet__body">
              <header className="tweet__head">
                <span className="tweet__name">{thread.author.name}</span>
                <RoleBadge role={thread.author.role} />
                <span className="tweet__handle">@{thread.author.username}</span>
                <span className="tweet__handle" title={formatDateTime(thread.createdAt)}>
                  · {relativeTime(thread.createdAt)}
                </span>
              </header>

              <h1 className="tweet__title">{thread.title}</h1>
              <p className="tweet__text prose">{thread.body}</p>

              <footer className="tweet__footer">
                <span className="tweet__stat">
                  {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
                </span>
                <span className="tweet__stat">{countNested(replies)} in thread</span>
              </footer>
            </div>
          </div>
        </article>
      </Panel>

      <Panel title="Replies" subtitle="Hit Reply on any post to answer it directly.">
        {replies.length === 0 ? (
          <EmptyState
            icon="forum"
            title="No replies yet"
            hint="Be the first to answer this discussion."
          />
        ) : (
          <div className="tweet-thread__root">
            {rootReplies.map((node) => renderNode(node, 0))}
          </div>
        )}

        {!replyTarget ? composer({}) : null}
      </Panel>

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
