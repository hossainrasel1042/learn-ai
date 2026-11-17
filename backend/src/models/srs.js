














































import { toIso } from '../utils/date.js';





export class FlashcardDeck {
  constructor({
    id,
    userId,
    title,
    description = null,
    sourceType = null,
    sourceId = null,
    cardCount = 0,
    createdAt,
    updatedAt,
  }) {
    this.id = id;
    this.userId = userId;
    this.title = title;
    this.description = description;
    this.sourceType = sourceType;
    this.sourceId = sourceId;
    this.cardCount = cardCount;
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
      cardCount: this.cardCount,
      createdAt: toIso(this.createdAt),
      updatedAt: toIso(this.updatedAt),
    };
  }
}

export class Flashcard {
  constructor({
    id,
    deckId,
    userId,
    front,
    back,
    tags = [],
    easeFactor = 2.5,
    intervalDays = 0,
    repetitions = 0,
    dueAt,
    lastReviewed = null,
    createdAt,
  }) {
    this.id = id;
    this.deckId = deckId;
    this.userId = userId;
    this.front = front;
    this.back = back;
    this.tags = tags || [];
    this.easeFactor = easeFactor;
    this.intervalDays = intervalDays;
    this.repetitions = repetitions;
    this.dueAt = dueAt;
    this.lastReviewed = lastReviewed;
    this.createdAt = createdAt;
  }


  toDict() {
    return {
      id: this.id,
      deckId: this.deckId,
      userId: this.userId,
      front: this.front,
      back: this.back,
      tags: this.tags || [],
      easeFactor: this.easeFactor,
      intervalDays: this.intervalDays,
      repetitions: this.repetitions,
      dueAt: toIso(this.dueAt),
      lastReviewed: this.lastReviewed ? toIso(this.lastReviewed) : null,
      createdAt: toIso(this.createdAt),
    };
  }
}

export class FlashcardReview {
  constructor({
    id,
    cardId,
    userId,
    rating,
    prevInterval = null,
    newInterval = null,
    prevEase = null,
    newEase = null,
    reviewedAt,
  }) {
    this.id = id;
    this.cardId = cardId;
    this.userId = userId;
    this.rating = rating;
    this.prevInterval = prevInterval;
    this.newInterval = newInterval;
    this.prevEase = prevEase;
    this.newEase = newEase;
    this.reviewedAt = reviewedAt;
  }


  toDict() {
    return {
      id: this.id,
      cardId: this.cardId,
      userId: this.userId,
      rating: this.rating,
      prevInterval: this.prevInterval,
      newInterval: this.newInterval,
      prevEase: this.prevEase,
      newEase: this.newEase,
      reviewedAt: toIso(this.reviewedAt),
    };
  }
}





function rowToDeck(row) {
  return new FlashcardDeck({
    id: row.id,
    userId: row.user_id,
    title: row.title,
    description: row.description,
    sourceType: row.source_type,
    sourceId: row.source_id,
    cardCount: row.card_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function rowToCard(row) {
  return new Flashcard({
    id: row.id,
    deckId: row.deck_id,
    userId: row.user_id,
    front: row.front,
    back: row.back,
    tags: row.tags || [],
    easeFactor: row.ease_factor,
    intervalDays: row.interval_days,
    repetitions: row.repetitions,
    dueAt: row.due_at,
    lastReviewed: row.last_reviewed,
    createdAt: row.created_at,
  });
}

function rowToReview(row) {
  return new FlashcardReview({
    id: row.id,
    cardId: row.card_id,
    userId: row.user_id,
    rating: row.rating,
    prevInterval: row.prev_interval,
    newInterval: row.new_interval,
    prevEase: row.prev_ease,
    newEase: row.new_ease,
    reviewedAt: row.reviewed_at,
  });
}






export function srsRepository(pool) {
  return {


    async createDeck({ userId, title, description = null, sourceType = null, sourceId = null }) {
      const { rows } = await pool.query(
        `INSERT INTO flashcard_decks (user_id, title, description, source_type, source_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, user_id, title, description, source_type, source_id,
                   card_count, created_at, updated_at`,
        [userId, title, description, sourceType, sourceId],
      );
      return rowToDeck(rows[0]);
    },

    async listDecks(userId, { page = 1, pageSize = 20 } = {}) {
      const offset = (page - 1) * pageSize;
      const { rows } = await pool.query(
        `SELECT id, user_id, title, description, source_type, source_id,
                card_count, created_at, updated_at
         FROM flashcard_decks
         WHERE user_id = $1
         ORDER BY updated_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, pageSize, offset],
      );
      const countRes = await pool.query(
        `SELECT COUNT(*)::int AS count FROM flashcard_decks WHERE user_id = $1`,
        [userId],
      );
      return {
        items: rows.map(rowToDeck),
        total: countRes.rows[0].count,
      };
    },

    async getDeck(deckId, userId) {
      const { rows } = await pool.query(
        `SELECT id, user_id, title, description, source_type, source_id,
                card_count, created_at, updated_at
         FROM flashcard_decks
         WHERE id = $1 AND user_id = $2`,
        [deckId, userId],
      );
      if (rows.length === 0) return null;
      return rowToDeck(rows[0]);
    },

    async updateDeck(deckId, userId, { title, description }) {
      const { rows } = await pool.query(
        `UPDATE flashcard_decks
         SET title = COALESCE($3, title),
             description = COALESCE($4, description),
             updated_at = now()
         WHERE id = $1 AND user_id = $2
         RETURNING id, user_id, title, description, source_type, source_id,
                   card_count, created_at, updated_at`,
        [deckId, userId, title ?? null, description ?? null],
      );
      if (rows.length === 0) return null;
      return rowToDeck(rows[0]);
    },

    async deleteDeck(deckId, userId) {
      const { rowCount } = await pool.query(
        `DELETE FROM flashcard_decks WHERE id = $1 AND user_id = $2`,
        [deckId, userId],
      );
      return rowCount > 0;
    },

    async refreshDeckCardCount(deckId, client = null) {
      const c = client || pool;
      await c.query(
        `UPDATE flashcard_decks
         SET card_count = (SELECT COUNT(*) FROM flashcards WHERE deck_id = $1),
             updated_at = now()
         WHERE id = $1`,
        [deckId],
      );
    },



    async insertCards(cards) {
      if (!cards || cards.length === 0) return [];

      const cols = ['deck_id', 'user_id', 'front', 'back', 'tags'];
      const valuesSql = [];
      const params = [];
      cards.forEach((c, i) => {
        const base = i * cols.length;
        valuesSql.push(
          `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`,
        );
        params.push(c.deckId, c.userId, c.front, c.back, c.tags || []);
      });
      const sql = `
        INSERT INTO flashcards (${cols.join(', ')})
        VALUES ${valuesSql.join(', ')}
        RETURNING id, deck_id, user_id, front, back, tags,
                  ease_factor, interval_days, repetitions,
                  due_at, last_reviewed, created_at
      `;




      const isTransactionalClient = typeof pool?.release === 'function';
      const workClient = isTransactionalClient ? pool : await pool.connect();
      const ownConnection = !isTransactionalClient;

      try {
        if (ownConnection) {
          await workClient.query('BEGIN');
        }

        const { rows } = await workClient.query(sql, params);

        if (cards.length > 0) {
          await this.refreshDeckCardCount(cards[0].deckId, workClient);
        }

        if (ownConnection) await workClient.query('COMMIT');
        return rows.map(rowToCard);
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

    async listCards(deckId, userId, { page = 1, pageSize = 50 } = {}) {
      const offset = (page - 1) * pageSize;
      const { rows } = await pool.query(
        `SELECT id, deck_id, user_id, front, back, tags,
                ease_factor, interval_days, repetitions,
                due_at, last_reviewed, created_at
         FROM flashcards
         WHERE deck_id = $1 AND user_id = $2
         ORDER BY created_at ASC
         LIMIT $3 OFFSET $4`,
        [deckId, userId, pageSize, offset],
      );
      const countRes = await pool.query(
        `SELECT COUNT(*)::int AS count FROM flashcards WHERE deck_id = $1 AND user_id = $2`,
        [deckId, userId],
      );
      return {
        items: rows.map(rowToCard),
        total: countRes.rows[0].count,
      };
    },

    async getCard(cardId, userId) {
      const { rows } = await pool.query(
        `SELECT id, deck_id, user_id, front, back, tags,
                ease_factor, interval_days, repetitions,
                due_at, last_reviewed, created_at
         FROM flashcards
         WHERE id = $1 AND user_id = $2`,
        [cardId, userId],
      );
      if (rows.length === 0) return null;
      return rowToCard(rows[0]);
    },

    async updateCardSchedule(cardId, fields) {
      const { rows } = await pool.query(
        `UPDATE flashcards
         SET ease_factor = $2,
             interval_days = $3,
             repetitions = $4,
             due_at = $5,
             last_reviewed = now()
         WHERE id = $1
         RETURNING id, deck_id, user_id, front, back, tags,
                   ease_factor, interval_days, repetitions,
                   due_at, last_reviewed, created_at`,
        [cardId, fields.easeFactor, fields.intervalDays, fields.repetitions, fields.dueAt],
      );
      if (rows.length === 0) return null;
      return rowToCard(rows[0]);
    },

    async deleteCard(cardId, userId) {


      const isTransactionalClient = typeof pool?.release === 'function';
      const workClient = isTransactionalClient ? pool : await pool.connect();
      const ownConnection = !isTransactionalClient;

      try {
        if (ownConnection) {
          await workClient.query('BEGIN');
        }



        const lookup = await workClient.query(
          `SELECT deck_id FROM flashcards WHERE id = $1 AND user_id = $2`,
          [cardId, userId],
        );
        const { rowCount } = await workClient.query(
          `DELETE FROM flashcards WHERE id = $1 AND user_id = $2`,
          [cardId, userId],
        );
        if (rowCount > 0) {
          const deckId = lookup.rows[0]?.deck_id;
          if (deckId) {
            await this.refreshDeckCardCount(deckId, workClient);
          }
        }

        if (ownConnection) await workClient.query('COMMIT');
        return rowCount > 0;
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

    async getDueCards(userId, { deckId = null, limit = 20, now = null } = {}) {
      const ts = now || new Date();
      const params = [userId, ts];
      let deckFilter = '';
      if (deckId) {
        deckFilter = 'AND deck_id = $3';
        params.push(deckId);
      }
      params.push(limit);
      const limitIdx = params.length;
      const { rows } = await pool.query(
        `SELECT id, deck_id, user_id, front, back, tags,
                ease_factor, interval_days, repetitions,
                due_at, last_reviewed, created_at
         FROM flashcards
         WHERE user_id = $1 AND due_at <= $2 ${deckFilter}
         ORDER BY due_at ASC
         LIMIT $${limitIdx}`,
        params,
      );
      return rows.map(rowToCard);
    },



    async insertReview({
      cardId,
      userId,
      rating,
      prevInterval = null,
      newInterval = null,
      prevEase = null,
      newEase = null,
    }) {
      const { rows } = await pool.query(
        `INSERT INTO flashcard_reviews
           (card_id, user_id, rating, prev_interval, new_interval, prev_ease, new_ease)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, card_id, user_id, rating, prev_interval, new_interval,
                   prev_ease, new_ease, reviewed_at`,
        [cardId, userId, rating, prevInterval, newInterval, prevEase, newEase],
      );
      return rowToReview(rows[0]);
    },

    async getDeckStats(deckId, userId) {
      const countsRes = await pool.query(
        `SELECT
           COUNT(*)::int                                       AS total,
           COUNT(*) FILTER (WHERE due_at <= now())::int        AS due,
           COUNT(*) FILTER (WHERE repetitions > 0)::int        AS learned,
           COUNT(*) FILTER (WHERE repetitions = 0)::int        AS new_cards
         FROM flashcards
         WHERE deck_id = $1 AND user_id = $2`,
        [deckId, userId],
      );
      const retentionRes = await pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE r.rating >= 3)::int AS correct,
           COUNT(*)::int                              AS total_reviews
         FROM flashcard_reviews r
         JOIN flashcards f ON f.id = r.card_id
         WHERE f.deck_id = $1 AND r.user_id = $2`,
        [deckId, userId],
      );
      const counts = countsRes.rows[0];
      const reviews = retentionRes.rows[0];
      const retention =
        reviews.total_reviews > 0
          ? Number((reviews.correct / reviews.total_reviews).toFixed(4))
          : null;
      return {
        total: counts.total,
        due: counts.due,
        learned: counts.learned,
        newCards: counts.new_cards,
        retention,
        totalReviews: reviews.total_reviews,
      };
    },
  };
}
