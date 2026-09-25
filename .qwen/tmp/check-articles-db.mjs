import { connectServer, closePool } from '/opt/e-forum/server/db.js';

const conn = await connectServer();

try {
  await conn.query('USE `e-journey`');
  
  console.log('=== Checking articles table in e-journey ===');
  const [tables] = await conn.query('SHOW TABLES');
  console.log('Tables:', tables.map(t => Object.values(t)[0]));
  
  const [articles] = await conn.query('SELECT * FROM articles');
  console.log('\nArticles:', JSON.stringify(articles, null, 2));
  
  const [schema] = await conn.query('DESCRIBE articles');
  console.log('\nColumns:', schema.map(c => c.Field));
} catch (e) {
  console.log('Error:', e.message);
}

await conn.end();
await closePool();
