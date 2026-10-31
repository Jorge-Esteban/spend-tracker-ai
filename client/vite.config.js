import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // DEV_HTTPS=true sirve https://localhost:5173 con un certificado autofirmado:
  // Enable Banking solo acepta redirect URLs https.
  const https = env.DEV_HTTPS === 'true';
  return {
    plugins: [react(), ...(https ? [basicSsl()] : [])],
    // Recharts va en su propio chunk: cambia poco y se cachea aparte.
    build: { rollupOptions: { output: { manualChunks: { charts: ['recharts'] } } } },
    server: {
      port: 5173,
      // Proxy same-origin: el navegador solo habla con :5173 y la cookie de sesión funciona sin CORS.
      proxy: { '/api': { target: env.API_PROXY_TARGET || 'http://localhost:5000', changeOrigin: true } },
    },
  };
});
