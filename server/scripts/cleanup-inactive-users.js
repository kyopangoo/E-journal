import mysql from 'mysql2/promise';
import { config } from '../config.js';

async function cleanupInactiveUsers() {
  const connection = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.name,
    charset: 'utf8mb4_unicode_ci',
  });

  try {
    const users = await connection.query(
      'SELECT id, username, full_name FROM users WHERE is_active = 0'
    );

    if (users[0].length === 0) {
      console.log('No inactive users found.');
      process.exit(0);
    }

    console.log(`Found ${users[0].length} inactive user(s):`);
    for (const user of users[0]) {
      console.log(`  - ${user.username} (${user.full_name})`);
    }

    console.log('\nDeleting inactive users...');
    await connection.query('DELETE FROM users WHERE is_active = 0');

    const result = await connection.query('SELECT ROW_COUNT() AS deleted');
    console.log(`\nDeleted ${result[0][0].deleted} inactive user(s).`);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

cleanupInactiveUsers();
