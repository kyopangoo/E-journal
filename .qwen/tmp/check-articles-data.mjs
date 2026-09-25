import { query, closePool } from '/opt/e-forum/server/db.js';
try {
  const articles = await query('SELECT * FROM articles ORDER BY created_at DESC');
  console.log('Articles in database:', JSON.stringify(articles, null, 2));
} catch (e) {
  console.log('Error:', e.message);
}
await closePool();
