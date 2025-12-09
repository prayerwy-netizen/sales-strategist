import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    // Load env from .env file (for local dev)
    const fileEnv = loadEnv(mode, '.', '');

    // Also check process.env for CI/CD environments (GitHub Actions)
    const geminiKey = process.env.VITE_GEMINI_API_KEY || fileEnv.GEMINI_API_KEY || fileEnv.VITE_GEMINI_API_KEY || '';

    return {
      base: mode === 'production' ? '/sales-strategist/' : '/',
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        // For legacy code that uses process.env
        'process.env.API_KEY': JSON.stringify(geminiKey),
        'process.env.GEMINI_API_KEY': JSON.stringify(geminiKey)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
