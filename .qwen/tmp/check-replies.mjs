import { query, closePool } from '/opt/e-forum/server/db.js';

const replies = await query('SELECT id, parent_reply_id FROM forum_replies ORDER BY id');
console.log(JSON.stringify(replies, null, 2));
await closePool();
