// The single definition of what "keaktifan" means on the staff dashboard. Shared by the
// JSON API (server/routes/dashboard.js) and the PDF report (server/lib/report.js) so the
// screen and the download can never disagree.
//
// The admin defined it as exactly these four: forum replies, e-learning work, articles and
// certifications. Everything else the app records (sign-ins, schedule entries, appearance
// changes) is deliberately not scored.
//
// They are not worth the same: a certification is a bigger piece of work than a one-line
// reply, and the weight column is what says so.
export const METRICS = [
  { key: 'forumReplies', label: 'Forum replies', short: 'replies', icon: 'forum', weight: 1 },
  { key: 'elearningPosts', label: 'E-Learning work', short: 'e-learn', icon: 'book', weight: 1.5 },
  { key: 'articles', label: 'Articles', short: 'articles', icon: 'article', weight: 2 },
  { key: 'certifications', label: 'Certifications', short: 'certs', icon: 'certificate', weight: 3 },
];

export const METRIC_KEYS = METRICS.map((metric) => metric.key);

// The weights carry a half point, so a straight sum can land on 0.30000000000000004.
// Scoring and formatting live here, next to the weights, so the two always agree.
export function scoreFor(counts) {
  const total = METRICS.reduce(
    (sum, metric) => sum + (Number(counts[metric.key]) || 0) * metric.weight,
    0
  );
  return Math.round(total * 100) / 100;
}

export function formatScore(value) {
  return String(Math.round((Number(value) || 0) * 100) / 100);
}

// A member with no contribution for longer than this reads as gone quiet, whatever their
// total inside the window.
export const IDLE_AFTER_DAYS = 7;

export const LEVEL_LABELS = {
  high: 'Active',
  medium: 'Steady',
  low: 'Light',
  idle: 'Gone quiet',
  never: 'Never contributed',
};
