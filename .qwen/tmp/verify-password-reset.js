import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../../server/config.js';
import { query, connectServer } from '../../server/db.js';

const BASE = 'http://127.0.0.1:3001';
const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const token = (userId) => jwt.sign({ sub: String(userId) }, config.jwt.secret, { expiresIn: '5m' });
const call = async (path, { method = 'GET', body, userId } = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(userId ? { Cookie: `ej_token=${token(userId)}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let payload = null;
  try { payload = await res.json(); } catch {}
  return { status: res.status, payload };
};

const [admin] = await query("SELECT id, username FROM users WHERE role = 'admin' AND is_active = 1 ORDER BY id LIMIT 1");
const [staff] = await query("SELECT id, username FROM users WHERE role = 'staff' AND is_active = 1 ORDER BY id LIMIT 1");
const INITIAL = 'initial-pass-1';
const RESET = 'reset-pass-9876';
let tempId = null;

try {
  const uname = `zz-pwreset-${Date.now()}`;
  const created = await call('/api/users', {
    method: 'POST', userId: admin.id,
    body: { username: uname, fullName: 'ZZ PwReset', password: INITIAL, role: 'staff' },
  });
  tempId = created.payload?.user?.id ?? null;
  record('setup: temp user created', created.status === 201 && !!tempId, `id=${tempId}`);

  // baseline: the initial password works
  const loginBefore = await call('/api/auth/login', { method: 'POST', body: { username: uname, password: INITIAL } });
  record('login with initial password works', loginBefore.status === 200, `status=${loginBefore.status}`);

  // the actual feature
  const reset = await call(`/api/users/${tempId}/password`, {
    method: 'POST', userId: admin.id, body: { password: RESET },
  });
  record('POST /users/:id/password (admin) -> 200', reset.status === 200, `status=${reset.status}`);

  const loginAfter = await call('/api/auth/login', { method: 'POST', body: { username: uname, password: RESET } });
  record('login with NEW password works', loginAfter.status === 200, `status=${loginAfter.status}`);

  const loginStale = await call('/api/auth/login', { method: 'POST', body: { username: uname, password: INITIAL } });
  record('login with OLD password now rejected', loginStale.status === 401, `status=${loginStale.status}`);

  const [row] = await query('SELECT password_hash AS hash FROM users WHERE id = ?', [tempId]);
  record('stored hash matches new password', await bcrypt.compare(RESET, row.hash));
  record('stored hash no longer matches old password', !(await bcrypt.compare(INITIAL, row.hash)));

  // guards
  const tooShort = await call(`/api/users/${tempId}/password`, {
    method: 'POST', userId: admin.id, body: { password: 'short' },
  });
  record('password under 8 chars -> 400', tooShort.status === 400, `"${tooShort.payload?.error}"`);

  const missing = await call('/api/users/999999/password', {
    method: 'POST', userId: admin.id, body: { password: RESET },
  });
  record('unknown user -> 404', missing.status === 404, `"${missing.payload?.error}"`);

  const asStaff = await call(`/api/users/${tempId}/password`, {
    method: 'POST', userId: staff.id, body: { password: RESET },
  });
  record('non-admin -> 403', asStaff.status === 403, `status=${asStaff.status}`);

  const anon = await call(`/api/users/${tempId}/password`, { method: 'POST', body: { password: RESET } });
  record('unauthenticated -> 401', anon.status === 401, `status=${anon.status}`);
} finally {
  if (tempId) {
    await query('DELETE FROM users WHERE id = ?', [tempId]);
    const conn = await connectServer();
    await conn.query(`DROP DATABASE IF EXISTS \`ej_user_${tempId}\``);
    await conn.end();
    console.log(`\ncleanup: removed test user #${tempId} and its schema`);
  }
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
