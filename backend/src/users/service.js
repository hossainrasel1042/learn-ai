

import { clearSessionCookies } from '../services/cookieSession.js';
import { profileRepository } from '../models/profile.js';
import { verifyPassword } from '../services/passwordHasher.js';
import { deleteAvatar, extractPathFromUrl } from '../storage/service.js';





function _repo(pool) {
  return profileRepository(pool);
}






export async function updateProfile(pool, userId, { name, avatarUrl }) {
  if (name !== undefined && (typeof name !== 'string' || name.length === 0)) {
    return { error: 'name must be a non-empty string' };
  }

  const repo = _repo(pool);


  let previousAvatarUrl = null;
  if (avatarUrl !== undefined) {
    const existing = await repo.getById(userId);
    if (existing) previousAvatarUrl = existing.avatarUrl || null;
  }

  const patch = {};
  if (name !== undefined) patch.name = name;
  if (avatarUrl !== undefined) patch.avatarUrl = avatarUrl;

  const profile = await repo.update(userId, patch);
  if (!profile) return { error: 'Profile not found' };



  if (
    avatarUrl !== undefined &&
    previousAvatarUrl &&
    previousAvatarUrl !== avatarUrl
  ) {
    const objectPath = extractPathFromUrl(previousAvatarUrl, userId);
    if (objectPath) {
      try {
        await deleteAvatar({ userId, path: objectPath });
      } catch (_) {

      }
    }
  }

  return {
    data: {
      success: true,
      message: 'Profile updated successfully',
      profile,
    },
  };
}


export async function deleteProfile(pool, { password, userId }, res) {

  const repo = _repo(pool);

  const credentials = await repo.getCredentialsById(userId);
  if (!credentials) {
    return { error: 'Account not found' };
  }

  const ok = await verifyPassword(password, credentials.passwordHash);
  if (!ok) {
    return { error: 'Invalid password' };
  }


  let avatarUrl = null;
  try {
    const existing = await repo.getById(userId);
    if (existing) avatarUrl = existing.avatarUrl || null;
  } catch (_) {

  }



  await repo.delete(userId);



  if (avatarUrl) {
    const objectPath = extractPathFromUrl(avatarUrl, userId);
    if (objectPath) {
      try {
        await deleteAvatar({ userId, path: objectPath });
      } catch (e) {

      }
    }
  }

  if (res) {
    clearSessionCookies(res);
  }

  return {
    data: {
      success: true,
      message: 'Account deleted successfully',
    },
  };
}

export default {
  updateProfile,
  deleteProfile,
};