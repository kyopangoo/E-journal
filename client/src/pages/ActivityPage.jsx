import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { Icon } from '../components/Icons.jsx';
import {
  EmptyState,
  Hero,
  Loading,
  Notice,
  Panel,
  Split,
  formatDateTime,
  relativeTime,
} from '../components/ui.jsx';

const LIMITS = [25, 60, 120, 200];

function dateKey(value) {
  if (value instanceof Date) {
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${value.getFullYear()}-${month}-${day}`;
  }

  const text = String(value ?? '');
  const direct = text.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct;

  const parsed = new Date(text.replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) return '';
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${parsed.getFullYear()}-${month}-${day}`;
}

export default function ActivityPage() {
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(60);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get(`/activity?limit=${limit}`);
      setEntries(data.entries);
      setTotal(data.total);
      setError('');
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    load();
  }, [load]);

  const today = dateKey(new Date());

  const breakdown = useMemo(() => {
    const counts = new Map();
    for (const entry of entries) {
      counts.set(entry.action, (counts.get(entry.action) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [entries]);

  const todayCount = useMemo(
    () => entries.filter((entry) => dateKey(entry.createdAt) === today).length,
    [entries, today]
  );

  const topCount = breakdown[0]?.count ?? 0;

  return (
    <>
      <Hero
        eyebrow="Audit"
        title="Activity History"
        lead="Everything you have done in this workspace, newest first — sign-ins, discussions, submissions, and schedule changes."
        chips={['Timeline', 'Newest first']}
        stats={[
          { label: 'recorded', value: total },
          { label: 'in view', value: entries.length },
          { label: 'today', value: todayCount },
        ]}
        actions={
          <label className="row" style={{ gap: 8 }}>
            <span className="meta">Show</span>
            <select
              className="select"
              value={limit}
              onChange={(event) => setLimit(Number(event.target.value))}
              style={{ width: 132 }}
              aria-label="Number of entries to show"
            >
              {LIMITS.map((value) => (
                <option key={value} value={value}>
                  {value} entries
                </option>
              ))}
            </select>
          </label>
        }
      />

      <Notice tone="error">{error}</Notice>

      <Split
        aside={
          <>
            <Panel title="Breakdown" subtitle="Action types in this view">
              {breakdown.length === 0 ? (
                <p className="muted">Nothing recorded yet.</p>
              ) : (
                <div className="bars">
                  {breakdown.map((row) => (
                    <div className="bar-row" key={row.action}>
                      <span className="bar-row__head">
                        <span className="truncate">{row.action.replaceAll('_', ' ')}</span>
                        <span className="bar-row__value">{row.count}</span>
                      </span>
                      <div className="progress-bar">
                        <div
                          className="progress-bar__fill"
                          style={{ width: `${topCount ? Math.round((row.count / topCount) * 100) : 0}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="About this log">
              <p className="muted">
                Entries are written as you work and keep their timestamp and IP address, so this
                page doubles as a personal audit trail.
              </p>
            </Panel>
          </>
        }
      >
        <Panel title="Timeline" subtitle={`${total} recorded action${total === 1 ? '' : 's'} in total`}>
          {loading ? (
            <Loading label="Loading activity" />
          ) : entries.length === 0 ? (
            <EmptyState
              icon="history"
              title="No activity yet"
              hint="Your actions — sign-ins, discussions, submissions — will appear here."
            />
          ) : (
            <div className="timeline">
              {entries.map((entry, index) => (
                <div
                  className="timeline__item"
                  key={entry.id}
                  style={{ animationDelay: `${Math.min(index * 25, 300)}ms` }}
                >
                  <span className="timeline__dot" />
                  <p className="timeline__action">{entry.action.replaceAll('_', ' ')}</p>
                  {entry.detail ? <p className="timeline__detail">{entry.detail}</p> : null}
                  <p className="timeline__time">
                    {formatDateTime(entry.createdAt)} · {relativeTime(entry.createdAt)}
                    {entry.ipAddress ? ` · ${entry.ipAddress}` : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Panel>
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
