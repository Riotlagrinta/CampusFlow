import { timingSafeEqual } from 'crypto';

const store = new Map<string, number[]>();

export function getRateLimitKey(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  const realIp = req.headers.get('x-real-ip');
  const ip = forwarded ? forwarded.split(',')[0].trim() : (realIp || 'unknown');
  const ua = req.headers.get('user-agent') || 'unknown';
  return `${ip}::${ua.substring(0, 40)}`;
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const timestamps = (store.get(key) || []).filter(t => now - t < windowMs);

  if (timestamps.length >= limit) {
    const oldest = timestamps[0];
    return { allowed: false, retryAfterMs: windowMs - (now - oldest) };
  }

  timestamps.push(now);
  store.set(key, timestamps);
  return { allowed: true, retryAfterMs: 0 };
}

// Comparaison en temps constant pour éviter les timing attacks sur les codes OTP/reset
export function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return timingSafeEqual(bufA, bufB);
}
