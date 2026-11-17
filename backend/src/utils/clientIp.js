

import { isIP } from 'node:net';


export function isValidInet(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;

  if (trimmed.includes('%')) return false;

  if (trimmed.includes('/')) {
    const [addr, prefix] = trimmed.split('/');
    if (!/^\d{1,3}$/.test(prefix)) return false;
    return isIP(addr) !== 0;
  }
  return isIP(trimmed) !== 0;
}


export function clientIp(req, options = {}) {
  const trustProxy = options.trustProxy ?? req?.app?.get?.('trust proxy') ?? false;

  if (trustProxy) {
    const xff = req?.headers?.['x-forwarded-for'];
    if (typeof xff === 'string' && xff.length > 0) {

      const candidate = xff.split(',')[0].trim();
      if (isValidInet(candidate)) return candidate;
    }
  }

  const ip = req?.ip;
  if (isValidInet(ip)) return ip;

  const socketIp = req?.socket?.remoteAddress;
  if (isValidInet(socketIp)) return socketIp;

  return null;
}

export default { isValidInet, clientIp };
