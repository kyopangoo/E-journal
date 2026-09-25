---
name: css-design-overhaul
description: How to rework the E-Journey client's visual design safely — inventory the global stylesheet before rewriting, preserve the --accent/data-theme preferences contract, and verify with a className-vs-CSS cross-check. Includes the animation-fill-mode sticky/box-shadow gotcha.
source: auto-skill
extracted_at: '2026-09-16T18:13:24.826Z'
---

# Overhauling the client design without breaking pages

Use this when restyling `/opt/e-forum/client` — a theme pass, a new visual language, or any edit that rewrites `client/src/styles.css` or renames a class.

## The shape of the client

`client/src/styles.css` is a single ~2000-line global stylesheet imported once by `main.jsx`. There is no CSS-in-JS, no Tailwind, no per-component CSS. Pages and components share a small vocabulary:

- `components/Layout.jsx` — `.shell`, `.sidebar*`, `.nav-link`, `.topbar*`, `.content`
- `components/ui.jsx` — `PageHeader` (`.page-head*`), `Panel` (`.panel*`), `EmptyState` (`.empty*`), `Notice`, `Loading`, `Avatar`, `RoleBadge`
- `components/Icons.jsx` — inline SVG sprite (`PATHS` map + `<Icon name>`)

Because everything is global, **one missing selector silently unstyled one page**. That is the main failure mode of this task.

## Step 1 — inventory before you rewrite

Do not rewrite `styles.css` from memory of what a section "probably" looks like. Read it in full (it needs 2–3 paginated reads) **and** read every page, and treat the set of selectors in the old file as the contract you must keep.

Then rewrite preserving **every** existing class name, even ones that look unused, and add new ones on top. Renaming a class is a two-file change (CSS + the JSX that uses it) and is where regressions come from — prefer keeping the name and changing only the look.

## Step 2 — respect the live preferences contract

`client/src/auth.jsx` writes user preferences onto the document element at runtime:

```js
root.dataset.theme = preferences.theme;        // [data-theme='dark']
root.dataset.density = preferences.density;    // [data-density='compact']
root.style.setProperty('--accent', preferences.accent);
root.style.fontSize = `${Math.round(16 * preferences.fontScale)}px`;
```

Consequences for any new CSS:

- The accent is **user-configurable**. Never hard-code `#AA71FF` in new rules — read `var(--accent)` so the Appearance page keeps working. `--primary` is fixed; gradients should combine both.
- Both light and dark must be styled. `[data-theme='dark']` overrides the token block; if you add a token, add its dark value too, or the dark theme will show a light-mode artefact.
- `[data-density='compact']` only redefines `--card-pad` / `--gap`. Components that hard-code padding instead of using those tokens will ignore the density setting.
- `fontScale` changes the root `font-size`, so **prefer `rem` over `px`** in anything that should scale with text. `px` is fine for hairlines, glows and control heights.
- `design.md` tokens are the palette of record: primary `#13A8FF`, accent `#AA71FF`, background `#F1F5F9`, surface `#27272A`, card radius `4px`, control radius `12px`, pill `9999px`; fonts Chewy / Patrick Hand / JetBrains Mono.

## Step 3 — the gotcha that will bite you: entrance animations

A "masked reveal" done the obvious way breaks two unrelated things at once:

```css
/* DON'T */
@keyframes revealMask {
  from { opacity: 0; clip-path: inset(0 0 100% 0); transform: translateY(14px); }
  to   { opacity: 1; clip-path: inset(0 0 0 0);      transform: translateY(0); }
}
.page-head { animation: revealMask .6s ease both; }
```

`animation-fill-mode: both` **keeps the `to` keyframe applied forever**. Two failures follow from that:

1. `transform: translateY(0)` is not `transform: none` — it still establishes a containing block, which breaks `position: sticky` on descendants. In this app that is `.schedule__rail`, which starts scrolling away with the page.
2. `clip-path: inset(0 0 0 0)` clips to the border box, so the element's own `box-shadow` (and any overflow glow) is cut off.

Fix both by ending on a genuinely neutral state, and move the "wipe" onto a pseudo-element where clipping is harmless:

```css
@keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
@keyframes barWipe { from { transform: scaleX(0); } to { transform: scaleX(1); } }

.page-head { animation: fadeUp .55s var(--ease) both; }
.page-head::after { /* the gradient hairline */
  transform-origin: left center;
  animation: barWipe .8s var(--ease) both;
}
```

Rule of thumb: **if a container will hold a sticky child, its animation must resolve to `transform: none` and must not clip.**

A related trap: a blanket `.content > * { animation: fadeUp … both; }` for staggered entrance also lands on the element that wraps a sticky rail. It is safe only because the end state is `transform: none` — so keep that end state if you add staggering.

## Step 4 — guard `background-clip: text`

Gradient display type is the signature look, but `color: transparent` with a failed `background-clip` renders invisible text. Always wrap it:

```css
@supports ((-webkit-background-clip: text) or (background-clip: text)) {
  .page-head__title { /* gradient, transparent fill */ }
}
```

Set a real `color` on the base rule as the fallback.

## Step 5 — verify: build, then cross-check class names

The build proves the CSS parses; it does **not** prove every class is defined.

```bash
npm --prefix client run build          # Vite will fail on a CSS syntax error
```

Then diff the classes used in JSX against the classes defined in the sheet. This catches a selector you dropped during the rewrite — the exact bug that produces one silently unstyled page:

```js
// node /tmp/check-classes.mjs
import fs from 'node:fs';
import path from 'node:path';

const srcDir = '/opt/e-forum/client/src';
const css = fs.readFileSync(path.join(srcDir, 'styles.css'), 'utf8');
const cssClasses = new Set([...css.matchAll(/\.([a-zA-Z0-9_-]+)/g)].map((m) => m[1]));

function walk(dir) {
  let out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out = out.concat(walk(full));
    else if (/\.(jsx|js)$/.test(e.name)) out.push(full);
  }
  return out;
}

const used = new Set();
const re = /className=(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\}|\{'([^']*)'\})/g;
for (const file of walk(srcDir)) {
  const text = fs.readFileSync(file, 'utf8');
  let m;
  while ((m = re.exec(text))) {
    const raw = m[1] ?? m[2] ?? m[3] ?? m[4] ?? '';
    const cleaned = raw.replace(/\$\{[^}]*\}/g, ' ');   // a template hole is not a class
    for (const token of cleaned.split(/\s+/)) if (token && !token.includes('$')) used.add(token);
  }
}

console.log('missing in CSS:', [...used].filter((c) => !cssClasses.has(c)).sort().join(', ') || '(none)');
```

**Expect three false positives — do not "fix" them:** the prefixes left behind by interpolated variants (`badge--` from `` `badge--${role}` ``, `notice--` from `` `notice--${tone}` ``) and the bare `nav-group` wrapper in `Layout.jsx`, which has never had a rule of its own. Anything *else* in the output is a real missing selector.

## Step 6 — adding icons

`Icons.jsx` is a single `PATHS` object of `viewBox="0 0 24 24"` stroke paths rendered by `<Icon name size />`, defaulting to `dot` for an unknown name. Add new glyphs as entries there; a typo silently renders a dot rather than erroring, which is easy to miss.

## Scope reminders

- Only `client/` is touched by this work, so **the API does not need restarting** after a design pass (unlike edits under `server/`).
- Preview with `npm run client:dev` (Vite on `:5173`, proxying `/api` and `/uploads` to `:3000`); the API must be running separately for data to load.
- Keep `client/index.html`'s Google Fonts link in sync if the type stack changes — the three design.md faces are already linked there.
