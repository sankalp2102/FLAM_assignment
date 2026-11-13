import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // `vercel dev` runs the serverless function on 3000.
    // Plain `npm run dev` + this proxy keeps the browser talking to /api/*
    // without ever seeing the API key.
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
