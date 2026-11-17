import { settings } from '../config/settings.js';
import { logger } from '../utils/logger.js';




const RESEND_ENDPOINT_FALLBACK = 'https://api.resend.com/emails';
const REQUEST_TIMEOUT_MS = 10_000;




export function mailServiceEnabled() {
  return Boolean(settings.RESEND_API_KEY);
}




function _fromAddress() {
  const configured = String(settings.MAIL_FROM || '').trim();
  if (configured) return configured;
  return 'LearnAI <onboarding@resend.dev>';
}




export async function sendMail({ to, subject, text, html }) {
  if (!mailServiceEnabled()) {
    logger.warn('[mailService] RESEND_API_KEY is not set - emails are not sent.');
    return { sent: false, reason: 'not_configured' };
  }

  if (!to || !subject) {
    logger.warn('[mailService] sendMail called without a recipient or subject.');
    return { sent: false, reason: 'invalid_payload' };
  }

  const body = { from: _fromAddress(), to: [to], subject };
  if (text) body.text = text;
  if (html) body.html = html;

  try {
    const res = await fetch(settings.RESEND_API_URL || RESEND_ENDPOINT_FALLBACK, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      logger.error(`[mailService] provider returned ${res.status}: ${detail.slice(0, 300)}`);
      return { sent: false, reason: 'provider_error', status: res.status };
    }

    let id = null;
    try {
      const parsed = await res.json();
      id = parsed?.id || null;
    } catch (e) {
      id = null;
    }

    logger.info(`[mailService] email sent to ${to}`);
    return { sent: true, id };
  } catch (e) {
    logger.error(`[mailService] send failed: ${e?.message || e}`);
    return { sent: false, reason: 'provider_error' };
  }
}

export default sendMail;
