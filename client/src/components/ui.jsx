import { Icon } from './Icons.jsx';

export function initials(name) {
  return String(name ?? '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

const AVATAR_TONES = ['#FFEB3B', '#FF5252', '#2196F3', '#FF9800', '#4CAF50', '#BA68C8'];

export function avatarTone(seed) {
  const text = String(seed ?? '');
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) % 9973;
  }
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

export function Avatar({ name, size = 36 }) {
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, background: avatarTone(name), fontSize: size * 0.4 }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

export function RoleBadge({ role }) {
  return (
    <span className={`badge badge--${role === 'admin' ? 'admin' : 'staff'}`}>
      {role === 'admin' ? 'admin' : 'staff'}
    </span>
  );
}

export function Panel({ title, subtitle, actions, children, className = '' }) {
  return (
    <section className={`panel ${className}`}>
      {title || actions ? (
        <header className="panel__head">
          <div>
            <h2 className="panel__title">{title}</h2>
            {subtitle ? <p className="panel__subtitle">{subtitle}</p> : null}
          </div>
          {actions ? <div className="panel__actions">{actions}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function EmptyState({ icon = 'dot', title, hint }) {
  return (
    <div className="empty">
      <span className="empty__icon">
        <Icon name={icon} size={22} />
      </span>
      <p className="empty__title">{title}</p>
      {hint ? <p className="empty__hint">{hint}</p> : null}
    </div>
  );
}

export function Field({ label, hint, children, wide }) {
  return (
    <label className={`field${wide ? ' field--wide' : ''}`}>
      <span className="field__label">{label}</span>
      {children}
      {hint ? <span className="field__hint">{hint}</span> : null}
    </label>
  );
}

export function Notice({ tone = 'error', children }) {
  if (!children) return null;
  return (
    <p className={`notice notice--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  );
}

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="loading">
      <span className="loading__spinner" />
      <span>{label}</span>
    </div>
  );
}

export function Hero({ eyebrow, title, lead, chips, stats, actions, mark, markPlain = false, children }) {
  const aside = mark || stats?.length || actions;

  return (
    <section className="hero">
      <div className="hero__body">
        {eyebrow ? <p className="hero__eyebrow">{eyebrow}</p> : null}
        <h1 className="hero__title">{title}</h1>
        {lead ? <p className="hero__lead">{lead}</p> : null}
        {chips?.length ? (
          <div className="hero__chips">
            {chips.map((chip) => (
              <span className="hero__chip" key={chip}>
                {chip}
              </span>
            ))}
          </div>
        ) : null}
        {children}
      </div>

      {aside ? (
        <div className="hero__aside">
          {mark ? (
            <span className={`hero__mark${markPlain ? ' hero__mark--plain' : ''}`}>{mark}</span>
          ) : null}

          {stats?.length ? (
            <div className="hero__stats">
              {stats.map((stat) => (
                <div className="hero__stat" key={stat.label}>
                  <p className="hero__stat-value">{stat.value}</p>
                  <p className="hero__stat-label">{stat.label}</p>
                </div>
              ))}
            </div>
          ) : null}

          {actions ? <div className="hero__actions">{actions}</div> : null}
        </div>
      ) : null}
    </section>
  );
}

export function Stats({ items }) {
  return (
    <div className="stats">
      {items.map((item) => (
        <div className="stat" key={item.label}>
          <p className="stat__value">{item.value}</p>
          <p className="stat__label">{item.label}</p>
        </div>
      ))}
    </div>
  );
}

export function Split({ aside, railWide = false, children }) {
  return (
    <div className={`split${railWide ? ' split--rail-wide' : ''}`}>
      <div>{children}</div>
      <aside className="rail">{aside}</aside>
    </div>
  );
}

export function SectionHead({ eyebrow, title, hint, actions }) {
  return (
    <div className="section-head">
      <div>
        {eyebrow ? <p className="section-head__eyebrow">{eyebrow}</p> : null}
        <h2 className="section-head__title">{title}</h2>
        {hint ? <p className="section-head__hint">{hint}</p> : null}
      </div>
      {actions ? <div className="row">{actions}</div> : null}
    </div>
  );
}

export function SearchField({ value, onChange, onSubmit, placeholder = 'Search…', label = 'Search' }) {
  return (
    <form className="search" onSubmit={onSubmit}>
      <span className="search__icon">
        <Icon name="search" size={16} />
      </span>
      <input
        className="input"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        aria-label={label}
      />
    </form>
  );
}

export function formatDateTime(value) {
  if (!value) return '—';
  return String(value).replace('T', ' ').slice(0, 16);
}

export function formatDate(value) {
  if (!value) return '—';
  return String(value).slice(0, 10);
}

export function relativeTime(value) {
  if (!value) return '';
  const timestamp = new Date(String(value).replace(' ', 'T') + '+07:00').getTime();
  if (Number.isNaN(timestamp)) return '';

  const diff = Date.now() - timestamp;
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(value);
}
