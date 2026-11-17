

import { logger } from '../utils/logger.js';
import {
  PostCreate,
  PostUpdate,
  PostResponse,
  PostDetailResponse,
  PostListResponse,
  CommentCreate,
  CommentResponse,
  PostCategory,
  AuthorInfo,
  PresenceStatus,
} from './schemas.js';

export class CommunityService {

  static ONLINE_THRESHOLD_MINUTES = 2;
  static AWAY_THRESHOLD_MINUTES = 10;


  static DEFAULT_PAGE_SIZE = 20;
  static MIN_PAGE_SIZE = 1;
  static MAX_PAGE_SIZE = 100;


  static _clampPagination(page, pageSize) {
    const rawPage = Number(page);
    const rawPageSize = Number(pageSize);

    const safePage = Number.isFinite(rawPage)
      ? Math.max(1, Math.floor(rawPage))
      : 1;

    let safePageSize = Number.isFinite(rawPageSize)
      ? Math.floor(rawPageSize)
      : CommunityService.DEFAULT_PAGE_SIZE;
    safePageSize = Math.max(
      CommunityService.MIN_PAGE_SIZE,
      Math.min(CommunityService.MAX_PAGE_SIZE, safePageSize),
    );

    return { page: safePage, pageSize: safePageSize };
  }


  constructor(db) {
    this.db = db;
  }


  async listPosts({
    category = null,
    courseTopic = null,
    isResolved = null,
    search = null,
    page = 1,
    pageSize = CommunityService.DEFAULT_PAGE_SIZE,
  } = {}) {


    ({ page, pageSize } = CommunityService._clampPagination(page, pageSize));


    const whereClauses = ['1=1'];
    const params = [];
    const pushCond = (clause, value) => {
      params.push(value);
      whereClauses.push(clause.replace('?', `$${params.length}`));
    };

    if (category) {
      pushCond('p.category = ?', category);
    }
    if (courseTopic) {
      pushCond('p.course_topic ILIKE ?', `%${courseTopic}%`);
    }
    if (typeof isResolved === 'boolean') {
      pushCond('p.is_resolved = ?', isResolved);
    }
    if (search) {
      pushCond('(p.title ILIKE ? OR p.content ILIKE ?)', `%${search}%`);





    }


    if (search) {

      whereClauses.pop();
      params.pop();
      params.push(`%${search}%`);
      const idx = params.length;
      whereClauses.push(
        `(p.title ILIKE $${idx} OR p.content ILIKE $${idx})`,
      );
    }

    const whereSql = whereClauses.join(' AND ');


    const countQuery = `SELECT COUNT(*) FROM community_posts p WHERE ${whereSql}`;
    const countResult = await this.db.query(countQuery, params);
    const total = Number(countResult.rows[0].count) || 0;


    const query = `
      SELECT
        p.id, p.author_id, p.title, p.content, p.category,
        p.course_topic, p.is_resolved, p.view_count,
        p.created_at, p.updated_at,
        pr.name as author_name, pr.avatar_url as author_avatar,
        (SELECT COUNT(*) FROM community_comments c WHERE c.post_id = p.id) as comment_count
      FROM community_posts p
      LEFT JOIN profiles pr ON p.author_id = pr.id
      WHERE ${whereSql}
      ORDER BY p.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    const limitIdx = params.length + 1;
    const offsetIdx = params.length + 2;
    const queryParams = [...params, pageSize, (page - 1) * pageSize];

    const result = await this.db.query(query, queryParams);
    const rows = result.rows;

    const posts = rows.map((row) => {
      const content =
        row.content && row.content.length > 500
          ? `${row.content.slice(0, 500)}...`
          : row.content;
      return new PostResponse({
        id: row.id,
        author: new AuthorInfo({
          id: row.author_id,
          name: row.author_name || 'Unknown',
          avatarUrl: row.author_avatar,
        }),
        title: row.title,
        content,
        category: PostCategory[row.category] || row.category,
        courseTopic: row.course_topic,
        isResolved: row.is_resolved,
        viewCount: row.view_count,
        commentCount: Number(row.comment_count),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      });
    });

    return new PostListResponse({
      posts,
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total,
    });
  }


  async createPost({ userId, postData }) {


    const category = postData.category || PostCategory.GENERAL;
    const categoryValue =
      typeof category === 'string' ? category : PostCategory.GENERAL;

    const query = `
      INSERT INTO community_posts (author_id, title, content, category, course_topic)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, author_id, title, content, category, course_topic,
                is_resolved, view_count, created_at, updated_at
    `;
    const result = await this.db.query(query, [
      userId,
      postData.title,
      postData.content,
      categoryValue,
      postData.courseTopic || null,
    ]);
    const row = result.rows[0];


    const authorResult = await this.db.query(
      'SELECT name, avatar_url FROM profiles WHERE id = $1',
      [userId],
    );
    const authorRow = authorResult.rows[0];

    const postResponse = new PostResponse({
      id: row.id,
      author: new AuthorInfo({
        id: userId,
        name: authorRow ? authorRow.name : 'Unknown',
        avatarUrl: authorRow ? authorRow.avatar_url : null,
      }),
      title: row.title,
      content: row.content,
      category: PostCategory[row.category] || row.category,
      courseTopic: row.course_topic,
      isResolved: row.is_resolved,
      viewCount: row.view_count,
      commentCount: 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });














    return postResponse;
  }


  async getPostWithComments(postId, { trackView = false } = {}) {

    const postQuery = `
      SELECT
        p.id, p.author_id, p.title, p.content, p.category,
        p.course_topic, p.is_resolved, p.view_count,
        p.created_at, p.updated_at,
        pr.name as author_name, pr.avatar_url as author_avatar
      FROM community_posts p
      LEFT JOIN profiles pr ON p.author_id = pr.id
      WHERE p.id = $1
    `;
    const result = await this.db.query(postQuery, [postId]);
    const postRow = result.rows[0];

    if (!postRow) {
      return null;
    }





    let effectiveViewCount = Number(postRow.view_count) || 0;
    if (trackView) {
      const updateResult = await this.db.query(
        'UPDATE community_posts SET view_count = view_count + 1 WHERE id = $1 RETURNING view_count',
        [postId],
      );
      if (updateResult.rows.length > 0) {
        effectiveViewCount = Number(updateResult.rows[0].view_count) || effectiveViewCount;
      } else {
        effectiveViewCount = effectiveViewCount + 1;
      }
    }


    const commentsQuery = `
      SELECT
        c.id, c.post_id, c.author_id, c.parent_id, c.content,
        c.is_bot_reply, c.mentioned_user_id, c.bot_metadata, c.created_at,
        pr.name as author_name, pr.avatar_url as author_avatar
      FROM community_comments c
      LEFT JOIN profiles pr ON c.author_id = pr.id
      WHERE c.post_id = $1
      ORDER BY c.created_at ASC
    `;
    const commentsResult = await this.db.query(commentsQuery, [postId]);
    const commentRows = commentsResult.rows;


    const commentsMap = {};
    const rootComments = [];


    for (const row of commentRows) {
      commentsMap[row.id] = new CommentResponse({
        id: row.id,
        postId: row.post_id,
        author: row.author_id
          ? new AuthorInfo({
              id: row.author_id,
              name: row.author_name || 'Bot',
              avatarUrl: row.author_avatar,
            })
          : null,
        parentId: row.parent_id,
        content: row.content,
        isBotReply: row.is_bot_reply,
        mentionedUserId: row.mentioned_user_id,
        botMetadata: row.bot_metadata,
        createdAt: row.created_at,
        replies: [],
      });
    }









    for (const row of commentRows) {
      const comment = commentsMap[row.id];
      const parent =
        row.parent_id === null || row.parent_id === undefined
          ? null
          : commentsMap[row.parent_id];

      if (!parent) {

        rootComments.push(comment);
      } else {
        parent.replies.push(comment);
      }
    }

    return new PostDetailResponse({
      id: postRow.id,
      author: new AuthorInfo({
        id: postRow.author_id,
        name: postRow.author_name || 'Unknown',
        avatarUrl: postRow.author_avatar,
      }),
      title: postRow.title,
      content: postRow.content,
      category: PostCategory[postRow.category] || postRow.category,
      courseTopic: postRow.course_topic,
      isResolved: postRow.is_resolved,
      viewCount: effectiveViewCount,
      createdAt: postRow.created_at,
      updatedAt: postRow.updated_at,
      comments: rootComments,
    });
  }


  async updatePost(postId, userId, postData) {

    const check = await this.db.query(
      'SELECT author_id FROM community_posts WHERE id = $1',
      [postId],
    );
    const row = check.rows[0];
    if (!row || row.author_id !== userId) {
      return null;
    }


    const updates = [];
    const params = [];
    const add = (col, val) => {
      params.push(val);
      updates.push(`${col} = $${params.length}`);
    };

    if (postData.title !== undefined) add('title', postData.title);
    if (postData.content !== undefined) add('content', postData.content);
    if (postData.category !== undefined) {
      const cat =
        typeof postData.category === 'string'
          ? postData.category
          : PostCategory.GENERAL;
      add('category', cat);
    }
    if (postData.courseTopic !== undefined) add('course_topic', postData.courseTopic);
    if (postData.isResolved !== undefined) add('is_resolved', postData.isResolved);

    if (updates.length > 0) {
      updates.push('updated_at = NOW()');
      params.push(postId);
      const query = `UPDATE community_posts SET ${updates.join(', ')} WHERE id = $${params.length}`;
      await this.db.query(query, params);
    }


    return await this._getPostResponse(postId);
  }


  async deletePost(postId, userId) {
    const result = await this.db.query(
      'DELETE FROM community_posts WHERE id = $1 AND author_id = $2',
      [postId, userId],
    );
    return result.rowCount > 0;
  }


  async toggleResolved(postId, userId) {
    const result = await this.db.query(
      `UPDATE community_posts
       SET is_resolved = NOT is_resolved, updated_at = NOW()
       WHERE id = $1 AND author_id = $2
       RETURNING id`,
      [postId, userId],
    );
    if (result.rows.length === 0) return null;
    return await this._getPostResponse(postId);
  }


  async _resolveUsername(username) {
    if (!username) return null;
    const clean = String(username).trim().replace(/^@/, '');
    if (!clean) return null;

    const result = await this.db.query(
      `SELECT id
         FROM profiles
        WHERE LOWER(name) = LOWER($1)
           OR LOWER(split_part(email, '@', 1)) = LOWER($1)
        LIMIT 1`,
      [clean],
    );
    return result.rows.length > 0 ? result.rows[0].id : null;
  }


  async createComment({ postId, userId, commentData }) {


    let mentionedUserId = commentData.mentionedUserId || null;
    if (!mentionedUserId && commentData.mentionedUsername) {
      mentionedUserId = await this._resolveUsername(commentData.mentionedUsername);
      if (!mentionedUserId) {
        logger.info(
          `Mention "@${commentData.mentionedUsername}" did not match any profile — treating the comment as a plain reply`,
        );
      }
    }






    let parentId = commentData.parentId || null;
    if (parentId) {
      const parentCheck = await this.db.query(
        'SELECT id FROM community_comments WHERE id = $1 AND post_id = $2',
        [parentId, postId],
      );
      if (parentCheck.rows.length === 0) {
        logger.info(
          `Parent comment ${parentId} does not belong to post ${postId} — storing the comment as a root reply`,
        );
        parentId = null;
      }
    }


    const query = `
      INSERT INTO community_comments
      (post_id, author_id, parent_id, content, mentioned_user_id)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, post_id, author_id, parent_id, content,
                is_bot_reply, mentioned_user_id, bot_metadata, created_at
    `;
    const result = await this.db.query(query, [
      postId,
      userId,
      parentId,
      commentData.content,
      mentionedUserId,
    ]);
    const row = result.rows[0];


    const authorResult = await this.db.query(
      'SELECT name, avatar_url FROM profiles WHERE id = $1',
      [userId],
    );
    const authorRow = authorResult.rows[0];

    const comment = new CommentResponse({
      id: row.id,
      postId: row.post_id,
      author: new AuthorInfo({
        id: userId,
        name: authorRow ? authorRow.name : 'Unknown',
        avatarUrl: authorRow ? authorRow.avatar_url : null,
      }),
      parentId: row.parent_id,
      content: row.content,
      isBotReply: false,
      mentionedUserId: row.mentioned_user_id,
      botMetadata: null,
      createdAt: row.created_at,
      replies: [],
    });










    let botReplyNeeded = false;
    if (mentionedUserId) {
      const isOffline = await this._isUserOffline(mentionedUserId);
      if (isOffline) {
        botReplyNeeded = true;
        logger.info(
          `User ${mentionedUserId} is offline, bot reply will be triggered`,
        );
      }
    }

    return { comment, botReply: botReplyNeeded ? { postId, parentCommentId: row.id, questionContent: commentData.content } : null };
  }


  async deleteComment(commentId, userId) {
    const result = await this.db.query(
      'DELETE FROM community_comments WHERE id = $1 AND author_id = $2',
      [commentId, userId],
    );
    return result.rowCount > 0;
  }


  async updatePresence(userId) {
    const query = `
      INSERT INTO user_presence (user_id, last_seen, is_online)
      VALUES ($1, NOW(), true)
      ON CONFLICT (user_id)
      DO UPDATE SET last_seen = NOW(), is_online = true
      RETURNING user_id, last_seen, is_online
    `;
    const result = await this.db.query(query, [userId]);
    const row = result.rows[0];







    await this.db.query(
      `UPDATE user_presence
          SET is_online = false
        WHERE is_online = true
          AND last_seen < NOW() - INTERVAL '${CommunityService.ONLINE_THRESHOLD_MINUTES} minutes'`,
    );

    return new PresenceStatus({
      userId: row.user_id,
      isOnline: row.is_online,
      lastSeen: row.last_seen,
    });
  }


  async getUsersPresence(userIds) {
    if (!userIds || userIds.length === 0) {
      return [];
    }

    const placeholders = userIds.map((_, i) => `$${i + 1}`).join(', ');
    const params = userIds.map((uid) => String(uid));

    const interval = `${CommunityService.ONLINE_THRESHOLD_MINUTES} minutes`;
    const query = `
      SELECT user_id, last_seen, is_online,
             CASE
                 WHEN last_seen > NOW() - INTERVAL '${interval}' THEN true
                 ELSE false
             END as actually_online
      FROM user_presence
      WHERE user_id IN (${placeholders})
    `;
    const result = await this.db.query(query, params);
    const rows = result.rows;

    return rows.map(
      (row) =>
        new PresenceStatus({
          userId: row.user_id,
          isOnline: row.actually_online,
          lastSeen: row.last_seen,
        }),
    );
  }


  async _isUserOffline(userId) {
    const query = `
      SELECT last_seen
      FROM user_presence
      WHERE user_id = $1
    `;
    const result = await this.db.query(query, [userId]);
    const row = result.rows[0];

    if (!row) {
      return true;
    }

    const threshold =
      new Date(Date.now() - CommunityService.ONLINE_THRESHOLD_MINUTES * 60 * 1000);
    const lastSeen = row.last_seen instanceof Date
      ? row.last_seen
      : new Date(row.last_seen);
    return lastSeen < threshold;
  }


  async _getPostResponse(postId) {
    const query = `
      SELECT
        p.id, p.author_id, p.title, p.content, p.category,
        p.course_topic, p.is_resolved, p.view_count,
        p.created_at, p.updated_at,
        pr.name as author_name, pr.avatar_url as author_avatar,
        COUNT(c.id) as comment_count
      FROM community_posts p
      LEFT JOIN profiles pr ON p.author_id = pr.id
      LEFT JOIN community_comments c ON c.post_id = p.id
      WHERE p.id = $1
      GROUP BY p.id, pr.name, pr.avatar_url
    `;
    const result = await this.db.query(query, [postId]);
    const row = result.rows[0];

    if (!row) {
      return null;
    }

    return new PostResponse({
      id: row.id,
      author: new AuthorInfo({
        id: row.author_id,
        name: row.author_name || 'Unknown',
        avatarUrl: row.author_avatar,
      }),
      title: row.title,
      content: row.content,
      category: PostCategory[row.category] || row.category,
      courseTopic: row.course_topic,
      isResolved: row.is_resolved,
      viewCount: row.view_count,
      commentCount: Number(row.comment_count),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
}

export default CommunityService;