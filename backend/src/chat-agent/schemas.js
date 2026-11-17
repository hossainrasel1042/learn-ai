

import { z } from 'zod';






export const MessageRole = Object.freeze({
  USER: 'user',
  ASSISTANT: 'assistant',
  SYSTEM: 'system',
});


export const StreamEventType = Object.freeze({
  START: 'start',
  TOKEN: 'token',
  TOOL_CALL: 'tool_call',
  TOOL_RESULT: 'tool_result',
  END: 'end',
  ERROR: 'error',
});






export const ChatCreate = z.object({
  title: z.string().optional(),
});


export const MessageCreate = z.object({
  content: z
    .string()
    .min(1, 'content must be at least 1 character')
    .max(10000, 'content must be at most 10000 characters'),
});


export const PaginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});


export const ChatIdParam = z.object({
  chatId: z.string().uuid('chatId must be a UUID'),
});






export class ToolCall {
  constructor({ id, name, args = {} } = {}) {
    this.id = id;
    this.name = name;
    this.args = args;
  }

  toDict() {
    return {
      id: this.id,
      name: this.name,
      args: this.args,
    };
  }
}


export class AgentMessage {
  constructor({ role, content, toolCall = null, toolCallId = null, metadata = null } = {}) {
    this.role = role;
    this.content = content;
    this.toolCall = toolCall;
    this.toolCallId = toolCallId;
    this.metadata = metadata;
  }

  toDict() {
    const out = {
      role: this.role,
      content: this.content,
    };
    if (this.toolCall !== null) {
      out.toolCall = this.toolCall.toDict ? this.toolCall.toDict() : this.toolCall;
    }
    if (this.toolCallId !== null) {
      out.toolCallId = this.toolCallId;
    }
    return out;
  }
}


export class MessageResponse {
  constructor({
    id,
    chatId,
    role,
    content,
    toolCalls = null,
    createdAt,
  } = {}) {
    this.id = id;
    this.chatId = chatId;
    this.role = role;
    this.content = content;
    this.toolCalls = toolCalls;
    this.createdAt = createdAt;
  }

  toDict() {
    return {
      id: this.id,
      chatId: this.chatId,
      role: this.role,
      content: this.content,
      toolCalls: this.toolCalls,
      createdAt:
        this.createdAt instanceof Date
          ? this.createdAt.toISOString()
          : this.createdAt,
    };
  }
}


export class ChatResponse {
  constructor({
    id,
    userId,
    title,
    createdAt,
    updatedAt,
    messageCount = 0,
  } = {}) {
    this.id = id;
    this.userId = userId;
    this.title = title;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.messageCount = messageCount;
  }

  toDict() {
    return {
      id: this.id,
      userId: this.userId,
      title: this.title,
      createdAt:
        this.createdAt instanceof Date
          ? this.createdAt.toISOString()
          : this.createdAt,
      updatedAt:
        this.updatedAt instanceof Date
          ? this.updatedAt.toISOString()
          : this.updatedAt,
      messageCount: this.messageCount,
    };
  }
}


export class ChatDetailResponse {
  constructor({ chat, messages = [] } = {}) {
    this.chat = chat;
    this.messages = messages;
  }

  toDict() {
    const chat = this.chat ? this.chat.toDict() : null;
    const messages = this.messages
      ? this.messages.map((m) => (m.toDict ? m.toDict() : m))
      : [];
    if (!chat) {
      return { messages };
    }

    return { ...chat, messageCount: messages.length, messages };
  }
}


export class ChatListResponse {
  constructor({ chats = [], total = 0, page = 1, pageSize = 20 } = {}) {
    this.chats = chats;
    this.total = total;
    this.page = page;
    this.pageSize = pageSize;
  }

  toDict() {
    return {
      chats: this.chats
        ? this.chats.map((c) => (c.toDict ? c.toDict() : c))
        : [],
      total: this.total,
      page: this.page,
      pageSize: this.pageSize,
    };
  }
}


export class StreamingChunk {
  constructor({ event, data = '', metadata = null } = {}) {
    this.event = event;
    this.data = data;
    this.metadata = metadata;
  }

  toDict() {
    return {
      event: this.event,
      data: this.data,
      metadata: this.metadata,
    };
  }
}