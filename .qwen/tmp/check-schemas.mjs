import { connectServer, closePool } from '/opt/e-forum/server/db.js';
try {
  const schemas = await connectServer().then(c => c.query('SHOW DATABASES LIKE "ej_user%"'));
  console.log('User schemas:', JSON.stringify(schemas[0], null, 2));
} catch (e) {
  console.log('Error:', e.message);
}
await closePool();
