import { query, closePool } from '/opt/e-forum/server/db.js';

const threadId = 9;

const replies = await query(
  `SELECT r.id, r.parent_reply_id AS parentReplyId, r.body, r.created_at AS createdAt,
          u.id AS authorId, u.full_name AS authorName, u.username AS authorUsername, u.role AS authorRole
   FROM forum_replies r
   JOIN users u ON u.id = r.user_id
   WHERE r.thread_id = ?
   ORDER BY r.created_at ASC, r.id ASC`,
  [threadId]
);

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

console.log("API returns:", JSON.stringify(replies.map(mapReply), null, 2));
await closePool();
