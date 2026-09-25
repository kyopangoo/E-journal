import { schemaQuery } from '../schema.js';

const DETAIL_MAX = 500;

export function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const value = (raw?.split(',')[0] ?? req.socket?.remoteAddress ?? '').trim();
  return value.replace(/^::ffff:/, '') || null;
}

export async function recordActivity(userId, action, detail = null, ip = null) {
  try {
    await schemaQuery(
      userId,
      'INSERT INTO activity_history (action, detail, ip_address) VALUES (?, ?, ?)',
      [action, detail ? detail.slice(0, DETAIL_MAX) : null, ip]
    );
  } catch (error) {
    console.error(`[activity] could not record "${action}" for user ${userId}: ${error.message}`);
  }
}
