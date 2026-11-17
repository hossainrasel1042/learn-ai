import { randomInt } from 'node:crypto';




export const FRIEND_CODE_LENGTH = 8;
export const FRIEND_CODE_RE = /^[0-9]{8}$/;




export function generateFriendCode() {
  return String(randomInt(0, 100_000_000)).padStart(FRIEND_CODE_LENGTH, '0');
}


export function isValidFriendCode(value) {
  return typeof value === 'string' && FRIEND_CODE_RE.test(value.trim());
}



export function deriveFriendCodeFromUserId(userId) {
  const hex = String(userId || '').replace(/-/g, '').slice(0, 12);
  let sum = 0;
  for (let i = 0; i < hex.length; i += 1) {
    sum = (sum * 31 + parseInt(hex[i], 16)) % 100_000_000;
  }
  return String(sum).padStart(FRIEND_CODE_LENGTH, '0');
}
