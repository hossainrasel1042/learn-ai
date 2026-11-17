

































































import { toIso } from '../utils/date.js';





export class QuizSet {
  constructor({
    id,
    userId,
    title,
    description = null,
    sourceType = null,
    sourceId = null,
    questionCount = 0,
    createdAt,
    updatedAt,
  }) {
    this.id = id;
    this.userId = userId;
    this.title = title;
    this.description = description;
    this.sourceType = sourceType;
    this.sourceId = sourceId;
    this.questionCount = questionCount;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }


  toDict() {
    return {
      id: this.id,
      userId: this.userId,
      title: this.title,
      description: this.description,
      sourceType: this.sourceType,
      sourceId: this.sourceId,
      questionCount: this.questionCount,
      createdAt: toIso(this.createdAt),
      updatedAt: toIso(this.updatedAt),
    };
  }
}

export class QuizQuestion {
  constructor({
    id,
    quizSetId,
    userId,
    position,
    prompt,
    optionA,
    optionB,
    optionC,
    optionD,
    correct,
    explanation = null,
    tags = [],
    difficulty = null,
    createdAt,
  }) {
    this.id = id;
    this.quizSetId = quizSetId;
    this.userId = userId;
    this.position = position;
    this.prompt = prompt;
    this.optionA = optionA;
    this.optionB = optionB;
    this.optionC = optionC;
    this.optionD = optionD;
    this.correct = correct;
    this.explanation = explanation;
    this.tags = tags || [];
    this.difficulty = difficulty;
    this.createdAt = createdAt;
  }


  optionFor(letter) {
    switch ((letter || '').toUpperCase()) {
      case 'A': return this.optionA;
      case 'B': return this.optionB;
      case 'C': return this.optionC;
      case 'D': return this.optionD;
      default: return null;
    }
  }


  toDict() {
    return {
      id: this.id,
      quizSetId: this.quizSetId,
      userId: this.userId,
      position: this.position,
      prompt: this.prompt,
      optionA: this.optionA,
      optionB: this.optionB,
      optionC: this.optionC,
      optionD: this.optionD,
      correct: this.correct,
      explanation: this.explanation,
      tags: this.tags || [],
      difficulty: this.difficulty,
      createdAt: toIso(this.createdAt),
    };
  }
}

export class QuizAttempt {
  constructor({
    id,
    quizSetId,
    userId,
    score,
    total,
    correctCount,
    wrongTopics = [],
    srsDeckId = null,
    durationSeconds = null,
    startedAt,
    finishedAt = null,
  }) {
    this.id = id;
    this.quizSetId = quizSetId;
    this.userId = userId;
    this.score = score;
    this.total = total;
    this.correctCount = correctCount;
    this.wrongTopics = wrongTopics || [];
    this.srsDeckId = srsDeckId;
    this.durationSeconds = durationSeconds;
    this.startedAt = startedAt;
    this.finishedAt = finishedAt;
  }


  toDict() {
    return {
      id: this.id,
      quizSetId: this.quizSetId,
      userId: this.userId,
      score: this.score,
      total: this.total,
      correctCount: this.correctCount,
      wrongTopics: this.wrongTopics || [],
      srsDeckId: this.srsDeckId,
      durationSeconds: this.durationSeconds,
      startedAt: toIso(this.startedAt),
      finishedAt: this.finishedAt ? toIso(this.finishedAt) : null,
    };
  }
}

export class QuizAnswer {
  constructor({
    id,
    attemptId,
    questionId,
    userId,
    selected,
    isCorrect,
    timeSeconds = null,
    answeredAt,
  }) {
    this.id = id;
    this.attemptId = attemptId;
    this.questionId = questionId;
    this.userId = userId;
    this.selected = selected;
    this.isCorrect = isCorrect;
    this.timeSeconds = timeSeconds;
    this.answeredAt = answeredAt;
  }


  toDict() {
    return {
      id: this.id,
      attemptId: this.attemptId,
      questionId: this.questionId,
      userId: this.userId,
      selected: this.selected,
      isCorrect: this.isCorrect,
      timeSeconds: this.timeSeconds,
      answeredAt: toIso(this.answeredAt),
    };
  }
}





function rowToQuizSet(row) {
  return new QuizSet({
    id: row.id,
    userId: row.user_id,
    title: row.title,
    description: row.description,
    sourceType: row.source_type,
    sourceId: row.source_id,
    questionCount: row.question_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function rowToQuizQuestion(row) {
  return new QuizQuestion({
    id: row.id,
    quizSetId: row.quiz_set_id,
    userId: row.user_id,
    position: row.position,
    prompt: row.prompt,
    optionA: row.option_a,
    optionB: row.option_b,
    optionC: row.option_c,
    optionD: row.option_d,
    correct: row.correct,
    explanation: row.explanation,
    tags: row.tags || [],
    difficulty: row.difficulty,
    createdAt: row.created_at,
  });
}

function rowToQuizAttempt(row) {
  return new QuizAttempt({
    id: row.id,
    quizSetId: row.quiz_set_id,
    userId: row.user_id,
    score: row.score,
    total: row.total,
    correctCount: row.correct_count,
    wrongTopics: row.wrong_topics || [],
    srsDeckId: row.srs_deck_id,
    durationSeconds: row.duration_seconds,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  });
}

function rowToQuizAnswer(row) {
  return new QuizAnswer({
    id: row.id,
    attemptId: row.attempt_id,
    questionId: row.question_id,
    userId: row.user_id,
    selected: row.selected,
    isCorrect: row.is_correct,
    timeSeconds: row.time_seconds,
    answeredAt: row.answered_at,
  });
}






export function quizRepository(pool) {
  return {


    async createQuizSet({ userId, title, description = null, sourceType = null, sourceId = null }) {
      const { rows } = await pool.query(
        `INSERT INTO quiz_sets (user_id, title, description, source_type, source_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, user_id, title, description, source_type, source_id,
                   question_count, created_at, updated_at`,
        [userId, title, description, sourceType, sourceId],
      );
      return rowToQuizSet(rows[0]);
    },

    async listQuizSets(userId, { page = 1, pageSize = 20 } = {}) {
      const offset = (page - 1) * pageSize;
      const { rows } = await pool.query(
        `SELECT id, user_id, title, description, source_type, source_id,
                question_count, created_at, updated_at
         FROM quiz_sets
         WHERE user_id = $1
         ORDER BY updated_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, pageSize, offset],
      );
      const countRes = await pool.query(
        `SELECT COUNT(*)::int AS count FROM quiz_sets WHERE user_id = $1`,
        [userId],
      );
      return {
        items: rows.map(rowToQuizSet),
        total: countRes.rows[0].count,
      };
    },

    async getQuizSet(quizSetId, userId) {
      const { rows } = await pool.query(
        `SELECT id, user_id, title, description, source_type, source_id,
                question_count, created_at, updated_at
         FROM quiz_sets
         WHERE id = $1 AND user_id = $2`,
        [quizSetId, userId],
      );
      if (rows.length === 0) return null;
      return rowToQuizSet(rows[0]);
    },

    async updateQuizSet(quizSetId, userId, { title, description }) {
      const { rows } = await pool.query(
        `UPDATE quiz_sets
         SET title = COALESCE($3, title),
             description = COALESCE($4, description),
             updated_at = now()
         WHERE id = $1 AND user_id = $2
         RETURNING id, user_id, title, description, source_type, source_id,
                   question_count, created_at, updated_at`,
        [quizSetId, userId, title ?? null, description ?? null],
      );
      if (rows.length === 0) return null;
      return rowToQuizSet(rows[0]);
    },

    async deleteQuizSet(quizSetId, userId) {
      const { rowCount } = await pool.query(
        `DELETE FROM quiz_sets WHERE id = $1 AND user_id = $2`,
        [quizSetId, userId],
      );
      return rowCount > 0;
    },



    async insertQuestions(questions) {
      if (!questions || questions.length === 0) return [];
      const cols = [
        'quiz_set_id', 'user_id', 'position',
        'prompt', 'option_a', 'option_b', 'option_c', 'option_d',
        'correct', 'explanation', 'tags', 'difficulty',
      ];
      const valuesSql = [];
      const params = [];
      questions.forEach((q, i) => {
        const base = i * cols.length;
        valuesSql.push(
          `($${base + 1}, $${base + 2}, $${base + 3},
            $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8},
            $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12})`,
        );
        params.push(
          q.quizSetId, q.userId, q.position,
          q.prompt, q.optionA, q.optionB, q.optionC, q.optionD,
          q.correct, q.explanation ?? null, q.tags || [], q.difficulty ?? null,
        );
      });
      const sql = `
        INSERT INTO quiz_questions (${cols.join(', ')})
        VALUES ${valuesSql.join(', ')}
        RETURNING id, quiz_set_id, user_id, position, prompt,
                  option_a, option_b, option_c, option_d,
                  correct, explanation, tags, difficulty, created_at
      `;




      const isTransactionalClient = typeof pool?.release === 'function';
      const workClient = isTransactionalClient ? pool : await pool.connect();
      const ownConnection = !isTransactionalClient;

      try {
        if (ownConnection) {
          await workClient.query('BEGIN');
        }

        const { rows } = await workClient.query(sql, params);

        if (questions.length > 0) {
          await this.refreshQuestionCount(questions[0].quizSetId, workClient);
        }

        if (ownConnection) await workClient.query('COMMIT');
        return rows.map(rowToQuizQuestion);
      } catch (e) {
        if (ownConnection) {
          try {
            await workClient.query('ROLLBACK');
          } catch (_) {

          }
        }
        throw e;
      } finally {
        if (ownConnection) {
          workClient.release();
        }
      }
    },

    async listQuestions(quizSetId, userId) {
      const { rows } = await pool.query(
        `SELECT id, quiz_set_id, user_id, position, prompt,
                option_a, option_b, option_c, option_d,
                correct, explanation, tags, difficulty, created_at
         FROM quiz_questions
         WHERE quiz_set_id = $1 AND user_id = $2
         ORDER BY position ASC`,
        [quizSetId, userId],
      );
      return rows.map(rowToQuizQuestion);
    },

    async getQuestionsByIds(ids, userId) {
      if (!ids || ids.length === 0) return [];
      const { rows } = await pool.query(
        `SELECT id, quiz_set_id, user_id, position, prompt,
                option_a, option_b, option_c, option_d,
                correct, explanation, tags, difficulty, created_at
         FROM quiz_questions
         WHERE user_id = $1 AND id = ANY($2::uuid[])`,
        [userId, ids],
      );
      return rows.map(rowToQuizQuestion);
    },

    async refreshQuestionCount(quizSetId, client = null) {
      const c = client || pool;
      await c.query(
        `UPDATE quiz_sets
         SET question_count = (SELECT COUNT(*) FROM quiz_questions WHERE quiz_set_id = $1),
             updated_at = now()
         WHERE id = $1`,
        [quizSetId],
      );
    },



    async startAttempt({ quizSetId, userId, total }) {



      const existing = await pool.query(
        `SELECT id, quiz_set_id, user_id, score, total, correct_count,
                wrong_topics, srs_deck_id, duration_seconds,
                started_at, finished_at
         FROM quiz_attempts
         WHERE user_id = $1 AND quiz_set_id = $2 AND finished_at IS NULL
         ORDER BY started_at DESC
         LIMIT 1`,
        [userId, quizSetId],
      );
      if (existing.rows.length > 0) {
        return rowToQuizAttempt(existing.rows[0]);
      }
      const { rows } = await pool.query(
        `INSERT INTO quiz_attempts (quiz_set_id, user_id, score, total, correct_count)
         VALUES ($1, $2, 0, $3, 0)
         RETURNING id, quiz_set_id, user_id, score, total, correct_count,
                   wrong_topics, srs_deck_id, duration_seconds,
                   started_at, finished_at`,
        [quizSetId, userId, total],
      );
      return rowToQuizAttempt(rows[0]);
    },

    async getAttempt(attemptId, userId) {
      const { rows } = await pool.query(
        `SELECT id, quiz_set_id, user_id, score, total, correct_count,
                wrong_topics, srs_deck_id, duration_seconds,
                started_at, finished_at
         FROM quiz_attempts
         WHERE id = $1 AND user_id = $2`,
        [attemptId, userId],
      );
      if (rows.length === 0) return null;
      return rowToQuizAttempt(rows[0]);
    },

    async listAnswers(attemptId) {
      const { rows } = await pool.query(
        `SELECT id, attempt_id, question_id, user_id, selected, is_correct,
                time_seconds, answered_at
         FROM quiz_answers
         WHERE attempt_id = $1
         ORDER BY answered_at ASC`,
        [attemptId],
      );
      return rows.map(rowToQuizAnswer);
    },

    async listAnswersForAttemptAndQuestions(attemptId, questionIds) {
      if (!questionIds || questionIds.length === 0) return [];
      const { rows } = await pool.query(
        `SELECT id, attempt_id, question_id, user_id, selected, is_correct,
                time_seconds, answered_at
         FROM quiz_answers
         WHERE attempt_id = $1 AND question_id = ANY($2::uuid[])`,
        [attemptId, questionIds],
      );
      return rows.map(rowToQuizAnswer);
    },

    async recordAnswer({ attemptId, questionId, userId, selected, isCorrect, timeSeconds = null }) {




      const { rows } = await pool.query(
        `INSERT INTO quiz_answers
           (attempt_id, question_id, user_id, selected, is_correct, time_seconds)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (attempt_id, question_id) DO NOTHING
         RETURNING id, attempt_id, question_id, user_id, selected, is_correct,
                   time_seconds, answered_at`,
        [attemptId, questionId, userId, selected, isCorrect, timeSeconds],
      );
      if (rows.length === 0) {

        const existing = await pool.query(
          `SELECT id, attempt_id, question_id, user_id, selected, is_correct,
                  time_seconds, answered_at
           FROM quiz_answers
           WHERE attempt_id = $1 AND question_id = $2`,
          [attemptId, questionId],
        );
        return { answer: rowToQuizAnswer(existing.rows[0]), created: false };
      }
      return { answer: rowToQuizAnswer(rows[0]), created: true };
    },

    async finishAttempt(attemptId, userId, {
      score,
      correctCount,
      total,
      wrongTopics,
      durationSeconds,
      srsDeckId = null,
    }) {
      const { rows } = await pool.query(
        `UPDATE quiz_attempts
         SET score = $3,
             correct_count = $4,
             total = $5,
             wrong_topics = $6,
             duration_seconds = $7,
             srs_deck_id = COALESCE($8, srs_deck_id),
             finished_at = now()
         WHERE id = $1 AND user_id = $2 AND finished_at IS NULL
         RETURNING id, quiz_set_id, user_id, score, total, correct_count,
                   wrong_topics, srs_deck_id, duration_seconds,
                   started_at, finished_at`,
        [
          attemptId,
          userId,
          score,
          correctCount,
          total,
          wrongTopics || [],
          durationSeconds,
          srsDeckId,
        ],
      );
      if (rows.length === 0) return null;
      return rowToQuizAttempt(rows[0]);
    },

    async attachSrsDeck(attemptId, userId, srsDeckId) {
      const { rows } = await pool.query(
        `UPDATE quiz_attempts
         SET srs_deck_id = $3
         WHERE id = $1 AND user_id = $2
         RETURNING id, quiz_set_id, user_id, score, total, correct_count,
                   wrong_topics, srs_deck_id, duration_seconds,
                   started_at, finished_at`,
        [attemptId, userId, srsDeckId],
      );
      if (rows.length === 0) return null;
      return rowToQuizAttempt(rows[0]);
    },

    async listAttempts(quizSetId, userId, { page = 1, pageSize = 20 } = {}) {
      const offset = (page - 1) * pageSize;
      const { rows } = await pool.query(
        `SELECT id, quiz_set_id, user_id, score, total, correct_count,
                wrong_topics, srs_deck_id, duration_seconds,
                started_at, finished_at
         FROM quiz_attempts
         WHERE quiz_set_id = $1 AND user_id = $2 AND finished_at IS NOT NULL
         ORDER BY finished_at DESC
         LIMIT $3 OFFSET $4`,
        [quizSetId, userId, pageSize, offset],
      );
      const countRes = await pool.query(
        `SELECT COUNT(*)::int AS count
         FROM quiz_attempts
         WHERE quiz_set_id = $1 AND user_id = $2 AND finished_at IS NOT NULL`,
        [quizSetId, userId],
      );
      return {
        items: rows.map(rowToQuizAttempt),
        total: countRes.rows[0].count,
      };
    },


    async getQuizSetStats(quizSetId, userId) {
      const { rows } = await pool.query(
        `SELECT
           COUNT(*)::int                                       AS attempts,
           COALESCE(MAX(score), 0)::int                        AS best_score,
           COALESCE(ROUND(AVG(score))::int, 0)::int           AS avg_score,
           COALESCE(SUM(correct_count), 0)::int                AS total_correct,
           COALESCE(SUM(total), 0)::int                        AS total_questions,
           MAX(finished_at)                                    AS last_taken
         FROM quiz_attempts
         WHERE quiz_set_id = $1 AND user_id = $2 AND finished_at IS NOT NULL`,
        [quizSetId, userId],
      );
      return rows[0] || {
        attempts: 0, best_score: 0, avg_score: 0,
        total_correct: 0, total_questions: 0, last_taken: null,
      };
    },


    async getUserStats(userId) {
      const summary = await pool.query(
        `SELECT
           COUNT(*)::int                            AS attempts,
           COALESCE(SUM(correct_count), 0)::int     AS total_correct,
           COALESCE(SUM(total), 0)::int             AS total_questions,
           COALESCE(ROUND(AVG(score))::int, 0)::int AS avg_score,
           MAX(finished_at)                         AS last_taken
         FROM quiz_attempts
         WHERE user_id = $1 AND finished_at IS NOT NULL`,
        [userId],
      );
      const row = summary.rows[0] || {};
      const totalCorrect = Number(row.total_correct || 0);
      const totalQuestions = Number(row.total_questions || 0);
      const accuracy = totalQuestions > 0
        ? Number(((totalCorrect / totalQuestions) * 100).toFixed(1))
        : null;
      return {
        attempts: Number(row.attempts || 0),
        avgScore: Number(row.avg_score || 0),
        accuracy,
        totalCorrect,
        totalQuestions,
        lastTaken: row.last_taken || null,
      };
    },
  };
}