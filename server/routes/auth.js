import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { query } from '../db.js';
import { HttpError, requireText, wrap } from '../lib/http.js';
import { clientIp, recordActivity } from '../lib/activity.js';
import { loadPreferences, loadPublicUser } from '../lib/users.js';
import { clearSession, issueSession, requireAuth } from '../middleware/auth.js';
import { ensureUserSchema } from '../schema.js';

const router = Router();

router.post(
  '/login',
  wrap(async (req, res) => {
    const username = requireText(req.body?.username, 'Username', 64);
    const password = String(req.body?.password ?? '');
    if (!password) throw new HttpError(400, 'Password is required');

    const rows = await query(
      'SELECT id, username, password_hash, is_active FROM users WHERE username = ? LIMIT 1',
      [username]
    );
    const account = rows[0];
    if (!account) throw new HttpError(401, 'Invalid username or password');
    if (!account.is_active) throw new HttpError(403, 'This account has been disabled');

    const passwordMatches = await bcrypt.compare(password, account.password_hash);
    if (!passwordMatches) throw new HttpError(401, 'Invalid username or password');

    await ensureUserSchema(account.id);
    const user = await loadPublicUser(account.id);
    const preferences = await loadPreferences(account.id);

    issueSession(res, user);
    await recordActivity(account.id, 'LOGIN', `${user.fullName} signed in`, clientIp(req));

    res.json({ user, preferences });
  })
);

router.post(
  '/logout',
  requireAuth,
  wrap(async (req, res) => {
    await recordActivity(req.user.id, 'LOGOUT', `${req.user.fullName} signed out`, clientIp(req));
    clearSession(res);
    res.json({ ok: true });
  })
);

router.get(
  '/me',
  requireAuth,
  wrap(async (req, res) => {
    res.json({ user: req.user, preferences: await loadPreferences(req.user.id) });
  })
);

export default router;
