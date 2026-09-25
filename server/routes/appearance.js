import { Router } from 'express';
import { query } from '../db.js';
import { wrap } from '../lib/http.js';
import { clientIp, recordActivity } from '../lib/activity.js';
import { loadPreferences } from '../lib/users.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

const THEMES = new Set(['light', 'dark']);
const DENSITIES = new Set(['comfortable', 'compact']);
const ACCENT_PATTERN = /^#[0-9a-fA-F]{6}$/;

export const ACCENTS = [
  { name: 'Yellow', value: '#FFEB3B' },
  { name: 'Red', value: '#FF5252' },
  { name: 'Blue', value: '#2196F3' },
  { name: 'Orange', value: '#FF9800' },
  { name: 'Green', value: '#4CAF50' },
  { name: 'Violet', value: '#BA68C8' },
];

function clampScale(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(1.35, Math.max(0.85, Math.round(numeric * 100) / 100));
}

router.get(
  '/',
  wrap(async (req, res) => {
    res.json({ preferences: await loadPreferences(req.user.id), accents: ACCENTS });
  })
);

router.put(
  '/',
  wrap(async (req, res) => {
    const current = await loadPreferences(req.user.id);

    const theme = THEMES.has(req.body?.theme) ? req.body.theme : current.theme;
    const density = DENSITIES.has(req.body?.density) ? req.body.density : current.density;
    const accent = ACCENT_PATTERN.test(String(req.body?.accent ?? ''))
      ? req.body.accent
      : current.accent;
    const fontScale = clampScale(req.body?.fontScale ?? current.fontScale, current.fontScale);

    await query(
      `INSERT INTO user_preferences (user_id, theme, accent, font_scale, density)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         theme = VALUES(theme),
         accent = VALUES(accent),
         font_scale = VALUES(font_scale),
         density = VALUES(density)`,
      [req.user.id, theme, accent, fontScale, density]
    );

    await recordActivity(
      req.user.id,
      'APPEARANCE_UPDATED',
      `Theme ${theme}, accent ${accent}, scale ${fontScale}`,
      clientIp(req)
    );

    res.json({ preferences: { theme, accent, fontScale, density } });
  })
);

export default router;
