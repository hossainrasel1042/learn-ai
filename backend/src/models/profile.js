
import {
  generateFriendCode,
  deriveFriendCodeFromUserId,
} from '../quiz_battle_agent/friendCode.js';


const PROFILE_COLUMNS = `
  id, name, email, role, avatar_url, has_password,
  email_confirmed_at, last_login_at, friend_code, created_at, updated_at
`;

export const UNVERIFIED = Symbol('unverified');

export function profileRepository(pool) {
  return {

    async getById(id) {
      const { rows } = await pool.query(
        `SELECT ${PROFILE_COLUMNS} FROM profiles WHERE id = $1`,
        [id]
      );
      if (rows.length === 0) return null;
      return rowToProfile(rows[0]);
    },


    async getByEmail(email) {
      const { rows } = await pool.query(
        `SELECT ${PROFILE_COLUMNS} FROM profiles WHERE lower(email) = lower($1)`,
        [email]
      );
      if (rows.length === 0) return null;
      return rowToProfile(rows[0]);
    },


    async getCredentialsByEmail(email) {
      const { rows } = await pool.query(
        `SELECT id, email, role, password_hash, email_confirmed_at
         FROM profiles WHERE lower(email) = lower($1)`,
        [email]
      );
      if (rows.length === 0) return null;
      return rowToCredentials(rows[0]);
    },


    async getCredentialsById(id) {
      const { rows } = await pool.query(
        `SELECT id, email, role, password_hash, email_confirmed_at
         FROM profiles WHERE id = $1`,
        [id]
      );
      if (rows.length === 0) return null;
      return rowToCredentials(rows[0]);
    },


    async insert({
      id,
      name,
      email,
      role = 'user',
      hasPassword = false,
      passwordHash = null,
      emailConfirmedAt = null,
    }) {
      const unverified = emailConfirmedAt === UNVERIFIED;
      const confirmedAt = unverified ? null : emailConfirmedAt;

      const { rows } = await pool.query(
        `INSERT INTO profiles
           (id, name, email, role, has_password, password_hash, email_confirmed_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6,
                 CASE WHEN $8::boolean THEN NULL
                      WHEN $7::timestamptz IS NULL THEN now()
                      ELSE $7 END,
                 now(), now())
         RETURNING ${PROFILE_COLUMNS}`,
        [id, name, email, role, hasPassword, passwordHash, confirmedAt, unverified]
      );
      return rowToProfile(rows[0]);
    },


    async update(id, patch) {
      const fields = [];
      const values = [];
      let i = 1;
      if (Object.prototype.hasOwnProperty.call(patch, 'name')) {
        fields.push(`name = $${i++}`);
        values.push(patch.name);
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'avatarUrl')) {
        fields.push(`avatar_url = $${i++}`);
        values.push(patch.avatarUrl);
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'role')) {
        fields.push(`role = $${i++}`);
        values.push(patch.role);
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'hasPassword')) {
        fields.push(`has_password = $${i++}`);
        values.push(patch.hasPassword);
      }

      if (fields.length === 0) {

        return this.getById(id);
      }

      fields.push(`updated_at = now()`);
      values.push(id);

      const { rows } = await pool.query(
        `UPDATE profiles SET ${fields.join(', ')}
         WHERE id = $${i}
         RETURNING ${PROFILE_COLUMNS}`,
        values
      );
      if (rows.length === 0) return null;
      return rowToProfile(rows[0]);
    },

    async setHasPassword(id, hasPassword) {
      return this.update(id, { hasPassword });
    },


    async setPasswordHash(id, passwordHash) {
      const { rows } = await pool.query(
        `UPDATE profiles
            SET password_hash = $1, has_password = TRUE, updated_at = now()
          WHERE id = $2
          RETURNING ${PROFILE_COLUMNS}`,
        [passwordHash, id]
      );
      if (rows.length === 0) return null;
      return rowToProfile(rows[0]);
    },


    async setLastLoginAt(id, when = new Date()) {
      await pool.query(
        `UPDATE profiles SET last_login_at = $1 WHERE id = $2`,
        [when, id]
      );
    },


    async setEmailConfirmedAt(id, when = new Date()) {
      const { rows } = await pool.query(
        `UPDATE profiles
            SET email_confirmed_at = $1, updated_at = now()
          WHERE id = $2
          RETURNING ${PROFILE_COLUMNS}`,
        [when, id]
      );
      if (rows.length === 0) return null;
      return rowToProfile(rows[0]);
    },

    async delete(id) {
      await pool.query(`DELETE FROM profiles WHERE id = $1`, [id]);
    },




    async getFriendCode(id) {
      const { rows } = await pool.query(
        `SELECT friend_code FROM profiles WHERE id = $1`,
        [id]
      );
      if (rows.length === 0) return null;
      return rows[0].friend_code ?? null;
    },


    async ensureFriendCode(id, { generate, maxAttempts = 10 } = {}) {
      const existing = await this.getFriendCode(id);
      if (existing) return existing;

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const code = (generate || generateFriendCode)();
        try {
          const { rows } = await pool.query(
            `UPDATE profiles SET friend_code = $2, updated_at = now()
              WHERE id = $1 AND friend_code IS NULL
              RETURNING friend_code`,
            [id, code]
          );
          if (rows.length > 0) return rows[0].friend_code;
          return await this.getFriendCode(id);
        } catch (e) {
          if (e && e.code === '23505') continue; 
          throw e;
        }
      }

      const derived = deriveFriendCodeFromUserId(id);
      try {
        const { rows } = await pool.query(
          `UPDATE profiles SET friend_code = $2, updated_at = now()
            WHERE id = $1 AND friend_code IS NULL
            RETURNING friend_code`,
          [id, derived]
        );
        if (rows.length > 0) return rows[0].friend_code;
        return await this.getFriendCode(id);
      } catch (e) {
        if (e && e.code === '23505') return null;
        throw e;
      }
    },


    async regenerateFriendCode(id, { generate, maxAttempts = 10 } = {}) {
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const code = (generate || generateFriendCode)();
        try {
          const { rows } = await pool.query(
            `UPDATE profiles SET friend_code = $2, updated_at = now()
              WHERE id = $1
              RETURNING friend_code`,
            [id, code]
          );
          if (rows.length > 0) return rows[0].friend_code;
          return null;
        } catch (e) {
          if (e && e.code === '23505') continue; 
          throw e;
        }
      }

      const derived = deriveFriendCodeFromUserId(`${id}:${Date.now()}`);
      try {
        const { rows } = await pool.query(
          `UPDATE profiles SET friend_code = $2, updated_at = now()
            WHERE id = $1
            RETURNING friend_code`,
          [id, derived]
        );
        if (rows.length > 0) return rows[0].friend_code;
        return null;
      } catch (e) {
        if (e && e.code === '23505') return null;
        throw e;
      }
    },
  };
}

function rowToProfile(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role || 'user',
    avatarUrl: row.avatar_url,
    hasPassword: row.has_password === true,
    emailConfirmedAt: row.email_confirmed_at,
    lastLoginAt: row.last_login_at,
    friendCode: row.friend_code ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}


function rowToCredentials(row) {
  return {
    id: row.id,
    email: row.email,
    role: row.role || 'user',
    passwordHash: row.password_hash,
    emailConfirmedAt: row.email_confirmed_at,
  };
}

export { rowToProfile, rowToCredentials };
