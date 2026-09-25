// Write side of the notification bell. Notifications live in the central db (see the
// `notifications` table in server/migrations/001_central.sql) because the recipient is
// almost never the actor, and the per-user schemas cannot carry a message between members.
//
// Same contract as recordActivity() in ./activity.js: a notification is a side effect, so
// nothing here is allowed to fail the request that triggered it. A write that throws is
// logged and swallowed, never rethrown.
import { query } from '../db.js';

const TYPE_MAX = 48;
const ENTITY_TYPE_MAX = 32;
const TITLE_MAX = 200;
const BODY_MAX = 300;
const LINK_MAX = 255;

function clip(value, max) {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function positiveIds(values) {
  const ids = (values ?? [])
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);
  return [...new Set(ids)];
}

// The fan-out happens in SQL, so a broadcast to the whole team costs one round trip
// instead of a loop with a query per member. `is_active` and "not the actor" are filtered
// here rather than in JS, which also means no de-duplication pass is needed.
async function fanOut(actorId, payload, audienceSql, audienceParams) {
  const title = clip(payload.title, TITLE_MAX);
  const link = clip(payload.link, LINK_MAX);
  const type = clip(payload.type, TYPE_MAX);
  if (!title || !link || !type) return 0;

  try {
    const result = await query(
      `INSERT INTO notifications (user_id, actor_id, type, entity_type, entity_id, title, body, link)
       SELECT u.id, ?, ?, ?, ?, ?, ?, ?
         FROM users u
        WHERE u.is_active = 1 AND u.id <> ?${audienceSql}`,
      [
        actorId,
        type,
        clip(payload.entityType, ENTITY_TYPE_MAX),
        payload.entityId ?? null,
        title,
        clip(payload.body, BODY_MAX),
        link,
        actorId,
        ...audienceParams,
      ]
    );
    return Number(result.affectedRows ?? 0);
  } catch (error) {
    console.error(`[notify] could not write "${payload.type}" for actor ${actorId}: ${error.message}`);
    return 0;
  }
}

// Everyone active except the person who did it — for things the whole team should see:
// a new schedule, a new discussion, an uploaded certification.
export function notifyTeam(actorId, payload) {
  return fanOut(actorId, payload, '', []);
}

// Only administrators. The archive is the one admin-only section of the app: telling a staff
// member about a file they cannot open would just send them to a page whose API answers 403.
export function notifyAdmins(actorId, payload) {
  return fanOut(actorId, payload, " AND u.role = 'admin'", []);
}

// Only the members given — for replies, which matter to the people already in that
// conversation and to nobody else. An empty audience is a no-op, not an error: replying to
// your own thread with no other participant legitimately notifies no one.
export function notifyUsers(actorId, userIds, payload) {
  const ids = positiveIds(userIds).filter((id) => id !== Number(actorId));
  if (!ids.length) return Promise.resolve(0);

  const placeholders = ids.map(() => '?').join(', ');
  return fanOut(actorId, payload, ` AND u.id IN (${placeholders})`, ids);
}
