

import { randomUUID } from 'node:crypto';


function mapMember(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    email: row.email,
    role: row.role,
    permissions: row.permissions || [],
    status: row.status,
    createdBy: row.created_by,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAudit(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    memberId: row.member_id,
    event: row.event,
    ip: row.ip,
    userAgent: row.user_agent,
    metadata: row.metadata || {},
    createdAt: row.created_at,
  };
}

function mapActivity(row) {
  if (!row) return null;
  return {
    id: row.id,
    courseId: row.course_id,
    title: row.title,
    type: row.type,
    fileType: row.file_type,
    url: row.url,
    week: row.week,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}


export function adminRepository(client) {
  return {


    async findMemberByUserId(userId) {
      const { rows } = await client.query(
        `SELECT id, user_id, email, role, permissions, status, created_by,
                last_login_at, created_at, updated_at
         FROM public.admin_members
         WHERE user_id = $1`,
        [userId],
      );
      return mapMember(rows[0]);
    },

    async findMemberByEmail(email) {
      const { rows } = await client.query(
        `SELECT id, user_id, email, role, permissions, status, created_by,
                last_login_at, created_at, updated_at
         FROM public.admin_members
         WHERE email = $1`,
        [String(email || '').toLowerCase()],
      );
      return mapMember(rows[0]);
    },

    async findMemberById(id) {
      const { rows } = await client.query(
        `SELECT id, user_id, email, role, permissions, status, created_by,
                last_login_at, created_at, updated_at
         FROM public.admin_members
         WHERE id = $1`,
        [id],
      );
      return mapMember(rows[0]);
    },


    async countActiveAdmins() {
      const { rows } = await client.query(
        `SELECT COUNT(*)::int AS total
         FROM public.admin_members
         WHERE role = 'admin' AND status = 'active'`,
      );
      return rows[0]?.total ?? 0;
    },


    async countActiveAdminsForUpdate() {




      const { rows } = await client.query(
        `WITH locked AS (
           SELECT id
           FROM public.admin_members
           WHERE role = 'admin' AND status = 'active'
           FOR UPDATE
         )
         SELECT COUNT(*)::int AS total FROM locked`,
      );
      return rows[0]?.total ?? 0;
    },

    async listMembers({ status, role, limit = 50, offset = 0 } = {}) {
      const where = [];
      const params = [];
      if (status) {
        params.push(status);
        where.push(`status = $${params.length}`);
      }
      if (role) {
        params.push(role);
        where.push(`role = $${params.length}`);
      }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

      params.push(limit, offset);
      const limitIdx = params.length - 1;
      const offsetIdx = params.length;

      const { rows } = await client.query(
        `SELECT id, user_id, email, role, permissions, status, created_by,
                last_login_at, created_at, updated_at
         FROM public.admin_members
         ${whereSql}
         ORDER BY created_at DESC
         LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        params,
      );

      const totalRes = await client.query(
        `SELECT COUNT(*)::int AS total FROM public.admin_members ${whereSql}`,
        params.slice(0, params.length - 2),
      );

      return {
        rows: rows.map(mapMember),
        total: totalRes.rows[0]?.total ?? 0,
      };
    },



    async createMember({ userId, email, role, permissions, createdBy }) {
      const id = randomUUID();
      const { rows } = await client.query(
        `INSERT INTO public.admin_members
           (id, user_id, email, role, permissions, created_by, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'active')
         RETURNING id, user_id, email, role, permissions, status, created_by,
                   last_login_at, created_at, updated_at`,
        [
          id,
          userId,
          String(email || '').toLowerCase(),
          role,
          permissions || [],
          createdBy || null,
        ],
      );
      return mapMember(rows[0]);
    },


    async softDeleteMember(id) {
      const { rows } = await client.query(
        `UPDATE public.admin_members
            SET status = 'removed'
          WHERE id = $1
        RETURNING id, user_id, email, role, permissions, status, created_by,
                  last_login_at, created_at, updated_at`,
        [id],
      );
      return mapMember(rows[0]);
    },

    async updatePermissions(id, permissions) {
      const { rows } = await client.query(
        `UPDATE public.admin_members
            SET permissions = $2
          WHERE id = $1
        RETURNING id, user_id, email, role, permissions, status, created_by,
                  last_login_at, created_at, updated_at`,
        [id, permissions || []],
      );
      return mapMember(rows[0]);
    },


    async updateMemberRoleStatus(id, { role, status }) {
      const sets = [];
      const params = [id];
      if (role !== undefined && role !== null) {
        params.push(role);
        sets.push(`role = $${params.length}`);
      }
      if (status !== undefined && status !== null) {
        params.push(status);
        sets.push(`status = $${params.length}`);
      }
      if (sets.length === 0) return undefined;
      const { rows } = await client.query(
        `UPDATE public.admin_members
            SET ${sets.join(', ')}
          WHERE id = $1
        RETURNING id, user_id, email, role, permissions, status, created_by,
                  last_login_at, created_at, updated_at`,
        params,
      );
      return mapMember(rows[0]);
    },

    async updateLastLogin(id, ip) {
      await client.query(
        `UPDATE public.admin_members
            SET last_login_at = now()
          WHERE id = $1`,
        [id],
      );

      void ip;
    },




    async listActivity(userId, { limit = 50, offset = 0 } = {}) {
      const { rows } = await client.query(
        `SELECT id, course_id, title, type, file_type, url, week,
                created_at, updated_at
         FROM public.course_materials
         WHERE uploaded_by = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset],
      );

      const totalRes = await client.query(
        `SELECT COUNT(*)::int AS total FROM public.course_materials
         WHERE uploaded_by = $1`,
        [userId],
      );

      return {
        rows: rows.map(mapActivity),
        total: totalRes.rows[0]?.total ?? 0,
      };
    },

    async listAuditLog(memberId, { limit = 50, offset = 0 } = {}) {
      const { rows } = await client.query(
        `SELECT id, member_id, event, ip, user_agent, metadata, created_at
         FROM public.admin_audit_log
         WHERE member_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [memberId, limit, offset],
      );

      const totalRes = await client.query(
        `SELECT COUNT(*)::int AS total FROM public.admin_audit_log
         WHERE member_id = $1`,
        [memberId],
      );

      return {
        rows: rows.map(mapAudit),
        total: totalRes.rows[0]?.total ?? 0,
      };
    },

    async insertAuditEvent({ memberId, event, ip, userAgent, metadata }) {
      await client.query(
        `INSERT INTO public.admin_audit_log
           (member_id, event, ip, user_agent, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [memberId, event, ip || null, userAgent || null, metadata || {}],
      );
    },
  };
}
