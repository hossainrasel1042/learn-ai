

import { chatRepository } from '../models/chat.js';
import { getVectorStore } from '../services/vectorStoreService.js';
import { logger } from '../utils/logger.js';


export async function collectChatText(chatId, userId, pool) {
  const repo = chatRepository(pool);

  const chat = await repo.findById(chatId);
  if (!chat || chat.userId !== userId) {
    logger.warn(
      `collectChatText: chat ${chatId} is not owned by ${userId} — refusing to read it`,
    );
    return '';
  }

  const msgs = await repo.getMessages(chatId, 30);
  return msgs
    .filter((m) => m.content && (m.role === 'user' || m.role === 'assistant'))
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n');
}


export async function collectCourseText(courseId, _userId, _pool) {
  const vectorStore = getVectorStore('learnai');

  let chunks = [];
  try {
    chunks = await vectorStore.getByFilter({ course_id: String(courseId) }, 200);
  } catch (e) {


    logger.warn(`collectCourseText: vector store lookup failed: ${e.message || e}`);
    return '';
  }

  if (!chunks || chunks.length === 0) {
    logger.warn(`collectCourseText: no RAG chunks found for course ${courseId}`);
    return '';
  }



  const byFile = new Map();
  for (const chunk of chunks) {
    const meta = chunk.metadata || {};
    const key = meta.source_file || meta.source_object_key || meta.filename || 'material';
    if (!byFile.has(key)) {
      byFile.set(key, { title: meta.title || meta.filename || 'Material', parts: [] });
    }
    const content = (chunk.content || '').trim();
    if (content) byFile.get(key).parts.push(content);
  }

  const text = [...byFile.values()]
    .map((f) => `FILE: ${f.title}\n${f.parts.join('\n---\n')}`)
    .join('\n\n');

  logger.info(
    `collectCourseText: course=${courseId} chunks=${chunks.length} files=${byFile.size} chars=${text.length}`,
  );
  return text;
}