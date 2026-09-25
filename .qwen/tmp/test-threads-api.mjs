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

console.log("API returns:");
console.log(JSON.stringify(replies.map(r => ({
  id: r.id,
  authorId: r.authorId,
  authorName: r.authorName,
  authorUsername: r.authorUsername,
  authorRole: r.authorRole
})), null, 2));

await closePool();
