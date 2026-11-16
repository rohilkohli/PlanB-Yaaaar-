/** Production / self-hosted server: serves the built PWA from dist/ and the /api routes. `npm start` */
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { nodeApi } from './node';
import { securityHeaders } from './headers';

try { process.loadEnvFile('.env'); } catch { /* no .env: zero-config mode */ }

const DIST = join(process.cwd(), 'dist');
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2'
};

createServer(async (req, res) => {
  if (await nodeApi(req, res)) return;
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = normalize(join(DIST, urlPath));
  if (!file.startsWith(DIST)) { res.statusCode = 403; res.end(); return; }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html'); // SPA fallback (/today, /preferences)
  for (const [k, v] of Object.entries(securityHeaders())) res.setHeader(k, v);
  const ext = extname(file);
  res.setHeader('Content-Type', TYPES[ext] ?? 'application/octet-stream');
  if (file.endsWith('sw.js') || file.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
  else if (file.includes('/assets/')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  createReadStream(file).pipe(res);
}).listen(Number(process.env.PORT) || 8080, () => console.log(`PlanB listening on :${process.env.PORT || 8080}`));
