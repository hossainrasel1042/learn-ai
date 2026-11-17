

import bcrypt from 'bcryptjs';


const SALT_ROUNDS = 10;


export async function hashPassword(plain) {
  if (typeof plain !== 'string' || plain.length === 0) {
    throw new Error('Password is required');
  }
  return bcrypt.hash(plain, SALT_ROUNDS);
}


export async function verifyPassword(plain, hash) {
  if (typeof plain !== 'string' || plain.length === 0) return false;
  if (typeof hash !== 'string' || hash.length === 0) return false;
  try {
    return await bcrypt.compare(plain, hash);
  } catch {


    return false;
  }
}

export default { hashPassword, verifyPassword };
