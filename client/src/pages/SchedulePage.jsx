import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Icon } from '../components/Icons.jsx';
import { EmptyState, Notice, Panel } from '../components/ui.jsx';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const COLORS = ['#FFEB3B', '#FF5252', '#2196F3', '#FF9800', '#4CAF50'];

const VIEWS = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
];

const HOUR_HEIGHT = 46;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

function dateKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function startOfWeek(date) {
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay());
  start.setHours(0, 0, 0, 0);
  return start;
}

function buildMonthGrid(year, month) {
  const firstOfMonth = new Date(year, month, 1);
  const start = new Date(firstOfMonth);
  start.setDate(1 - firstOfMonth.getDay());

  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

function timeOf(value) {
  return String(value ?? '').slice(11, 16);
}

function minutesOf(value, fallback) {
  const hour = Number(String(value ?? '').slice(11, 13));
  const minute = Number(String(value ?? '').slice(14, 16));
  if (Number.isNaN(hour) || Number.isNaN(minute)) return fallback;
  return hour * 60 + minute;
}

function eventSpan(event) {
  const start = minutesOf(event.startAt, 9 * 60);
  const end = event.endAt ? minutesOf(event.endAt, start + 60) : start + 60;
  return { start, end: end > start ? end : start + 30 };
}

function emptyDraft(dayKey) {
  return {
    title: '',
    description: '',
    date: dayKey,
    startTime: '09:00',
    endTime: '10:00',
    allDay: false,
    color: COLORS[0],
  };
}

function dayLabel(key) {
  const [year, month, day] = String(key).split('-').map(Number);
  if (!year || !month || !day) return key;
  const date = new Date(year, month - 1, day);
  return `${WEEKDAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]} ${year}`;
}

export default function SchedulePage() {
  const { user } = useAuth();
  const today = useMemo(() => new Date(), []);
  const todayKey = dateKey(today);

  const [view, setView] = useState('month');
  const [anchor, setAnchor] = useState(() => new Date());
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedDay, setSelectedDay] = useState(todayKey);
  const [draft, setDraft] = useState(() => emptyDraft(todayKey));
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  const visibleDays = useMemo(() => {
    if (view === 'month') return buildMonthGrid(anchor.getFullYear(), anchor.getMonth());
    if (view === 'week') {
      const start = startOfWeek(anchor);
      return Array.from({ length: 7 }, (_, index) => addDays(start, index));
    }
    return [new Date(anchor)];
  }, [view, anchor]);

  const rangeLabel = useMemo(() => {
    if (view === 'month') return `${MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`;
    if (view === 'week') {
      const first = visibleDays[0];
      const last = visibleDays[visibleDays.length - 1];
      const sameMonth = first.getMonth() === last.getMonth();
      return sameMonth
        ? `${MONTHS[first.getMonth()]} ${first.getDate()} – ${last.getDate()}, ${first.getFullYear()}`
        : `${MONTHS[first.getMonth()].slice(0, 3)} ${first.getDate()} – ${MONTHS[last.getMonth()].slice(0, 3)} ${last.getDate()}, ${last.getFullYear()}`;
    }
    return `${WEEKDAYS[anchor.getDay()]}, ${MONTHS[anchor.getMonth()]} ${anchor.getDate()}, ${anchor.getFullYear()}`;
  }, [view, anchor, visibleDays]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const from = dateKey(visibleDays[0]);
      const to = dateKey(visibleDays[visibleDays.length - 1]);
      const data = await api.get(`/schedule?from=${from}&to=${to}`);
      setEvents(data.events);
      setError('');
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [visibleDays]);

  useEffect(() => {
    load();
  }, [load]);

  const eventsByDay = useMemo(() => {
    const grouped = new Map();
    for (const event of events) {
      if (!event || !event.id || !event.startAt) continue;
      const key = String(event.startAt).slice(0, 10);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(event);
    }
    return grouped;
  }, [events]);

  const selectedEvents = eventsByDay.get(selectedDay) ?? [];
  const todayEvents = eventsByDay.get(todayKey) ?? [];

  function shift(step) {
    setAnchor((current) => {
      if (view === 'month') return new Date(current.getFullYear(), current.getMonth() + step, 1);
      if (view === 'week') return addDays(current, step * 7);
      return addDays(current, step);
    });
  }

  function goToday() {
    setAnchor(new Date());
    selectDay(todayKey);
  }

  function selectDay(key) {
    setSelectedDay(key);
    setEditingId(null);
    setDraft(emptyDraft(key));
  }

  function selectSlot(key, hour) {
    setSelectedDay(key);
    setEditingId(null);
    setDraft({
      ...emptyDraft(key),
      startTime: `${String(hour).padStart(2, '0')}:00`,
      endTime: `${String(Math.min(hour + 1, 23)).padStart(2, '0')}:00`,
    });
  }

  // The calendar deliberately combines every member's events, but PATCH/DELETE
  // /schedule/:id only look inside the signed-in user's own schema (routes/schedule.js)
  // — so offering the editor for someone else's event could only ever 404.
  function canEdit(event) {
    return Boolean(event?.id) && event.ownerId === user?.id;
  }

  // Event ids are only unique inside each member's own schema while this list merges
  // everyone's, so React needs a composite key or same-numbered rows collide.
  function eventKey(event) {
    return `${event.ownerId}-${event.id}`;
  }

  function startEditing(event) {
    if (!canEdit(event)) return;
    setEditingId(event.id);
    setDraft({
      title: event.title,
      description: event.description ?? '',
      date: String(event.startAt).slice(0, 10),
      startTime: timeOf(event.startAt),
      endTime: event.endAt ? timeOf(event.endAt) : '',
      allDay: event.allDay,
      color: event.color,
    });
  }

  async function handleSubmit(submitEvent) {
    submitEvent.preventDefault();
    setSaving(true);
    setError('');

    const payload = {
      title: draft.title,
      description: draft.description,
      startAt: `${draft.date}T${draft.allDay ? '00:00' : draft.startTime}`,
      endAt: draft.allDay || !draft.endTime ? null : `${draft.date}T${draft.endTime}`,
      allDay: draft.allDay,
      color: draft.color,
    };

    try {
      if (editingId) {
        await api.patch(`/schedule/${editingId}`, payload);
      } else {
        await api.post('/schedule', payload);
      }
      setEditingId(null);
      setDraft(emptyDraft(draft.date));
      await load();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Remove this event from your calendar?')) return;
    try {
      await api.del(`/schedule/${id}`);
      if (editingId === id) {
        setEditingId(null);
        setDraft(emptyDraft(selectedDay));
      }
      await load();
    } catch (deleteError) {
      setError(deleteError.message);
    }
  }

  function renderTimedEvent(event) {
    if (!event || !event.id) return null;
    const { start, end } = eventSpan(event);
    const top = (start / 60) * HOUR_HEIGHT;
    const height = Math.max(((end - start) / 60) * HOUR_HEIGHT - 2, 24);
    const editable = canEdit(event);

    return (
      <button
        type="button"
        key={eventKey(event)}
        className={`timegrid__event${editable ? '' : ' timegrid__event--locked'}`}
        style={{ top, height, '--event-color': event.color }}
        onClick={(clickEvent) => {
          clickEvent.stopPropagation();
          startEditing(event);
        }}
        title={`${timeOf(event.startAt)} ${event.title}${
          event.ownerName ? ` by ${event.ownerName}` : ''
        }${editable ? '' : ' · read-only'}`}
      >
        <span className="timegrid__event-time">{timeOf(event.startAt)}</span>
        <span className="timegrid__event-title">{event.title} {event.ownerName ? `(${event.ownerName.split(' ')[0]})` : ''}</span>
      </button>
    );
  }

  function renderTimeGrid(days) {
    return (
      <div className="timegrid">
        <div className="timegrid__head" style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)` }}>
          <div className="timegrid__gutter" />
          {days.map((day) => {
            const key = dateKey(day);
            return (
              <button
                type="button"
                key={key}
                className={`timegrid__dayhead${key === todayKey ? ' is-today' : ''}${
                  key === selectedDay ? ' is-selected' : ''
                }`}
                onClick={() => selectDay(key)}
              >
                <span className="timegrid__dow">{WEEKDAYS[day.getDay()]}</span>
                <span className="timegrid__num">{day.getDate()}</span>
              </button>
            );
          })}
        </div>

        <div className="timegrid__allday" style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)` }}>
          <div className="timegrid__gutter">
            <span className="meta">all-day</span>
          </div>
          {days.map((day) => {
            const key = dateKey(day);
            const allDay = (eventsByDay.get(key) ?? []).filter((event) => event.allDay);
            return (
              <div className="timegrid__allday-cell" key={key}>
                {allDay.filter(event => event && event.id).map((event) => (
                  <button
                    type="button"
                    key={eventKey(event)}
                    className={`timegrid__allday-chip${
                      canEdit(event) ? '' : ' timegrid__allday-chip--locked'
                    }`}
                    style={{ '--event-color': event.color }}
                    onClick={() => startEditing(event)}
                    title={`${event.title}${event.ownerName ? ` by ${event.ownerName}` : ''}${
                      canEdit(event) ? '' : ' · read-only'
                    }`}
                  >
                    {event.title} {event.ownerName ? `(${event.ownerName.split(' ')[0]})` : ''}
                  </button>
                ))}
              </div>
            );
          })}
        </div>

        <div className="timegrid__scroll">
          <div className="timegrid__hours">
            {HOURS.map((hour) => (
              <div className="timegrid__hour" key={hour} style={{ height: HOUR_HEIGHT }}>
                <span>{String(hour).padStart(2, '0')}:00</span>
              </div>
            ))}
          </div>

          <div className="timegrid__cols" style={{ gridTemplateColumns: `repeat(${days.length}, 1fr)` }}>
            {days.map((day) => {
              const key = dateKey(day);
              const timed = (eventsByDay.get(key) ?? []).filter((event) => !event.allDay);

              return (
                <div className="timegrid__col" key={key}>
                  {HOURS.map((hour) => (
                    <div
                      className="timegrid__slot"
                      key={hour}
                      style={{ height: HOUR_HEIGHT }}
                      onClick={() => selectSlot(key, hour)}
                    />
                  ))}
                  {timed.map(renderTimedEvent)}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  function renderMonth() {
    return (
      <>
        <div className="calendar__weekdays">
          {WEEKDAYS.map((weekday, index) => (
            <div
              className={`calendar__weekday${
                index === 0 || index === 6 ? ' calendar__weekday--rest' : ''
              }`}
              key={weekday}
            >
              {weekday}
            </div>
          ))}
        </div>

        <div className="calendar__grid">
          {visibleDays.map((day) => {
            const key = dateKey(day);
            const dayEvents = eventsByDay.get(key) ?? [];
            const isWeekend = day.getDay() === 0 || day.getDay() === 6;
            const classes = [
              'calendar__day',
              day.getMonth() !== anchor.getMonth() ? 'calendar__day--muted' : '',
              isWeekend ? 'calendar__day--weekend' : '',
              key === todayKey ? 'calendar__day--today' : '',
              key === selectedDay ? 'calendar__day--selected' : '',
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <button
                type="button"
                key={key}
                className={classes}
                onClick={() => selectDay(key)}
                aria-pressed={key === selectedDay}
              >
                <span className="calendar__date">{day.getDate()}</span>

                <span className="calendar__events">
                  {dayEvents.filter(event => event && event.id).slice(0, 3).map((event) => (
                    <span
                      className="calendar__pill"
                      key={eventKey(event)}
                      style={{ '--event-color': event.color }}
                      title={`${event.title} · ${event.allDay ? 'all day' : timeOf(event.startAt)}${event.ownerName ? ` by ${event.ownerName}` : ''}`}
                    >
                      <span>{event.title}</span>
                    </span>
                  ))}
                  {dayEvents.length > 3 ? (
                    <span className="calendar__more">+{dayEvents.length - 3} more</span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      </>
    );
  }

  return (
    <div className="schedule">
      <header className="schedule__bar">
        <div>
          <p className="schedule__eyebrow">Schedule & Task</p>
          <div className="schedule__nav">
            <button type="button" className="icon-button" onClick={() => shift(-1)} aria-label="Previous">
              <Icon name="back" size={16} />
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() => shift(1)}
              aria-label="Next"
              style={{ transform: 'rotate(180deg)' }}
            >
              <Icon name="back" size={16} />
            </button>
            <h1 className="schedule__title">{rangeLabel}</h1>
            {loading ? <span className="meta">syncing…</span> : null}
          </div>

          <div className="schedule__stats">
            <span className="schedule__chip">{events.length} in view</span>
            <span className="schedule__chip">{todayEvents.length} today</span>
            <span className="schedule__chip">{selectedEvents.length} on selected day</span>
          </div>
        </div>

        <div className="schedule__actions">
          <div className="segmented">
            {VIEWS.map((item) => (
              <button
                type="button"
                key={item.id}
                className={view === item.id ? 'is-active' : ''}
                onClick={() => setView(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn--outline btn--sm" onClick={goToday}>
            Today
          </button>
        </div>
      </header>

      <Notice tone="error">{error}</Notice>

      <div className="schedule__body">
        <div className={`schedule__canvas${view === 'month' ? '' : ' schedule__canvas--time'}`}>
          {view === 'month' ? renderMonth() : renderTimeGrid(visibleDays)}
        </div>

        <aside className="schedule__rail">
          <Panel
            title={dayLabel(selectedDay)}
            subtitle={`${selectedEvents.length} event${selectedEvents.length === 1 ? '' : 's'}`}
          >
            {selectedEvents.length === 0 ? (
              <EmptyState icon="calendar" title="Nothing planned" hint="Add an activity for this date." />
            ) : (
              <div className="stack" style={{ gap: 8 }}>
                {selectedEvents.filter(event => event && event.id).map((event) => (
                  <div className="event-row" key={eventKey(event)}>
                    <span className="event-row__swatch" style={{ background: event.color }} />
                    <div className="event-row__body">
                      <strong>{event.title}</strong>
                      <p className="meta">
                        {event.allDay
                          ? 'All day'
                          : `${timeOf(event.startAt)}${event.endAt ? ` – ${timeOf(event.endAt)}` : ''}`}
                        {event.ownerName ? (
                          <span> · Created by {event.ownerName}</span>
                        ) : null}
                      </p>
                      {event.description ? <p className="muted">{event.description}</p> : null}
                    </div>
                    {canEdit(event) ? (
                      <>
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => startEditing(event)}
                          title="Edit event"
                        >
                          <Icon name="edit" size={15} />
                        </button>
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => handleDelete(event.id)}
                          title="Delete event"
                        >
                          <Icon name="trash" size={15} />
                        </button>
                      </>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title={editingId ? 'Edit activity' : 'New activity'}>
            <form onSubmit={handleSubmit}>
              <label className="field">
                <span className="field__label">Title</span>
                <input
                  className="input"
                  value={draft.title}
                  onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                  placeholder="Team sync, deadline, training…"
                  maxLength={200}
                  required
                />
              </label>

              <label className="field">
                <span className="field__label">Date</span>
                <input
                  className="input"
                  type="date"
                  value={draft.date}
                  onChange={(event) => {
                    setDraft({ ...draft, date: event.target.value });
                    setSelectedDay(event.target.value);
                  }}
                  required
                />
              </label>

              <div className="row" style={{ gap: 12 }}>
                <label className="field" style={{ flex: 1, marginBottom: 8 }}>
                  <span className="field__label">Start</span>
                  <input
                    className="input"
                    type="time"
                    value={draft.startTime}
                    onChange={(event) => setDraft({ ...draft, startTime: event.target.value })}
                    disabled={draft.allDay}
                  />
                </label>
                <label className="field" style={{ flex: 1, marginBottom: 8 }}>
                  <span className="field__label">End</span>
                  <input
                    className="input"
                    type="time"
                    value={draft.endTime}
                    onChange={(event) => setDraft({ ...draft, endTime: event.target.value })}
                    disabled={draft.allDay}
                  />
                </label>
              </div>

              <label className="checkbox" style={{ marginBottom: 16 }}>
                <input
                  type="checkbox"
                  checked={draft.allDay}
                  onChange={(event) => setDraft({ ...draft, allDay: event.target.checked })}
                />
                <span>All day</span>
              </label>

              <label className="field">
                <span className="field__label">Description</span>
                <textarea
                  className="textarea"
                  value={draft.description}
                  onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                  style={{ minHeight: 70 }}
                />
              </label>

              <div className="field">
                <span className="field__label">Colour</span>
                <div className="swatches">
                  {COLORS.map((color) => (
                    <button
                      type="button"
                      key={color}
                      className={`swatch${draft.color === color ? ' is-active' : ''}`}
                      style={{ background: color, width: 30, height: 30 }}
                      onClick={() => setDraft({ ...draft, color })}
                      aria-label={`Use colour ${color}`}
                    />
                  ))}
                </div>
              </div>

              <div className="row" style={{ gap: 8 }}>
                <button type="submit" className="btn btn--primary" disabled={saving}>
                  <Icon name={editingId ? 'check' : 'plus'} size={16} />
                  {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add activity'}
                </button>
                {editingId ? (
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => {
                      setEditingId(null);
                      setDraft(emptyDraft(selectedDay));
                    }}
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
            </form>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
