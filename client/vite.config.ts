import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';

/**
 * Lê o .env da raiz (o mesmo do servidor) direto do arquivo, para alinhar as portas:
 * PORT é a do servidor (alvo do proxy) e CLIENT_PORT a do Vite. Útil quando há mais de um
 * projeto deste tipo na mesma máquina. Lê do arquivo, e não de process.env, porque ferramentas
 * que sobem o Vite podem injetar um PORT próprio e isso faria o proxy apontar para o Vite.
 */
function rootEnv(): Record<string, string> {
  try {
    return parseEnv(readFileSync(path.resolve(__dirname, '..', '.env'), 'utf8'));
  } catch {
    return {};
  }
}

export default defineConfig(() => {
  const env = rootEnv();
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
