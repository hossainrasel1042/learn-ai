

import { randomBytes, randomUUID } from 'node:crypto';

import { profileRepository, UNVERIFIED } from '../models/profile.js';
import { hashPassword, verifyPassword } from '../services/passwordHasher.js';
import { setSessionCookies, clearSessionCookies } from '../services/cookieSession.js';
import {
  signAccessToken,
  verifyAccessToken,
  ACCESS_TOKEN_TTL_SECONDS,
} from '../services/tokenService.js';
import { storeOtp, consumeOtp, consumeToken } from './otp.js';
import {
  issueVerificationToken,
  consumeVerificationToken,
  verificationTokenTtlSeconds,
} from './verificationToken.js';
import { sendMail, mailServiceEnabled } from '../services/mailService.js';
import { settings } from '../config/settings.js';
import { pool as dbPool } from '../config/database.js';
import { logger } from '../utils/logger.js';







function _repo(pool) {
  return profileRepository(pool);
}

function _normaliseEmail(email) {
  return String(email || '').trim().toLowerCase();
}


function _resetLink(token) {
  const base = String(settings.FRONTEND_URL || '').replace(/\/+$/, '');
  return `${base}/auth/reset-password?token=${encodeURIComponent(token)}`;
}


function _verificationLink(token) {
  const base = String(settings.FRONTEND_URL || '').replace(/\/+$/, '');
  return `${base}/auth/verify-email?token=${encodeURIComponent(token)}`;
}


export const VERIFICATION_REQUIRED_MESSAGE =
  'We have sent a verification link to your email. Please click it within 10 minutes to activate your account.';

export const VERIFICATION_REQUIRED_SIGNIN_MESSAGE =
  'Please verify your email. We have sent a new verification link — please click it within 10 minutes.';






export async function signUp(pool, { name, email, password, confirmPassword }) {
  if (password !== confirmPassword) {
    return { error: 'Passwords do not match' };
  }
  if (!password || password.length < 6) {
    return { error: 'Password must be at least 6 characters' };
  }

  const normalisedEmail = _normaliseEmail(email);
  if (!normalisedEmail) {
    return { error: 'Email is required' };
  }

  const repo = _repo(pool);
  const existing = await repo.getByEmail(normalisedEmail);
  if (existing) {
    return { error: 'A user with this email already exists' };
  }

  const passwordHash = await hashPassword(password);

  let profile;
  try {
    profile = await repo.insert({
      id: randomUUID(),
      name: String(name || '').trim() || normalisedEmail.split('@')[0],
      email: normalisedEmail,
      role: 'user',
      hasPassword: true,
      passwordHash,
      emailConfirmedAt: UNVERIFIED,
    });
  } catch (e) {

    if (e && e.code === '23505') {
      return { error: 'A user with this email already exists' };
    }
    logger.error(
      `[auth] signUp: profile insert failed for ${normalisedEmail}: ${e?.message || e}`,
    );
    return { error: 'Failed to create profile. Please try again.' };
  }

  let mail = null;
  try {
    const issued = await issueVerificationToken({
      userId: profile.id,
      email: normalisedEmail,
    });
    if (issued?.ok) {
      mail = _verificationMailPayload({
        email: normalisedEmail,
        name: profile.name,
        link: _verificationLink(issued.token),
      });
      logger.info(
        `[auth] email verification link for ${normalisedEmail} (expires in ${verificationTokenTtlSeconds()}s): ${_verificationLink(issued.token)}`,
      );
    } else {
      logger.error(
        `[auth] signUp: could not issue a verification token for ${normalisedEmail}: ${issued?.reason || 'unknown'}`,
      );
    }
  } catch (e) {
    logger.error(
      `[auth] signUp: failed to issue a verification token for ${normalisedEmail}: ${e?.message || e}`,
    );
  }

  return {
    data: {
      success: true,
      message: VERIFICATION_REQUIRED_MESSAGE,
      email: normalisedEmail,
      verificationRequired: true,
      profile,
    },
    mail,
  };
}


export async function signIn(pool, { email, password }, res) {
  const normalisedEmail = _normaliseEmail(email);
  if (!normalisedEmail || !password) {
    return { error: 'Email and password are required' };
  }

  const repo = _repo(pool);
  const credentials = await repo.getCredentialsByEmail(normalisedEmail);




  const hash = credentials?.passwordHash || DUMMY_HASH;
  const ok = await verifyPassword(password, hash);

  if (!credentials || !ok) {
    return { error: 'Invalid credentials' };
  }

  if (!credentials.passwordHash) {


    return { error: 'Invalid credentials' };
  }

  if (!credentials.emailConfirmedAt) {
    return {
      error: VERIFICATION_REQUIRED_SIGNIN_MESSAGE,
      code: 'email_not_verified',
      email: credentials.email,
      userId: credentials.id,
    };
  }

  const user = {
    id: credentials.id,
    email: credentials.email,
    role: credentials.role || 'user',
  };

  const accessToken = signAccessToken(user);
  const session = {
    access_token: accessToken,
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
  };

  if (res) {
    setSessionCookies(res, session);
  }
















  {
    const savepoint = 'auth_last_login';
    let savepointCreated = false;
    try {
      await pool.query(`SAVEPOINT ${savepoint}`);
      savepointCreated = true;
      await repo.setLastLoginAt(credentials.id);
      await pool.query(`RELEASE SAVEPOINT ${savepoint}`);
    } catch (e) {
      if (savepointCreated) {
        try {
          await pool.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
          await pool.query(`RELEASE SAVEPOINT ${savepoint}`);
        } catch (_) {


        }
      }
      logger.warn(
        `[auth] signIn: failed to stamp last_login_at for ${credentials.id}: ${e?.message || e}`,
      );
    }
  }

  return { data: { success: true }, session, user };
}


const DUMMY_HASH = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';


export async function signOut(res) {
  if (res) {
    clearSessionCookies(res);
  }
  return { data: { success: true } };
}


function _resetMailPayload({ email, code, link }) {
  const subject = 'Your LearnAI password reset code';
  const text = [
    'We received a request to reset your LearnAI password.',
    '',
    `Your reset code is: ${code}`,
    '',
    'Or open this link to choose a new password:',
    link,
    '',
    'The code expires in 10 minutes. If you did not request this, you can ignore this email.',
  ].join('\n');

  const html = [
    '<p>We received a request to reset your LearnAI password.</p>',
    `<p>Your reset code is <strong style="font-size:20px;letter-spacing:2px">${code}</strong></p>`,
    '<p>Or open this link to choose a new password:</p>',
    `<p><a href="${link}">${link}</a></p>`,
    '<p>The code expires in 10 minutes. If you did not request this, you can ignore this email.</p>',
  ].join('');

  return { to: email, subject, text, html };
}


function _verificationMailPayload({ email, name, link }) {
  const subject = 'Verify your LearnAI email address';

  const text = [
    `Hi ${name},`,
    'Welcome to LearnAI! Please confirm your email address to activate your account.',
    '',
    link,
    '',
    'This link expires in 10 minutes and can only be used once.',
    'If you did not create a LearnAI account, you can ignore this email.',
  ].join('\n');

  const html = [
    `<p>Hi ${name},</p>`,
    '<p>Welcome to LearnAI! Please confirm your email address to activate your account.</p>',
    `<p><a href="${link}">${link}</a></p>`,
    '<p>This link expires in 10 minutes and can only be used once.</p>',
    '<p>If you did not create a LearnAI account, you can ignore this email.</p>',
  ].join('');

  return { to: email, subject, text, html };
}


export async function issueVerificationLink({ userId, email, name }) {
  const normalisedEmail = _normaliseEmail(email);
  if (!normalisedEmail || !userId) {
    return { data: null, mail: null };
  }

  let issued = null;
  try {
    issued = await issueVerificationToken({ userId, email: normalisedEmail });
  } catch (e) {
    logger.error(
      `[auth] issueVerificationLink failed for ${normalisedEmail}: ${e?.message || e}`,
    );
    return { data: null, mail: null };
  }

  if (!issued?.ok) {
    return { data: null, mail: null };
  }

  const link = _verificationLink(issued.token);

  logger.info(
    `[auth] email verification link for ${normalisedEmail} (expires in ${verificationTokenTtlSeconds()}s): ${link}`,
  );

  const mail = _verificationMailPayload({
    email: normalisedEmail,
    name: name || normalisedEmail.split('@')[0],
    link,
  });

  return {
    data: {
      success: true,
      message: VERIFICATION_REQUIRED_MESSAGE,
      email: normalisedEmail,
      verificationRequired: true,
    },
    mail,
  };
}


export async function verifyEmail(pool, { token }) {
  const raw = String(token || '').trim();
  if (!raw) {
    return { error: 'Invalid or expired verification link' };
  }

  let found;
  try {
    found = await consumeVerificationToken(raw);
  } catch (e) {
    logger.error(`[auth] verifyEmail: token lookup failed: ${e?.message || e}`);
    return { error: 'Invalid or expired verification link' };
  }

  if (!found?.ok || !found.userId) {
    return { error: 'Invalid or expired verification link' };
  }

  const repo = _repo(pool);
  const profile = await repo.setEmailConfirmedAt(found.userId, new Date());
  if (!profile) {
    return { error: 'Invalid or expired verification link' };
  }

  return {
    data: {
      success: true,
      message: 'Your email is verified — you can sign in now.',
      email: profile.email,
    },
  };
}


export async function forgotPassword(pool, { email }) {
  const normalisedEmail = _normaliseEmail(email);
  if (!normalisedEmail) {
    return {
      data: {
        success: true,
        message: 'If an account exists for that email, a reset link has been generated.',
      },
      mail: null,
    };
  }

  let mail = null;

  try {
    const repo = _repo(pool);
    const account = await repo.getByEmail(normalisedEmail);

    if (account) {
      const rawToken = randomBytes(32).toString('hex');
      const { code } = await storeOtp({
        email: normalisedEmail,
        userId: account.id,
        token: rawToken,
      });

      logger.info(
        `[auth] password reset link for ${normalisedEmail} (expires in 60 min): ${_resetLink(rawToken)}`
      );

      if (!mailServiceEnabled()) {
        logger.info(
          `[auth] password reset code for ${normalisedEmail} (expires in 10 min): ${code}`,
        );
      }

      mail = _resetMailPayload({
        email: normalisedEmail,
        code,
        link: _resetLink(rawToken),
      });
    }
  } catch (e) {

    logger.error(
      `[auth] forgotPassword: failed to issue reset token: ${e?.message || e}`,
    );
  }

  return {
    data: {
      success: true,
      message: 'If an account exists for that email, a reset link has been generated.',
    },
    mail,
  };
}


export async function deliverOtpMail(mail) {
  if (!mail) return { sent: false, reason: 'no_payload' };
  try {
    return await sendMail(mail);
  } catch (e) {
    logger.error(`[auth] deliverOtpMail failed: ${e?.message || e}`);
    return { sent: false, reason: 'provider_error' };
  }
}


export async function verifyOtp(pool, { email, code }) {
  const normalisedEmail = _normaliseEmail(email);
  if (!normalisedEmail || !code) {
    return { error: 'Email and code are required' };
  }

  const repo = _repo(pool);
  const account = await repo.getByEmail(normalisedEmail);
  if (!account) {
    return { error: 'Invalid or expired code' };
  }

  let result;
  try {
    result = await consumeOtp({ email: normalisedEmail, code: String(code) });
  } catch (e) {
    logger.error(`[auth] verifyOtp failed: ${e?.message || e}`);
    return { error: 'Invalid or expired code' };
  }

  if (!result?.ok) {
    return { error: 'Invalid or expired code' };
  }

  return {
    data: {
      success: true,
      token: result.token,
      message: 'Code verified. Use the token to set a new password.',
    },
  };
}


export async function resetPassword(pool, { token, password, confirmPassword }) {
  if (password !== confirmPassword) {
    return { error: 'Passwords do not match' };
  }
  if (!password || password.length < 6) {
    return { error: 'Password must be at least 6 characters' };
  }
  if (!token) {
    return { error: 'Invalid or expired reset link' };
  }

  let found;
  try {
    found = await consumeToken(token);
  } catch (e) {
    logger.error(`[auth] resetPassword: token lookup failed: ${e?.message || e}`);
    return { error: 'Invalid or expired reset link' };
  }

  if (!found?.ok || !found.userId) {
    return { error: 'Invalid or expired reset link' };
  }

  const userId = found.userId;
  const passwordHash = await hashPassword(password);

  await _repo(pool).setPasswordHash(userId, passwordHash);

  return {
    data: {
      success: true,
      message: 'Password updated successfully',
    },
  };
}


export async function changePassword(
  pool,
  { currentPassword, newPassword, userId },
) {
  if (!newPassword || newPassword.length < 6) {
    return { error: 'New password must be at least 6 characters' };
  }
  if (!currentPassword) {
    return { error: 'Current password is required' };
  }

  const repo = _repo(pool);
  const credentials = await repo.getCredentialsById(userId);
  if (!credentials) {
    return { error: 'Account not found' };
  }

  const ok = await verifyPassword(currentPassword, credentials.passwordHash);
  if (!ok) {
    return { error: 'Current password is incorrect' };
  }

  const passwordHash = await hashPassword(newPassword);
  await repo.setPasswordHash(userId, passwordHash);

  return {
    data: {
      success: true,
      message: 'Password changed successfully',
    },
  };
}


export async function me(pool, userId) {
  const repo = _repo(pool);
  const profile = await repo.getById(userId);

  if (!profile) {
    return { data: null };
  }

  let friendCode = profile.friendCode ?? null;
  if (!friendCode) {
    try {
      friendCode = await _repo(dbPool).ensureFriendCode(userId);
    } catch (e) {
      logger.warn(`Could not mint a friend code for user ${userId}: ${e.message || e}`);
    }
  }

  return {
    data: {
      id: userId,
      email: profile.email,
      profile: {
        id: profile.id,
        name: profile.name,
        avatarUrl: profile.avatarUrl ?? null,
        role: profile.role || 'user',
        friendCode: friendCode ?? null,
      },
    },
  };
}


export function authenticateToken(token) {
  return verifyAccessToken(token);
}
