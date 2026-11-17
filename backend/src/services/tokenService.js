

import jwt from 'jsonwebtoken';

import { settings } from '../config/settings.js';


export const ACCESS_TOKEN_TTL_SECONDS = Number(settings.JWT_TTL_SECONDS) || 1800;


export function signAccessToken({ id, email, role }) {
  if (!id) throw new Error('Cannot sign an access token without a user id');
  return jwt.sign({ id, email, role: role || 'user' }, settings.JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    issuer: settings.JWT_ISSUER,
    subject: String(id),
  });
}


export function verifyAccessToken(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const payload = jwt.verify(token, settings.JWT_SECRET, {
      issuer: settings.JWT_ISSUER,
    });
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
}


export function payloadToUser(payload) {
  if (!payload) return null;
  const id = payload.id || payload.sub;
  if (!id) return null;
  return {
    id: String(id),
    sub: payload.sub ? String(payload.sub) : String(id),
    email: payload.email || null,
    role: payload.role || 'user',
  };
}

export default {
  ACCESS_TOKEN_TTL_SECONDS,
  signAccessToken,
  verifyAccessToken,
  payloadToUser,
};
