import { query, closePool } from '/opt/e-forum/server/db.js';
const rows = await query('SELECT id, media_url, position FROM elearning_questions ORDER BY id DESC');
console.log('Questions with media_url:');
rows.forEach(r => console.log(`  id=${r.id}, position=${r.position}, media_url=${r.media_url}`));
await closePool();