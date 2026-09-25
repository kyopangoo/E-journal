import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import { query } from '../db.js';
import { HttpError, requireText, wrap } from '../lib/http.js';
import { clientIp, recordActivity } from '../lib/activity.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { uploadDir, uploadElearningImage } from '../middleware/upload.js';

const router = Router();

router.use(requireAuth);

// Get all assignments
router.get(
  '/assignments',
  wrap(async (req, res) => {
    const isAdmin = req.user.role === 'admin';
    const rows = await query(
      `SELECT a.*, u.id AS createdById, u.full_name AS createdByName,
       (SELECT COUNT(*) FROM elearning_questions q WHERE q.assignment_id = a.id) as questionCount,
       (SELECT MAX(p.created_at) FROM elearning_posts p 
        WHERE p.question_id IN (SELECT id FROM elearning_questions WHERE assignment_id = a.id)) as latestReplyAt
       FROM elearning_assignments a
       JOIN users u ON u.id = a.created_by
       ${isAdmin ? '' : 'WHERE a.is_published = 1'}
       ORDER BY a.created_at DESC`
    );
    res.json({ assignments: rows.map(mapAssignment) });
  })
);

// Create assignment (admin only)
router.post(
  '/assignments',
  requireAdmin,
  uploadElearningImage.any(),
  wrap(async (req, res) => {
    const title = requireText(req.body?.title, 'Title', 200);
    const description = String(req.body?.description ?? '').trim() || null;

    let questionsInput = req.body?.questions;
    if (typeof questionsInput === 'string') {
      try { questionsInput = JSON.parse(questionsInput); }
      catch { throw new HttpError(400, 'Invalid questions format'); }
    }

    if (!Array.isArray(questionsInput) || questionsInput.length === 0) {
      throw new HttpError(400, 'At least one question is required');
    }

    const questions = questionsInput.map((q, i) => ({
      prompt: requireText(q?.prompt, `Question ${i + 1}`, 2000),
      position: i
    }));

    const mediaMap = {};
    let assignmentImage = null;
    for (const file of req.files || []) {
      const match = /^question_(\d+)_image$/.exec(file.fieldname);
      if (match) {
        mediaMap[Number(match[1])] = `/uploads/elearning/${file.filename}`;
      } else if (file.fieldname === 'assignment_image') {
        assignmentImage = `/uploads/elearning/${file.filename}`;
      }
    }

    const result = await query(
      'INSERT INTO elearning_assignments (created_by, title, description, image, is_published) VALUES (?, ?, ?, ?, 1)',
      [req.user.id, title, description, assignmentImage]
    );
    const assignmentId = Number(result.insertId);

    for (let i = 0; i < questions.length; i++) {
      await query(
        'INSERT INTO elearning_questions (assignment_id, prompt, media_url, position) VALUES (?, ?, ?, ?)',
        [assignmentId, questions[i].prompt, mediaMap[i] ?? null, i]
      );
    }

    res.status(201).json({ assignment: { id: assignmentId, title, description, image: assignmentImage } });
  })
);

// Get assignment with questions and threads
router.get(
  '/assignments/:id',
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    
    const [row] = await query(
      `SELECT a.*, u.full_name AS authorName FROM elearning_assignments a
       JOIN users u ON u.id = a.created_by WHERE a.id = ?`,
      [id]
    );
    if (!row) throw new HttpError(404, 'Assignment not found');

    const questions = await query(
      `SELECT q.*, 
       (SELECT COUNT(*) FROM elearning_posts p WHERE p.question_id = q.id) as replyCount
       FROM elearning_questions q WHERE q.assignment_id = ? ORDER BY q.position`,
      [id]
    );

    res.json({
      assignment: mapAssignment(row),
      questions: questions.map(q => ({
        id: q.id,
        prompt: q.prompt,
        mediaUrl: q.media_url,
        replyCount: q.replyCount
      }))
    });
  })
);

// Create question in existing assignment (admin only)
router.post(
  '/assignments/:id/questions',
  requireAdmin,
  uploadElearningImage.single('image'),
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const prompt = requireText(req.body?.prompt, 'Question', 2000);

    const maxPos = await query(
      'SELECT MAX(position) as maxPos FROM elearning_questions WHERE assignment_id = ?',
      [id]
    );

    await query(
      'INSERT INTO elearning_questions (assignment_id, prompt, media_url, position) VALUES (?, ?, ?, ?)',
      [
        id,
        prompt,
        req.file ? `/uploads/elearning/${req.file.filename}` : null,
        (maxPos[0].maxPos ?? -1) + 1,
      ]
    );

    res.json({ ok: true });
  })
);

// Get thread (question + replies)
router.get(
  '/assignments/:id/questions/:questionId',
  wrap(async (req, res) => {
    const questionId = Number(req.params.questionId);

    const [question] = await query(
      'SELECT * FROM elearning_questions WHERE id = ?',
      [questionId]
    );
    if (!question) throw new HttpError(404, 'Question not found');

    const replies = await query(
      `SELECT p.*, u.full_name AS authorName, u.role AS authorRole
       FROM elearning_posts p
       JOIN users u ON u.id = p.user_id
       WHERE p.question_id = ? AND p.parent_id IS NULL
       ORDER BY p.created_at`,
      [questionId]
    );

    const getReplies = async (parentId) => {
      const result = await query(
        `SELECT p.*, u.full_name AS authorName, u.role AS authorRole
         FROM elearning_posts p
         JOIN users u ON u.id = p.user_id
         WHERE p.parent_id = ?
         ORDER BY p.created_at`,
        [parentId]
      );
      for (const reply of result) {
        reply.media = await query(
          'SELECT media_url, media_type FROM elearning_post_media WHERE post_id = ?',
          [reply.id]
        );
        reply.replies = await getReplies(reply.id);
      }
      return result;
    };

    for (const reply of replies) {
      reply.media = await query(
        'SELECT media_url, media_type FROM elearning_post_media WHERE post_id = ?',
        [reply.id]
      );
      reply.replies = await getReplies(reply.id);
    }

    res.json({ question, replies });
  })
);

// Create post (reply) to question
router.post(
  '/assignments/:id/questions/:questionId/posts',
  uploadElearningImage.any(),
  wrap(async (req, res) => {
    const questionId = Number(req.params.questionId);
    const parentId = req.body?.parentId ? Number(req.body.parentId) : null;
    const body = requireText(req.body?.body, 'Reply', 5000);

    const question = await query('SELECT assignment_id FROM elearning_questions WHERE id = ?', [questionId]);
    if (!question.length) throw new HttpError(404, 'Question not found');

    const media = [];
    for (const file of req.files || []) {
      const isText = file.originalname.endsWith('.txt') || file.mimetype === 'text/plain';
      media.push({
        url: `/uploads/elearning/${file.filename}`,
        type: isText ? 'text' : 'image'
      });
    }

    const result = await query(
      'INSERT INTO elearning_posts (question_id, parent_id, user_id, body) VALUES (?, ?, ?, ?)',
      [questionId, parentId, req.user.id, body]
    );
    const postId = Number(result.insertId);

    for (const m of media) {
      await query(
        'INSERT INTO elearning_post_media (post_id, media_url, media_type) VALUES (?, ?, ?)',
        [postId, m.url, m.type]
      );
    }

    res.json({ ok: true });
  })
);

// Get all threads in assignment
router.get(
  '/assignments/:id/threads',
  wrap(async (req, res) => {
    const id = Number(req.params.id);

    const threads = await query(
      `SELECT q.*, u.full_name AS authorName,
       (SELECT COUNT(*) FROM elearning_posts p WHERE p.question_id = q.id) as replyCount
       FROM elearning_questions q
       JOIN elearning_assignments a ON a.id = q.assignment_id
       JOIN users u ON u.id = a.created_by
       WHERE q.assignment_id = ?
       ORDER BY q.created_at DESC`,
      [id]
    );

    res.json({ threads });
  })
);

// Delete assignment (admin only)
router.delete(
  '/assignments/:id',
  requireAdmin,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    
    // Get assignment to find image

    const [row] = await query(
      'SELECT id, image FROM elearning_assignments WHERE id = ?',
      [id]
    );
    if (!row) throw new HttpError(404, 'Assignment not found');

    // Delete related posts first (cascading)
    await query('DELETE FROM elearning_posts WHERE question_id IN (SELECT id FROM elearning_questions WHERE assignment_id = ?)', [id]);
    
    // Delete related questions
    await query('DELETE FROM elearning_questions WHERE assignment_id = ?', [id]);
    
    // Delete assignment
    await query('DELETE FROM elearning_assignments WHERE id = ?', [id]);

    // Delete image file if exists
    if (row.image) {
      const absolute = path.join(uploadDir, row.image.replace(/^\/uploads\//, ''));
      await fs.rm(absolute, { force: true }).catch(() => {});
    }

    res.json({ ok: true });
  })
);

function mapAssignment(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    image: row.image,
    questionCount: row.questionCount,
    latestReplyAt: row.latestReplyAt ?? null,
    createdAt: row.created_at,
    author: { id: row.createdById, name: row.createdByName },
    createdBy: { id: row.createdById, name: row.createdByName }
  };
}

export default router;
