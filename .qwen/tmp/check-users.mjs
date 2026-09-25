import { query, closePool } from '/opt/e-forum/server/db.js';

const rows = await query('SELECT id, username, full_name, role FROM users ORDER BY id');
console.log(JSON.stringify(rows, null, 2));
await closePool();
