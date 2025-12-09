import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    // Load env from .env file
    const env = loadEnv(mode, '.', '');

    // For GitHub Actions, use process.env which is set from secrets
    // For local dev, use loadEnv which reads from .env files
    const supabaseUrl = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL || '';
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '';
    const geminiKey = process.env.VITE_GEMINI_API_KEY || env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY || '';

    return {
      base: mode === 'production' ? '/sales-strategist/' : '/',
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        // Define Gemini keys for process.env access
        'process.env.API_KEY': JSON.stringify(geminiKey),
        'process.env.GEMINI_API_KEY': JSON.stringify(geminiKey),
        // Define Supabase keys for import.meta.env access
        'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
        'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseKey),
        'import.meta.env.VITE_GEMINI_API_KEY': JSON.stringify(geminiKey),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
