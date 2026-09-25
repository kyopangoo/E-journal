import { query, closePool } from '/opt/e-forum/server/db.js';

const questionId = 1;

const replies = await query(
  `SELECT p.*, u.full_name AS authorName, u.role AS authorRole
   FROM elearning_posts p
   JOIN users u ON u.id = p.user_id
   WHERE p.question_id = ? AND p.parent_id IS NULL
   ORDER BY p.created_at`,
  [questionId]
);

console.log("Root replies:", JSON.stringify(replies.map(r => ({
  id: r.id,
  parentId: r.parent_id,
  authorName: r.authorName
})), null, 2));

const getReplies = async (parentId) => {
  const result = await query(
    `SELECT p.*, u.full_name AS authorName, u.role AS authorRole
     FROM elearning_posts p
     JOIN users u ON u.id = p.user_id
     WHERE p.parent_id = ?
     ORDER BY p.created_at`,
    [parentId]
  );
  return result;
};

for (const reply of replies) {
  const childReplies = await getReplies(reply.id);
  console.log(`Reply ${reply.id} has ${childReplies.length} children`);
  if (childReplies.length > 0) {
    console.log(JSON.stringify(childReplies.map(r => ({
      id: r.id,
      parentId: r.parent_id,
      authorName: r.authorName
    })), null, 2));
  }
}

await closePool();
