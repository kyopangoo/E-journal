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
    const cleaned = raw.replace(/\$\{[^}]*\}/g, ' ');
    for (const token of cleaned.split(/\s+/)) if (token && !token.includes('$')) used.add(token);
  }
}

// classes that only ever appear inside a template/ternary hole, or are toggled by state
const dynamic = /^(is-|badge--|notice--|nav-group|hero$|panel$|split$|stats$|bar-row$|stage$|search$|toolbar$|timeline$|empty$|loading$|composer$|tweet$|thread$|question$|choice$|swatch$|segmented$|link-card$|course-card$|cert-card$|post-hero$|quiz-nav$|rail$|field$|btn$|card)/;

console.log('JSX class missing in CSS:', [...used].filter((c) => !cssClasses.has(c)).sort().join(', ') || '(none)');
console.log();
console.log(
  'CSS class never used in JSX:',
  [...cssClasses].filter((c) => !used.has(c) && !dynamic.test(c)).sort().join(', ') || '(none)'
);
