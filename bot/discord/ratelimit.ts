/**
 * Discord Bot Rate Limiting
 *
 * Rate limiting implementation for Discord bot commands.
 */

import { RateLimitEntry, RateLimitResult } from "./types";

const rateLimitStore = new Map<string, RateLimitEntry>();

export function checkRateLimit(
  userId: string,
  maxRequests: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const entry = rateLimitStore.get(userId);

  if (!entry || entry.resetAt < now) {
    const resetAt = now + windowMs;
    rateLimitStore.set(userId, { count: 1, resetAt });
    return { allowed: true, remaining: maxRequests - 1, resetAt };
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return {
    allowed: true,
    remaining: maxRequests - entry.count,
    resetAt: entry.resetAt,
  };
}
