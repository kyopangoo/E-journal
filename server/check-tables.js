import { query } from './db.js';
try {
  const tables = await query("SHOW TABLES FROM `e-journey` LIKE 'elearning%'");
  console.log("E-learning tables:", JSON.stringify(tables, null, 2));
} catch (e) {
  console.error(e.message);
}
