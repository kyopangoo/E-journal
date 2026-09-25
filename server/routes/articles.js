import { Router } from 'express';
import { query } from '../db.js';
import { HttpError, requireText, wrap } from '../lib/http.js';
import { clientIp, recordActivity } from '../lib/activity.js';
import { notifyTeam } from '../lib/notify.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

const ARTICLE_COLUMNS = 'id, title, url, description, created_at AS createdAt, updated_at AS updatedAt, user_id';

function requireLink(value) {
  const url = requireText(value, 'Article link', 500);
  if (!/^https?:\/\//i.test(url)) {
    throw new HttpError(400, 'Article link must start with http:// or https://');
  }
  return url;
}

router.get(
  '/',
  wrap(async (req, res) => {
    const articles = await query(
      `SELECT ${ARTICLE_COLUMNS} FROM articles ORDER BY created_at DESC`
    );

    const people = await query(
      'SELECT id, username, full_name AS fullName, role FROM users WHERE is_active = 1'
    );
    const authorMap = new Map(people.map(p => [p.id, p]));

    const result = articles.map(a => {
      const author = authorMap.get(a.user_id);
      return {
        ...a,
        author: author ? {
          id: author.id,
          name: author.fullName,
          username: author.username,
          role: author.role
        } : { id: a.user_id, name: 'Unknown', username: '', role: 'user' }
      };
    });
    res.json({ articles: result });
  })
);

router.get(
  '/team',
  wrap(async (req, res) => {
    res.json({ articles: [] });
  })
);

router.post(
  '/',
  wrap(async (req, res) => {
    const title = requireText(req.body?.title, 'Title', 200);
    const url = requireLink(req.body?.url);
    const description = String(req.body?.description ?? '').trim() || null;

    const result = await query(
      'INSERT INTO articles (user_id, title, url, description) VALUES (?, ?, ?, ?)',
      [req.user.id, title, url, description]
    );

    await recordActivity(req.user.id, 'ARTICLE_ADDED', `Shared article "${title}"`, clientIp(req));

    await notifyTeam(req.user.id, {
      type: 'article.added',
      entityType: 'article',
      entityId: result.insertId,
      title: `${req.user.fullName} shared an article`,
      body: title,
      link: '/achievements/articles',
    });

    const rows = await query(
      `SELECT ${ARTICLE_COLUMNS} FROM articles WHERE id = ? LIMIT 1`,
      [result.insertId]
    );

    res.status(201).json({ article: rows[0] });
  })
);

router.delete(
  '/:id',
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const rows = await query(
      'SELECT title FROM articles WHERE id = ? AND user_id = ? LIMIT 1',
      [id, req.user.id]
    );
    if (!rows.length) throw new HttpError(404, 'Article not found');

    await query('DELETE FROM articles WHERE id = ? AND user_id = ?', [id, req.user.id]);
    await recordActivity(req.user.id, 'ARTICLE_DELETED', `Removed article "${rows[0].title}"`, clientIp(req));

    await notifyTeam(req.user.id, {
      type: 'article.deleted',
      entityType: 'article',
      entityId: id,
      title: `${req.user.fullName} removed an article`,
      body: rows[0].title,
      link: '/achievements/articles',
    });

    res.json({ ok: true });
  })
);

export default router;
