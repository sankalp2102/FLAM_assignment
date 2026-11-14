/**
 * Vite dev plugin: runs the files in /api inside the dev server.
 *
 * Why this exists: the assignment requires `npm install && npm start` to work.
 * Without this you need the Vercel CLI running a second process on :3000, which
 * is a login and an install the grader should not need. This mounts the exact
 * same handler Vercel deploys, so there is one implementation, not a dev copy
 * and a prod copy that drift.
 *
 * It only emulates the slice of the Vercel request/response surface that
 * api/itinerary.js actually uses: req.method, req.body, res.status().json(),
 * res.setHeader(). Deliberately not a full shim.
 */

import { loadEnv } from 'vite';

const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });

export function devApiPlugin() {
  return {
    name: 'dev-api',
    apply: 'serve',

    config(_, { mode }) {
      // Vite only exposes VITE_* to the client. Server-side keys have to be
      // lifted into process.env by hand — which is exactly why GEMINI_API_KEY
      // is not VITE_-prefixed: it must never land in the browser bundle.
      const env = loadEnv(mode, process.cwd(), '');
      for (const [k, v] of Object.entries(env)) {
        if (!(k in process.env)) process.env[k] = v;
      }
    },

    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0] ?? '';
        if (!url.startsWith('/api/')) return next();

        const route = url.slice('/api/'.length).replace(/\/$/, '');
        if (!/^[a-z0-9-]+$/i.test(route)) return next();

        try {
          // ssrLoadModule so edits to api/*.js hot-reload without a restart.
          const mod = await server.ssrLoadModule(`/api/${route}.js`);
          const handler = mod.default;
          if (typeof handler !== 'function') return next();

          if (req.method !== 'GET' && req.method !== 'HEAD') {
            const raw = await readBody(req);
            try {
              req.body = raw ? JSON.parse(raw) : {};
            } catch {
              // Leave it as the raw string; the handler already guards against
              // unparseable bodies.
              req.body = raw;
            }
          }

          res.status = (code) => {
            res.statusCode = code;
            return res;
          };
          res.json = (payload) => {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(payload));
            return res;
          };

          await handler(req, res);
        } catch (err) {
          server.config.logger.error(`[dev-api] ${route}: ${err?.stack ?? err}`);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                error: { code: 'DEV_HANDLER_ERROR', message: String(err?.message ?? err) },
              })
            );
          }
        }
      });
    },
  };
}
