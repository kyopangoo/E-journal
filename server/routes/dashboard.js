import { Router } from 'express';
import { userSchemaName } from '../config.js';
import { connectServer, query } from '../db.js';
import { HttpError, wrap } from '../lib/http.js';
import { IDLE_AFTER_DAYS, LEVEL_LABELS, METRICS, METRIC_KEYS, scoreFor } from '../lib/metrics.js';
import { buildStaffReportPdf, PDF_MIME, reportFileStamp } from '../lib/report.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { assertSchemaName, ensureUserSchema, schemaQuery } from '../schema.js';

const router = Router();

// This page reads other members' contribution records, so the guard sits on the whole
// router rather than on individual routes — the same shape the archive/users routers use.
router.use(requireAuth);
router.use(requireAdmin);

const WINDOWS = [7, 30, 90];
const DEFAULT_WINDOW = 30;

const DAY_MS = 86_400_000;

function clampDays(value) {
  const requested = Number(value);
  return WINDOWS.includes(requested) ? requested : DEFAULT_WINDOW;
}

function clampLimit(value, fallback) {
  const requested = Number(value);
  return Number.isFinite(requested)
    ? Math.min(Math.max(Math.trunc(requested), 1), 200)
    : fallback;
}

// Timestamps arrive as "YYYY-MM-DD HH:MM:SS" in WIB because the pool sets
// dateStrings:true and timezone +07:00 — same handling as relativeTime() in ui.jsx.
function daysSince(value) {
  if (!value) return null;
  const timestamp = new Date(`${String(value).replace(' ', 'T')}+07:00`).getTime();
  if (Number.isNaN(timestamp)) return null;
  return Math.max(0, Math.floor((Date.now() - timestamp) / DAY_MS));
}

function latestOf(...values) {
  return values
    .filter(Boolean)
    .reduce((latest, value) => (!latest || value > latest ? value : latest), null);
}

// Banding is relative to the busiest member rather than to fixed cut-offs, so the labels
// keep their meaning on a two-person team and on a fifty-person one.
//
// `daysSince` is null only when the member has no contribution on record at all — so that,
// not a zero score inside the window, is what "never" means. Someone who contributed last
// month but nothing this week is idle, not a first-timer.
function levelFor(row, topScore) {
  if (row.idleDays === null) return 'never';
  if (row.idleDays > IDLE_AFTER_DAYS) return 'idle';
  if (!topScore) return 'low';
  const share = row.score / topScore;
  if (share >= 0.6) return 'high';
  if (share >= 0.25) return 'medium';
  return 'low';
}

// Certifications are the only one of the four that lives in a member's own schema, so this
// is the only per-member query the dashboard needs. schemaQuery() opens a fresh connection
// per call; holding one connection here covers both the count and the daily breakdown.
async function readCertifications(userId, days) {
  const schema = assertSchemaName(userSchemaName(userId));
  // ensureUserSchema() is what schemaQuery() would run anyway; calling it first means the
  // connection below can be opened directly without risking a missing schema.
  await ensureUserSchema(userId);

  const connection = await connectServer();
  try {
    await connection.query(`USE \`${schema}\``);

    const [[counted]] = await connection.execute(
      `SELECT COUNT(*) AS n, MAX(created_at) AS lastAt FROM certifications
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [days]
    );

    // Unwindowed on purpose: the point of "gone quiet" is to surface someone whose last
    // contribution predates the window entirely.
    const [[everLast]] = await connection.execute(
      'SELECT MAX(created_at) AS lastAt FROM certifications'
    );

    const [daily] = await connection.execute(
      `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS date, COUNT(*) AS n
         FROM certifications
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        GROUP BY date`,
      [days]
    );

    return {
      count: Number(counted?.n ?? 0),
      lastAt: everLast?.lastAt ?? null,
      daily,
    };
  } finally {
    await connection.end();
  }
}

function emptyTeam() {
  return {
    staffCount: 0,
    reportingCount: 0,
    idleCount: 0,
    neverCount: 0,
    totalScore: 0,
    totals: Object.fromEntries(METRIC_KEYS.map((key) => [key, 0])),
    trend: [],
  };
}

// Shared by the JSON endpoint and the PDF report so the two can never drift apart.
async function collectReport(days) {
  const staff = await query(
    `SELECT id, username, full_name AS fullName, avatar
       FROM users
      WHERE role = 'staff' AND is_active = 1
      ORDER BY full_name`
  );

  if (!staff.length) {
    return { window: { days, options: WINDOWS }, metrics: METRICS, staff: [], team: emptyTeam() };
  }

  // Three of the four metrics live in the central db and carry user_id, so a windowed count
  // and an all-time "last contribution" each cost one grouped query for the whole team
  // rather than one per member.
  //
  // Every one of them is filtered to the staff ids. Admins reply in the forum and work
  // through e-learning too, and without this filter the per-day series counted their rows
  // while the table did not — so the bars added up to more than the total above them.
  const staffIds = staff.map((person) => person.id);
  const staffOnly = `user_id IN (${staffIds.map(() => '?').join(', ')})`;

  const queryWindow = (table) =>
    query(
      `SELECT user_id AS userId, COUNT(*) AS n FROM ${table}
        WHERE ${staffOnly} AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        GROUP BY user_id`,
      [...staffIds, days]
    );
  const queryLast = (table) =>
    query(
      `SELECT user_id AS userId, MAX(created_at) AS at FROM ${table}
        WHERE ${staffOnly} GROUP BY user_id`,
      staffIds
    );
  const queryDaily = (table) =>
    query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS date, COUNT(*) AS n FROM ${table}
        WHERE ${staffOnly} AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        GROUP BY date`,
      [...staffIds, days]
    );

  const [replyRows, postRows, articleRows, lastReply, lastPost, lastArticle, replyDaily, postDaily, articleDaily] =
    await Promise.all([
      queryWindow('forum_replies'),
      queryWindow('elearning_posts'),
      queryWindow('articles'),
      queryLast('forum_replies'),
      queryLast('elearning_posts'),
      queryLast('articles'),
      queryDaily('forum_replies'),
      queryDaily('elearning_posts'),
      queryDaily('articles'),
    ]);

  const indexByUser = (rows) => new Map(rows.map((row) => [Number(row.userId), Number(row.n)]));
  const lastByUser = (rows) => new Map(rows.map((row) => [Number(row.userId), row.at ?? null]));

  const replyCounts = indexByUser(replyRows);
  const postCounts = indexByUser(postRows);
  const articleCounts = indexByUser(articleRows);

  const replyLast = lastByUser(lastReply);
  const postLast = lastByUser(lastPost);
  const articleLast = lastByUser(lastArticle);

  // The daily series is weighted like the score, so the bars add up to the headline figure
  // instead of to a second, unexplained one.
  const weightOf = (key) => METRICS.find((metric) => metric.key === key)?.weight ?? 1;
  const byDayPoints = new Map();
  const addDaily = (rows, weight) => {
    for (const row of rows) {
      byDayPoints.set(row.date, (byDayPoints.get(row.date) ?? 0) + Number(row.n) * weight);
    }
  };

  addDaily(replyDaily, weightOf('forumReplies'));
  addDaily(postDaily, weightOf('elearningPosts'));
  addDaily(articleDaily, weightOf('articles'));

  const people = [];

  // Sequential on purpose: each member needs a connection of their own, and the staff list
  // is small enough that serialising keeps the pool from being drained at once.
  for (const person of staff) {
    const certifications = await readCertifications(person.id, days);

    addDaily(certifications.daily, weightOf('certifications'));

    const counts = {
      forumReplies: replyCounts.get(person.id) ?? 0,
      elearningPosts: postCounts.get(person.id) ?? 0,
      articles: articleCounts.get(person.id) ?? 0,
      certifications: certifications.count,
    };

    // Latest contribution across all four sources — not a sign-in, so "gone quiet" means
    // "has stopped contributing".
    const lastContribAt = latestOf(
      replyLast.get(person.id),
      postLast.get(person.id),
      articleLast.get(person.id),
      certifications.lastAt
    );

    people.push({
      user: {
        id: person.id,
        fullName: person.fullName,
        username: person.username,
        avatar: person.avatar,
      },
      counts,
      score: scoreFor(counts),
      lastContribAt,
      idleDays: daysSince(lastContribAt),
    });
  }

  people.sort((a, b) => b.score - a.score || a.user.fullName.localeCompare(b.user.fullName));
  const topScore = people[0]?.score ?? 0;
  people.forEach((person, index) => {
    person.rank = index + 1;
    person.level = levelFor(person, topScore);
    // Sent alongside the raw level so the screen and the PDF print the same words.
    person.levelLabel = LEVEL_LABELS[person.level];
  });

  const totals = Object.fromEntries(
    METRIC_KEYS.map((key) => [key, people.reduce((sum, person) => sum + person.counts[key], 0)])
  );

  return {
    window: { days, options: WINDOWS },
    metrics: METRICS,
    staff: people,
    team: {
      staffCount: people.length,
      // "Reporting" counts anyone who produced something inside the window; idleCount is
      // about the gap since their last contribution. Both are shown, they differ.
      reportingCount: people.filter((person) => person.score > 0).length,
      idleCount: people.filter((person) => person.level === 'idle' || person.level === 'never')
        .length,
      neverCount: people.filter((person) => person.level === 'never').length,
      // Scored off the column totals rather than by adding up the rows, so the headline
      // figure is provably the same number the metric columns add up to.
      totalScore: scoreFor(totals),
      totals,
      trend: [...byDayPoints.entries()]
        .map(([date, points]) => ({ date, points }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    },
  };
}

function excerpt(value, max = 180) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

// One member's contributions across the four counted sources, newest first. Used by both
// the drill-down panel and the PDF report.
async function collectContributions(userId, limit) {
  // Each source is capped at the limit before merging, so a member with a thousand replies
  // cannot drown out their articles in the combined list.
  const [replies, posts, articles, certifications] = await Promise.all([
    query(
      `SELECT r.id, r.created_at AS createdAt, r.body, t.id AS threadId, t.title AS threadTitle
         FROM forum_replies r
         JOIN forum_threads t ON t.id = r.thread_id
        WHERE r.user_id = ?
        ORDER BY r.created_at DESC, r.id DESC
        LIMIT ${limit}`,
      [userId]
    ),
    query(
      `SELECT p.id, p.created_at AS createdAt, p.body,
              q.prompt AS questionPrompt, a.id AS assignmentId, a.title AS assignmentTitle
         FROM elearning_posts p
         JOIN elearning_questions q ON q.id = p.question_id
         JOIN elearning_assignments a ON a.id = q.assignment_id
        WHERE p.user_id = ?
        ORDER BY p.created_at DESC, p.id DESC
        LIMIT ${limit}`,
      [userId]
    ),
    query(
      `SELECT id, created_at AS createdAt, title, url FROM articles
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT ${limit}`,
      [userId]
    ),
    schemaQuery(
      userId,
      `SELECT id, created_at AS createdAt, name, issuer FROM certifications
        ORDER BY created_at DESC, id DESC
        LIMIT ${limit}`
    ),
  ]);

  const entries = [
    ...replies.map((row) => ({
      key: `reply-${row.id}`,
      type: 'forumReplies',
      createdAt: row.createdAt,
      title: row.threadTitle,
      detail: excerpt(row.body),
      link: `/forum/${row.threadId}`,
    })),
    ...posts.map((row) => ({
      key: `post-${row.id}`,
      type: 'elearningPosts',
      createdAt: row.createdAt,
      title: row.assignmentTitle,
      detail: excerpt(row.body),
      link: `/e-learning/${row.assignmentId}`,
    })),
    ...articles.map((row) => ({
      key: `article-${row.id}`,
      type: 'articles',
      createdAt: row.createdAt,
      title: row.title,
      detail: row.url,
      link: row.url,
    })),
    ...certifications.map((row) => ({
      key: `cert-${row.id}`,
      type: 'certifications',
      createdAt: row.createdAt,
      title: row.name,
      detail: row.issuer ?? '',
      link: null,
    })),
  ];

  entries.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  return { entries: entries.slice(0, limit), total: entries.length };
}

router.get(
  '/',
  wrap(async (req, res) => {
    res.json(await collectReport(clampDays(req.query.days)));
  })
);

// The downloadable report. Bounded on purpose: each member's detail list is capped so a
// single prolific contributor cannot turn the PDF into hundreds of pages.
const REPORT_DETAIL_LIMIT = 30;

router.get(
  '/report.pdf',
  wrap(async (req, res) => {
    const days = clampDays(req.query.days);
    const report = await collectReport(days);

    const details = new Map();
    for (const person of report.staff) {
      const { entries } = await collectContributions(person.user.id, REPORT_DETAIL_LIMIT + 1);
      details.set(person.user.id, {
        entries: entries.slice(0, REPORT_DETAIL_LIMIT),
        truncated: entries.length > REPORT_DETAIL_LIMIT,
      });
    }

    const generatedAt = new Date();
    const pdf = await buildStaffReportPdf({
      report,
      details,
      days,
      generatedBy: req.user.fullName,
      generatedAt,
      detailLimit: REPORT_DETAIL_LIMIT,
    });

    // Every report for the same window shares one URL, and a streamed body carries no ETag
    // and no Last-Modified — so without this the browser is free to hand back the copy it
    // downloaded earlier. That reads as "the report ignores new activity" even though the
    // data underneath is current. The JSON routes never hit this because res.json() sets an
    // ETag and the browser revalidates.
    res.setHeader('Cache-Control', 'no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Content-Type', PDF_MIME);
    res.setHeader('Content-Length', pdf.length);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="e-journey-staff-report-${days}d-${reportFileStamp(generatedAt)}.pdf"`
    );
    res.end(pdf);
  })
);

// The drill-down behind a table row.
router.get(
  '/staff/:id/contributions',
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid member id');

    const rows = await query(
      `SELECT id, username, full_name AS fullName, role, avatar
         FROM users WHERE id = ? AND is_active = 1 LIMIT 1`,
      [id]
    );
    if (!rows.length) throw new HttpError(404, 'Member not found');

    const limit = clampLimit(req.query.limit, 60);
    const { entries, total } = await collectContributions(id, limit);

    res.json({ user: rows[0], metrics: METRICS, entries, total });
  })
);

export default router;
