import { randomUUID } from 'node:crypto';

import { settings } from '../config/settings.js';
import { profileRepository } from '../models/profile.js';
import { hashPassword } from '../services/passwordHasher.js';
import { logger } from '../utils/logger.js';

import { adminRepository } from './repository.js';

const ALL_PERMISSIONS = ['can_manage_members', 'can_manage_courses', 'can_view_audit'];
const MIN_PASSWORD_LENGTH = 6;


export function adminBootstrapConfigured() {
  return Boolean(String(settings.ADMIN_EMAIL || '').trim());
}


function _normaliseEmail(email) {
  return String(email || '').trim().toLowerCase();
}


async function _ensureProfile(pool, email, password) {
  const repo = profileRepository(pool);
  const existing = await repo.getByEmail(email);
  if (existing) {
    return { profile: existing, created: false };
  }

  const id = randomUUID();
  const profile = await repo.insert({
    id,
    name:
      String(settings.ADMIN_NAME || '').trim() ||
      email.split('@')[0],
    email,
    role: 'user',
    hasPassword: true,
    passwordHash: await hashPassword(password),
    emailConfirmedAt: new Date(),
  });
  return { profile, created: true };
}


async function _ensureMember(pool, profile, email) {
  const repo = adminRepository(pool);
  const existing = await repo.findMemberByEmail(email);
  if (existing) {
    return { member: existing, created: false };
  }

  const member = await repo.createMember({
    userId: profile.id,
    email,
    role: 'admin',
    permissions: ALL_PERMISSIONS,
    createdBy: null,
  });
  return { member, created: true };
}


export async function bootstrapAdmin(pool) {
  if (!adminBootstrapConfigured()) {
    return { skipped: true, reason: 'not_configured' };
  }

  const email = _normaliseEmail(settings.ADMIN_EMAIL);
  const password = String(settings.ADMIN_PASS || '');

  if (!email) {
    return { skipped: true, reason: 'no_email' };
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    logger.warn(
      `[admin] bootstrap skipped: ADMIN_PASS must be at least ${MIN_PASSWORD_LENGTH} characters`,
    );
    return { skipped: true, reason: 'weak_password' };
  }

  const { profile, created: profileCreated } = await _ensureProfile(
    pool,
    email,
    password,
  );
  const { member, created: memberCreated } = await _ensureMember(
    pool,
    profile,
    email,
  );

  if (profileCreated) {
    logger.info(`[admin] bootstrap created the admin profile for ${email}`);
  }
  if (memberCreated) {
    logger.info(
      `[admin] bootstrap created the admin_members row for ${email} with role=admin`,
    );
  }
  if (!profileCreated && !memberCreated) {
    logger.info(
      `[admin] bootstrap: ${email} is already an admin — the password was left untouched`,
    );
  }

  return {
    skipped: false,
    email,
    member,
    profileCreated,
    memberCreated,
  };
}


export default bootstrapAdmin;
