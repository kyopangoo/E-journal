import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';
import { Icon } from '../components/Icons.jsx';
import {
  Avatar,
  EmptyState,
  Hero,
  Loading,
  Notice,
  Panel,
  Split,
  formatDate,
  relativeTime,
} from '../components/ui.jsx';

const buildTree = (replies) => replies;

function excerpt(text, max = 80) {
  const clean = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

export default function AssignmentPage() {
  const { assignmentId } = useParams();

  const [assignment, setAssignment] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [replies, setReplies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [replyText, setReplyText] = useState('');
  const [replyTarget, setReplyTarget] = useState(null);
  const [replyFiles, setReplyFiles] = useState([]);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get(`/elearning/assignments/${assignmentId}`);
      setAssignment(data.assignment);
      setQuestions(data.questions);
      if (data.questions?.length > 0) {
        setSelectedQuestion(data.questions[0]);
        loadQuestionThread(data.questions[0].id);
      }
      setError('');
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [assignmentId]);

  const loadQuestionThread = useCallback(async (questionId) => {
    try {
      const data = await api.get(`/elearning/assignments/${assignmentId}/questions/${questionId}`);
      setReplies(data.replies);
      setReplyTarget(null); // Clear reply target after reload
    } catch (err) {
      console.error('Failed to load thread:', err);
    }
  }, [assignmentId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (selectedQuestion) {
      loadQuestionThread(selectedQuestion.id);
    }
  }, [selectedQuestion, loadQuestionThread]);

  const tree = useMemo(() => buildTree(replies), [replies]);
  const replyIndex = useMemo(() => {
    const index = new Map();
    function collect(all) {
      for (const r of all) {
        index.set(r.id, r);
        if (r.replies?.length) collect(r.replies);
      }
    }
    collect(replies);
    return index;
  }, [replies]);

  function jumpToReply(id) {
    const element = document.getElementById(`reply-${id}`);
    if (!element) return;
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSending(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('body', replyText);
      formData.append('parentId', replyTarget?.id ?? '');
      for (const file of replyFiles) {
        formData.append('files', file);
      }
      await api.upload(`/elearning/assignments/${assignmentId}/questions/${selectedQuestion.id}/posts`, formData);
      await loadQuestionThread(selectedQuestion.id);
      setReplyText('');
      setReplyTarget(null);
      setReplyFiles([]);
    } catch (replyError) {
      setError(replyError.message);
    } finally {
      setSending(false);
    }
  }

  function composer({ inline = false, replyingTo = null }) {
    return (
      <form
        className={`composer${inline ? ' composer--inline' : ' composer--root'}`}
        onSubmit={handleSubmit}
      >
        {replyingTo ? (
          <p className="composer__target">
            Replying to <span>@{replyingTo.authorName}</span>
          </p>
        ) : (
          <p className="composer__label">New reply to this question</p>
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

        <label className="composer__file">
          <Icon name="upload" size={16} />
          <span>Attach photo or txt file</span>
          <input
            type="file"
            accept="image/*,.txt"
            multiple
            onChange={(e) => setReplyFiles(Array.from(e.target.files || []))}
          />
        </label>

        {replyFiles.length > 0 && (
          <div className="composer__files">
            {replyFiles.map((file, i) => (
              <span key={i} className="composer__file-tag">
                <Icon name={file.name.endsWith('.txt') ? 'article' : 'image'} size={12} />
                <span>{file.name}</span>
                <button
                  type="button"
                  onClick={() => setReplyFiles(replyFiles.filter((_, idx) => idx !== i))}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

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
    const parent = node.parent_id ? replyIndex.get(node.parent_id) : null;
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

            {node.media?.length ? (
              <div className="tweet__media">
                {node.media.map((m, i) =>
                  m.media_type === 'image' ? (
                    <img
                      key={i}
                      src={m.media_url}
                      alt="Attachment"
                      style={{ maxWidth: '100%', borderRadius: 4, marginTop: 8 }}
                    />
                  ) : (
                    <a
                      key={i}
                      href={m.media_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="tweet__media-link"
                    >
                      <Icon name="forum" size={14} />
                      View attachment
                    </a>
                  )
                )}
              </div>
            ) : null}

            <footer className="tweet__actions">
              <button type="button" className="tweet__action" onClick={() => setReplyTarget(node)}>
                <Icon name="forum" size={14} />
                Reply
              </button>
              {node.replies?.length ? (
                <span className="tweet__stat">
                  {node.replies.length} {node.replies.length === 1 ? 'reply' : 'replies'}
                </span>
              ) : null}
            </footer>
          </div>
        </article>

        {isTarget ? composer({ inline: true, replyingTo: node }) : null}

        {node.replies?.length ? (
          <div
            className={`tweet-thread__children${
              depth >= 3 ? ' tweet-thread__children--flat' : ''
            }`}
          >
            {node.replies.map((child) => renderNode(child, depth + 1))}
          </div>
        ) : null}
      </div>
    );
  }

  if (loading) return <Loading label="Loading assignment" />;
  if (!assignment) return <EmptyState icon="book" title="Assignment not found" />;

  return (
    <>
      <Hero
        eyebrow="Assignment"
        title={assignment.title}
        lead={assignment.description}
        stats={[
          { label: 'questions', value: questions.length },
        ]}
      />

      {assignment.image && (
        <Panel>
          <img
            src={assignment.image}
            alt=""
            style={{ maxWidth: '100%', borderRadius: 4 }}
          />
        </Panel>
      )}

      <Notice tone="error">{error}</Notice>

      <Split
        aside={
          <Panel title="Questions" subtitle={`${questions.length} total`}>
            <div className="nav-list">
              {questions.map((q, i) => (
                <button
                  key={q.id}
                  type="button"
                  className={`nav-list__item ${selectedQuestion?.id === q.id ? 'nav-list__item--active' : ''}`}
                  onClick={() => setSelectedQuestion(q)}
                >
                  <span className="truncate">Q{i + 1}: {q.prompt.slice(0, 50)}</span>
                  {q.replyCount > 0 && (
                    <span className="nav-list__value">{q.replyCount}</span>
                  )}
                </button>
              ))}
            </div>
          </Panel>
        }
      >
        {selectedQuestion ? (
          <Panel
            title={`Q: ${selectedQuestion.prompt}`}
            subtitle={`${replies.length} reply${replies.length !== 1 ? 'ies' : ''}`}
            actions={
              replyTarget ? (
                <button
                  type="button"
                  className="btn btn--outline btn--sm"
                  onClick={() => setReplyTarget(null)}
                >
                  <Icon name="close" size={14} />
                  Cancel reply
                </button>
              ) : null
            }
          >
            {selectedQuestion.mediaUrl && (
              <img
                src={selectedQuestion.mediaUrl}
                alt=""
                style={{ maxWidth: '100%', borderRadius: 4, marginBottom: 12 }}
              />
            )}

            {tree.length === 0 ? (
              <EmptyState
                icon="forum"
                title="No replies yet"
                hint="Be the first to answer this question."
              />
            ) : (
              <div className="tweet-thread__root">
                {tree.map((node) => renderNode(node, 0))}
              </div>
            )}

            {!replyTarget ? composer({}) : null}
          </Panel>
        ) : (
          <EmptyState
            icon="book"
            title="No questions available"
            hint="There are no questions in this assignment yet."
          />
        )}
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
