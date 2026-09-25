import { Router } from 'express';
import { query } from '../db.js';
import { HttpError, requireText, wrap } from '../lib/http.js';
import { clientIp, recordActivity } from '../lib/activity.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

const THREAD_COLUMNS = `
  t.id, t.title, t.body, t.is_pinned, t.created_at AS createdAt, t.updated_at AS updatedAt,
  u.id AS authorId, u.full_name AS authorName, u.username AS authorUsername, u.role AS authorRole,
  (SELECT COUNT(*) FROM forum_replies r WHERE r.thread_id = t.id) AS replyCount
`;

const THREAD_SOURCE = 'FROM forum_threads t JOIN users u ON u.id = t.user_id';

function mapThread(row) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    isPinned: Boolean(row.is_pinned),
    replyCount: Number(row.replyCount ?? 0),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    author: {
      id: row.authorId,
      name: row.authorName,
      username: row.authorUsername,
      role: row.authorRole,
    },
  };
}

function mapReply(row) {
  return {
    id: row.id,
    parentReplyId: row.parentReplyId ?? null,
    body: row.body,
    createdAt: row.createdAt,
    authorId: row.authorId,
    authorName: row.authorName,
    authorUsername: row.authorUsername,
    authorRole: row.authorRole,
  };
}

async function findThread(id) {
  const rows = await query(
    `SELECT ${THREAD_COLUMNS} ${THREAD_SOURCE} WHERE t.id = ? LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

router.get(
  '/threads',
  wrap(async (req, res) => {
    const search = String(req.query.search ?? '').trim();
    const params = [];
    let where = '';

    if (search) {
      where = 'WHERE t.title LIKE ? OR t.body LIKE ? OR u.full_name LIKE ?';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const rows = await query(
      `SELECT ${THREAD_COLUMNS} ${THREAD_SOURCE} ${where}
       ORDER BY t.is_pinned DESC, t.updated_at DESC
       LIMIT 200`,
      params
    );

    res.json({ threads: rows.map(mapThread) });
  })
);

router.post(
  '/threads',
  wrap(async (req, res) => {
    const title = requireText(req.body?.title, 'Title', 200);
    const body = requireText(req.body?.body, 'Discussion body', 20000);

    const result = await query(
      'INSERT INTO forum_threads (user_id, title, body) VALUES (?, ?, ?)',
      [req.user.id, title, body]
    );

    await recordActivity(req.user.id, 'THREAD_CREATED', `Started discussion "${title}"`, clientIp(req));

    res.status(201).json({ thread: mapThread(await findThread(result.insertId)) });
  })
);

router.get(
  '/threads/:id',
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const thread = await findThread(id);
    if (!thread) throw new HttpError(404, 'Discussion not found');

    const replies = await query(
      `SELECT r.id, r.parent_reply_id AS parentReplyId, r.body, r.created_at AS createdAt,
              u.id AS authorId, u.full_name AS authorName, u.username AS authorUsername, u.role AS authorRole
       FROM forum_replies r
       JOIN users u ON u.id = r.user_id
       WHERE r.thread_id = ?
       ORDER BY r.created_at ASC, r.id ASC`,
      [id]
    );

    res.json({ thread: mapThread(thread), replies: replies.map(mapReply) });
  })
);

router.post(
  '/threads/:id/replies',
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const body = requireText(req.body?.body, 'Reply', 20000);

    const thread = await findThread(id);
    if (!thread) throw new HttpError(404, 'Discussion not found');

    const parentReplyId = req.body?.parentReplyId ? Number(req.body.parentReplyId) : null;
    if (parentReplyId) {
      const parent = await query(
        'SELECT id FROM forum_replies WHERE id = ? AND thread_id = ? LIMIT 1',
        [parentReplyId, id]
      );
      if (!parent.length) {
        throw new HttpError(400, 'The reply you are responding to is no longer in this discussion');
      }
    }

    const result = await query(
      'INSERT INTO forum_replies (thread_id, user_id, parent_reply_id, body) VALUES (?, ?, ?, ?)',
      [id, req.user.id, parentReplyId, body]
    );
    await query('UPDATE forum_threads SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);

    await recordActivity(
      req.user.id,
      'THREAD_REPLIED',
      `Replied to "${thread.title}"`,
      clientIp(req)
    );

    const rows = await query(
      `SELECT r.id, r.parent_reply_id AS parentReplyId, r.body, r.created_at AS createdAt,
              u.id AS authorId, u.full_name AS authorName, u.username AS authorUsername, u.role AS authorRole
       FROM forum_replies r
       JOIN users u ON u.id = r.user_id
       WHERE r.id = ? LIMIT 1`,
      [result.insertId]
    );

    res.status(201).json({ reply: mapReply(rows[0]) });
  })
);

router.delete(
  '/threads/:id',
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const rows = await query('SELECT user_id, title FROM forum_threads WHERE id = ? LIMIT 1', [id]);
    if (!rows.length) throw new HttpError(404, 'Discussion not found');

    const isOwner = rows[0].user_id === req.user.id;
    if (!isOwner && req.user.role !== 'admin') {
      throw new HttpError(403, 'You can only delete your own discussions');
    }

    await query('DELETE FROM forum_threads WHERE id = ?', [id]);
    await recordActivity(
      req.user.id,
      'THREAD_DELETED',
      `Deleted discussion "${rows[0].title}"`,
      clientIp(req)
    );

    res.json({ ok: true });
  })
);

export default router;
