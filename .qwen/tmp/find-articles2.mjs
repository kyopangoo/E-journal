import { createPool } from 'mysql2/promise';
const pool = createPool({
  host: '10.28.9.109',
  port: 3306,
  user: 'root',
  password: 'P@ssw0rd!1',
  database: 'ej_user_template',
  dateStrings: true
});
try {
  const [rows] = await pool.execute('SELECT * FROM articles');
  console.log('Articles:', JSON.stringify(rows, null, 2));
} catch (e) {
  console.log('Error:', e.message);
}
await pool.end();
