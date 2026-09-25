import { Router } from 'express';
import { HttpError, requireText, wrap } from '../lib/http.js';
import { clientIp, recordActivity } from '../lib/activity.js';
import { notifyTeam } from '../lib/notify.js';
import { requireAuth } from '../middleware/auth.js';
import { schemaQuery } from '../schema.js';

import { query } from '../db.js';

const router = Router();

router.use(requireAuth);

const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const DEFAULT_COLOR = '#FFEB3B';

function naiveDateTime(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(value ?? ''));
  if (!match) return null;
  const [, year, month, day, hour, minute, second = '00'] = match;
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function dayBoundary(value, time) {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(value ?? ''));
  return match ? `${match[1]} ${time}` : null;
}

function mapEvent(row, owner) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    startAt: row.startAt,
    endAt: row.endAt,
    allDay: Boolean(row.all_day),
    color: row.color,
    ownerId: owner.id,
    ownerName: owner.full_name,
    ownerUsername: owner.username,
  };
}

const EVENT_COLUMNS =
  'id, title, description, start_at AS startAt, end_at AS endAt, all_day, color';

// The GET route fans out across members and so has a raw `users` row in hand (full_name),
// while the single-event routes only have req.user, which loadPublicUser() already aliased to
// fullName. mapEvent() wants one shape, so both are reduced to it here — without this the
// create and edit responses threw on `owner.id` and answered 500 *after* the write had
// already committed, which is why the row saved but the screen reported a failure.
function ownerFrom(user) {
  return { id: user.id, full_name: user.fullName ?? user.full_name, username: user.username };
}

async function findEvent(userId, id) {
  const rows = await schemaQuery(
    userId,
    `SELECT ${EVENT_COLUMNS} FROM schedule_events WHERE id = ? LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

router.get(
  '/',
  wrap(async (req, res) => {
    const from = dayBoundary(req.query.from, '00:00:00');
    const to = dayBoundary(req.query.to, '23:59:59');

    const filters = [];
    const params = [];
    if (from) {
      filters.push('start_at >= ?');
      params.push(from);
    }
    if (to) {
      filters.push('start_at <= ?');
      params.push(to);
    }

    const users = await query(
      'SELECT id, username, full_name FROM users WHERE is_active = 1 ORDER BY full_name'
    );

    const events = [];
    for (const user of users) {
      try {
        const userEvents = await schemaQuery(
          user.id,
          `SELECT ${EVENT_COLUMNS} FROM schedule_events
           ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
           ORDER BY start_at ASC`,
          params
        );
        for (const event of userEvents) {
          events.push(mapEvent(event, user));
        }
      } catch {
        // Skip users without schema
      }
    }

    res.json({ events });
  })
);

router.post(
  '/',
  wrap(async (req, res) => {
    const title = requireText(req.body?.title, 'Title', 200);
    const startAt = naiveDateTime(req.body?.startAt);
    if (!startAt) throw new HttpError(400, 'A valid start date and time is required');

    const endAt = naiveDateTime(req.body?.endAt);
    if (endAt && endAt < startAt) throw new HttpError(400, 'End time cannot precede start time');

    const description = String(req.body?.description ?? '').trim() || null;
    const allDay = req.body?.allDay ? 1 : 0;
    const color = COLOR_PATTERN.test(String(req.body?.color ?? '')) ? req.body.color : DEFAULT_COLOR;

    const result = await schemaQuery(
      req.user.id,
      `INSERT INTO schedule_events (title, description, start_at, end_at, all_day, color)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [title, description, startAt, endAt, allDay, color]
    );

    await recordActivity(req.user.id, 'SCHEDULE_CREATED', `Added "${title}" on ${startAt.slice(0, 10)}`, clientIp(req));

    // The whole team can see everybody's schedule, so a new entry is worth telling them about.
    await notifyTeam(req.user.id, {
      type: 'schedule.created',
      entityType: 'schedule_event',
      entityId: result.insertId,
      title: `${req.user.fullName} added a new schedule`,
      body: `${title} · ${startAt.slice(0, 16)}`,
      link: '/schedule',
    });

    res.status(201).json({
      event: mapEvent(await findEvent(req.user.id, result.insertId), ownerFrom(req.user)),
    });
  })
);

router.patch(
  '/:id',
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const existing = await findEvent(req.user.id, id);
    if (!existing) throw new HttpError(404, 'Event not found');

    const assignments = [];
    const params = [];

    if (req.body?.title !== undefined) {
      assignments.push('title = ?');
      params.push(requireText(req.body.title, 'Title', 200));
    }
    if (req.body?.description !== undefined) {
      assignments.push('description = ?');
      params.push(String(req.body.description ?? '').trim() || null);
    }
    if (req.body?.startAt !== undefined) {
      const startAt = naiveDateTime(req.body.startAt);
      if (!startAt) throw new HttpError(400, 'A valid start date and time is required');
      assignments.push('start_at = ?');
      params.push(startAt);
    }
    if (req.body?.endAt !== undefined) {
      const endAt = naiveDateTime(req.body.endAt);
      assignments.push('end_at = ?');
      params.push(endAt);
    }
    if (req.body?.allDay !== undefined) {
      assignments.push('all_day = ?');
      params.push(req.body.allDay ? 1 : 0);
    }
    if (req.body?.color !== undefined) {
      assignments.push('color = ?');
      params.push(COLOR_PATTERN.test(String(req.body.color)) ? req.body.color : existing.color);
    }

    if (!assignments.length) throw new HttpError(400, 'Nothing to update');

    params.push(id);
    await schemaQuery(
      req.user.id,
      `UPDATE schedule_events SET ${assignments.join(', ')} WHERE id = ?`,
      params
    );

    const event = mapEvent(await findEvent(req.user.id, id), ownerFrom(req.user));

    // No recordActivity() on this path — an edit was never part of the activity trail. The
    // notification is here because a moved schedule is exactly the kind of change a teammate
    // needs to hear about.
    await notifyTeam(req.user.id, {
      type: 'schedule.updated',
      entityType: 'schedule_event',
      entityId: id,
      title: `${req.user.fullName} updated a schedule`,
      body: `${event.title} · ${String(event.startAt).slice(0, 16)}`,
      link: '/schedule',
    });

    res.json({ event });
  })
);

router.delete(
  '/:id',
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const existing = await findEvent(req.user.id, id);
    if (!existing) throw new HttpError(404, 'Event not found');

    await schemaQuery(req.user.id, 'DELETE FROM schedule_events WHERE id = ?', [id]);
    await recordActivity(req.user.id, 'SCHEDULE_DELETED', `Removed "${existing.title}"`, clientIp(req));

    await notifyTeam(req.user.id, {
      type: 'schedule.deleted',
      entityType: 'schedule_event',
      entityId: id,
      title: `${req.user.fullName} removed a schedule`,
      body: existing.title,
      link: '/schedule',
    });

    res.json({ ok: true });
  })
);

export default router;
