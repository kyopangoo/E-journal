import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Icon } from '../components/Icons.jsx';
import {
  Avatar,
  EmptyState,
  Hero,
  Loading,
  Notice,
  Panel,
  Split,
  Stats,
  formatDateTime,
  relativeTime,
} from '../components/ui.jsx';

const WINDOWS = [
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
];

// The wording for each level comes from the API (it is shared with the PDF report), so this
// only maps a level onto an existing badge tone: ok / neutral / warn.
const LEVEL_TONES = {
  high: 'ok',
  medium: 'neutral',
  low: 'warn',
  idle: 'warn',
  never: 'warn',
};

function dateKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

// Mirrors formatScore() in server/lib/metrics.js. The half-point weights mean a score can
// land on 58.5, which JS also likes to render as 58.50000000000001.
function score(value) {
  return String(Math.round((Number(value) || 0) * 100) / 100);
}

// The API only reports days that actually saw a contribution. Padding the gaps here keeps
// the strip honest — a quiet week has to look quiet — and uses the viewer's own calendar
// day rather than the server's, which may sit in another timezone.
function densifyTrend(sparse, days) {
  const points = new Map(sparse.map((row) => [String(row.date).slice(0, 10), row.points]));
  const today = new Date();
  const series = [];

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset);
    const key = dateKey(day);
    series.push({ date: key, points: points.get(key) ?? 0 });
  }

  return series;
}

// One place decides how a contribution opens: discussions and assignments stay in the app,
// articles point at the original link, certifications have nowhere to go.
function ContributionLink({ entry, children }) {
  if (!entry.link) return <span className="contrib__title">{children}</span>;

  const external = /^https?:\/\//i.test(entry.link);
  if (external) {
    return (
      <a className="contrib__title" href={entry.link} target="_blank" rel="noreferrer">
        {children}
        <Icon name="external" size={13} />
      </a>
    );
  }

  return (
    <Link className="contrib__title" to={entry.link}>
      {children}
    </Link>
  );
}

export default function DashboardPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedId, setSelectedId] = useState(null);
  const [entries, setEntries] = useState([]);
  const [entriesLoading, setEntriesLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await api.get(`/dashboard?days=${days}`);
      setData(payload);
      setError('');
      // Drop the drill-down if the person it pointed at is no longer in the ranking.
      setSelectedId((current) =>
        current && payload.staff.some((row) => row.user.id === current) ? current : null
      );
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  // Keyed on the id alone so refreshing the table does not re-fetch the same list.
  useEffect(() => {
    if (!selectedId) {
      setEntries([]);
      return undefined;
    }

    let cancelled = false;
    setEntriesLoading(true);

    api
      .get(`/dashboard/staff/${selectedId}/contributions?limit=60`)
      .then((payload) => {
        if (!cancelled) setEntries(payload.entries);
      })
      .catch((fetchError) => {
        if (!cancelled) setError(fetchError.message);
      })
      .finally(() => {
        if (!cancelled) setEntriesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const staffRows = data?.staff ?? [];
  const selected = staffRows.find((row) => row.user.id === selectedId) ?? null;

  const metrics = data?.metrics ?? [];
  const metricByKey = useMemo(
    () => new Map(metrics.map((metric) => [metric.key, metric])),
    [metrics]
  );

  const trend = useMemo(() => (data ? densifyTrend(data.team.trend, days) : []), [data, days]);
  const trendPeak = useMemo(
    () => trend.reduce((peak, point) => Math.max(peak, point.points), 0),
    [trend]
  );

  // Weighted, to match the score — the bars below the table are points, not raw counts.
  const metricRows = useMemo(() => {
    if (!data) return [];
    return metrics.map((metric) => ({
      ...metric,
      points: (data.team.totals[metric.key] ?? 0) * metric.weight,
    }));
  }, [data, metrics]);
  const metricPeak = metricRows.reduce((peak, row) => Math.max(peak, row.points), 0);

  const maxScore = staffRows[0]?.score ?? 0;

  return (
    <>
      <Hero
        eyebrow="Insight"
        title="Staff Dashboard"
        lead="What each staff member has contributed — forum replies, e-learning work, articles, and certifications."
        chips={['Admin only', `${days}-day window`]}
        stats={[
          { label: 'staff', value: data ? data.team.staffCount : '—' },
          { label: 'contributing', value: data ? data.team.reportingCount : '—' },
          { label: 'gone quiet', value: data ? data.team.idleCount : '—' },
          { label: 'score', value: data ? score(data.team.totalScore) : '—' },
        ]}
        actions={
          <>
            <label className="row" style={{ gap: 8 }}>
              <span className="meta">Window</span>
              <select
                className="select"
                value={days}
                onChange={(event) => setDays(Number(event.target.value))}
                style={{ width: 152 }}
                aria-label="Reporting window"
              >
                {WINDOWS.map((option) => (
                  <option key={option.days} value={option.days}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {/* A plain link, not fetch() — the browser carries the auth cookie itself, and
                downloading is exactly what an <a> does best. */}
            <a
              className="btn btn--primary"
              href={`/api/dashboard/report.pdf?days=${days}`}
              title={`Download the ${days}-day staff report as PDF`}
            >
              <Icon name="download" size={16} />
              Download report
            </a>
          </>
        }
      />

      <Notice tone="error">{error}</Notice>

      {/* Volume, not points — how many of each thing happened. The rail below converts these
          into the weighted points the score is actually made of. */}
      <Stats
        items={metrics.map((metric) => ({
          label: metric.label,
          value: data ? (data.team.totals[metric.key] ?? 0) : '—',
        }))}
      />

      <Split
        aside={
          <>
            <Panel
              title="Where the work goes"
              subtitle="Score contributed by each activity"
            >
              {loading ? (
                <Loading label="Loading score" />
              ) : metricPeak === 0 ? (
                <p className="muted">Nothing contributed in this window.</p>
              ) : (
                <div className="bars">
                  {metricRows.map((row) => (
                    <div className="bar-row" key={row.key}>
                      <span className="bar-row__head">
                        <span className="truncate">
                          {row.label} <span className="muted">×{score(row.weight)}</span>
                        </span>
                        <span className="bar-row__value">{score(row.points)}</span>
                      </span>
                      <div className="progress-bar">
                        <div
                          className="progress-bar__fill"
                          style={{
                            width: `${metricPeak ? Math.round((row.points / metricPeak) * 100) : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel
              title="Daily score"
              subtitle={`Score earned per day, last ${days} days`}
            >
              {loading ? (
                <Loading label="Loading trend" />
              ) : trendPeak === 0 ? (
                <p className="muted">Nothing contributed in this window.</p>
              ) : (
                <>
                  <div
                    className="spark"
                    role="img"
                    aria-label={`Daily staff score over the last ${days} days, busiest day ${trendPeak}`}
                  >
                    {trend.map((point) => (
                      <span
                        key={point.date}
                        className={`spark__bar${point.points ? '' : ' spark__bar--zero'}`}
                        style={{
                          height: point.points
                            ? `${Math.max(6, Math.round((point.points / trendPeak) * 100))}%`
                            : '3%',
                        }}
                        title={`${point.date}: score ${score(point.points)}`}
                      />
                    ))}
                  </div>
                  <p className="meta" style={{ marginTop: 8 }}>
                    {trend[0]?.date} → {trend[trend.length - 1]?.date} · busiest{' '}
                    {score(trendPeak)}/day
                  </p>
                </>
              )}
            </Panel>

            <Panel title="How the score works">
              <p className="muted" style={{ marginBottom: 10 }}>
                Only four things count, and they are not worth the same. Each one is multiplied
                by its weight before the score goes up, so a certification moves the score
                further than a single reply.
              </p>
              <ul className="score-legend">
                {metrics.map((metric) => (
                  <li key={metric.key}>
                    <span>{metric.label}</span>
                    <span className="score-legend__value">×{score(metric.weight)}</span>
                  </li>
                ))}
              </ul>
              <p className="muted" style={{ marginTop: 10 }}>
                Sign-ins, schedule entries, and appearance changes are recorded by the app but
                deliberately not scored. A member reads as <strong>gone quiet</strong> once
                they have gone 7 days without contributing, whatever their score.
              </p>
            </Panel>
          </>
        }
      >
        <Panel
          title="Staff contributions"
          subtitle={`Ranked by score over the last ${days} days — select a row to see what that member produced.`}
        >
          {loading ? (
            <Loading label="Measuring staff contributions" />
          ) : staffRows.length === 0 ? (
            <EmptyState
              icon="users"
              title="No staff accounts"
              hint="Active staff members will be measured here."
            />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Staff</th>
                    <th>Score</th>
                    <th>State</th>
                    {/* The weight sits in the header because the count columns deliberately
                        do not add up to the score any more. */}
                    {metrics.map((metric) => (
                      <th key={metric.key}>
                        {metric.short} <span className="muted">×{score(metric.weight)}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {staffRows.map((row) => {
                    const isSelected = row.user.id === selectedId;
                    return (
                      <tr
                        key={row.user.id}
                        className={`kpi-row${isSelected ? ' is-selected' : ''}`}
                        onClick={() => setSelectedId(isSelected ? null : row.user.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setSelectedId(isSelected ? null : row.user.id);
                          }
                        }}
                        tabIndex={0}
                        role="button"
                        aria-pressed={isSelected}
                      >
                        <td className="kpi-row__rank">{row.rank}</td>
                        <td>
                          <span className="kpi-person">
                            <Avatar name={row.user.fullName} size={32} />
                            <span className="kpi-person__text">
                              <span className="kpi-person__name">{row.user.fullName}</span>
                              <span className="kpi-person__handle">@{row.user.username}</span>
                            </span>
                          </span>
                        </td>
                        <td>
                          <span className="kpi-score">{score(row.score)}</span>
                          <span className="kpi-score__track" aria-hidden="true">
                            <span
                              className="kpi-score__fill"
                              style={{
                                width: `${maxScore ? Math.round((row.score / maxScore) * 100) : 0}%`,
                              }}
                            />
                          </span>
                        </td>
                        <td>
                          <span className={`badge badge--${LEVEL_TONES[row.level] ?? 'neutral'}`}>
                            {row.levelLabel ?? row.level}
                          </span>
                        </td>
                        {metrics.map((metric) => (
                          <td className="kpi-num" key={metric.key}>
                            {row.counts[metric.key]}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        {selected ? (
          <Panel
            title={`${selected.user.fullName} — contributions`}
            subtitle="Newest first, across the four counted activities."
            actions={
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setSelectedId(null)}
              >
                <Icon name="close" size={15} />
                Close
              </button>
            }
          >
            {entriesLoading ? (
              <Loading label="Loading contributions" />
            ) : entries.length === 0 ? (
              <EmptyState
                icon="dot"
                title="Nothing contributed yet"
                hint="This member has not replied, posted, shared an article, or added a certification."
              />
            ) : (
              <div className="contrib-list">
                {entries.map((entry, index) => {
                  const metric = metricByKey.get(entry.type);
                  return (
                    <article
                      className="contrib"
                      key={entry.key}
                      style={{ animationDelay: `${Math.min(index * 20, 240)}ms` }}
                    >
                      <span className="contrib__icon">
                        <Icon name={metric?.icon ?? 'dot'} size={16} />
                      </span>
                      <div className="contrib__body">
                        <div className="contrib__head">
                          <span className="badge badge--neutral">{metric?.label ?? entry.type}</span>
                          <span className="meta">{relativeTime(entry.createdAt)}</span>
                        </div>
                        <ContributionLink entry={entry}>{entry.title}</ContributionLink>
                        {entry.detail ? <p className="contrib__detail">{entry.detail}</p> : null}
                      </div>
                      <span className="contrib__time">{formatDateTime(entry.createdAt)}</span>
                    </article>
                  );
                })}
              </div>
            )}
          </Panel>
        ) : null}
      </Split>

      <button
        type="button"
        className="scroll-to-bottom"
        title="Scroll to bottom"
        onClick={() => {
          window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        }}
      >
        <Icon name="down" size={16} />
      </button>
    </>
  );
}
