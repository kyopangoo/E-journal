import { Router } from 'express';
import { query } from '../db.js';
import { HttpError, wrap } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Every route here reads or writes the caller's own rows, so the guard sits on the whole
// router the way forum and schedule do it.
router.use(requireAuth);

// The dropdown only ever shows the newest handful; older ones stay in the table but are not
// fetched. Kept as a constant rather than a query parameter because nothing asks for more.
const LIST_LIMIT = 20;

const NOTIFICATION_COLUMNS = `
  n.id, n.type, n.entity_type AS entityType, n.entity_id AS entityId,
  n.title, n.body, n.link, n.read_at AS readAt, n.created_at AS createdAt,
  u.id AS actorId, u.full_name AS actorName, u.username AS actorUsername, u.avatar AS actorAvatar
`;

function mapNotification(row) {
  return {
    id: row.id,
    type: row.type,
    entityType: row.entityType ?? null,
    entityId: row.entityId ?? null,
    title: row.title,
    body: row.body ?? null,
    link: row.link,
    readAt: row.readAt ?? null,
    createdAt: row.createdAt,
    // Null when the actor's account is gone; the client falls back to a plain icon.
    actor: row.actorId
      ? {
          id: row.actorId,
          fullName: row.actorName,
          username: row.actorUsername,
          avatar: row.actorAvatar ?? null,
        }
      : null,
  };
}

async function unreadCountFor(userId) {
  const rows = await query(
    'SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL',
    [userId]
  );
  return Number(rows[0]?.n ?? 0);
}

router.get(
  '/',
  wrap(async (req, res) => {
    const rows = await query(
      `SELECT ${NOTIFICATION_COLUMNS}
         FROM notifications n
         LEFT JOIN users u ON u.id = n.actor_id
        WHERE n.user_id = ?
        ORDER BY n.created_at DESC, n.id DESC
        LIMIT ${LIST_LIMIT}`,
      [req.user.id]
    );

    res.json({
      notifications: rows.map(mapNotification),
      unreadCount: await unreadCountFor(req.user.id),
    });
  })
);

// What the 30-second poll asks for. Separate from the list so the poll moves a single
// number instead of twenty rows every time.
router.get(
  '/unread-count',
  wrap(async (req, res) => {
    res.json({ unreadCount: await unreadCountFor(req.user.id) });
  })
);

// Declared before /:id/read for readability, though "read-all" could not match that route
// anyway — it has no id segment.
router.patch(
  '/read-all',
  wrap(async (req, res) => {
    const result = await query(
      'UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL',
      [req.user.id]
    );
    res.json({ ok: true, marked: Number(result.affectedRows ?? 0), unreadCount: 0 });
  })
);

router.patch(
  '/:id/read',
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid notification id');

    // Scoped to the caller: marking somebody else's notification read changes nothing rather
    // than reporting a 403, which would leak that the row exists.
    await query(
      'UPDATE notifications SET read_at = NOW() WHERE id = ? AND user_id = ? AND read_at IS NULL',
      [id, req.user.id]
    );

    res.json({ ok: true, unreadCount: await unreadCountFor(req.user.id) });
  })
);

export default router;
