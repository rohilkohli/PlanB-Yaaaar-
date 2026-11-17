/** Production / self-hosted server: serves the built PWA from dist/ and the /api routes. `npm start` */
import { createServer } from 'node:http';
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { extname, join, normalize } from 'node:path';
import { nodeApi } from './node';
import { securityHeaders } from './headers';

try { process.loadEnvFile('.env'); } catch { /* no .env: zero-config mode */ }

const DIST = join(process.cwd(), 'dist');
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2'
};

// Text assets are compressed once per file and kept in memory (the whole dist is ~1 MB), so each request is a buffer write.
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.webmanifest', '.svg']);
const compressed = new Map<string, { br: Buffer; gz: Buffer }>();
function variants(file: string) {
  let v = compressed.get(file);
  if (!v) {
    const raw = readFileSync(file);
    v = { br: brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }), gz: gzipSync(raw, { level: 9 }) };
    compressed.set(file, v);
  }
  return v;
}

function warm(dir: string) {
  try { for (const f of readdirSync(dir, { withFileTypes: true })) { const full = join(dir, f.name); if (f.isDirectory()) warm(full); else if (COMPRESSIBLE.has(extname(full))) variants(full); } } catch { /* no dist yet */ }
}
warm(DIST);

createServer(async (req, res) => {
  if (await nodeApi(req, res)) return;
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = normalize(join(DIST, urlPath));
  if (!file.startsWith(DIST)) { res.statusCode = 403; res.end(); return; }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html'); // SPA fallback (/today, /preferences)
  for (const [k, v] of Object.entries(securityHeaders())) res.setHeader(k, v);
  if (urlPath.startsWith('/s/') || urlPath.startsWith('/r/')) res.setHeader('X-Robots-Tag', 'noindex, nofollow'); // private share links stay out of search
  const ext = extname(file);
  res.setHeader('Content-Type', TYPES[ext] ?? 'application/octet-stream');
  if (file.endsWith('sw.js') || file.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
  else if (file.includes('/assets/')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  const accept = String(req.headers['accept-encoding'] || '');
  if (COMPRESSIBLE.has(ext) && /\b(br|gzip)\b/.test(accept)) {
    const v = variants(file); const useBr = /\bbr\b/.test(accept);
    const body = useBr ? v.br : v.gz;
    res.setHeader('Content-Encoding', useBr ? 'br' : 'gzip'); res.setHeader('Vary', 'Accept-Encoding'); res.setHeader('Content-Length', body.length);
    res.end(body); return;
  }
  createReadStream(file).pipe(res);
}).listen(Number(process.env.PORT) || 8080, () => console.log(`PlanB listening on :${process.env.PORT || 8080}`));
