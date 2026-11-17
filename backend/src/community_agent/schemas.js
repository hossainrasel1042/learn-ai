

import { z } from 'zod';






export const PostCategory = Object.freeze({
  THEORY: 'theory',
  LAB: 'lab',
  GENERAL: 'general',
});






export const PostCreate = z.object({
  title: z
    .string()
    .min(1, 'title must be at least 1 character')
    .max(500, 'title must be at most 500 characters'),
  content: z
    .string()
    .min(1, 'content must be at least 1 character')
    .max(50000, 'content must be at most 50000 characters'),
  category: z.nativeEnum(PostCategory).default(PostCategory.GENERAL),
  courseTopic: z
    .string()
    .max(200, 'courseTopic must be at most 200 characters')
    .optional(),
});


export const PostUpdate = z.object({
  title: z
    .string()
    .min(1, 'title must be at least 1 character')
    .max(500, 'title must be at most 500 characters')
    .optional(),
  content: z
    .string()
    .min(1, 'content must be at least 1 character')
    .max(50000, 'content must be at most 50000 characters')
    .optional(),
  category: z.nativeEnum(PostCategory).optional(),
  courseTopic: z
    .string()
    .max(200, 'courseTopic must be at most 200 characters')
    .optional(),
  isResolved: z.boolean().optional(),
});


export const CommentCreate = z.object({
  content: z
    .string()
    .min(1, 'content must be at least 1 character')
    .max(10000, 'content must be at most 10000 characters'),
  parentId: z.string().uuid().optional(),
  mentionedUserId: z.string().uuid().optional(),
  mentionedUsername: z
    .string()
    .min(1, 'mentionedUsername must be at least 1 character')
    .max(200, 'mentionedUsername must be at most 200 characters')
    .optional(),
})
  .refine((d) => !(d.mentionedUserId && d.mentionedUsername), {
    message: 'provide either mentionedUserId or mentionedUsername, not both',
    path: ['mentionedUsername'],
  });






export class AuthorInfo {
  constructor({ id, name, avatarUrl = null } = {}) {
    this.id = id;
    this.name = name;
    this.avatarUrl = avatarUrl;
  }

  toDict() {
    return {
      id: this.id,
      name: this.name,
      avatarUrl: this.avatarUrl,
    };
  }
}


export class CommentResponse {
  constructor({
    id,
    postId,
    author = null,
    parentId = null,
    content,
    isBotReply = false,
    mentionedUserId = null,
    botMetadata = null,
    createdAt,
    replies = [],
  } = {}) {
    this.id = id;
    this.postId = postId;
    this.author = author;
    this.parentId = parentId;
    this.content = content;
    this.isBotReply = isBotReply;
    this.mentionedUserId = mentionedUserId;
    this.botMetadata = botMetadata;
    this.createdAt = createdAt;
    this.replies = replies;
  }

  toDict() {
    return {
      id: this.id,
      postId: this.postId,
      author: this.author ? (this.author.toDict ? this.author.toDict() : this.author) : null,
      parentId: this.parentId,
      content: this.content,
      isBotReply: this.isBotReply,
      mentionedUserId: this.mentionedUserId,
      botMetadata: this.botMetadata,
      createdAt:
        this.createdAt instanceof Date
          ? this.createdAt.toISOString()
          : this.createdAt,
      replies: this.replies
        ? this.replies.map((r) => (r.toDict ? r.toDict() : r))
        : [],
    };
  }
}


export class PostResponse {
  constructor({
    id,
    author,
    title,
    content,
    category,
    courseTopic = null,
    isResolved = false,
    viewCount = 0,
    commentCount = 0,
    createdAt,
    updatedAt,
  } = {}) {
    this.id = id;
    this.author = author;
    this.title = title;
    this.content = content;
    this.category = category;
    this.courseTopic = courseTopic;
    this.isResolved = isResolved;
    this.viewCount = viewCount;
    this.commentCount = commentCount;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  toDict() {
    return {
      id: this.id,
      author: this.author ? (this.author.toDict ? this.author.toDict() : this.author) : null,
      title: this.title,
      content: this.content,
      category: this.category,
      courseTopic: this.courseTopic,
      isResolved: this.isResolved,
      viewCount: this.viewCount,
      commentCount: this.commentCount,
      createdAt:
        this.createdAt instanceof Date
          ? this.createdAt.toISOString()
          : this.createdAt,
      updatedAt:
        this.updatedAt instanceof Date
          ? this.updatedAt.toISOString()
          : this.updatedAt,
    };
  }
}


export class PostDetailResponse {
  constructor({
    id,
    author,
    title,
    content,
    category,
    courseTopic = null,
    isResolved = false,
    viewCount = 0,
    createdAt,
    updatedAt,
    comments = [],
  } = {}) {
    this.id = id;
    this.author = author;
    this.title = title;
    this.content = content;
    this.category = category;
    this.courseTopic = courseTopic;
    this.isResolved = isResolved;
    this.viewCount = viewCount;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.comments = comments;
  }

  toDict() {
    return {
      id: this.id,
      author: this.author ? (this.author.toDict ? this.author.toDict() : this.author) : null,
      title: this.title,
      content: this.content,
      category: this.category,
      courseTopic: this.courseTopic,
      isResolved: this.isResolved,
      viewCount: this.viewCount,
      createdAt:
        this.createdAt instanceof Date
          ? this.createdAt.toISOString()
          : this.createdAt,
      updatedAt:
        this.updatedAt instanceof Date
          ? this.updatedAt.toISOString()
          : this.updatedAt,
      comments: this.comments
        ? this.comments.map((c) => (c.toDict ? c.toDict() : c))
        : [],
    };
  }
}


export class PostListResponse {
  constructor({ posts = [], total = 0, page = 1, pageSize = 20, hasMore = false } = {}) {
    this.posts = posts;
    this.total = total;
    this.page = page;
    this.pageSize = pageSize;
    this.hasMore = hasMore;
  }

  toDict() {
    return {
      posts: this.posts
        ? this.posts.map((p) => (p.toDict ? p.toDict() : p))
        : [],
      total: this.total,
      page: this.page,
      pageSize: this.pageSize,
      hasMore: this.hasMore,
    };
  }
}






export const PresenceHeartbeat = z.object({}).strict().optional();


export class PresenceStatus {
  constructor({ userId, isOnline, lastSeen } = {}) {
    this.userId = userId;
    this.isOnline = isOnline;
    this.lastSeen = lastSeen;
  }

  toDict() {
    return {
      userId: this.userId,
      isOnline: this.isOnline,
      lastSeen:
        this.lastSeen instanceof Date
          ? this.lastSeen.toISOString()
          : this.lastSeen,
    };
  }
}


export class UserPresenceList {
  constructor({ users = [] } = {}) {
    this.users = users;
  }

  toDict() {
    return {
      users: this.users
        ? this.users.map((u) => (u.toDict ? u.toDict() : u))
        : [],
    };
  }
}






export class BotReplyMetadata {
  constructor({ sources = [], confidence = 0.0, courseContext = null, generatedAt } = {}) {
    this.sources = sources;
    this.confidence = confidence;
    this.courseContext = courseContext;
    this.generatedAt = generatedAt;
  }

  toDict() {
    return {
      sources: this.sources,
      confidence: this.confidence,
      courseContext: this.courseContext,
      generatedAt:
        this.generatedAt instanceof Date
          ? this.generatedAt.toISOString()
          : this.generatedAt,
    };
  }
}
