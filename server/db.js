import mysql from 'mysql2/promise';
import { config } from './config.js';

const connectionOptions = {
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '+07:00', // WIB (Western Indonesia Time)
  // DATETIME/TIMESTAMP columns hold wall-clock values managed by the app; returning
  // them as strings avoids mysql2 re-interpreting them through the server timezone.
  dateStrings: true,
};

let pool;

export function getPool() {
  if (!pool) {
    pool = mysql.createPool({ ...connectionOptions, database: config.db.name });
  }
  return pool;
}

export async function query(sql, params = []) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}

export async function connectServer() {
  const connection = await mysql.createConnection(connectionOptions);
  return connection;
}

export async function transaction(handler) {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    try {
      const result = await handler(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  } finally {
    connection.release();
  }
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}