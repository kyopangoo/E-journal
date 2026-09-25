import { query } from './db.js';
try {
  const tables = await query("SHOW TABLE STATUS FROM `e-journey` WHERE Name = 'users'");
  console.log(JSON.stringify(tables, null, 2));
} catch (e) {
  console.error(e.message);
}
