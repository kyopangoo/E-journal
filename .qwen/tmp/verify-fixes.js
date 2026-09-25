import jwt from 'jsonwebtoken';
import { config } from '../../server/config.js';
import { query, connectServer } from '../../server/db.js';

const BASE = 'http://127.0.0.1:3001';
const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok, detail });
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
const [assignment] = await query('SELECT id, title FROM elearning_assignments ORDER BY id LIMIT 1');
console.log(`admin=${admin.username}#${admin.id}  assignment=${assignment?.title}#${assignment?.id}\n`);

let testUserId = null;

try {
  // 1. /api/elearning/assignments/:id/threads used to join a non-existent q.created_by
  const threads = await call(`/api/elearning/assignments/${assignment.id}/threads`, { userId: admin.id });
  record('GET elearning .../threads (was 500)', threads.status === 200,
    `status=${threads.status} threads=${threads.payload?.threads?.length ?? '-'} ${threads.payload?.error ?? ''}`);

  // 2. requireAuth still resolves a healthy user, and now exposes isActive
  const me = await call('/api/auth/me', { userId: admin.id });
  record('GET /auth/me returns isActive', me.status === 200 && me.payload?.user?.isActive === 1,
    `status=${me.status} isActive=${me.payload?.user?.isActive}`);

  // 3. active-user list
  const list = await call('/api/users', { userId: admin.id });
  record('GET /users lists only active users', list.status === 200 && list.payload.users.every((u) => u.isActive === 1),
    `status=${list.status} count=${list.payload?.users?.length}`);

  // 4. create a throwaway user
  const uname = `zz-verify-${Date.now()}`;
  const created = await call('/api/users', {
    method: 'POST', userId: admin.id,
    body: { username: uname, fullName: 'ZZ Verify', email: `${uname}@example.test`, password: 'verify-pass-123', role: 'staff' },
  });
  testUserId = created.payload?.user?.id ?? null;
  record('POST /users creates throwaway user', created.status === 201 && testUserId, `status=${created.status} id=${testUserId}`);

  // 5. duplicate username while ACTIVE -> clean 409
  const dupActive = await call('/api/users', {
    method: 'POST', userId: admin.id,
    body: { username: uname, fullName: 'ZZ Dup', password: 'verify-pass-123', role: 'staff' },
  });
  record('POST /users duplicate (active) -> 409', dupActive.status === 409, `status=${dupActive.status} "${dupActive.payload?.error}"`);

  // 6. soft delete
  const del = await call(`/api/users/${testUserId}`, { method: 'DELETE', userId: admin.id });
  const [after] = await query('SELECT is_active AS isActive FROM users WHERE id = ?', [testUserId]);
  record('DELETE /users/:id soft-deactivates', del.status === 200 && after?.isActive === 0,
    `status=${del.status} is_active=${after?.isActive}`);

  // 7. deactivated user vanishes from the list
  const list2 = await call('/api/users', { userId: admin.id });
  record('deactivated user hidden from GET /users',
    Array.isArray(list2.payload?.users) && !list2.payload.users.some((u) => u.id === testUserId),
    `status=${list2.status} count=${list2.payload?.users?.length}`);

  // 8. existing session of a deactivated user is now rejected (was a 12h window)
  const meDisabled = await call('/api/auth/me', { userId: testUserId });
  record('deactivated user session -> 401', meDisabled.status === 401, `status=${meDisabled.status} "${meDisabled.payload?.error}"`);

  // 9. username stays reserved -> explicit 409, not a 500 ER_DUP_ENTRY
  const dupInactive = await call('/api/users', {
    method: 'POST', userId: admin.id,
    body: { username: uname, fullName: 'ZZ Reuse', password: 'verify-pass-123', role: 'staff' },
  });
  record('POST /users reuse of deactivated username -> 409', dupInactive.status === 409, `status=${dupInactive.status} "${dupInactive.payload?.error}"`);

  // 10. self-deactivation guard
  const selfDel = await call(`/api/users/${admin.id}`, { method: 'DELETE', userId: admin.id });
  record('admin cannot deactivate self -> 400', selfDel.status === 400, `status=${selfDel.status} "${selfDel.payload?.error}"`);
} finally {
  if (testUserId) {
    await query('DELETE FROM users WHERE id = ?', [testUserId]);
    const conn = await connectServer();
    await conn.query(`DROP DATABASE IF EXISTS \`ej_user_${testUserId}\``);
    await conn.end();
    console.log(`\ncleanup: removed test user #${testUserId} and its schema`);
  }
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
