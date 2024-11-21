import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { SERVER_PORT, FRONTEND_PORT } from './src/server/config';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: FRONTEND_PORT,
    strictPort: false, // Allow Vite to find another port if default is taken
    proxy: {
      '/api': {
        target: `http://localhost:${SERVER_PORT}`,
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
