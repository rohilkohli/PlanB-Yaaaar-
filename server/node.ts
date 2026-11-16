/** Node adapter: mounts the API on a plain http server or connect-style middleware (Vite dev). */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handle } from './handlers';
import { securityHeaders } from './headers';
import { clientIp, readBody, type ApiResponse } from './http';

export async function nodeApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url || '/', 'http://localhost');
  if (!url.pathname.startsWith('/api/')) return false;
  let body: unknown;
  let out: ApiResponse;
  try {
    body = await readBody(req);
    out = await handle({ method: req.method || 'GET', path: url.pathname.replace(/\/$/, ''), query: url.searchParams, body, ip: clientIp(req) });
  } catch (err) {
    const status = (err as { status?: number })?.status ?? 500;
    out = { status, body: { error: (err as Error).message } };
  }
  res.statusCode = out.status;
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(securityHeaders())) res.setHeader(k, v);
  for (const [k, v] of Object.entries(out.headers ?? {})) res.setHeader(k, v);
  if (out.body === undefined) { res.end(); return true; }
  if (Buffer.isBuffer(out.body)) { res.end(out.body); return true; }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(out.body));
  return true;
}
