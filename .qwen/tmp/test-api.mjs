import { connectServer, closePool } from '/opt/e-forum/server/db.js';

const conn = await connectServer();

try {
  await conn.query('USE `e-journey`');
  
  console.log('=== Testing articles query ===');
  const [articles] = await conn.query('SELECT id, title, url, description, created_at AS createdAt, updated_at AS updatedAt, user_id FROM articles ORDER BY created_at DESC');
  console.log('Articles:', JSON.stringify(articles, null, 2));
  
  console.log('\n=== Users ===');
  const [users] = await conn.query('SELECT id, username, full_name AS fullName, role FROM users WHERE is_active = 1');
  console.log('Users:', JSON.stringify(users, null, 2));
  
  console.log('\n=== Building result ===');
  const authorMap = new Map(users.map(u => [u.id, u]));
  const result = articles.map(a => {
    const author = authorMap.get(a.user_id);
    return {
      ...a,
      author: author ? {
        id: author.id,
        name: author.fullName,
        username: author.username,
        role: author.role
      } : { id: a.user_id, name: 'Unknown', username: '', role: 'user' }
    };
  });
  console.log('Result:', JSON.stringify(result, null, 2));
  
} catch (e) {
  console.log('Error:', e.message);
}

await conn.end();
await closePool();
