

import { settings } from '../config/settings.js';
import { ACCESS_TOKEN_TTL_SECONDS } from './tokenService.js';

const ACCESS_COOKIE = 'sb-access-token';

function _cookieOptions(maxAgeMs) {





  const sameSite = settings.cookie_secure ? 'none' : 'lax';
  return {
    httpOnly: true,
    sameSite,
    secure: settings.cookie_secure,
    path: '/',
    maxAge: maxAgeMs,
  };
}


export function setSessionCookies(res, session) {
  if (!session || !session.access_token) return;


  const accessMaxAge = (session.expires_in || ACCESS_TOKEN_TTL_SECONDS) * 1000;

  res.cookie(ACCESS_COOKIE, session.access_token, _cookieOptions(accessMaxAge));
}


export function clearSessionCookies(res) {
  res.clearCookie(ACCESS_COOKIE, _cookieOptions(0));
}

export const ACCESS_COOKIE_NAME = ACCESS_COOKIE;
