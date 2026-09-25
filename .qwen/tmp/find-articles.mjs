import { connectServer, closePool } from '/opt/e-forum/server/db.js';
const conn = await connectServer();
try {
  await conn.query('USE ej_user_template');
  const data = await conn.query('SELECT * FROM articles LIMIT 5');
  console.log('Articles in template:', JSON.stringify(data, null, 2));
} catch (e) {
  console.log('Error:', e.message);
}
await conn.end();
await closePool();
