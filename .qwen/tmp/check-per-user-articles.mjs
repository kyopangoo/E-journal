import { connectServer, closePool } from '/opt/e-forum/server/db.js';

const users = [9, 17, 18, 23];
const conn = await connectServer();

for (const userId of users) {
  const schema = `ej_user_${userId}`;
  try {
    await conn.query(`USE ${schema}`);
    const [tables] = await conn.query('SHOW TABLES LIKE "articles"');
    if (tables.length > 0) {
      const [rows] = await conn.query('SELECT * FROM articles');
      console.log(`\n=== ${schema} articles ===`);
      console.log(JSON.stringify(rows, null, 2));
    }
  } catch (e) {
    console.log(`${schema}: ${e.message}`);
  }
}

await conn.end();
await closePool();
