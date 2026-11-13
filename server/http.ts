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
  body?: unknown;
  headers?: Record<string, string>;
}

export const json = (status: number, body: unknown, headers: Record<string, string> = {}): ApiResponse => ({ status, body, headers });

export function clientIp(req: IncomingMessage): string {
  const xf = req.headers['x-forwarded-for'];
  const first = (Array.isArray(xf) ? xf[0] : xf)?.split(',')[0]?.trim();
  return first || req.socket.remoteAddress || 'unknown';
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
