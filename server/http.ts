import type { IncomingMessage } from 'node:http';

export interface ApiRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
  ip: string;
}
export interface ApiResponse {
  status: number;
  body?: unknown | Buffer;
  headers?: Record<string, string>;
}

export const json = (status: number, body: unknown, headers: Record<string, string> = {}): ApiResponse => ({ status, body, headers });

/**
 * The visitor IP used for rate limits. `X-Forwarded-For` is client-controlled, so only the entry appended by
 * OUR trusted proxy is believed: on Cloud Run (K_SERVICE set) that is the last entry. Elsewhere XFF is ignored
 * unless TRUSTED_PROXY_HOPS is set (number of proxies in front of us).
 */
export function clientIp(req: IncomingMessage): string {
  const hops = process.env.TRUSTED_PROXY_HOPS !== undefined ? Number(process.env.TRUSTED_PROXY_HOPS) : process.env.K_SERVICE ? 1 : 0;
  const raw = req.headers['x-forwarded-for'];
  const parts = (Array.isArray(raw) ? raw.join(',') : raw ?? '').split(',').map(x => x.trim()).filter(Boolean);
  if (hops > 0 && parts.length >= hops) return parts[parts.length - hops];
  return req.socket.remoteAddress || 'unknown';
}

export async function readBody(req: IncomingMessage, maxBytes = 200_000): Promise<unknown> {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > maxBytes) throw Object.assign(new Error('payload_too_large'), { status: 413 });
    chunks.push(c as Buffer);
  }
  if (!chunks.length) return undefined;
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('invalid_json'), { status: 400 }); }
}
