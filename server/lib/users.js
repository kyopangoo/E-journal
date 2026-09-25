import { query } from '../db.js';

export const DEFAULT_PREFERENCES = {
  theme: 'light',
  accent: '#FFEB3B',
  fontScale: 1,
  density: 'comfortable',
};

const PUBLIC_COLUMNS =
  'id, username, full_name AS fullName, email, role, avatar, is_active AS isActive, created_at AS createdAt';

export async function loadPublicUser(userId) {
  const rows = await query(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ? LIMIT 1`, [userId]);
  return rows[0] ?? null;
}

export async function loadPreferences(userId) {
  const rows = await query(
    'SELECT theme, accent, font_scale, density FROM user_preferences WHERE user_id = ? LIMIT 1',
    [userId]
  );
  if (!rows.length) {
    // Seed the row from the app defaults rather than the table defaults, so a
    // fresh account matches DEFAULT_PREFERENCES on every later read too.
    await query(
      'INSERT IGNORE INTO user_preferences (user_id, theme, accent, font_scale, density) VALUES (?, ?, ?, ?, ?)',
      [
        userId,
        DEFAULT_PREFERENCES.theme,
        DEFAULT_PREFERENCES.accent,
        DEFAULT_PREFERENCES.fontScale,
        DEFAULT_PREFERENCES.density,
      ]
    );
    return { ...DEFAULT_PREFERENCES };
  }
  return {
    theme: rows[0].theme,
    accent: rows[0].accent,
    fontScale: Number(rows[0].font_scale),
    density: rows[0].density,
  };
}

export async function listStaff() {
  return query(
    "SELECT id, username, full_name AS fullName FROM users WHERE role = 'staff' AND is_active = 1 ORDER BY full_name"
  );
}
