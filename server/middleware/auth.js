import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { HttpError } from '../lib/http.js';
import { loadPublicUser } from '../lib/users.js';

export const AUTH_COOKIE = 'ej_token';

const UNIT_MS = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

function sessionMaxAge() {
  const match = /^(\d+)([smhd])$/.exec(String(config.jwt.expiresIn).trim());
  if (!match) return 12 * UNIT_MS.h;
  return Number(match[1]) * UNIT_MS[match[2]];
}

export function issueSession(res, user) {
  const token = jwt.sign({ sub: String(user.id), role: user.role }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.nodeEnv === 'production',
    maxAge: sessionMaxAge(),
    path: '/',
  });
}

export function clearSession(res) {
  res.clearCookie(AUTH_COOKIE, { path: '/' });
}

function readToken(req) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return req.cookies?.[AUTH_COOKIE] ?? null;
}

export async function requireAuth(req, res, next) {
  try {
    const token = readToken(req);
    if (!token) throw new HttpError(401, 'Authentication required');

    let payload;
    try {
      payload = jwt.verify(token, config.jwt.secret);
    } catch {
      throw new HttpError(401, 'Session expired, please sign in again');
    }

    const user = await loadPublicUser(Number(payload.sub));
    if (!user) throw new HttpError(401, 'Account no longer exists');
    if (!user.isActive) throw new HttpError(401, 'This account has been disabled');

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return next(new HttpError(403, 'Administrator access required'));
  }
  return next();
}
