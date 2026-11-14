import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { devApiPlugin } from './dev-api-plugin.js';

export default defineConfig({
  // devApiPlugin runs the /api functions inside the Vite dev server, so
  // `npm install && npm start` is all anyone needs. The same handler file is
  // what Vercel deploys in production — no separate dev implementation.
  plugins: [react(), devApiPlugin()],
  server: { port: 5173 },
});
