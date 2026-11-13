/**
 * Per-IP daily limits (PRD §18: 10 generations + 25 adaptations / IP / day).
 * Uses Upstash Redis REST when configured (shared across serverless instances),
 * otherwise an in-memory counter. IPs are hashed with a daily salt; raw IPs are never stored.
 */
import { createHash } from 'node:crypto';
import { env } from './env';

export interface LimitResult { allowed: boolean; remaining: number; limit: number; retryAfterSec: number }

const mem = new Map<string, { count: number; day: string }>();

function today() { return new Date().toISOString().slice(0, 10); }
function secondsToMidnightUtc() {
  const n = new Date();
  return Math.max(1, Math.ceil((Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1) - n.getTime()) / 1000));
}
export function hashIp(ip: string): string {
  return createHash('sha256').update(`${ip}|${today()}|planb`).digest('hex').slice(0, 24);
}

export function resetMemoryLimits() { mem.clear(); }

async function incrUpstash(key: string, url: string, token: string): Promise<number | null> {
  try {
    const res = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([['INCR', key], ['EXPIRE', key, 90000, 'NX']]),
      signal: AbortSignal.timeout(800)
    });
    if (!res.ok) return null;
    const out = (await res.json()) as Array<{ result?: number }>;
    return typeof out?.[0]?.result === 'number' ? out[0].result : null;
  } catch {
    return null;
  }
}

export async function checkLimit(ip: string, bucket: string, limit: number): Promise<LimitResult> {
  const e = env();
  const key = `planb:rl:${bucket}:${hashIp(ip)}:${today()}`;
  let count: number | null = null;
  if (e.upstashUrl && e.upstashToken) count = await incrUpstash(key, e.upstashUrl, e.upstashToken);
  if (count === null) {
    const cur = mem.get(key);
    count = (cur && cur.day === today() ? cur.count : 0) + 1;
    mem.set(key, { count, day: today() });
    if (mem.size > 5000) for (const k of mem.keys()) { if (!k.endsWith(today())) mem.delete(k); }
  }
  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    limit,
    retryAfterSec: secondsToMidnightUtc()
  };
}
