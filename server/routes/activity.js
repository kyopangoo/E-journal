import { Router } from 'express';
import { wrap } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { schemaQuery } from '../schema.js';

const router = Router();

router.use(requireAuth);

router.get(
  '/',
  wrap(async (req, res) => {
    const requested = Number(req.query.limit);
    const limit = Number.isFinite(requested) ? Math.min(Math.max(Math.trunc(requested), 1), 200) : 60;

    const entries = await schemaQuery(
      req.user.id,
      `SELECT id, action, detail, ip_address AS ipAddress, created_at AS createdAt
       FROM activity_history
       ORDER BY created_at DESC, id DESC
       LIMIT ${limit}`
    );

    const [totals] = await schemaQuery(
      req.user.id,
      'SELECT COUNT(*) AS total FROM activity_history'
    );

    res.json({ entries, total: Number(totals?.total ?? 0) });
  })
);

export default router;
