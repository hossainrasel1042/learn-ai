


























export class Chat {

  constructor({ id, userId, title, createdAt, updatedAt }) {
    this.id = id;
    this.userId = userId;
    this.title = title;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;

    this.messages = [];
  }
}


export class Message {

  constructor({ id, chatId, role, content, metadata, createdAt }) {
    this.id = id;
    this.chatId = chatId;
    this.role = role;
    this.content = content;
    this.metadata = metadata ?? null;
    this.createdAt = createdAt;
  }
}


export function chatRepository(pool) {
  return {

    async create({ userId, id, title }) {
      const params = [];
      const cols = ["user_id"];
      const vals = ["$1"];
      params.push(userId);
      if (id !== undefined) {
        params.push(id);
        cols.push("id");
        vals.push(`$${params.length}`);
      }
      if (title !== undefined) {
        params.push(title);
        cols.push("title");
        vals.push(`$${params.length}`);
      }
      const sql = `
        INSERT INTO chat_agent.chats (${cols.join(", ")})
        VALUES (${vals.join(", ")})
        RETURNING id, user_id, title, created_at, updated_at
      `;
      const { rows } = await pool.query(sql, params);
      const row = rows[0];
      return new Chat({
        id: row.id,
        userId: row.user_id,
        title: row.title,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      });
    },


    async findById(id) {
      const { rows } = await pool.query(
        `SELECT id, user_id, title, created_at, updated_at
         FROM chat_agent.chats
         WHERE id = $1`,
        [id],
      );
      if (rows.length === 0) return null;
      const row = rows[0];
      return new Chat({
        id: row.id,
        userId: row.user_id,
        title: row.title,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      });
    },


    async listByUser(userId, limit = 20, offset = 0) {
      const { rows } = await pool.query(
        `SELECT id, user_id, title, created_at, updated_at
         FROM chat_agent.chats
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset],
      );
      return rows.map(
        (row) =>
          new Chat({
            id: row.id,
            userId: row.user_id,
            title: row.title,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          }),
      );
    },

    async countByUser(userId) {
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS count FROM chat_agent.chats WHERE user_id = $1`,
        [userId],
      );
      return rows[0].count;
    },


    async updateTimestamp(id) {
      const { rowCount } = await pool.query(
        `UPDATE chat_agent.chats SET updated_at = now() WHERE id = $1`,
        [id],
      );
      return rowCount;
    },

    async updateTitle(id, title) {
      const { rowCount } = await pool.query(
        `UPDATE chat_agent.chats SET title = $1, updated_at = now() WHERE id = $2`,
        [title, id],
      );
      return rowCount;
    },

    async delete(id) {
      const { rowCount } = await pool.query(`DELETE FROM chat_agent.chats WHERE id = $1`, [
        id,
      ]);
      return rowCount;
    },


    async addMessage({ id, chatId, role, content, metadata }) {
      const params = [chatId, role, content, metadata ?? null];
      let idClause = "";
      if (id !== undefined) {
        params.unshift(id);
        idClause = "id, ";
      }
      const idx = (n) => `$${n}`;
      const sql = `
        INSERT INTO chat_agent.messages (${idClause}chat_id, role, content, metadata, created_at)
        VALUES (${id !== undefined ? `${idx(1)}, ${idx(2)}, ${idx(3)}, ${idx(4)}` : `${idx(1)}, ${idx(2)}, ${idx(3)}`}, clock_timestamp())
        RETURNING id, chat_id, role, content, metadata, created_at
      `;
      const { rows } = await pool.query(sql, params);
      const row = rows[0];
      return new Message({
        id: row.id,
        chatId: row.chat_id,
        role: row.role,
        content: row.content,
        metadata: row.metadata,
        createdAt: row.created_at,
      });
    },


    async getMessages(chatId, limit = 50) {
      const { rows } = await pool.query(
        `SELECT id, chat_id, role, content, metadata, created_at
         FROM (
           SELECT id, chat_id, role, content, metadata, created_at
           FROM chat_agent.messages
           WHERE chat_id = $1
           ORDER BY created_at DESC
           LIMIT $2
         ) recent
         ORDER BY created_at ASC`,
        [chatId, limit],
      );
      return rows.map(
        (row) =>
          new Message({
            id: row.id,
            chatId: row.chat_id,
            role: row.role,
            content: row.content,
            metadata: row.metadata,
            createdAt: row.created_at,
          }),
      );
    },

    async countMessages(chatId) {
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS count FROM chat_agent.messages WHERE chat_id = $1`,
        [chatId],
      );
      return rows[0].count;
    },
  };
}