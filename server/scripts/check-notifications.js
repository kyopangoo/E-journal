// End-to-end check for the notification bell. Ad-hoc, like the other scripts in this
// directory — run it after changing anything in server/lib/notify.js or
// server/routes/notifications.js:
//
//   cd /opt/e-forum && node server/scripts/check-notifications.js
//
// It talks to the running API on PORT (3001 by default) rather than importing the routers,
// so `pm2 restart ejourney` has to have happened first for the result to mean anything.
// Nothing here needs a password: it mints a JWT with the same secret requireAuth verifies
// against, which the middleware accepts through the Authorization header.
//
// Where a check is about what was *written*, it reads the notifications table directly
// instead of going through GET /notifications. The API's list is capped at the newest 20 and
// returns entity_id as whatever type the driver chose, so it is the wrong thing to assert
// against — but it is still exercised, because the client depends on it.
//
// Cleanup is done at the end, in SQL, by id and by title: every notification above the id
// recorded at startup goes, along with the test rows in the schedule and forum tables. That
// is deliberately a little broad — a teammate creating a real notification in the same
// second would lose it — in exchange for never leaving test rows in a real bell.
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query, closePool } from '../db.js';
import { schemaQuery } from '../schema.js';

const BASE = `http://127.0.0.1:${config.port}/api`;
const MARK = 'NOTIF TEST';

let passed = 0;
let failed = 0;

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed += 1;
  else failed += 1;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${label}` +
      (ok ? '' : ` — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`)
  );
}

function tokenFor(user) {
  return jwt.sign({ sub: String(user.id), role: user.role }, config.jwt.secret, {
    expiresIn: '1h',
  });
}

async function call(user, path, init = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${tokenFor(user)}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

// Every notification written since the script started, with names resolved — so a failure
// shows what actually landed instead of only that an expectation was not met.
async function writtenSince(gte, extraWhere = '', extraParams = []) {
  return query(
    `SELECT n.id, n.type, n.user_id AS recipientId, ru.username AS recipient,
            au.username AS actor, n.entity_type AS entityType, n.entity_id AS entityId,
            n.link
       FROM notifications n
       LEFT JOIN users ru ON ru.id = n.user_id
       LEFT JOIN users au ON au.id = n.actor_id
      WHERE n.id > ? ${extraWhere}
      ORDER BY n.id`,
    [gte, ...extraParams]
  );
}

function report(label, rows) {
  console.log(`\n--- ${label}: ${rows.length} row(s) ---`);
  for (const row of rows) {
    console.log(
      `  #${row.id} ${row.type} → ${row.recipient} (actor ${row.actor ?? '—'}) ` +
        `entity ${row.entityType ?? '—'}#${row.entityId} (${typeof row.entityId}) link ${row.link}`
    );
  }
}

const users = await query(
  'SELECT id, username, full_name AS fullName, role FROM users WHERE is_active = 1 ORDER BY id LIMIT 3'
);

if (users.length < 2) {
  console.error(`Need at least two active users to test with; found ${users.length}.`);
  await closePool();
  process.exit(1);
}

const [actor, other, third] = users;
console.log(
  `actor=${actor.username}  other=${other.username}${third ? `  third=${third.username}` : ''}\n`
);

const [maxRow] = await query('SELECT COALESCE(MAX(id), 0) AS maxId FROM notifications');
const maxIdBefore = Number(maxRow.maxId);

try {
  // --- a broadcast event reaches everyone except the person who did it -------------------
  const created = await call(actor, '/schedule', {
    method: 'POST',
    body: JSON.stringify({
      title: MARK,
      startAt: '2026-09-26T09:00',
      endAt: '2026-09-26T10:00',
    }),
  });
  // 201 also pins a pre-existing bug that used to answer 500 here: mapEvent() reads
  // owner.id, and the create and edit responses were passing it no owner at all.
  check('create a schedule answers 201', created.status, 201);
  const scheduleId = created.body?.event?.id ?? null;

  const broadcast = await writtenSince(maxIdBefore, 'AND n.type = ?', ['schedule.created']);
  const toOther = broadcast.filter((row) => Number(row.recipientId) === Number(other.id));
  const toActor = broadcast.filter((row) => Number(row.recipientId) === Number(actor.id));
  check('the other member got a schedule notification', toOther.length, 1);
  check('it links to the schedule page', toOther[0]?.link, '/schedule');
  check('it names the actor', toOther[0]?.actor, actor.username);
  check('the actor does not get their own notification', toActor.length, 0);

  // Counted in SQL rather than from `users`, which is capped at three and would make the
  // expectation wrong the moment the team grows past that.
  const [activeRow] = await query('SELECT COUNT(*) AS n FROM users WHERE is_active = 1');
  check(
    'every active member except the actor was written to',
    broadcast.length,
    Number(activeRow.n) - 1
  );

  // --- read state is per recipient, and nobody can touch somebody else's ------------------
  const bell = await call(other, '/notifications');
  const target = bell.body.notifications.find((row) => row.type === 'schedule.created');
  check('the other member can see it in the bell', Boolean(target), true);
  check('and it arrives unread', target?.readAt, null);

  const beforeTamper = (await call(other, '/notifications/unread-count')).body.unreadCount;

  // Scoped to the caller in SQL, so this changes nothing rather than reporting 403 — a 403
  // would confirm that the row exists.
  const tampered = await call(actor, `/notifications/${target.id}/read`, { method: 'PATCH' });
  check("marking somebody else's notification is not an error", tampered.status, 200);
  check(
    'and it leaves their unread count alone',
    (await call(other, '/notifications/unread-count')).body.unreadCount,
    beforeTamper
  );

  const marked = await call(other, `/notifications/${target.id}/read`, { method: 'PATCH' });
  check('marking your own notification succeeds', marked.status, 200);
  check('and drops it out of the unread count', marked.body.unreadCount, beforeTamper - 1);

  // --- a reply is targeted, not broadcast -------------------------------------------------
  const thread = await call(actor, '/forum/threads', {
    method: 'POST',
    body: JSON.stringify({ title: `${MARK} thread`, body: 'Created by the notification check.' }),
  });
  check('create a discussion as the actor', thread.status, 201);
  const threadId = thread.body?.thread?.id ?? null;

  const reply = await call(other, `/forum/threads/${threadId}/replies`, {
    method: 'POST',
    body: JSON.stringify({ body: 'Replying to test targeted notifications.' }),
  });
  check('reply as another member', reply.status, 201);

  // Read from the table, not from the API list: this is the claim that matters, and the list
  // is capped at 20 rows. Filtered by link, not by entity_id — the entity is the *reply*
  // (entity_type 'forum_reply'), so entity_id is the reply's id; the link is what carries the
  // discussion.
  const replyRows = await writtenSince(maxIdBefore, 'AND n.type = ? AND n.link = ?', [
    'forum.reply.created',
    `/forum/${threadId}`,
  ]);
  check(
    'the reply notified exactly the discussion owner',
    replyRows.map((row) => Number(row.recipientId)),
    [Number(actor.id)]
  );
  check('it records the reply it is about', Number(replyRows[0]?.entityId), Number(reply.body?.reply?.id));
  check(
    'an uninvolved member got no row at all',
    replyRows.filter((row) => Number(row.recipientId) === Number(third?.id ?? -1)).length,
    0
  );

  // The same row, as the client sees it — this is what the bell renders.
  const notice = (await call(actor, '/notifications')).body.notifications.find(
    (row) => row.type === 'forum.reply.created' && row.link === `/forum/${threadId}`
  );
  check('the discussion owner can see it in the bell', Boolean(notice), true);
  check('with the discussion link', notice?.link, `/forum/${threadId}`);

  // --- a deleted event is broadcast too ---------------------------------------------------
  if (scheduleId) {
    const removed = await call(actor, `/schedule/${scheduleId}`, { method: 'DELETE' });
    check('delete the schedule', removed.status, 200);
    const deletions = await writtenSince(maxIdBefore, 'AND n.type = ?', ['schedule.deleted']);
    check(
      'the deletion was broadcast to the others',
      deletions.some((row) => Number(row.recipientId) === Number(other.id)),
      true
    );
  }

  // --- the poll endpoint ------------------------------------------------------------------
  const counted = await call(other, '/notifications/unread-count');
  check('the poll answers with the count alone', Object.keys(counted.body), ['unreadCount']);
} finally {
  report('notifications written by this run', await writtenSince(maxIdBefore));

  // In SQL rather than through the API so the cleanup does not generate notifications of its
  // own. By title, so it also clears anything an earlier run left behind.
  await schemaQuery(actor.id, 'DELETE FROM schedule_events WHERE title = ?', [MARK]).catch(
    () => {}
  );
  await query('DELETE FROM forum_threads WHERE title = ?', [`${MARK} thread`]).catch(() => {});
  await query('DELETE FROM notifications WHERE id > ?', [maxIdBefore]).catch(() => {});

  const [left] = await query(
    "SELECT COUNT(*) AS n FROM notifications WHERE title LIKE ? OR body LIKE ?",
    [`%${MARK}%`, `%${MARK}%`]
  );
  console.log(`\ncleanup: ${Number(left.n)} test row(s) left in notifications`);

  await closePool();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
