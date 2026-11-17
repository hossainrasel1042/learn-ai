

import express from 'express';
import { z } from 'zod';

import { ChatService } from './service.js';
import {
  ChatCreate,
  MessageCreate,
  PaginationQuery,
  ChatIdParam,
} from './schemas.js';
import { logger } from '../utils/logger.js';
import { getCurrentUser } from '../middlewares/auth.js';
import { awardXpFire } from '../gamification_agent/hook.js';

const router = express.Router();


function _getUserId(req) {
  if (req.user && (req.user.id || req.user.userId)) {
    return req.user.id || req.user.userId;
  }
  const err = new Error('Unauthorized');
  err.status = 401;
  throw err;
}

function _service(req) {


  return new ChatService(req.db);
}


function _invalidChatId(res, chatId) {
  const parsed = ChatIdParam.safeParse({ chatId });
  if (parsed.success) return null;
  return res.status(400).json({ error: 'chatId must be a UUID' });
}


function _ssePayload(ev) {
  const raw = ev?.data;
  if (typeof raw === 'string') {
    return { content: raw };
  }
  if (raw === null || raw === undefined) {
    return { content: '' };
  }



  let content;
  try {
    content = JSON.stringify(raw);
  } catch {
    content = String(raw);
  }
  return { content, ...(typeof raw === 'object' ? raw : {}) };
}






router.post('/', getCurrentUser, async (req, res, next) => {
  try {
    const userId = _getUserId(req);
    const parsed = ChatCreate.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.message });
    }
    const chat = await _service(req).createChat({
      userId,
      title: parsed.data.title,
    });




    await req.dbCommit?.();
    return res.status(201).json(chat.toDict());
  } catch (e) {
    try {
      await req.dbRollback?.();
    } catch (_) {

    }
    next(e);
  }
});


router.get('/', getCurrentUser, async (req, res, next) => {
  try {
    const userId = _getUserId(req);
    const parsed = PaginationQuery.safeParse(req.query || {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.message });
    }
    const { page, pageSize } = parsed.data;
    const result = await _service(req).listChats({ userId, page, pageSize });
    return res.json(result.toDict());
  } catch (e) {
    next(e);
  }
});


router.get('/:chatId', getCurrentUser, async (req, res, next) => {
  try {
    const userId = _getUserId(req);
    const invalid = _invalidChatId(res, req.params.chatId);
    if (invalid) return invalid;
    const detail = await _service(req).getChat({
      chatId: req.params.chatId,
      userId,
    });
    if (!detail) return res.status(404).json({ error: 'Chat not found' });
    return res.json(detail.toDict());
  } catch (e) {
    next(e);
  }
});


router.post('/:chatId/message', getCurrentUser, async (req, res, next) => {
  try {
    const userId = _getUserId(req);
    const parsed = MessageCreate.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.message });
    }
    const { chatId } = req.params;
    const invalid = _invalidChatId(res, chatId);
    if (invalid) return invalid;
    const { content } = parsed.data;
    const stream = req.query.stream === 'true' || req.query.stream === '1';












    let persistSucceeded = false;
    let turnOk = false;
    const fireXp = () => {
      if (!persistSucceeded || !turnOk) return;















      const xpReq = { ...req, db: undefined, user: { id: userId } };
      awardXpFire(xpReq, 'chat_message', { metadata: { chatId } });
    };

    if (stream) {

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      const svc = _service(req);



      const turnResult = { ok: false };
      try {
        for await (const ev of svc.sendMessageStream({
          chatId,
          userId,
          content,
          result: turnResult,
        })) {
          res.write(`event: ${ev.event}\n`);
          res.write(`data: ${JSON.stringify(_ssePayload(ev))}\n\n`);
        }
      } catch (e) {
        logger.error(`SSE stream error: ${e.message || e}`);
        res.write(
          `event: error\ndata: ${JSON.stringify({ content: e.message || String(e) })}\n\n`
        );
      } finally {
        res.end();

        try {
          await req.dbCommit?.();
          persistSucceeded = true;
        } catch (e) {

        }

        turnOk = turnResult.ok === true;

        fireXp();
      }
      return;
    }


    const reply = await _service(req).sendMessage({
      chatId,
      userId,
      content,
    });
    try {
      await req.dbCommit?.();
      persistSucceeded = true;


      turnOk = true;
    } catch (e) {

    }
    fireXp();
    return res.json({ reply });
  } catch (e) {
    try {
      await req.dbRollback?.();
    } catch (_) {

    }
    next(e);
  }
});


router.delete('/:chatId', getCurrentUser, async (req, res, next) => {
  try {
    const userId = _getUserId(req);
    const invalid = _invalidChatId(res, req.params.chatId);
    if (invalid) return invalid;
    const ok = await _service(req).deleteChat({
      chatId: req.params.chatId,
      userId,
    });
    if (!ok) return res.status(404).json({ error: 'Chat not found' });


    await req.dbCommit?.();
    return res.status(204).end();
  } catch (e) {
    try {
      await req.dbRollback?.();
    } catch (_) {

    }
    next(e);
  }
});


const UpdateTitleSchema = z.object({
  title: z.string().min(1).max(200),
});

router.patch('/:chatId/title', getCurrentUser, async (req, res, next) => {
  try {
    const userId = _getUserId(req);
    const parsed = UpdateTitleSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.message });
    }
    const invalid = _invalidChatId(res, req.params.chatId);
    if (invalid) return invalid;
    const chat = await _service(req).updateChatTitle({
      chatId: req.params.chatId,
      userId,
      title: parsed.data.title,
    });
    if (!chat) return res.status(404).json({ error: 'Chat not found' });


    await req.dbCommit?.();
    return res.json(chat.toDict());
  } catch (e) {
    try {
      await req.dbRollback?.();
    } catch (_) {

    }
    next(e);
  }
});

export default router;