import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { DropdownMenu } from './DropdownMenu.jsx';
import { Icon } from './Icons.jsx';
import { Avatar, EmptyState, relativeTime } from './ui.jsx';

// The app has no websocket, so polling is the whole delivery mechanism. The interval is
// deliberately lazy for a small team, and the visibility listener closes the gap it would
// otherwise leave: a tab that sat in the background for an hour would come back to an
// hour-old badge, because browsers throttle timers in hidden tabs.
const POLL_MS = 30_000;

// Past this the exact number stops being useful — "99+" reads the same as "412" and does not
// widen the badge.
const BADGE_MAX = 99;

function badgeText(count) {
  return count > BADGE_MAX ? `${BADGE_MAX}+` : String(count);
}

export default function NotificationBell() {
  const navigate = useNavigate();

  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // The poll only moves a single number; the list itself is fetched when the menu opens.
  const refreshCount = useCallback(async () => {
    try {
      const payload = await api.get('/notifications/unread-count');
      setUnreadCount(Number(payload.unreadCount) || 0);
    } catch {
      // A dropped poll is not worth telling the user about — the next one is 30s away, and an
      // error banner over a bell icon would be noise. Failures that matter come from the list.
    }
  }, []);

  const refreshList = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await api.get('/notifications');
      setItems(payload.notifications ?? []);
      setUnreadCount(Number(payload.unreadCount) || 0);
      setError('');
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshCount();

    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') refreshCount();
    }, POLL_MS);

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') refreshCount();
    }
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [refreshCount]);

  // Marks the row read locally so the badge drops as the page changes; the request is allowed
  // to fail quietly because the next poll reports the true count either way.
  function markReadLocally(id) {
    setUnreadCount((count) => Math.max(0, count - 1));
    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, readAt: new Date().toISOString() } : item
      )
    );
  }

  function handleSelect(notification, close) {
    close();
    if (!notification.readAt) {
      markReadLocally(notification.id);
      api.patch(`/notifications/${notification.id}/read`).catch(() => {});
    }
    navigate(notification.link);
  }

  async function markAllRead() {
    // Optimistic for the same reason as above, but with a rollback: this one is an explicit
    // action, so silently doing nothing would be a lie.
    const previous = items;
    const previousCount = unreadCount;
    setItems((current) =>
      current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() }))
    );
    setUnreadCount(0);

    try {
      await api.patch('/notifications/read-all');
      setError('');
    } catch (markError) {
      setItems(previous);
      setUnreadCount(previousCount);
      setError(markError.message);
    }
  }

  return (
    // The badge is positioned against the trigger button, and .icon-button is shared with the
    // sidebar — so the positioning is set here rather than in the stylesheet.
    <DropdownMenu
      placement="bottom-end"
      trigger={({ open, setOpen }) => (
        <button
          type="button"
          className="icon-button"
          style={{ position: 'relative' }}
          onClick={() => {
            const next = !open;
            setOpen(next);
            if (next) refreshList();
          }}
          title={unreadCount ? `${unreadCount} unread` : 'Notifications'}
          aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}
          aria-expanded={open}
        >
          <Icon name="bell" size={17} />
          {unreadCount > 0 ? <span className="notif-badge">{badgeText(unreadCount)}</span> : null}
        </button>
      )}
    >
      {({ close }) => (
        <div className="notif-panel">
          <div className="notif-panel__head">
            <span className="notif-panel__title">Notifications</span>
            {unreadCount > 0 ? (
              <button type="button" className="notif-panel__action" onClick={markAllRead}>
                Mark all read
              </button>
            ) : null}
          </div>

          {error ? <p className="notif-panel__error">{error}</p> : null}

          {loading && !items.length ? (
            <p className="notif-panel__note">Loading…</p>
          ) : items.length === 0 ? (
            <div className="notif-panel__empty">
              <EmptyState
                icon="bell"
                title="Nothing yet"
                hint="What your teammates do — new schedules, discussions, certifications — lands here."
              />
            </div>
          ) : (
            <div className="notif-list">
              {items.map((notification) => (
                <button
                  type="button"
                  key={notification.id}
                  className={`notif-item${notification.readAt ? '' : ' is-unread'}`}
                  onClick={() => handleSelect(notification, close)}
                >
                  {notification.actor ? (
                    <Avatar name={notification.actor.fullName} size={30} />
                  ) : (
                    <span className="notif-item__icon">
                      <Icon name="bell" size={15} />
                    </span>
                  )}

                  <span className="notif-item__body">
                    <span className="notif-item__title">{notification.title}</span>
                    {notification.body ? (
                      <span className="notif-item__detail">{notification.body}</span>
                    ) : null}
                    <span className="notif-item__meta">{relativeTime(notification.createdAt)}</span>
                  </span>

                  {notification.readAt ? null : (
                    <span className="notif-item__dot" role="img" aria-label="Unread" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </DropdownMenu>
  );
}
