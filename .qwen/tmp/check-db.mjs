import { query, closePool } from '/opt/e-forum/server/db.js';

console.log('=== Check articles table ===');
const articles = await query('SELECT * FROM articles');
console.log('Articles:', JSON.stringify(articles, null, 2));

await closePool();
