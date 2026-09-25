---
name: per-user-schema-mysql
description: Data-layer conventions for the E-Journey app (central DB + one MariaDB schema per user), MariaDB-vs-MySQL differences, connection/grant errors, and how to isolate a bug to the browser bundle, the API, or the data.
source: auto-skill
extracted_at: '2026-09-16T17:22:48.914Z'
---

# E-Journey data layer: central DB + one schema per user

Use this when adding or changing anything in `/opt/e-forum/server` — a new feature, endpoint, table, or migration.

## The placement rule

Two tiers, and a table belongs to exactly one:

- **Central database `e-journey`** (`server/migrations/001_central.sql`) — anything shared between users: `users`, `forum_threads`, `forum_replies`, `elearning_assignments`, `elearning_questions`, `elearning_feedback`, `user_preferences`.
- **Per-user schema `ej_user_<userId>`** (`server/migrations/002_per_user.sql`) — anything private to one person: `schedule_events`, `elearning_answers`, `elearning_answer_media`, `articles`, `certifications`, `activity_history`.

Naming is enforced by `userSchemaName(userId)` in `server/config.js` and validated by `assertSchemaName` in `server/schema.js` (must match `^ej_user_\d+$`).

Decide with: *would another user ever need to read this row as part of normal use?* Forum and assignments are shared → central. A personal calendar is not → per-user.

## Hard constraint: no foreign keys across databases

MySQL FKs cannot span databases. A per-user table may hold an ID that points at a central row (`elearning_answers.question_id`), but it must **not** declare a `FOREIGN KEY` for it — the migration will fail at `CREATE TABLE` time.

FKs are only safe when both tables live in the same migration file. Before adding one, confirm the referenced table is in that same file.

> **Verify ownership before editing a migration.** A batch `read_file` over several files lists results in call order, not in a labelled way; it is easy to attribute a table to the wrong file. If an `edit` reports "0 occurrences found" on SQL you just read, you are almost certainly editing the wrong file — re-read that single file with an explicit `offset`/`limit` rather than assuming the text is malformed.

## Changing a table that already exists

Every statement is `CREATE TABLE IF NOT EXISTS` and there is no migration-version table, so editing a migration file affects **fresh installs only** — it will not touch a database where the table already exists. Adding or changing a column is a three-part change:

1. Update the owning migration (`001_central.sql` or `002_per_user.sql`).
2. Update `database/e-journey-full-schema.sql` — the hand-runnable consolidated script the user may execute themselves. It duplicates the same DDL plus an `ej_provision_user_schemas()` routine that stamps out `ej_user_<id>` databases from an `ej_user_template` database via `CREATE TABLE ... LIKE`.
3. Hand the user the `ALTER TABLE` to run on their live database, stating that existing rows take the column default.

Self-referencing columns (a tree — e.g. `forum_replies.parent_reply_id`) are indexed but deliberately given **no** `FOREIGN KEY`: parent linkage is validated in the route instead (the parent must exist and belong to the same thread). That sidesteps self-referential cascade behaviour and keeps the `ALTER` trivial for the user.

### Adding a brand-new per-user table (no `ALTER` needed)

`ensureUserSchema` in `server/schema.js` no longer just memoises: on first touch of a schema it now checks `information_schema.SCHEMATA` — creating the whole schema if it is absent, otherwise running an idempotent `CREATE TABLE IF NOT EXISTS` for each table declared in the module (see the `ANSWER_MEDIA_TABLE` constant, added for `elearning_answer_media`). So a **new** per-user table reaches every existing `ej_user_<id>` schema automatically, with no `ALTER TABLE` handed to the user.

To use it, declare the DDL as a module-level constant and add it to the statements run for existing schemas. Keep it in step with:

1. `server/migrations/002_per_user.sql` — so fresh installs get it too.
2. `database/e-journey-full-schema.sql` — the `ej_user_template` section **and** the `ej_provision_user_schemas()` routine (a `CREATE TABLE ... LIKE` line per table).

Adding an entire table is the easy case. **Changing a column** still needs the three-part change above.

## Access helpers (`server/schema.js`, `server/db.js`)

| Helper | Use for |
| --- | --- |
| `query(sql, params)` | Central DB, single statement |
| `transaction(handler)` | Central DB, multi-statement (`getPool()` connection, auto commit/rollback) |
| `schemaQuery(userId, sql, params)` | Per-user DB; calls `ensureUserSchema` first, so the schema is created on demand |
| `schemaTransaction(userId, handler)` | Per-user DB, multi-statement |

`ensureUserSchema` memoises created schemas in an in-process `Set`, but each call still opens a fresh connection — fine at this scale, but do not assume it is pooled when writing loops.

## Reading another user's private data (admin views)

Admins legitimately need staff data that lives in the staff member's own schema. There is no cross-schema join, so fan out:

```js
const staff = await listStaff();            // central: role + id
for (const person of staff) {
  const rows = await schemaQuery(person.id, 'SELECT ... WHERE assignment_id = ?', [id]);
  if (!rows.length) continue;
  submissions.push({ user: person, answers: rows });
}
```

`listStaff()` lives in `server/lib/users.js`. If a user has never signed in their schema is created empty by `ensureUserSchema`, so this loop is safe — just skip empty results.

### Review threads belong in the central DB

Admin↔staff review of an assignment (`elearning_feedback`) is central, not per-user, even though it is "about" one person — **both** parties read and write it, which is the placement test.

Shape: one thread per `(assignment_id, staff_id)`, flat rows, no parent/child. `read_at` is a *single* column meaning "read by the other party", so the same column answers both directions:

- unread **for staff** = `author_role = 'admin' AND read_at IS NULL`
- unread **for admin** = `author_role = 'staff' AND read_at IS NULL`

Opening the assignment marks the admin's messages read; opening the admin review page marks every staff message read on that assignment. Capture the counts **before** the mark, or the response will always report zero unread.

Authorisation is asymmetric and must stay that way: an admin passes `staffId` explicitly, while a staff member's `staffId` is forced to `req.user.id` — never read from the request. Staff access is additionally gated on the assignment being published. There is a probe-verified isolation test for this: two different staff must see different threads for the same assignment.

## `dateStrings: true` is deliberate

`connectionOptions` in `server/db.js` sets `dateStrings: true`. `DATETIME` columns are written as naive wall-clock strings built from client input (see `naiveDateTime` in `routes/schedule.js`) and read back verbatim. Do not remove it — without it mysql2 re-interprets values through the server timezone and events shift hours. Keep writing datetimes as `YYYY-MM-DD HH:mm:ss` strings rather than `Date` objects.

## Verification ladder when the DB is unreachable

The app server and the DB server are different hosts, and the DB credentials may be rejected. You can still validate a full change before the database is available:

```bash
# 1. syntax-check every server file
for f in $(find /opt/e-forum/server -name '*.js'); do node --check "$f" || echo "FAILED: $f"; done

# 2. compile the client
npm --prefix /opt/e-forum/client run build

# 3. probe the already-running API (see the PM2 note below — do NOT start your own)
curl -s http://localhost:3000/api/health          # expect {"ok":true,...}
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/        # expect 200 (SPA)
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/auth/me  # expect 401
```

Port 3000 is normally already served by PM2 (below), so step 3 probes that process; restart it with `pm2 restart ejourney` rather than launching a second server.

Then report the DB-dependent steps as *unverified* rather than implying they passed.

Once credentials work, this must actually be re-run — a passing syntax check proves nothing about runtime behaviour.

## Do not trust `node --watch`

`npm run dev` runs `node --watch`, which will restart on the **first** of several rapid writes, load a partially-updated file, and then keep serving that stale code indefinitely with no error shown. Editing several files under `server/` in one go makes this likely, not exotic.

The signature is behaviour that contradicts the code on disk — typically reads reflecting a new field while writes silently drop it, because the GET handler had been written and the POST handler had not.

Confirm by comparing the process start time against the file mtime:

```bash
ss -ltnp | grep ':3000'                          # which PID actually owns the port
ps -o pid,lstart,cmd -p <pid>
stat -c '%y  %n' server/routes/forum.js
```

If the process started **before** the file was last written, it is running stale code. Restart the API and re-test before investigating anything else — this one cause can masquerade as a client bug, a CSS bug, and a bad `ALTER TABLE` all at once.

**Rule: after editing anything under `server/`, restart the API yourself** (see the PM2 section below for the one correct way).

### Port 3000 belongs to PM2 — do not start your own server

The live API is a PM2-managed app named `ejourney` (`pm2 list`; `fork` mode, `watching: disabled`). PM2's God Daemon immediately respawns the child whenever it exits, so any process that dies on port 3000 is replaced within seconds and the port is reclaimed.

**Why this matters:** starting `node --watch server/index.js` or `npm run dev` while PM2 owns the port produces an endless `EADDRINUSE: address already in use :::3000` crash-loop, and each `pkill` just triggers another PM2 respawn (watch the `↺` restart counter climb). It is easy to mistake this for "my restart didn't work" and chase ghosts.

```bash
pm2 list                          # confirm app name / status
pm2 restart ejourney              # the way to load server changes
pm2 stop ejourney                 # the way to stop it (never pkill)
curl -s http://localhost:3000/api/health
pm2 logs ejourney --nostream --lines 15
```

`watching: disabled` means PM2 does **not** reload on file changes — an explicit `pm2 restart` is always required. The PM2 logs are append-only (`~/.pm2/logs/ejourney-*.log`), so errors from earlier runs remain visible: check a logged exception is not historical before treating it as current.

## Prove which layer is broken — do not ask the user to check

A feature "not working" can be the browser bundle, the API, or the data. Read all three yourself in one command each; it ends the guesswork immediately. Repeated "still the same" replies from the user are the signal to stop asking and start inspecting.

**Read the live database through the app's own credentials** (no `mysql` client required, and it reuses the grant already proven to work):

```bash
cd /opt/e-forum && node -e "
import('./server/db.js').then(async ({ query, closePool }) => {
  try {
    console.table(await query('SELECT id, parent_reply_id, LEFT(body,25) AS body FROM forum_replies ORDER BY id'));
  } catch (e) { console.log('DB ERROR:', e.message); }
  finally { await closePool(); }
});"
```

**Exercise the API end to end with a self-cleaning probe** — log in, create a temporary thread, perform the writes under test, read them back, then `DELETE` the thread so zero test residue is left in the user's data:

```
login -> POST /forum/threads -> POST /forum/threads/:id/replies (+parentReplyId)
      -> GET /forum/threads/:id -> DELETE /forum/threads/:id
```

Assert on the **response of the write** (`reply.parentReplyId`), not only on a later read — that is what isolates a handler which ignores the field. Do the whole probe in one `node -e` with `fetch` and a cookie variable; it needs no dependency.

**Confirm which bundle the browser is served**, since a cached tab is indistinguishable from broken code:

```bash
curl -s http://localhost:3000/ | grep -o 'assets/index-[^"]*'   # must match client/dist/assets/
```

A cheaper trick when guiding a user through a reload: put a distinctive string in the new build and tell them to look for it. A visible marker beats asking them to compare asset hashes.

Only once data and API are both proven correct is a CSS or rendering explanation worth pursuing.

## The server is MariaDB, not MySQL

`10.28.9.109` runs MariaDB 10.11 (Ubuntu 24.04). `mysql2` talks to it fine, but two differences bite:

- **`JSON` columns are really `LONGTEXT`.** MySQL hands mysql2 an already-parsed array; MariaDB returns a raw string. `elearning_questions.options` hits this — `routes/elearning.js` runs it through `normaliseOptions()` so the API always emits an array or `null`. Never assume a JSON column arrives parsed, and never call `.map()` on one client-side.
- **`IDENTIFIED WITH <plugin> BY '...'` is a syntax error (1064).** MariaDB wants `CREATE USER ... IDENTIFIED BY '...'`, or `ALTER USER ... IDENTIFIED VIA mysql_native_password USING PASSWORD('...')`, or `GRANT ... TO ... IDENTIFIED BY '...'`.

## Connection errors and what they actually mean

`errno 1045 Access denied for user 'root'@'<client-ip>'` is ambiguous — MariaDB returns it both when the account is missing *and* when the password is wrong.

The trap: `sudo mysql` on the DB server authenticates through the `unix_socket` plugin as **`root@localhost`**, which is a *different account* from `root@<app-server-ip>`. Creating schemas and grants that way gives the app nothing. Run the grant in that local session on the DB server:

```sql
CREATE USER IF NOT EXISTS 'root'@'10.28.1.109' IDENTIFIED BY 'P@ssw0rd!1';
GRANT ALL PRIVILEGES ON *.* TO 'root'@'10.28.1.109';   -- *.* is required, not `e-journey`.*
FLUSH PRIVILEGES;
SELECT user, host, plugin FROM mysql.user WHERE user = 'root';  -- app row must be mysql_native_password, not unix_socket
SHOW GRANTS FOR 'root'@'10.28.1.109';
```

`*.*` is mandatory because the app creates `ej_user_<id>` databases at runtime and MariaDB has no wildcard grant like `ON ej_user_%.*`. If you cannot get onto the DB server, the user (or their DBA) must run this — it is never fixable from the app side.

Because the failure is `errno 1045` rather than a timeout or `ECONNREFUSED`, the TCP connection succeeded — that already rules out firewall and `bind-address` problems, so do not chase those.

`Table 'ej_user_1.user_preferences' doesn't exist` is a **code** bug, not a database one: a central-database table was queried through `schemaQuery`, which issues `USE ej_user_1` first. The per-user schemas hold only the tables listed in `002_per_user.sql` (six as of 2026-09-19). `user_preferences` is central — its FK to `users` can only resolve there — and must go through `query()`. When inserting a preferences row defensively, use `INSERT IGNORE` so two concurrent requests cannot collide on the primary key.

## Debugging the credentials themselves

Before blaming the grant, confirm what the app is actually sending — `.env` parsing and shell escaping are more common culprits than SQL:

```bash
cd /opt/e-forum && node -e "
import('dotenv/config').then(() => {
  console.log('host:', process.env.DB_HOST, 'user:', process.env.DB_USER);
  console.log('password length:', process.env.DB_PASSWORD?.length);
  console.log('matches expected:', process.env.DB_PASSWORD === 'P@ssw0rd!1');
});"
```

In bash, always single-quote a password containing `!` (`-p'P@ssw0rd!1'`) — an unquoted `!` triggers history expansion and silently mangles it.

Also confirm *which* server a local session is attached to before trusting anything it reports:

```sql
SELECT @@hostname AS hostname, @@version AS version, @@port AS port;
```

## Client conventions that pair with this

- Route guard lives in `client/src/App.jsx`; unauthenticated users only ever see `/login`, and a successful login lands on `/forum`.
- Session is an httpOnly cookie (`ej_token`), so `api.js` always sends `credentials: 'include'`; never store the JWT in JS.
- Per-user preferences (`theme`, `accent`, `fontScale`, `density`) are applied to `document.documentElement` in `client/src/auth.jsx`, which is what makes `[data-theme]` / `[data-density]` / `--accent` in `styles.css` work.
- Uploads are stored under `server/uploads/` and served at `/uploads`; `file_path` is persisted as a web path and converted back via `path.join(uploadDir, filePath.replace(/^\/uploads\//, ''))` when deleting.
- **Threaded replies** (`client/src/pages/ThreadPage.jsx`): the API returns a *flat* reply list that carries `parentReplyId`, and the client builds the tree via `buildTree()` then renders it recursively. Keep state flat and derive the tree with `useMemo` — appending a freshly POSTed reply then just works, with no tree surgery. Indentation caps at `MAX_INDENT_DEPTH` (3) and flattens past that so deep threads stay readable; each post has a Reply action that opens an inline composer directly beneath it, falling back to a single root composer when nothing is targeted.
