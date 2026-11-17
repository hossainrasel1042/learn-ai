

import express from 'express';

import { getCurrentUser } from '../middlewares/auth.js';
import { logger } from '../utils/logger.js';
import { pool } from '../config/database.js';
import { quizRepository } from '../models/quiz.js';
import { getQuizAgent } from './agent.js';
import { awardXpSafely } from '../gamification_agent/hook.js';
import {
  CreateQuizSetRequest,
  GenerateQuestionsRequest,
  StartAttemptRequest,
  SubmitAnswerRequest,
  FinishAttemptRequest,
  QuizSetIdParam,
  AttemptIdParam,
  PaginationQuery,
} from './schemas.js';

const router = express.Router();





function _userId(req) {
  const u = req.user || {};
  const id = u.id || u.user_id || u.sub;
  if (!id) {
    const err = new Error('Not authenticated');
    err.status = 401;
    throw err;
  }
  return id;
}

function _repo(req) {
  const client = req.db || pool;
  return quizRepository(client);
}

function _sendError(res, status, detail) {
  return res.status(status).json({ detail });
}


async function _commit(req) {
  if (req.dbCommit) await req.dbCommit();
}


async function _rollback(req) {
  if (req.dbRollback) {
    try { await req.dbRollback(); } catch (_) {  }
  }
}

function _shapeSet(s) { return s ? s.toDict() : s; }
function _shapeQuestion(q) { return q ? q.toDict() : q; }
function _shapeAttempt(a) { return a ? a.toDict() : a; }
function _shapeAnswer(a) { return a ? a.toDict() : a; }





router.post('/sets', getCurrentUser, async (req, res, next) => {
  try {
    const parsed = CreateQuizSetRequest.safeParse(req.body || {});
    if (!parsed.success) return _sendError(res, 400, parsed.error.message);
    const userId = _userId(req);
    const set = await _repo(req).createQuizSet({ userId, ...parsed.data });
    await _commit(req);
    return res.status(201).json({ set: _shapeSet(set) });
  } catch (e) {
    await _rollback(req);
    logger.error(`Quiz createQuizSet error: ${e.message || e}`);
    return _sendError(res, e.status || 500, e.message || String(e));
  }
});

router.get('/sets', getCurrentUser, async (req, res, next) => {
  try {
    const parsed = PaginationQuery.safeParse(req.query);
    if (!parsed.success) return _sendError(res, 400, parsed.error.message);
    const userId = _userId(req);
    const { page, pageSize } = parsed.data;
    const { items, total } = await _repo(req).listQuizSets(userId, { page, pageSize });
    return res.json({ sets: items.map(_shapeSet), total, page, pageSize });
  } catch (e) {
    return _sendError(res, e.status || 500, e.message || String(e));
  }
});


router.get('/sets/:quizSetId/stats', getCurrentUser, async (req, res, next) => {
  try {
    const paramParsed = QuizSetIdParam.safeParse(req.params);
    if (!paramParsed.success) return _sendError(res, 400, paramParsed.error.message);
    const userId = _userId(req);
    const repo = _repo(req);


    const set = await repo.getQuizSet(paramParsed.data.quizSetId, userId);
    if (!set) return _sendError(res, 404, 'Quiz set not found');
    const stats = await repo.getQuizSetStats(paramParsed.data.quizSetId, userId);
    return res.json(stats);
  } catch (e) {
    return _sendError(res, e.status || 500, e.message || String(e));
  }
});

router.get('/sets/:quizSetId', getCurrentUser, async (req, res, next) => {
  try {
    const paramParsed = QuizSetIdParam.safeParse(req.params);
    if (!paramParsed.success) return _sendError(res, 400, paramParsed.error.message);
    const userId = _userId(req);
    const repo = _repo(req);
    const set = await repo.getQuizSet(paramParsed.data.quizSetId, userId);
    if (!set) return _sendError(res, 404, 'Quiz set not found');
    const questions = await repo.listQuestions(paramParsed.data.quizSetId, userId);
    const stats = await repo.getQuizSetStats(paramParsed.data.quizSetId, userId);
    return res.json({
      set: _shapeSet(set),
      questions: questions.map(_shapeQuestion),
      stats,
    });
  } catch (e) {
    return _sendError(res, e.status || 500, e.message || String(e));
  }
});

router.patch('/sets/:quizSetId', getCurrentUser, async (req, res, next) => {
  try {
    const paramParsed = QuizSetIdParam.safeParse(req.params);
    if (!paramParsed.success) return _sendError(res, 400, paramParsed.error.message);
    const userId = _userId(req);
    const set = await _repo(req).updateQuizSet(paramParsed.data.quizSetId, userId, {
      title: req.body?.title,
      description: req.body?.description,
    });
    if (!set) return _sendError(res, 404, 'Quiz set not found');
    await _commit(req);
    return res.json({ set: _shapeSet(set) });
  } catch (e) {
    await _rollback(req);
    return _sendError(res, e.status || 500, e.message || String(e));
  }
});

router.delete('/sets/:quizSetId', getCurrentUser, async (req, res, next) => {
  try {
    const paramParsed = QuizSetIdParam.safeParse(req.params);
    if (!paramParsed.success) return _sendError(res, 400, paramParsed.error.message);
    const userId = _userId(req);
    const ok = await _repo(req).deleteQuizSet(paramParsed.data.quizSetId, userId);
    if (!ok) return _sendError(res, 404, 'Quiz set not found');
    await _commit(req);
    return res.status(204).end();
  } catch (e) {
    await _rollback(req);
    return _sendError(res, e.status || 500, e.message || String(e));
  }
});

router.post('/sets/:quizSetId/generate', getCurrentUser, async (req, res, next) => {
  try {
    const paramParsed = QuizSetIdParam.safeParse(req.params);
    if (!paramParsed.success) return _sendError(res, 400, paramParsed.error.message);
    const bodyParsed = GenerateQuestionsRequest.safeParse(req.body || {});
    if (!bodyParsed.success) return _sendError(res, 400, bodyParsed.error.message);
    const userId = _userId(req);


    const ownerRes = await (req.db || pool).query(
      `SELECT user_id FROM quiz_sets WHERE id = $1`,
      [paramParsed.data.quizSetId],
    );
    if (ownerRes.rows.length === 0) {
      return _sendError(res, 404, 'Quiz set not found');
    }
    if (ownerRes.rows[0].user_id !== userId) {
      return _sendError(res, 403, 'Forbidden');
    }
    const agent = getQuizAgent();
    const result = await agent.generateQuestions({
      userId,
      quizSetId: paramParsed.data.quizSetId,
      pool: req.db || pool,
      ...bodyParsed.data,
    });
    await _commit(req);
    return res.json({
      inserted: result.inserted,
      questions: result.questions.map(_shapeQuestion),



      generatedBy: result.generatedBy || 'ai',
    });
  } catch (e) {
    await _rollback(req);
    logger.error(`Quiz generateQuestions error: ${e.message || e}`);
    return _sendError(res, e.status || 500, e.message || String(e));
  }
});





router.post('/attempts', getCurrentUser, async (req, res, next) => {
  try {
    const parsed = StartAttemptRequest.safeParse(req.body || {});
    if (!parsed.success) return _sendError(res, 400, parsed.error.message);
    const userId = _userId(req);
    const repo = _repo(req);
    const set = await repo.getQuizSet(parsed.data.quizSetId, userId);
    if (!set) return _sendError(res, 404, 'Quiz set not found');
    const questions = await repo.listQuestions(parsed.data.quizSetId, userId);
    if (questions.length === 0) {
      return _sendError(res, 400, 'Quiz set has no questions — generate some first.');
    }
    const attempt = await repo.startAttempt({
      quizSetId: parsed.data.quizSetId,
      userId,
      total: questions.length,
    });
    await _commit(req);
    return res.status(201).json({
      attempt: _shapeAttempt(attempt),
      questions: questions.map(_shapeQuestion),
    });
  } catch (e) {
    await _rollback(req);
    logger.error(`Quiz startAttempt error: ${e.message || e}`);
    return _sendError(res, e.status || 500, e.message || String(e));
  }
});

router.get('/attempts/:attemptId', getCurrentUser, async (req, res, next) => {
  try {
    const paramParsed = AttemptIdParam.safeParse(req.params);
    if (!paramParsed.success) return _sendError(res, 400, paramParsed.error.message);
    const userId = _userId(req);
    const repo = _repo(req);
    const attempt = await repo.getAttempt(paramParsed.data.attemptId, userId);
    if (!attempt) return _sendError(res, 404, 'Attempt not found');
    const answers = await repo.listAnswers(paramParsed.data.attemptId);
    const questions = await repo.listQuestions(attempt.quizSetId, userId);
    return res.json({
      attempt: _shapeAttempt(attempt),
      answers: answers.map(_shapeAnswer),
      questions: questions.map(_shapeQuestion),
    });
  } catch (e) {
    return _sendError(res, e.status || 500, e.message || String(e));
  }
});

router.post('/attempts/:attemptId/answers', getCurrentUser, async (req, res, next) => {
  try {
    const paramParsed = AttemptIdParam.safeParse(req.params);
    if (!paramParsed.success) return _sendError(res, 400, paramParsed.error.message);
    const bodyParsed = SubmitAnswerRequest.safeParse(req.body || {});
    if (!bodyParsed.success) return _sendError(res, 400, bodyParsed.error.message);
    const userId = _userId(req);
    const repo = _repo(req);
    const attempt = await repo.getAttempt(paramParsed.data.attemptId, userId);
    if (!attempt) return _sendError(res, 404, 'Attempt not found');
    if (attempt.finishedAt) {
      return _sendError(res, 400, 'Attempt already finished');
    }

    const questions = await repo.listQuestions(attempt.quizSetId, userId);
    const q = questions.find((x) => x.id === bodyParsed.data.questionId);
    if (!q) return _sendError(res, 404, 'Question not found');
    const isCorrect = q.correct === bodyParsed.data.selected;
    const { answer, created } = await repo.recordAnswer({
      attemptId: paramParsed.data.attemptId,
      questionId: bodyParsed.data.questionId,
      userId,
      selected: bodyParsed.data.selected,
      isCorrect,
      timeSeconds: bodyParsed.data.timeSeconds ?? null,
    });


    if (isCorrect && created) {
      await awardXpSafely(req, 'quiz_correct', {
        metadata: {
          questionId: bodyParsed.data.questionId,
          attemptId: paramParsed.data.attemptId,
        },
      });
    }
    await _commit(req);
    return res.status(201).json({
      answer: _shapeAnswer(answer),
      isCorrect,
      correct: q.correct,
      correctText: q.optionFor(q.correct),
      explanation: q.explanation,
    });
  } catch (e) {
    await _rollback(req);
    logger.error(`Quiz submitAnswer error: ${e.message || e}`);
    return _sendError(res, e.status || 500, e.message || String(e));
  }
});

router.post('/attempts/:attemptId/finish', getCurrentUser, async (req, res, next) => {
  try {
    const paramParsed = AttemptIdParam.safeParse(req.params);
    if (!paramParsed.success) return _sendError(res, 400, paramParsed.error.message);
    const bodyParsed = FinishAttemptRequest.safeParse(req.body || {});
    if (!bodyParsed.success) return _sendError(res, 400, bodyParsed.error.message);
    const userId = _userId(req);
    const agent = getQuizAgent();
    const graded = await agent.gradeAttempt({
      attemptId: paramParsed.data.attemptId,
      userId,
      pool: req.db || pool,
    });
    const attempt = await _repo(req).finishAttempt(
      paramParsed.data.attemptId,
      userId,
      {
        score: graded.score,
        correctCount: graded.correctCount,
        total: graded.total,
        wrongTopics: graded.wrongTopics,
        durationSeconds: bodyParsed.data.durationSeconds ?? null,
      },
    );
    if (!attempt) return _sendError(res, 400, 'Attempt already finished or not found');

    let deck = null;
    if (bodyParsed.data.createSrsDeck && graded.wrongQuestions.length > 0) {
      deck = await agent.createSrsDeckFromWrongAnswers({
        attempt: {
          ...attempt,
          wrongQuestions: graded.wrongQuestions,
        },
        userId,
        pool: req.db || pool,
      });
    }

    await awardXpSafely(req, 'quiz_finished', {
      metadata: {
        attemptId: paramParsed.data.attemptId,
        score: graded.score,
        correctCount: graded.correctCount,
        total: graded.total,
      },
    });
    await _commit(req);
    return res.json({
      attempt: _shapeAttempt(attempt),
      srsDeck: deck ? { id: deck.id, title: deck.title } : null,
      wrongQuestions: graded.wrongQuestions.map(_shapeQuestion),
      weakTopics: graded.wrongTopics,
    });
  } catch (e) {
    await _rollback(req);
    logger.error(`Quiz finishAttempt error: ${e.message || e}`);
    return _sendError(res, e.status || 500, e.message || String(e));
  }
});

router.post('/attempts/:attemptId/to-srs', getCurrentUser, async (req, res, next) => {
  try {
    const paramParsed = AttemptIdParam.safeParse(req.params);
    if (!paramParsed.success) return _sendError(res, 400, paramParsed.error.message);
    const userId = _userId(req);
    const repo = _repo(req);
    const attempt = await repo.getAttempt(paramParsed.data.attemptId, userId);
    if (!attempt) return _sendError(res, 404, 'Attempt not found');
    const answers = await repo.listAnswers(paramParsed.data.attemptId);
    const wrongIds = answers.filter((a) => !a.isCorrect).map((a) => a.questionId);
    const wrongQuestions = await repo.getQuestionsByIds(wrongIds, userId);
    if (wrongQuestions.length === 0) {
      return res.json({ srsDeck: null, inserted: 0 });
    }
    const agent = getQuizAgent();
    const deck = await agent.createSrsDeckFromWrongAnswers({
      attempt: { ...attempt, wrongQuestions },
      userId,
      pool: req.db || pool,
    });
    await _commit(req);
    return res.json({
      srsDeck: deck ? { id: deck.id, title: deck.title } : null,
      inserted: wrongQuestions.length,
    });
  } catch (e) {
    await _rollback(req);
    logger.error(`Quiz to-srs error: ${e.message || e}`);
    return _sendError(res, e.status || 500, e.message || String(e));
  }
});

router.get('/sets/:quizSetId/attempts', getCurrentUser, async (req, res, next) => {
  try {
    const paramParsed = QuizSetIdParam.safeParse(req.params);
    if (!paramParsed.success) return _sendError(res, 400, paramParsed.error.message);
    const q = PaginationQuery.safeParse(req.query);
    if (!q.success) return _sendError(res, 400, q.error.message);
    const userId = _userId(req);
    const { page, pageSize } = q.data;
    const { items, total } = await _repo(req).listAttempts(
      paramParsed.data.quizSetId,
      userId,
      { page, pageSize },
    );
    return res.json({
      attempts: items.map(_shapeAttempt),
      total,
      page,
      pageSize,
    });
  } catch (e) {
    return _sendError(res, e.status || 500, e.message || String(e));
  }
});

router.get('/stats', getCurrentUser, async (req, res, next) => {
  try {
    const userId = _userId(req);
    const stats = await _repo(req).getUserStats(userId);
    return res.json(stats);
  } catch (e) {
    return _sendError(res, e.status || 500, e.message || String(e));
  }
});





router.get('/health', async (_req, res, next) => {
  try {
    res.json({ status: 'ok', service: 'quiz' });
  } catch (e) {
    next(e);
  }
});

export default router;