import { getPool } from './db.js';
try {
  const conn = await getPool().getConnection();
  const [dbs] = await conn.query("SHOW DATABASES");
  console.log("Databases:", JSON.stringify(dbs.map(d => d.Database), null, 2));
  
  const [tables] = await conn.query("SHOW TABLES FROM `e-journey` LIKE 'elearning%'");
  console.log("E-learning tables in e-journey:", JSON.stringify(tables, null, 2));
  await conn.release();
} catch (e) {
  console.error("Error:", e.message);
}
