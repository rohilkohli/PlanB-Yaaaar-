import type { IncomingMessage, ServerResponse } from 'node:http';
import { nodeApi } from '../server/node';

/** Vercel serverless entry: every /api/* function delegates to the shared router. */
export default async function vercelHandler(req: IncomingMessage, res: ServerResponse) {
  const handled = await nodeApi(req, res);
  if (!handled) { res.statusCode = 404; res.end(); }
}
