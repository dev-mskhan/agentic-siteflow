import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const proxyTarget = process.env.VITE_DEV_PROXY_TARGET ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  envDir: '..',
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': { target: proxyTarget, changeOrigin: true },
      '/socket.io': { target: proxyTarget, ws: true },
      '/health': { target: proxyTarget },
      '/ready': { target: proxyTarget },
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
  },
});