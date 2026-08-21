import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Конфигурация Vite: dev-сервер фронтенда проксирует
// запросы к API на бэкенд (FastAPI, порт 8000), чтобы
// не было проблем с CORS и WebSocket в разработке.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/ws': {
        target: 'ws://127.0.0.1:8000',
        ws: true,
      },
      '/uploads': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
});
