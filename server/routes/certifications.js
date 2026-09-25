import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import { query } from '../db.js';
import { HttpError, requireText, wrap } from '../lib/http.js';
import { clientIp, recordActivity } from '../lib/activity.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadCertification, uploadDir } from '../middleware/upload.js';
import { schemaQuery } from '../schema.js';

const router = Router();

router.use(requireAuth);

const CERTIFICATION_COLUMNS = `
  id, name, issuer, credential_id AS credentialId, issued_date AS issuedDate,
  expiry_date AS expiryDate, file_path AS filePath, file_name AS fileName, created_at AS createdAt
`;

function optionalDate(value, field) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new HttpError(400, `${field} must use the YYYY-MM-DD format`);
  }
  return text;
}

router.get(
  '/',
  wrap(async (req, res) => {
    const certifications = await schemaQuery(
      req.user.id,
      `SELECT ${CERTIFICATION_COLUMNS} FROM certifications ORDER BY created_at DESC`
    );
    res.json({ certifications });
  })
);

// Every active member's certifications, so the team can see each other's credentials.
// Certifications live in each person's own schema, so there is no join to make.
router.get(
  '/hub',
  wrap(async (req, res) => {
    const people = await query(
      `SELECT id, username, full_name AS fullName, role FROM users
       WHERE is_active = 1 ORDER BY role ASC, full_name ASC`
    );

    const members = [];
    let total = 0;

    for (const person of people) {
      const certifications = await schemaQuery(
        person.id,
        `SELECT ${CERTIFICATION_COLUMNS} FROM certifications ORDER BY created_at DESC`
      );
      if (!certifications.length) continue;

      total += certifications.length;
      members.push({ user: person, certifications });
    }

    res.json({ members, total, memberCount: members.length, userCount: people.length });
  })
);

router.post(
  '/',
  uploadCertification.single('file'),
  wrap(async (req, res) => {
    const name = requireText(req.body?.name, 'Certification name', 200);
    const issuer = String(req.body?.issuer ?? '').trim() || null;
    const credentialId = String(req.body?.credentialId ?? '').trim() || null;
    const issuedDate = optionalDate(req.body?.issuedDate, 'Issued date');
    const expiryDate = optionalDate(req.body?.expiryDate, 'Expiry date');
    const file = req.file ?? null;

    const result = await schemaQuery(
      req.user.id,
      `INSERT INTO certifications
         (name, issuer, credential_id, issued_date, expiry_date, file_path, file_name)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        issuer,
        credentialId,
        issuedDate,
        expiryDate,
        file ? `/uploads/certifications/${file.filename}` : null,
        file ? file.originalname : null,
      ]
    );

    await recordActivity(req.user.id, 'CERTIFICATION_UPLOADED', `Uploaded certification "${name}"`, clientIp(req));

    const rows = await schemaQuery(
      req.user.id,
      `SELECT ${CERTIFICATION_COLUMNS} FROM certifications WHERE id = ? LIMIT 1`,
      [result.insertId]
    );

    res.status(201).json({ certification: rows[0] });
  })
);

router.delete(
  '/:id',
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const rows = await schemaQuery(
      req.user.id,
      'SELECT name, file_path AS filePath FROM certifications WHERE id = ? LIMIT 1',
      [id]
    );
    if (!rows.length) throw new HttpError(404, 'Certification not found');

    await schemaQuery(req.user.id, 'DELETE FROM certifications WHERE id = ?', [id]);

    if (rows[0].filePath) {
      const absolute = path.join(uploadDir, rows[0].filePath.replace(/^\/uploads\//, ''));
      await fs.unlink(absolute).catch(() => {});
    }

    await recordActivity(req.user.id, 'CERTIFICATION_DELETED', `Removed certification "${rows[0].name}"`, clientIp(req));

    res.json({ ok: true });
  })
);

export default router;
