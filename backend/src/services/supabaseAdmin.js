

import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';
import { settings } from '../config/settings.js';
import { logger } from '../utils/logger.js';

let _admin = null;
let _initialised = false;

export function getSupabaseAdmin() {




  if (_initialised && _admin) return _admin;

  const url = settings.SUPABASE_URL;
  const key = settings.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    logger.warn(
      '[supabaseAdmin] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing — admin operations are disabled.'
    );
    _admin = null;
    return null;
  }







  if (typeof globalThis.WebSocket === 'undefined') {
    try {
      const req = createRequire(import.meta.url);
      const { WebSocket } = req('ws');
      globalThis.WebSocket = WebSocket;
    } catch (e) {


    }
  }

  try {
    _admin = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    _initialised = true;
    logger.info('[supabaseAdmin] service-role client initialised');
  } catch (e) {



    _admin = null;
    _initialised = false;
    logger.error(
      `[supabaseAdmin] createClient failed: ${e?.message || e}. Storage will be unavailable until this is fixed.`
    );
    throw e;
  }
  return _admin;
}

export function supabaseAdminEnabled() {
  return Boolean(settings.SUPABASE_URL && settings.SUPABASE_SERVICE_ROLE_KEY);
}

export default getSupabaseAdmin;
