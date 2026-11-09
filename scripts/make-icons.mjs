// Gera os ícones PNG do PWA a partir de client/public/brasao.png
// (brasão oficial dos noivos, com fundo transparente). Usa o sharp já instalado no server.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

// sharp fica hoisted no node_modules da raiz (workspaces)
const require = createRequire(import.meta.url);
const sharp = require('sharp');

const root = path.resolve(import.meta.dirname, '..');
const srcPath = path.join(root, 'client/public/brasao.png');
const outDir = path.join(root, 'client/public/icons');
await fs.mkdir(outDir, { recursive: true });

const BACKGROUND = '#fbf8f2';

/** Brasão centralizado sobre fundo areia; `fill` é a fração do quadrado ocupada pela arte. */
async function icon(size, fill) {
  const inner = Math.round(size * fill);
  const art = await sharp(srcPath).resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: BACKGROUND } })
    .composite([{ input: art, gravity: 'centre' }])
    .flatten({ background: BACKGROUND })
    .png();
}

const targets = [
  { name: 'icon-192.png', size: 192, fill: 0.92 },
  { name: 'icon-512.png', size: 512, fill: 0.92 },
  { name: 'apple-touch-icon.png', size: 180, fill: 0.88 },
  { name: 'favicon.png', size: 64, fill: 0.96 },
  // Maskable: o sistema recorta em círculo/squircle, então a arte fica na zona segura central
  { name: 'icon-512-maskable.png', size: 512, fill: 0.7 },
];

for (const t of targets) {
  await (await icon(t.size, t.fill)).toFile(path.join(outDir, t.name));
  console.log('ok', t.name);
}
