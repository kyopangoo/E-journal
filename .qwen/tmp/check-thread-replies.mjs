import { query, closePool } from '/opt/e-forum/server/db.js';
const replies = await query('SELECT id, parent_reply_id FROM forum_replies WHERE parent_reply_id IS NOT NULL LIMIT 10');
console.log('Replies with parent:', JSON.stringify(replies, null, 2));
await closePool();
