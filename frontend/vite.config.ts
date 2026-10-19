/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Lê o .env da raiz do repositório (único arquivo de configuração local).
  const env = loadEnv(mode, '..', '');
  const backend = `http://${env.BACKEND_HOST || '127.0.0.1'}:${env.BACKEND_PORT || '3001'}`;
  return {
    plugins: [react()],
    server: {
      // "localhost" é contexto seguro: getUserMedia funciona sem HTTPS.
      host: 'localhost',
      port: Number(env.FRONTEND_PORT || 5173),
      strictPort: true,
      proxy: { '/api': { target: backend, changeOrigin: false } },
    },
    preview: {
      host: 'localhost',
      port: Number(env.FRONTEND_PORT || 5173),
      strictPort: true,
      proxy: { '/api': { target: backend, changeOrigin: false } },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['src/test-setup.ts'],
      include: ['src/**/*.test.tsx', 'src/**/*.test.ts'],
    },
  };
});
