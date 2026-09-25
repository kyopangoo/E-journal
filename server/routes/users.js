import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { query, transaction } from '../db.js';
import { HttpError, requireText, wrap } from '../lib/http.js';
import { clientIp, recordActivity } from '../lib/activity.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { userSchemaName } from '../config.js';
import { ensureUserSchema } from '../schema.js';

const router = Router();

router.use(requireAuth);
router.use(requireAdmin);

const USER_COLUMNS = `
  id, username, full_name AS fullName, email, role, avatar,
  schema_name AS schemaName, is_active AS isActive,
  created_at AS createdAt, updated_at AS updatedAt
`;

router.get(
  '/',
  wrap(async (req, res) => {
    const rows = await query(`SELECT ${USER_COLUMNS} FROM users WHERE is_active = 1 ORDER BY id`);
    res.json({ users: rows });
  })
);

router.post(
  '/',
  wrap(async (req, res) => {
    const username = requireText(req.body?.username, 'Username', 64);
    const fullName = requireText(req.body?.fullName, 'Full name', 128);
    const password = String(req.body?.password ?? '');
    if (!password) throw new HttpError(400, 'Password is required');
    if (password.length < 8) {
      throw new HttpError(400, 'Password must be at least 8 characters long');
    }

    const email = String(req.body?.email ?? '').trim() || null;
    const role = req.body?.role === 'admin' ? 'admin' : 'staff';

    // Username and email stay reserved by deactivated accounts, so the check must
    // look past is_active — otherwise the INSERT hits uq_users_username and 500s.
    const existing = await query(
      'SELECT id, is_active AS isActive FROM users WHERE username = ? OR (email IS NOT NULL AND email = ?) LIMIT 1',
      [username, email]
    );
    if (existing.length) {
      throw new HttpError(
        409,
        existing[0].isActive
          ? 'A user with that username or email already exists'
          : 'A deactivated account already uses that username or email'
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const userId = await transaction(async (connection) => {
      const [{ insertId }] = await connection.execute(
        'INSERT INTO users (username, full_name, email, role, password_hash, schema_name) VALUES (?, ?, ?, ?, ?, ?)',
        [username, fullName, email, role, passwordHash, userSchemaName(0)]
      );

      const schema = await ensureUserSchema(insertId);
      await connection.execute('UPDATE users SET schema_name = ? WHERE id = ?', [schema, insertId]);

      return insertId;
    });

    await recordActivity(
      req.user.id,
      'USER_CREATED',
      `Created user "${fullName}" (${role})`,
      clientIp(req)
    );

    const rows = await query(`SELECT ${USER_COLUMNS} FROM users WHERE id = ? LIMIT 1`, [userId]);
    res.status(201).json({ user: rows[0] });
  })
);

router.put(
  '/:id/role',
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const role = req.body?.role === 'admin' ? 'admin' : 'staff';

    const rows = await query(
      "SELECT id, full_name AS fullName FROM users WHERE id = ? AND is_active = 1 LIMIT 1",
      [id]
    );
    if (!rows.length) throw new HttpError(404, 'User not found');

    await query('UPDATE users SET role = ? WHERE id = ?', [role, id]);

    await recordActivity(
      req.user.id,
      'USER_ROLE_CHANGED',
      `Set role for "${rows[0].fullName}" to ${role}`,
      clientIp(req)
    );

    const updated = await query(`SELECT ${USER_COLUMNS} FROM users WHERE id = ? LIMIT 1`, [id]);
    res.json({ user: updated[0] });
  })
);

router.post(
  '/:id/password',
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const password = String(req.body?.password ?? '');
    if (password.length < 8) {
      throw new HttpError(400, 'Password must be at least 8 characters long');
    }

    const rows = await query(
      'SELECT id, full_name AS fullName FROM users WHERE id = ? AND is_active = 1 LIMIT 1',
      [id]
    );
    if (!rows.length) throw new HttpError(404, 'User not found');

    await query('UPDATE users SET password_hash = ? WHERE id = ?', [
      await bcrypt.hash(password, 12),
      id,
    ]);

    await recordActivity(
      req.user.id,
      'USER_PASSWORD_RESET',
      `Reset password for "${rows[0].fullName}"`,
      clientIp(req)
    );

    res.json({ ok: true });
  })
);

router.delete(
  '/:id',
  wrap(async (req, res) => {
    const id = Number(req.params.id);

    const rows = await query(
      'SELECT id, full_name AS fullName FROM users WHERE id = ? AND is_active = 1 LIMIT 1',
      [id]
    );
    if (!rows.length) throw new HttpError(404, 'User not found');
    if (id === req.user.id) {
      throw new HttpError(400, 'You cannot deactivate your own account');
    }

    await query('UPDATE users SET is_active = 0 WHERE id = ?', [id]);

    await recordActivity(
      req.user.id,
      'USER_DEACTIVATED',
      `Deactivated user "${rows[0].fullName}"`,
      clientIp(req)
    );

    res.json({ ok: true });
  })
);

export default router;
