import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { connectServer, closePool } from '../db.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(here, '..', 'migrations');

async function main() {
  const connection = await connectServer();
  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${config.db.name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await connection.query(`USE \`${config.db.name}\``);

    const file = path.join(migrationsDir, '001_central.sql');
    const sql = await fs.readFile(file, 'utf8');
    const statements = sql
      .split(/;\s*(?:\r?\n|$)/)
      .map((s) => s.trim())
      .filter(Boolean);

    for (const statement of statements) {
      await connection.query(statement);
    }

    console.log(`Central schema ready in database "${config.db.name}"`);
  } finally {
    await connection.end();
    await closePool();
  }
}

main().catch((error) => {
  console.error('Migration failed:', error.message);
  process.exit(1);
});