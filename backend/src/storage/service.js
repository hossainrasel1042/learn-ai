

import { getSupabaseAdmin } from '../services/supabaseAdmin.js';
import { logger } from '../utils/logger.js';
import { settings } from '../config/settings.js';

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];






const MIME_TO_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};




const MAX_FILE_SIZE =
  settings.STORAGE_MAX_UPLOAD_BYTES || 10 * 1024 * 1024;

const AVATAR_BUCKET = 'avatars';


export async function uploadAvatar({ userId, fileBuffer, mimeType, originalName }) {

  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    return { error: 'File type must be JPEG, PNG, WebP, or GIF' };
  }


  const maxMb = Math.round(MAX_FILE_SIZE / (1024 * 1024));
  if (!fileBuffer || !Buffer.isBuffer(fileBuffer) || fileBuffer.length === 0) {
    return { error: `File size must be less than ${maxMb}MB` };
  }
  if (fileBuffer.length > MAX_FILE_SIZE) {
    return { error: `File size must be less than ${maxMb}MB` };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { error: 'Failed to upload file' };
  }





  const ext = MIME_TO_EXT[mimeType] || '.bin';

  const objectPath = `${userId}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(objectPath, fileBuffer, {
      contentType: mimeType,
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadError) {
    logger.error(`uploadAvatar upload error: ${uploadError.message || uploadError}`);
    return { error: 'Failed to upload file' };
  }

  const { data: publicUrlData } = supabase.storage
    .from(AVATAR_BUCKET)
    .getPublicUrl(objectPath);

  const publicUrl = publicUrlData && publicUrlData.publicUrl
    ? publicUrlData.publicUrl
    : null;

  if (!publicUrl) {
    logger.error('uploadAvatar: getPublicUrl returned no publicUrl');
    return { error: 'Failed to upload file' };
  }

  return { data: { path: objectPath, url: publicUrl } };
}


export async function deleteAvatar({ userId, path }) {
  if (!path || typeof path !== 'string' || !path.startsWith(`${userId}/`)) {
    return { error: 'Unauthorized to delete this file' };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { error: 'Failed to delete file' };
  }

  const { error: removeError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .remove([path]);

  if (removeError) {
    logger.error(`deleteAvatar remove error: ${removeError.message || removeError}`);
    return { error: 'Failed to delete file' };
  }

  return { data: { success: true } };
}


export function extractPathFromUrl(publicUrl, userId) {
  if (!publicUrl || typeof publicUrl !== 'string') return null;

  let pathname;
  try {
    pathname = new URL(publicUrl).pathname;
  } catch (_) {
    return null;
  }



  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch (_) {
    return null;
  }


  const stripped = decoded.replace(/^\/+/, '');
  const marker = 'avatars/';
  const idx = stripped.indexOf(marker);
  if (idx === -1) return null;

  let objectPath = stripped.substring(idx + marker.length);
  if (!objectPath) return null;



  if (userId) {
    const prefix = `${userId}/`;
    if (!objectPath.startsWith(prefix)) return null;
  }




  const segments = objectPath.split('/');
  if (segments.some((s) => s === '..' || s === '.')) return null;

  return objectPath || null;
}

export default {
  uploadAvatar,
  deleteAvatar,
  extractPathFromUrl,
};
