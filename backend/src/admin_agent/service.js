

import { randomUUID } from 'node:crypto';

import * as authService from '../auth/service.js';
import { profileRepository } from '../models/profile.js';
import { hashPassword, verifyPassword } from '../services/passwordHasher.js';
import { clientIp } from '../utils/clientIp.js';
import { logger } from '../utils/logger.js';

import {
  AuthInvalidError,
  EmailNotVerifiedError,
  InsufficientPermissionsError,
  MemberAlreadyExistsError,
  MemberNotFoundError,
  NotAdminMemberError,
  ValidationError,
} from './errors.js';
import { adminRepository } from './repository.js';

const REQUIRED_PERMISSIONS_FOR_MANAGE_MEMBERS = ['can_manage_members'];





function _repo(pool) {
  return adminRepository(pool);
}


async function _writeAudit(client, event, { memberId, ip, userAgent, metadata }) {
  const auditArgs = { memberId, event, ip, userAgent, metadata };

  if (client && typeof client.query === 'function') {
    const savepoint = `audit_${event}`;
    let savepointCreated = false;
    try {
      await client.query(`SAVEPOINT ${savepoint}`);
      savepointCreated = true;
      await adminRepository(client).insertAuditEvent(auditArgs);
      await client.query(`RELEASE SAVEPOINT ${savepoint}`);
      return;
    } catch (e) {
      if (savepointCreated) {


        try {
          await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
          await client.query(`RELEASE SAVEPOINT ${savepoint}`);
        } catch (_) {


        }
      }
      logger.error(
        `[admin] ${event} audit write failed: ${e?.message || e}`,
      );
      return;
    }
  }


  try {
    const { pool: sharedPool } = await import('../config/database.js');
    await adminRepository(sharedPool).insertAuditEvent(auditArgs);
  } catch (e) {
    logger.error(
      `[admin] ${event} audit write failed: ${e?.message || e}`,
    );
  }
}








const _EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;





const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


function _requireUuid(value) {
  const raw = String(value ?? '').trim();
  if (!UUID_RE.test(raw)) {
    throw new ValidationError('Invalid member id');
  }
  return raw.toLowerCase();
}

function _actorHasPermission(actor, permission) {
  if (!actor) return false;
  if (Array.isArray(actor.permissions) && actor.permissions.includes(permission)) {
    return true;
  }
  return false;
}

function _actorIsAdmin(actor) {
  return !!actor && actor.role === 'admin';
}

function _ipFromReq(req) {










  return clientIp(req);
}

function _userAgentFromReq(req) {
  return req.headers?.['user-agent'] || null;
}






export async function loginAdmin(pool, { email, password }, req, res) {



  const normalisedEmail = String(email || '').trim().toLowerCase();
  if (!normalisedEmail || !password) {
    throw new AuthInvalidError('Email and password are required');
  }







  const result = await authService.signIn(
    pool,
    { email: normalisedEmail, password },
    res,
  );
  if (result && result.error) {




    logger.warn(
      `[admin] login rejected for ${normalisedEmail}: ${result.error}`,
    );
    if (result.code === 'email_not_verified') {
      throw new EmailNotVerifiedError(result.error);
    }
    throw new AuthInvalidError('Invalid credentials');
  }
  if (!result || !result.user || !result.user.id) {
    logger.warn(
      `[admin] login rejected for ${normalisedEmail}: sign-in returned no user`,
    );
    throw new AuthInvalidError('Invalid credentials');
  }

  const userId = result.user.id;



  const member = await _repo(pool).findMemberByUserId(userId);
  if (!member || member.status !== 'active') {
    try {
      await authService.signOut(res);
    } catch (e) {
      logger.warn(
        `[admin] signOut after not-admin-member failed: ${e?.message || e}`,
      );
    }
    logger.warn(
      `[admin] login rejected for ${normalisedEmail}: valid credentials but no active admin_members row`,
    );
    throw new NotAdminMemberError('Invalid credentials');
  }










  {
    const savepoint = 'audit_last_login';
    let savepointCreated = false;
    try {
      await pool.query(`SAVEPOINT ${savepoint}`);
      savepointCreated = true;
      await _repo(pool).updateLastLogin(member.id, _ipFromReq(req));
      await pool.query(`RELEASE SAVEPOINT ${savepoint}`);
    } catch (e) {
      if (savepointCreated) {
        try {
          await pool.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
          await pool.query(`RELEASE SAVEPOINT ${savepoint}`);
        } catch (_) {


        }
      }
      logger.error(
        `[admin] last_login update failed: ${e?.message || e}`,
      );
    }
  }
  await _writeAudit(pool, 'login_success', {
    memberId: member.id,
    ip: _ipFromReq(req),
    userAgent: _userAgentFromReq(req),
    metadata: { email: member.email },
  });

  return { member, user: result.user };
}


export async function forgotPassword(pool, { email }) {
  if (!email) {
    return { ok: true };
  }
  await authService.forgotPassword(pool, { email });
  return { ok: true };
}


export async function changeOwnPassword(
  pool,
  actor,
  { currentPassword, newPassword },
  req,
) {
  if (!currentPassword || !newPassword) {
    throw new ValidationError('Current and new password are required');
  }
  if (String(newPassword).length < 6) {
    throw new ValidationError('Password must be at least 6 characters');
  }
  if (currentPassword === newPassword) {
    throw new ValidationError('The new password must differ from the current one');
  }

  const profileRepo = profileRepository(pool);
  const credentials = await profileRepo.getCredentialsById(actor.userId);
  if (!credentials) {
    throw new MemberNotFoundError('Account not found');
  }

  const ok = await verifyPassword(currentPassword, credentials.passwordHash);
  if (!ok) {
    throw new AuthInvalidError('Current password is incorrect');
  }

  const passwordHash = await hashPassword(newPassword);
  await profileRepo.setPasswordHash(actor.userId, passwordHash);

  await _writeAudit(pool, 'password_changed', {
    memberId: actor.id,
    ip: _ipFromReq(req),
    userAgent: _userAgentFromReq(req),
    metadata: { email: actor.email },
  });

  return { ok: true };
}


export async function getMe(pool, userId) {
  const member = await _repo(pool).findMemberByUserId(userId);
  if (!member || member.status !== 'active') {
    throw new NotAdminMemberError('Not an admin member');
  }
  return member;
}


export async function logoutAdmin(pool, memberId, req, res) {


  await authService.signOut(res);
  if (memberId) {
    await _writeAudit(pool, 'logout', {
      memberId,
      ip: _ipFromReq(req),
      userAgent: _userAgentFromReq(req),
    });
  }
  return { ok: true };
}





export async function listMembersForAdmin(pool, actor, filters) {
  if (!_actorIsAdmin(actor)) {
    throw new InsufficientPermissionsError('Only admins can list members');
  }
  return _repo(pool).listMembers(filters || {});
}


export async function createMemberForAdmin(
  pool,
  actor,
  { email, password, role, permissions },
  req,
) {
  if (!_actorHasPermission(actor, 'can_manage_members')) {
    throw new InsufficientPermissionsError('Missing can_manage_members');
  }
  if (!email || !password) {
    throw new ValidationError('Email and password are required');
  }








  if (!_EMAIL_RE.test(String(email).trim())) {
    throw new ValidationError('Invalid email address');
  }


  if (String(password).length < 6) {
    throw new ValidationError('Password must be at least 6 characters');
  }
  if (!['admin', 'moderator'].includes(role)) {
    throw new ValidationError('Invalid role');
  }





  if (role === 'admin' && !_actorIsAdmin(actor)) {
    throw new InsufficientPermissionsError(
      'Only an admin can create another admin',
    );
  }





  const knownPermissions = ['can_manage_members', 'can_manage_courses', 'can_view_audit'];
  if (permissions !== undefined && permissions !== null && !Array.isArray(permissions)) {
    throw new ValidationError('permissions must be an array');
  }
  const requested = permissions || [];
  const unknown = requested.filter((p) => !knownPermissions.includes(p));
  if (unknown.length > 0) {
    throw new ValidationError(`Unknown permission: ${unknown.join(', ')}`);
  }





  if (!_actorIsAdmin(actor)) {
    const notHeld = requested.filter((p) => !_actorHasPermission(actor, p));
    if (notHeld.length > 0) {
      throw new InsufficientPermissionsError(
        `You cannot grant a permission you do not hold: ${notHeld.join(', ')}`,
      );
    }
  }

  const normalisedEmail = String(email).trim().toLowerCase();
  const profileRepo = profileRepository(pool);


  const existing = await profileRepo.getByEmail(normalisedEmail);
  if (existing) {
    throw new MemberAlreadyExistsError('A user with this email already exists');
  }










  const existingMember = await _repo(pool).findMemberByEmail(normalisedEmail);
  if (existingMember) {
    throw new MemberAlreadyExistsError('A user with this email already exists');
  }

  const passwordHash = await hashPassword(password);
  const userId = randomUUID();

  try {
    await profileRepo.insert({
      id: userId,
      name: normalisedEmail.split('@')[0],
      email: normalisedEmail,
      role: 'user',
      hasPassword: true,
      passwordHash,
      emailConfirmedAt: new Date(),
    });
  } catch (e) {
    if (e && e.code === '23505') {
      throw new MemberAlreadyExistsError('A user with this email already exists');
    }
    throw e;
  }


  let member;
  try {
    member = await _repo(pool).createMember({
      userId,
      email: normalisedEmail,
      role,
      permissions: requested,
      createdBy: actor.id,
    });
  } catch (e) {


    try {
      await profileRepo.delete(userId);
    } catch (rollbackErr) {
      logger.error(
        `[admin] createMember rollback failed for ${userId}: ${rollbackErr?.message || rollbackErr}`,
      );
    }
    if (e && e.code === '23505') {

      throw new MemberAlreadyExistsError('Member already exists');
    }
    throw e;
  }


  await _writeAudit(pool, 'member_created', {
    memberId: actor.id,
    ip: _ipFromReq(req),
    userAgent: _userAgentFromReq(req),
    metadata: { newMemberId: member.id, email: normalisedEmail, role },
  });

  return member;
}

export async function softDeleteMemberForAdmin(pool, actor, targetId, req) {
  if (!_actorHasPermission(actor, 'can_manage_members')) {
    throw new InsufficientPermissionsError('Missing can_manage_members');
  }
  if (!targetId) {
    throw new MemberNotFoundError('Missing member id');
  }
  targetId = _requireUuid(targetId);
  if (actor.id === targetId) {
    throw new InsufficientPermissionsError('Cannot remove yourself');
  }
  const target = await _repo(pool).findMemberById(targetId);
  if (!target) {
    throw new MemberNotFoundError('Member not found');
  }




  if (target.role === 'admin' && !_actorIsAdmin(actor)) {
    throw new InsufficientPermissionsError(
      'Only an admin can remove another admin',
    );
  }




  if (target.role === 'admin' && target.status === 'active') {
    const activeAdmins = await _repo(pool).countActiveAdminsForUpdate();
    if (activeAdmins <= 1) {
      throw new InsufficientPermissionsError(
        'Cannot remove the last active admin',
      );
    }
  }
  const updated = await _repo(pool).softDeleteMember(targetId);

  await _writeAudit(pool, 'member_deleted', {
    memberId: actor.id,
    ip: _ipFromReq(req),
    userAgent: _userAgentFromReq(req),
    metadata: { targetId, email: target.email },
  });

  return updated;
}

export async function updatePermissionsForAdmin(
  pool,
  actor,
  targetId,
  permissions,
  req,
) {
  if (!_actorHasPermission(actor, 'can_manage_members')) {
    throw new InsufficientPermissionsError('Missing can_manage_members');
  }
  if (!Array.isArray(permissions)) {
    throw new ValidationError('permissions must be an array');
  }
  targetId = _requireUuid(targetId);




  if (actor.id === targetId) {
    throw new InsufficientPermissionsError('Cannot change your own permissions');
  }


  const knownPermissions = ['can_manage_members', 'can_manage_courses', 'can_view_audit'];
  const unknown = permissions.filter((p) => !knownPermissions.includes(p));
  if (unknown.length > 0) {
    throw new ValidationError(`Unknown permission: ${unknown.join(', ')}`);
  }
  const target = await _repo(pool).findMemberById(targetId);
  if (!target) {
    throw new MemberNotFoundError('Member not found');
  }






  if (target.role === 'admin' && !_actorIsAdmin(actor)) {
    throw new InsufficientPermissionsError(
      'Only an admin can change another admin\'s permissions',
    );
  }




















  if (!_actorIsAdmin(actor)) {
    const targetPermissions = Array.isArray(target.permissions) ? target.permissions : [];
    const granted = permissions.filter((p) => !targetPermissions.includes(p));
    const notHeld = granted.filter((p) => !_actorHasPermission(actor, p));
    if (notHeld.length > 0) {
      throw new InsufficientPermissionsError(
        `You cannot grant a permission you do not hold: ${notHeld.join(', ')}`,
      );
    }
  }












  const stripsMemberManagement =
    target.role === 'admin' &&
    target.status === 'active' &&
    target.permissions.includes('can_manage_members') &&
    !permissions.includes('can_manage_members');
  if (stripsMemberManagement) {
    const activeAdmins = await _repo(pool).countActiveAdminsForUpdate();
    if (activeAdmins <= 1) {
      throw new InsufficientPermissionsError(
        'Cannot remove can_manage_members from the last active admin',
      );
    }
  }

  const updated = await _repo(pool).updatePermissions(targetId, permissions);

  await _writeAudit(pool, 'permissions_updated', {
    memberId: actor.id,
    ip: _ipFromReq(req),
    userAgent: _userAgentFromReq(req),
    metadata: { targetId, permissions },
  });

  return updated;
}


export async function updateMemberForAdmin(
  pool,
  actor,
  targetId,
  { role, status },
  req,
) {
  if (!_actorHasPermission(actor, 'can_manage_members')) {
    throw new InsufficientPermissionsError('Missing can_manage_members');
  }
  if (!targetId) {
    throw new MemberNotFoundError('Missing member id');
  }
  targetId = _requireUuid(targetId);
  if (actor.id === targetId) {
    throw new InsufficientPermissionsError('Cannot change your own account');
  }

  const VALID_ROLES = ['admin', 'moderator'];
  const VALID_STATUSES = ['active', 'suspended', 'removed'];

  if (role === undefined && status === undefined) {
    throw new ValidationError('Nothing to update');
  }
  if (role !== undefined && !VALID_ROLES.includes(role)) {
    throw new ValidationError(`Invalid role: ${role}`);
  }
  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    throw new ValidationError(`Invalid status: ${status}`);
  }


  if (!_actorIsAdmin(actor)) {
    throw new InsufficientPermissionsError(
      'Only an admin can change a member\'s role or status',
    );
  }

  const target = await _repo(pool).findMemberById(targetId);
  if (!target) {
    throw new MemberNotFoundError('Member not found');
  }




  const losesAdmin =
    target.role === 'admin' &&
    target.status === 'active' &&
    ((role !== undefined && role !== 'admin') ||
      (status !== undefined && status !== 'active'));
  if (losesAdmin) {
    const activeAdmins = await _repo(pool).countActiveAdminsForUpdate();
    if (activeAdmins <= 1) {
      throw new InsufficientPermissionsError(
        'Cannot demote or suspend the last active admin',
      );
    }
  }

  const updated = await _repo(pool).updateMemberRoleStatus(targetId, { role, status });
  if (!updated) {
    throw new MemberNotFoundError('Member not found');
  }

  await _writeAudit(pool, 'member_updated', {
    memberId: actor.id,
    ip: _ipFromReq(req),
    userAgent: _userAgentFromReq(req),
    metadata: { targetId, email: target.email, role, status },
  });

  return updated;
}






export async function getMemberForAdmin(pool, actor, targetId) {
  targetId = _requireUuid(targetId);
  if (
    actor.id !== targetId &&
    !_actorIsAdmin(actor) &&
    !_actorHasPermission(actor, 'can_view_audit')
  ) {
    throw new InsufficientPermissionsError(
      'Cannot view another member',
    );
  }
  const target = await _repo(pool).findMemberById(targetId);
  if (!target) {
    throw new MemberNotFoundError('Member not found');
  }
  return target;
}

export async function getActivityForAdmin(pool, actor, targetId, pagination = {}) {
  targetId = _requireUuid(targetId);


  if (
    actor.id !== targetId &&
    !_actorIsAdmin(actor) &&
    !_actorHasPermission(actor, 'can_view_audit')
  ) {
    throw new InsufficientPermissionsError(
      'Cannot view another member\'s activity',
    );
  }
  const target = await _repo(pool).findMemberById(targetId);
  if (!target) {
    throw new MemberNotFoundError('Member not found');
  }
  return _repo(pool).listActivity(target.userId, pagination);
}

export async function getAuditForAdmin(pool, actor, targetId, pagination = {}) {
  if (!_actorHasPermission(actor, 'can_view_audit')) {
    throw new InsufficientPermissionsError('Missing can_view_audit');
  }
  targetId = _requireUuid(targetId);
  const target = await _repo(pool).findMemberById(targetId);
  if (!target) {
    throw new MemberNotFoundError('Member not found');
  }
  return _repo(pool).listAuditLog(targetId, pagination);
}
