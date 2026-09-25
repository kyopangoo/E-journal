import { query } from './db.js';

async function main() {
  try {
    const replies = await query(
      'SELECT id, parent_reply_id AS parentReplyId, thread_id, body FROM forum_replies ORDER BY thread_id, id'
    );
    console.log(JSON.stringify(replies, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();
