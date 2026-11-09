// Gera os ícones PNG do PWA a partir de client/public/monograma.png
// (recorte do monograma oficial P/B sobre o céu, da foto de capa do site dos noivos). Usa o sharp já instalado no server.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

// sharp fica hoisted no node_modules da raiz (workspaces)
const require = createRequire(import.meta.url);
const sharp = require('sharp');

const root = path.resolve(import.meta.dirname, '..');
const srcPath = path.join(root, 'client/public/monograma.png');
const outDir = path.join(root, 'client/public/icons');
await fs.mkdir(outDir, { recursive: true });

const targets = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'favicon.png', size: 64 },
];

for (const t of targets) {
  await sharp(srcPath).resize(t.size, t.size).png().toFile(path.join(outDir, t.name));
  console.log('ok', t.name);
}

// Maskable: a foto já preenche o quadrado todo e o monograma fica na zona segura central (80%).
await sharp(srcPath).resize(512, 512).png().toFile(path.join(outDir, 'icon-512-maskable.png'));
console.log('ok icon-512-maskable.png');
