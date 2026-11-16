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

export function resetMemoryLimits() { mem.clear(); tokenCache = null; }

/* ---- Firestore (shared across instances; native to Google Cloud, no extra account) ---- */
let tokenCache: { token: string; exp: number } | null = null;

async function accessToken(): Promise<string | null> {
  if (process.env.FIRESTORE_ACCESS_TOKEN) return process.env.FIRESTORE_ACCESS_TOKEN; // local testing only
  if (tokenCache && tokenCache.exp > Date.now() + 30_000) return tokenCache.token;
  try {
    const r = await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', {
      headers: { 'Metadata-Flavor': 'Google' }, signal: AbortSignal.timeout(500)
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { access_token: string; expires_in: number };
    tokenCache = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
    return tokenCache.token;
  } catch { return null; }
}

async function incrFirestore(key: string): Promise<number | null> {
  const project = process.env.GOOGLE_CLOUD_PROJECT || process.env.FIRESTORE_PROJECT;
  if (!project || !(process.env.K_SERVICE || process.env.FIRESTORE_ACCESS_TOKEN)) return null;
  const token = await accessToken();
  if (!token) return null;
  const doc = `projects/${project}/databases/(default)/documents/ratelimits/${key.replace(/[^A-Za-z0-9_-]/g, '_')}`;
  try {
    const res = await fetch(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents:commit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ writes: [
        { update: { name: doc, fields: { expireAt: { timestampValue: new Date(Date.now() + 36 * 3600_000).toISOString() } } }, updateMask: { fieldPaths: ['expireAt'] } },
        { transform: { document: doc, fieldTransforms: [{ fieldPath: 'count', increment: { integerValue: '1' } }] } }
      ] }),
      signal: AbortSignal.timeout(900)
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { writeResults?: Array<{ transformResults?: Array<{ integerValue?: string }> }> };
    const v = j.writeResults?.[1]?.transformResults?.[0]?.integerValue;
    return v !== undefined ? Number(v) : null;
  } catch { return null; }
}

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
  if (count === null) count = await incrFirestore(key);
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
