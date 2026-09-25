import { connectServer, closePool } from '/opt/e-forum/server/db.js';
const conn = await connectServer();
try {
  await conn.query('USE ej_user_template');
  const tables = await conn.query('SHOW TABLES');
  console.log('Tables in ej_user_template:', JSON.stringify(tables[0], null, 2));
  
  for (const t of tables[0]) {
    const tableName = Object.values(t)[0];
    if (tableName.includes('article')) {
      const cols = await conn.query(`DESCRIBE ${tableName}`);
      console.log(`${tableName} columns:`, JSON.stringify(cols, null, 2));
      const data = await conn.query(`SELECT * FROM ${tableName}`);
      console.log(`${tableName} data:`, JSON.stringify(data, null, 2));
    }
  }
} catch (e) {
  console.log('Error:', e.message);
}
await conn.end();
await closePool();
