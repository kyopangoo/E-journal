import { query, closePool } from '/opt/e-forum/server/db.js';
try {
  const schema = await query('SHOW COLUMNS FROM articles');
  console.log(JSON.stringify(schema, null, 2));
} catch (e) {
  console.log('Error:', e.message);
}
await closePool();
