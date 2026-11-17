

import express from 'express';
import { getCurrentUser } from '../middlewares/auth.js';

const router = express.Router();


function _shape(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    courseNo: row.course_no,
    course_no: row.course_no,
    description: row.description,
  };
}


router.get('/lookup', getCurrentUser, async (req, res, next) => {
  try {
    const code = String(req.query.code || '').trim();
    if (!code) return res.status(400).json({ detail: 'code is required' });

    const isUuid = /^[0-9a-f-]{36}$/i.test(code);







    if (!req.db) {
      return res.status(500).json({ detail: 'database client unavailable' });
    }
    const r = await req.db.query(
      isUuid
        ? `SELECT id, name, code, course_no, description FROM public.courses WHERE id::text = $1 LIMIT 1`
        : `SELECT id, name, code, course_no, description FROM public.courses WHERE code = $1 LIMIT 1`,
      [code],
    );
    if (r.rows.length === 0) return res.status(404).json({ detail: 'course not found' });
    return res.json(_shape(r.rows[0]));
  } catch (e) { next(e); }
});


router.get('/picker', getCurrentUser, async (req, res, next) => {
  try {
    const limit = Math.min(
      Math.max(Number.parseInt(req.query.limit, 10) || 200, 1),
      500,
    );
    const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);

    if (!req.db) {
      return res.status(500).json({ detail: 'database client unavailable' });
    }
    const r = await req.db.query(
      `SELECT id, name, code, course_no, description
         FROM public.courses
         ORDER BY course_no, code
         LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    return res.json(r.rows.map(_shape));
  } catch (e) { next(e); }
});

export default router;