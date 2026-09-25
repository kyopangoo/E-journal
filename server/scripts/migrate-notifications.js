// Creates the `notifications` table on its own.
//
//   cd /opt/e-forum && node server/scripts/migrate-notifications.js
//
// Why this exists instead of just `node server/scripts/migrate.js`:
//
// 001_central.sql runs top to bottom and migrate.js stops at the first error. The statement
// before `notifications` is elearning_feedback, whose foreign key to elearning_assignments
// cannot be formed — the live e-learning tables were created by server/migrate-elearning.js
// with signed `id INT` columns, while the migration declares `assignment_id INT UNSIGNED`.
// MySQL refuses that with errno 150, so everything declared after it never runs.
//
// elearning_feedback is a dead table (no route reads or writes it, and migrate-elearning.js
// drops it), so this script deliberately leaves that problem alone and reaches past it.
//
// The DDL is read out of 001_central.sql rather than repeated here, so there is still exactly
// one definition of the table. Once the elearning_feedback key is dealt with, the normal
// migrate.js covers this table too and this script becomes redundant.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { closePool, connectServer } from '../db.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationFile = path.join(here, '..', 'migrations', '001_central.sql');

// Same split migrate.js uses, so a statement is delimited the same way in both places.
const sql = await fs.readFile(migrationFile, 'utf8');
const statement = sql
  .split(/;\s*(?:\r?\n|$)/)
  .map((part) => part.trim())
  .find((part) => /CREATE TABLE IF NOT EXISTS notifications/i.test(part));

if (!statement) {
  console.error(`Could not find the notifications table in ${migrationFile}`);
  await closePool();
  process.exit(1);
}

const connection = await connectServer();
let ready = false;
try {
  await connection.query(`USE \`${config.db.name}\``);

  // Printed before the CREATE, because a foreign key mismatch (errno 150) is the one failure
  // this table can realistically hit — and the answer is in the live column types.
  const [referenced] = await connection.query(
    `SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName, COLUMN_TYPE AS columnType
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND COLUMN_NAME = 'id' AND TABLE_NAME IN ('users')
      ORDER BY TABLE_NAME`,
    [config.db.name]
  );
  for (const row of referenced) {
    console.log(`live ${row.tableName}.${row.columnName}: ${row.columnType}`);
  }

  await connection.query(statement);

  const [created] = await connection.query(
    `SELECT COLUMN_NAME AS name, COLUMN_TYPE AS type, IS_NULLABLE AS nullable
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'notifications'
      ORDER BY ORDINAL_POSITION`,
    [config.db.name]
  );

  if (!created.length) {
    console.error('The statement ran but the table is not there — something is wrong.');
    process.exitCode = 1;
  } else {
    console.log(`\nnotifications ready in "${config.db.name}" (${created.length} columns)`);
    for (const column of created) {
      console.log(
        `  ${column.name.padEnd(12)} ${column.type}${column.nullable === 'YES' ? ' NULL' : ''}`
      );
    }
    ready = true;
  }
} catch (error) {
  console.error(`Failed: ${error.message}`);
} finally {
  await connection.end();
  await closePool();
}

process.exit(ready ? 0 : 1);
