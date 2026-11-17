

import { getChatAgent } from './agent.js';
import { getChatMemory } from './memory.js';
import { getSemanticSearchTool } from './tools/index.js';
import { ChatContext } from './context.js';
import { withOwnDb } from '../config/database.js';
import {
  ChatResponse,
  ChatDetailResponse,
  ChatListResponse,
  MessageResponse,
  StreamEventType,
  MessageRole,
} from './schemas.js';
import { logger } from '../utils/logger.js';


export class ChatService {

  constructor(db) {
    this.db = db;
    this.agent = getChatAgent();
    this.memory = getChatMemory();
    this.semanticSearch = getSemanticSearchTool();
  }






  async createChat({ userId, title }) {
    const res = await this.db.query(
      `INSERT INTO chat_agent.chats (user_id, title)
       VALUES ($1, $2)
       RETURNING id, user_id, title, created_at, updated_at`,
      [userId, title || 'New Chat']
    );
    const row = res.rows[0];
    return new ChatResponse({
      id: row.id,
      userId: row.user_id,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      messageCount: 0,
    });
  }


  async listChats({ userId, page = 1, pageSize = 20 }) {
    const offset = (page - 1) * pageSize;

    const chatsRes = await this.db.query(
      `SELECT c.id, c.user_id, c.title, c.created_at, c.updated_at,
              COALESCE(m.cnt, 0)::int AS message_count
       FROM chat_agent.chats c
       LEFT JOIN (
         SELECT chat_id, COUNT(*) AS cnt
         FROM chat_agent.messages
         GROUP BY chat_id
       ) m ON m.chat_id = c.id
       WHERE c.user_id = $1
       ORDER BY c.updated_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, pageSize, offset]
    );

    const totalRes = await this.db.query(
      `SELECT COUNT(*)::int AS total FROM chat_agent.chats WHERE user_id = $1`,
      [userId]
    );

    const chats = chatsRes.rows.map(
      (r) =>
        new ChatResponse({
          id: r.id,
          userId: r.user_id,
          title: r.title,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
          messageCount: r.message_count,
        })
    );

    return new ChatListResponse({
      chats,
      total: totalRes.rows[0].total,
      page,
      pageSize,
    });
  }


  async getChat({ chatId, userId }) {
    const chatRes = await this.db.query(
      `SELECT id, user_id, title, created_at, updated_at
       FROM chat_agent.chats
       WHERE id = $1 AND user_id = $2`,
      [chatId, userId]
    );
    if (chatRes.rows.length === 0) return null;
    const row = chatRes.rows[0];

    const messagesRes = await this.db.query(
      `SELECT id, chat_id, role, content, metadata, created_at
       FROM chat_agent.messages
       WHERE chat_id = $1
       ORDER BY created_at ASC`,
      [chatId]
    );

    const messages = messagesRes.rows.map(
      (m) =>
        new MessageResponse({
          id: m.id,
          chatId: m.chat_id,
          role: m.role,
          content: m.content,
          toolCalls: m.metadata,
          createdAt: m.created_at,
        })
    );

    return new ChatDetailResponse({
      chat: new ChatResponse({
        id: row.id,
        userId: row.user_id,
        title: row.title,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        messageCount: messages.length,
      }),
      messages,
    });
  }


  async sendMessage({ chatId, userId, content }) {
    await this._getChatOrRaise({ chatId, userId });





    const userMsg = await withOwnDb(async (db) => {
      const saved = await this._saveMessageOn(db, {
        chatId,
        role: MessageRole.USER,
        content,
      });


      await this._autoGenerateTitle(chatId, content, db);





      await this._updateChatTimestamp(chatId, db);
      return saved;
    });

    const history = await this._getMessageHistory({ chatId });

    const ctx = new ChatContext(userId, chatId);
    const contextMessages = await ctx.buildContext(history, content, true);
    const { llmMessages, systemPrompt } = this._buildLlmMessages(contextMessages);

    const reply = await this.agent.invoke({
      userId,
      chatId,
      messages: llmMessages,
      systemPrompt,
    });





    const assistantMsg = reply && reply.trim()
      ? await this._saveMessage({
          chatId,
          role: MessageRole.ASSISTANT,
          content: reply,
        })
      : null;




    this._indexMessage({
      userId,
      chatId,
      role: MessageRole.USER,
      content,
      messageId: userMsg.id,
    }).catch((e) =>
      logger.warn(`semantic indexing failed: ${e?.message || e}`)
    );
    if (assistantMsg) {
      this._indexMessage({
        userId,
        chatId,
        role: MessageRole.ASSISTANT,
        content: reply,
        messageId: assistantMsg.id,
      }).catch((e) =>
        logger.warn(`semantic indexing failed: ${e?.message || e}`)
      );
    }

    ctx.extractAndStoreMemories(content, reply).catch((e) =>
      logger.warn(`extractAndStoreMemories failed: ${e?.message || e}`)
    );

    await this._updateChatTimestamp(chatId);
    return reply;
  }


  async *sendMessageStream({ chatId, userId, content, result = null }) {
    try {
      await this._getChatOrRaise({ chatId, userId });












      const userMsg = await withOwnDb(async (db) => {
        const saved = await this._saveMessageOn(
          db,
          {
            chatId,
            role: MessageRole.USER,
            content,
          }
        );


        await this._autoGenerateTitle(chatId, content, db);





        await this._updateChatTimestamp(chatId, db);
        return saved;
      });

      const history = await this._getMessageHistory({ chatId });

      const ctx = new ChatContext(userId, chatId);
      const contextMessages = await ctx.buildContext(history, content, true);
      const { llmMessages, systemPrompt } = this._buildLlmMessages(contextMessages);

      let fullReply = '';
      let agentFailed = false;
      const toolCalls = [];
      for await (const ev of this.agent.stream({
        userId,
        chatId,
        messages: llmMessages,
        systemPrompt,
      })) {
        if (ev.event === StreamEventType.TOKEN) {
          fullReply += ev.data;
        }
        if (ev.event === StreamEventType.END) {
          fullReply = ev.data || fullReply;
        }
        if (ev.event === StreamEventType.TOOL_CALL) {
          toolCalls.push(ev.data);
        }
        if (ev.event === StreamEventType.ERROR) {
          agentFailed = true;
        }
        yield ev;
      }





      if (agentFailed && !fullReply.trim()) {
        logger.warn(
          `chat agent produced no reply for chat ${chatId}; not persisting an empty assistant message`
        );
        await this._updateChatTimestamp(chatId);

        if (result) result.ok = false;
        return;
      }

      const assistantMsg = await this._saveMessage({
        chatId,
        role: MessageRole.ASSISTANT,
        content: fullReply,
        metadata: toolCalls.length > 0 ? { toolCalls } : null,
      });


      this._indexMessage({
        userId,
        chatId,
        role: MessageRole.USER,
        content,
        messageId: userMsg.id,
      }).catch(() => {});
      this._indexMessage({
        userId,
        chatId,
        role: MessageRole.ASSISTANT,
        content: fullReply,
        messageId: assistantMsg.id,
      }).catch(() => {});
      ctx.extractAndStoreMemories(content, fullReply).catch(() => {});

      await this._updateChatTimestamp(chatId);





      if (result) result.ok = true;
    } catch (e) {
      logger.error(`sendMessageStream failed: ${e.message || e}`);

      if (result) result.ok = false;
      yield {
        event: StreamEventType.ERROR,
        data: e?.message || String(e),
        metadata: null,
      };
    }
  }


  async deleteChat({ chatId, userId }) {
    const res = await this.db.query(
      `DELETE FROM chat_agent.chats WHERE id = $1 AND user_id = $2`,
      [chatId, userId]
    );
    if (res.rowCount === 0) return false;


    this.semanticSearch.deleteChatMessages(chatId).catch(() => {});
    this.memory.clearChatMemories(chatId).catch(() => {});
    return true;
  }


  async updateChatTitle({ chatId, userId, title }) {
    const res = await this.db.query(
      `UPDATE chat_agent.chats
       SET title = $3, updated_at = clock_timestamp()
       WHERE id = $1 AND user_id = $2
       RETURNING id, user_id, title, created_at, updated_at`,
      [chatId, userId, title]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];

    const countRes = await this.db.query(
      `SELECT COUNT(*)::int AS cnt FROM chat_agent.messages WHERE chat_id = $1`,
      [chatId]
    );

    return new ChatResponse({
      id: row.id,
      userId: row.user_id,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      messageCount: countRes.rows[0].cnt,
    });
  }






  _buildLlmMessages(contextMessages) {
    const memoryBlocks = [];
    const history = [];

    for (const m of contextMessages || []) {
      if (m.role === MessageRole.SYSTEM) {



        if (m.metadata?.kind === 'memory') {
          memoryBlocks.push(m.content);
        }
        continue;
      }
      history.push({
        role: m.role,
        content: m.content,
        metadata: m.metadata || null,
      });
    }

    let systemPrompt = new ChatContext(0, 0).getSystemPrompt();
    if (memoryBlocks.length > 0) {
      systemPrompt = `${systemPrompt}\n\n${memoryBlocks.join('\n\n')}`;
    }

    return { llmMessages: history, systemPrompt };
  }

  async _getChatOrRaise({ chatId, userId }) {
    const res = await this.db.query(
      `SELECT id FROM chat_agent.chats WHERE id = $1 AND user_id = $2`,
      [chatId, userId]
    );
    if (res.rows.length === 0) {
      const err = new Error('Chat not found');
      err.status = 404;
      throw err;
    }
    return res.rows[0];
  }

  async _saveMessage({ chatId, role, content, metadata = null }) {
    return this._saveMessageOn(this.db, { chatId, role, content, metadata });
  }


  async _saveMessageOn(db, { chatId, role, content, metadata = null }) {
    const res = await db.query(
      `INSERT INTO chat_agent.messages (chat_id, role, content, metadata, created_at)
       VALUES ($1, $2, $3, $4, clock_timestamp())
       RETURNING id, chat_id, role, content, metadata, created_at`,
      [chatId, role, content, metadata ? JSON.stringify(metadata) : null]
    );
    return new MessageResponse({
      id: res.rows[0].id,
      chatId: res.rows[0].chat_id,
      role: res.rows[0].role,
      content: res.rows[0].content,
      toolCalls: res.rows[0].metadata,
      createdAt: res.rows[0].created_at,
    });
  }

  async _getMessageHistory({ chatId }) {



    const res = await this.db.query(
      `SELECT role, content FROM chat_agent.messages
       WHERE chat_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [chatId]
    );
    return res.rows
      .map((r) => ({ role: r.role, content: r.content }))
      .reverse();
  }


  async _updateChatTimestamp(chatId, db = null) {
    const client = db || this.db;
    await client.query(
      `UPDATE chat_agent.chats SET updated_at = clock_timestamp() WHERE id = $1`,
      [chatId]
    );
  }

  async _autoGenerateTitle(chatId, userMessage, db = null) {
    try {
      const title = (userMessage || 'New Chat')
        .split('\n')[0]
        .substring(0, 50)
        .trim();
      if (!title) return;
      const client = db || this.db;
      await client.query(
        `UPDATE chat_agent.chats SET title = $2 WHERE id = $1 AND (title IS NULL OR title = 'New Chat')`,
        [chatId, title]
      );
    } catch (e) {
      logger.warn(`_autoGenerateTitle failed: ${e.message || e}`);
    }
  }

  async _indexMessage({ userId, chatId, role, content, messageId }) {
    return this.semanticSearch.indexMessage({
      userId,
      chatId,
      role,
      content,
      messageId,
    });
  }
}
