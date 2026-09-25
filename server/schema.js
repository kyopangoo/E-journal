import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectServer } from './db.js';
import { userSchemaName } from './config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(here, 'migrations');
const perUserMigration = path.join(migrationsDir, '002_per_user.sql');

const ensured = new Set();

const ANSWER_MEDIA_TABLE = `
CREATE TABLE IF NOT EXISTS elearning_answer_media (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  answer_id   INT UNSIGNED NOT NULL,
  media_url   VARCHAR(500) NOT NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_media_answer (answer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

export function assertSchemaName(schema) {
  if (!/^ej_user_\d+$/.test(schema)) {
    throw new Error(`Invalid schema name: ${schema}`);
  }
  return schema;
}

async function runSqlScript(connection, sql) {
  const statements = sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const statement of statements) {
    await connection.query(statement);
  }
}

export async function createUserSchema(userId) {
  const schema = assertSchemaName(userSchemaName(userId));
  const connection = await connectServer();
  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${schema}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    const sql = await fs.readFile(perUserMigration, 'utf8');
    await connection.query(`USE \`${schema}\``);
    await runSqlScript(connection, sql);
    ensured.add(schema);
  } finally {
    await connection.end();
  }
  return schema;
}

export async function ensureUserSchema(userId) {
  const schema = assertSchemaName(userSchemaName(userId));
  if (ensured.has(schema)) {
    return schema;
  }

  const connection = await connectServer();
  let exists = false;
  try {
    const [databases] = await connection.query(
      'SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?',
      [schema]
    );
    if (databases.length) {
      await connection.query(`USE \`${schema}\``);
      await runSqlScript(connection, ANSWER_MEDIA_TABLE);
      ensured.add(schema);
      exists = true;
    }
  } finally {
    await connection.end();
  }

  if (!exists) {
    await createUserSchema(userId);
  }

  return schema;
}

export async function schemaQuery(userId, sql, params = []) {
  const schema = await ensureUserSchema(userId);
  const connection = await connectServer();
  try {
    await connection.query(`USE \`${schema}\``);
    const [rows] = await connection.execute(sql, params);
    return rows;
  } finally {
    await connection.end();
  }
}

export async function schemaTransaction(userId, handler) {
  const schema = await ensureUserSchema(userId);
  const connection = await connectServer();
  try {
    await connection.query(`USE \`${schema}\``);
    await connection.beginTransaction();
    try {
      const result = await handler(connection);
      await connection.commit();
      return result;
    } catch (error) {
      console.error('[schemaTransaction] rollback:', error.message);
      await connection.rollback();
      throw error;
    }
  } catch (error) {
    console.error('[schemaTransaction] error:', error.message);
    throw error;
  } finally {
    await connection.end();
  }
}