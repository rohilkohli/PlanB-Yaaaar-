import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/** Serves /api/* from the same Node handlers used in production, so `npm run dev` is one process. */
function apiPlugin(): Plugin {
  return {
    name: 'planb-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        const { nodeApi } = await server.ssrLoadModule('/server/node.ts');
        if (!(await nodeApi(req, res))) next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        const { nodeApi } = await import('./server/node');
        if (!(await nodeApi(req, res))) next();
      });
    }
  };
}

export default defineConfig(({ mode }) => {
  // Server-only secrets (GOOGLE_PLACES_API_KEY, ANTHROPIC_API_KEY, …) are loaded into process.env for the
  // API middleware. They are NOT prefixed VITE_, so Vite never inlines them into the client bundle.
  const fileEnv = loadEnv(mode, process.cwd(), '');
  for (const [k, v] of Object.entries(fileEnv)) if (!k.startsWith('VITE_') && process.env[k] === undefined) process.env[k] = v;

  return {
    plugins: [
      react(),
      apiPlugin(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon.svg', 'apple-touch-icon.png'],
        manifest: {
          name: 'PlanB — Solo Travel India',
          short_name: 'PlanB',
          description: 'An adaptive one-day companion for solo travelers. Paced, not packed.',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#F8FBF1',
          theme_color: '#F8FBF1',
          icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
          ]
        },
        workbox: {
          // Precache the app shell; SPA routes (/today, /preferences) resolve to index.html offline.
          globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
          cleanupOutdatedCaches: true,
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
              handler: 'StaleWhileRevalidate',
              options: { cacheName: 'planb-fonts', expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 365 } }
            },
            {
              urlPattern: ({ request }) => request.destination === 'image',
              handler: 'CacheFirst',
              options: { cacheName: 'planb-images', expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 14 }, cacheableResponse: { statuses: [0, 200] } }
            }
          ]
        },
        devOptions: { enabled: false }
      })
    ],
    server: { port: 3000, host: true },
    preview: { port: 3000, host: true }
  };
});
