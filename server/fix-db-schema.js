import { config } from './config.js';
import mysql from 'mysql2/promise';

async function fix() {
  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.name,
  });

  try {
    await conn.query('ALTER TABLE elearning_assignments ADD COLUMN image VARCHAR(500) NULL');
    console.log('Added image column to elearning_assignments');
  } catch (err) {
    if (err.code === 'ER_DUP_FIELDNAME') {
      console.log('Column already exists');
    } else {
      throw err;
    }
  }

  await conn.end();
}

fix();
