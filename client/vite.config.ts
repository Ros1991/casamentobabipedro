import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  // Lê o .env da raiz (o mesmo do servidor) para alinhar as portas: PORT do servidor e CLIENT_PORT do Vite.
  // Útil quando há mais de um projeto deste tipo rodando na mesma máquina.
  const env = loadEnv(mode, path.resolve(__dirname, '..'), '');
  const api = `http://localhost:${env.PORT || 3000}`;
  const clientPort = Number(env.CLIENT_PORT || 5173);

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: clientPort,
      strictPort: true,
      proxy: {
        '/api': api,
        '/uploads': api,
        '/socket.io': { target: api, ws: true },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            map: ['leaflet', 'react-leaflet', 'leaflet.markercluster'],
            misc: ['socket.io-client', 'zustand', 'exifr', 'idb-keyval', 'qrcode'],
          },
        },
      },
    },
  };
});
