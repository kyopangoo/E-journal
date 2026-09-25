import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { query } from '../db.js';
import { HttpError, requireText, wrap } from '../lib/http.js';
import { clientIp, recordActivity } from '../lib/activity.js';
import { loadPreferences, loadPublicUser } from '../lib/users.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

router.get(
  '/',
  wrap(async (req, res) => {
    res.json({
      user: await loadPublicUser(req.user.id),
      preferences: await loadPreferences(req.user.id),
    });
  })
);

router.patch(
  '/',
  wrap(async (req, res) => {
    const fullName = requireText(req.body?.fullName, 'Full name', 128);
    const email = String(req.body?.email ?? '').trim() || null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new HttpError(400, 'Enter a valid email address');
    }

    try {
      await query('UPDATE users SET full_name = ?, email = ? WHERE id = ?', [
        fullName,
        email,
        req.user.id,
      ]);
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        throw new HttpError(409, 'That email is already used by another account');
      }
      throw error;
    }

    await recordActivity(req.user.id, 'PROFILE_UPDATED', 'Profile details updated', clientIp(req));
    res.json({ user: await loadPublicUser(req.user.id) });
  })
);

router.post(
  '/password',
  wrap(async (req, res) => {
    const currentPassword = String(req.body?.currentPassword ?? '');
    const newPassword = String(req.body?.newPassword ?? '');

    if (!currentPassword) throw new HttpError(400, 'Current password is required');
    if (newPassword.length < 8) {
      throw new HttpError(400, 'New password must be at least 8 characters');
    }
    if (newPassword === currentPassword) {
      throw new HttpError(400, 'New password must be different from the current one');
    }

    const rows = await query('SELECT password_hash FROM users WHERE id = ? LIMIT 1', [req.user.id]);
    if (!rows.length) throw new HttpError(404, 'Account not found');

    const matches = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!matches) throw new HttpError(400, 'Current password is incorrect');

    await query('UPDATE users SET password_hash = ? WHERE id = ?', [
      await bcrypt.hash(newPassword, 12),
      req.user.id,
    ]);

    await recordActivity(req.user.id, 'PASSWORD_CHANGED', 'Password changed', clientIp(req));
    res.json({ ok: true });
  })
);

export default router;
