















































export const PostCategory = Object.freeze({
  THEORY: "THEORY",
  LAB: "LAB",
  GENERAL: "GENERAL",
});

export class CommunityPost {

  constructor({
    id,
    authorId,
    authorName,
    authorAvatarUrl,
    title,
    content,
    category,
    courseTopic,
    isResolved,
    viewCount,
    commentCount,
    createdAt,
    updatedAt,
  }) {
    this.id = id;
    this.authorId = authorId;
    this.authorName = authorName ?? null;
    this.authorAvatarUrl = authorAvatarUrl ?? null;
    this.title = title;
    this.content = content;
    this.category = category;
    this.courseTopic = courseTopic ?? null;
    this.isResolved = isResolved;
    this.viewCount = viewCount;
    this.commentCount = commentCount;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }
}

export class CommunityComment {

  constructor({
    id,
    postId,
    authorId,
    authorName,
    authorAvatarUrl,
    parentId,
    content,
    isBotReply,
    mentionedUserId,
    botMetadata,
    createdAt,
  }) {
    this.id = id;
    this.postId = postId;
    this.authorId = authorId;
    this.authorName = authorName ?? null;
    this.authorAvatarUrl = authorAvatarUrl ?? null;
    this.parentId = parentId;
    this.content = content;
    this.isBotReply = isBotReply;
    this.mentionedUserId = mentionedUserId;
    this.botMetadata = botMetadata ?? null;
    this.createdAt = createdAt;
  }
}

export class UserPresence {

  constructor({ userId, lastSeen, isOnline, actuallyOnline }) {
    this.userId = userId;
    this.lastSeen = lastSeen;
    this.isOnline = isOnline;
    this.actuallyOnline = actuallyOnline ?? isOnline;
  }
}




function intervalMinutes(minutes) {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 24 * 60 * 365) {
    throw new RangeError(
      `intervalMinutes: minutes must be a non-negative integer (got ${minutes})`,
    );
  }
  return `${minutes} minutes`;
}


function rowToPost(row) {
  return new CommunityPost({
    id: row.id,
    authorId: row.author_id,
    authorName: row.author_name ?? null,
    authorAvatarUrl: row.author_avatar_url ?? null,
    title: row.title,
    content: row.content,
    category: row.category,
    courseTopic: row.course_topic ?? null,
    isResolved: row.is_resolved,
    viewCount: row.view_count,
    commentCount: row.comment_count != null ? Number(row.comment_count) : 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function rowToComment(row) {
  return new CommunityComment({
    id: row.id,
    postId: row.post_id,
    authorId: row.author_id ?? null,
    authorName: row.author_name ?? null,
    authorAvatarUrl: row.author_avatar_url ?? null,
    parentId: row.parent_id ?? null,
    content: row.content,
    isBotReply: row.is_bot_reply,
    mentionedUserId: row.mentioned_user_id ?? null,
    botMetadata: row.bot_metadata ?? null,
    createdAt: row.created_at,
  });
}



const POST_SELECT = `
  SELECT
    p.id,
    p.author_id,
    pr.name            AS author_name,
    pr.avatar_url      AS author_avatar_url,
    p.title,
    p.content,
    p.category,
    p.course_topic,
    p.is_resolved,
    p.view_count,
    p.created_at,
    p.updated_at,
    (SELECT COUNT(*)::int FROM community_comments c WHERE c.post_id = p.id) AS comment_count
  FROM community_posts p
  LEFT JOIN profiles pr ON pr.id = p.author_id
`;

const COMMENT_SELECT = `
  SELECT
    c.id,
    c.post_id,
    c.author_id,
    pr.name        AS author_name,
    pr.avatar_url  AS author_avatar_url,
    c.parent_id,
    c.content,
    c.is_bot_reply,
    c.mentioned_user_id,
    c.bot_metadata,
    c.created_at
  FROM community_comments c
  LEFT JOIN profiles pr ON pr.id = c.author_id
`;


export function communityRepository(pool) {
  return {

    async listPosts({
      category,
      courseTopic,
      isResolved,
      search,
      page = 1,
      pageSize = 20,
    } = {}) {
      const where = [];
      const params = [];
      const pushCond = (clause, value) => {
        params.push(value);
        where.push(clause.replace("?", `$${params.length}`));
      };

      if (category) pushCond("p.category = ?", category);
      if (courseTopic) pushCond("p.course_topic = ?", courseTopic);
      if (typeof isResolved === "boolean") pushCond("p.is_resolved = ?", isResolved);
      if (search && search.trim()) {
        const like = `%${search.trim()}%`;
        params.push(like);
        const i = params.length;
        where.push(`(p.title ILIKE $${i} OR p.content ILIKE $${i})`);
      }

      const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";


      const countSql = `
        SELECT COUNT(*)::int AS count
        FROM community_posts p
        ${whereSql}
      `;
      const countRes = await pool.query(countSql, params);
      const total = countRes.rows[0].count;


      const limit = Math.max(1, Math.min(100, Math.floor(pageSize)));
      const offset = Math.max(0, (Math.floor(page) - 1) * limit);
      params.push(limit, offset);
      const limitIdx = params.length - 1;
      const offsetIdx = params.length;

      const listSql = `
        ${POST_SELECT}
        ${whereSql}
        ORDER BY p.created_at DESC
        LIMIT $${limitIdx} OFFSET $${offsetIdx}
      `;
      const { rows } = await pool.query(listSql, params);

      return {
        items: rows.map(rowToPost),
        total,
        page: Math.floor(page),
        pageSize: limit,
      };
    },


    async createPost({ authorId, title, content, category, courseTopic }) {
      const { rows } = await pool.query(
        `INSERT INTO community_posts (author_id, title, content, category, course_topic)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, author_id, title, content, category, course_topic,
                   is_resolved, view_count, created_at, updated_at`,
        [authorId, title, content, category, courseTopic ?? null],
      );
      return rowToPost({ ...rows[0], comment_count: 0 });
    },


    async getAuthorInfo(userId) {
      const { rows } = await pool.query(
        `SELECT id, name, avatar_url
         FROM profiles
         WHERE id = $1`,
        [userId],
      );
      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        userId: r.id,
        fullName: r.name ?? null,
        avatarUrl: r.avatar_url ?? null,
      };
    },


    async getPostById(postId) {
      const { rows } = await pool.query(
        `${POST_SELECT} WHERE p.id = $1`,
        [postId],
      );
      if (rows.length === 0) return null;
      return rowToPost(rows[0]);
    },

    async incrementViewCount(postId) {
      const { rowCount } = await pool.query(
        `UPDATE community_posts SET view_count = view_count + 1 WHERE id = $1`,
        [postId],
      );
      return rowCount;
    },


    async listComments(postId) {
      const { rows } = await pool.query(
        `${COMMENT_SELECT} WHERE c.post_id = $1 ORDER BY c.created_at ASC`,
        [postId],
      );
      return rows.map(rowToComment);
    },


    async insertComment({
      postId,
      authorId,
      parentId = null,
      content,
      mentionedUserId = null,
      isBotReply = false,
      botMetadata = null,
    }) {
      const { rows } = await pool.query(
        `INSERT INTO community_comments
           (post_id, author_id, parent_id, content, is_bot_reply, mentioned_user_id, bot_metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, post_id, author_id, parent_id, content, is_bot_reply,
                   mentioned_user_id, bot_metadata, created_at`,
        [
          postId,
          authorId,
          parentId,
          content,
          isBotReply,
          mentionedUserId,
          botMetadata,
        ],
      );
      return rowToComment({ ...rows[0] });
    },


    async deletePost(postId, authorId) {
      const { rowCount } = await pool.query(
        `DELETE FROM community_posts WHERE id = $1 AND author_id = $2`,
        [postId, authorId],
      );
      return rowCount;
    },

    async deleteComment(commentId, authorId) {
      const { rowCount } = await pool.query(
        `DELETE FROM community_comments WHERE id = $1 AND author_id = $2`,
        [commentId, authorId],
      );
      return rowCount;
    },


    async updatePost(postId, authorId, { title, content, category, courseTopic, isResolved }) {
      const setParts = [];
      const params = [];
      const add = (col, val) => {
        params.push(val);
        setParts.push(`${col} = $${params.length}`);
      };
      if (title !== undefined) add("title", title);
      if (content !== undefined) add("content", content);
      if (category !== undefined) add("category", category);
      if (courseTopic !== undefined) add("course_topic", courseTopic);
      if (isResolved !== undefined) add("is_resolved", isResolved);

      if (setParts.length === 0) {

        return this.getPostById(postId);
      }

      setParts.push("updated_at = now()");
      params.push(postId);
      const idIdx = params.length;
      params.push(authorId);
      const authorIdx = params.length;

      const sql = `
        UPDATE community_posts
        SET ${setParts.join(", ")}
        WHERE id = $${idIdx} AND author_id = $${authorIdx}
        RETURNING id, author_id, title, content, category, course_topic,
                  is_resolved, view_count, created_at, updated_at
      `;
      const { rows } = await pool.query(sql, params);
      if (rows.length === 0) return null;
      return rowToPost({ ...rows[0], comment_count: 0 });
    },


    async toggleResolved(postId, authorId) {
      const { rows } = await pool.query(
        `UPDATE community_posts
         SET is_resolved = NOT is_resolved, updated_at = now()
         WHERE id = $1 AND author_id = $2
         RETURNING is_resolved`,
        [postId, authorId],
      );
      if (rows.length === 0) return null;
      return rows[0].is_resolved;
    },


    async upsertPresence(userId) {
      const { rows } = await pool.query(
        `INSERT INTO user_presence (user_id, last_seen, is_online)
         VALUES ($1, now(), TRUE)
         ON CONFLICT (user_id) DO UPDATE
           SET last_seen = now(), is_online = TRUE
         RETURNING user_id, last_seen, is_online`,
        [userId],
      );
      const r = rows[0];
      return new UserPresence({
        userId: r.user_id,
        lastSeen: r.last_seen,
        isOnline: r.is_online,
        actuallyOnline: true,
      });
    },


    async getPresence(userIds, minutes = 5) {
      if (!Array.isArray(userIds) || userIds.length === 0) return [];
      const interval = intervalMinutes(minutes);
      const sql = `
        SELECT
          user_id,
          last_seen,
          is_online,
          (last_seen >= NOW() - INTERVAL '${interval}') AS actually_online
        FROM user_presence
        WHERE user_id = ANY($1::uuid[])
      `;
      const { rows } = await pool.query(sql, [userIds]);
      return rows.map(
        (r) =>
          new UserPresence({
            userId: r.user_id,
            lastSeen: r.last_seen,
            isOnline: r.is_online,
            actuallyOnline: r.actually_online,
          }),
      );
    },
  };
}