// Gera os ícones PNG do PWA a partir da foto do casal (scripts/arte/casal.webp), recortada nos rostos.
// Usa o sharp já instalado no server.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

// sharp fica hoisted no node_modules da raiz (workspaces)
const require = createRequire(import.meta.url);
const sharp = require('sharp');

const root = path.resolve(import.meta.dirname, '..');
const srcPath = path.join(root, 'scripts/arte/casal.webp');
const outDir = path.join(root, 'client/public/icons');
await fs.mkdir(outDir, { recursive: true });

// Centro entre os dois rostos na foto de 854x1280 e o lado do quadrado recortado.
const CENTER = { x: 482, y: 468 };
const crop = (side) => ({ left: Math.round(CENTER.x - side / 2), top: Math.round(CENTER.y - side / 2), width: side, height: side });

const targets = [
  { name: 'icon-192.png', size: 192, side: 500 },
  { name: 'icon-512.png', size: 512, side: 500 },
  { name: 'apple-touch-icon.png', size: 180, side: 500 },
  { name: 'favicon.png', size: 64, side: 460 },
  // Maskable: o sistema recorta em círculo/squircle, então o recorte é mais aberto para os rostos ficarem na zona segura
  { name: 'icon-512-maskable.png', size: 512, side: 640 },
];

for (const t of targets) {
  await sharp(srcPath).extract(crop(t.side)).resize(t.size, t.size).png().toFile(path.join(outDir, t.name));
  console.log('ok', t.name);
}

// Ícone pequeno das notificações no Android: o sistema usa só a silhueta (canal alfa) e pinta de branco.
// Uma foto colorida vira um quadrado branco, então aqui sai o monograma P/B com coqueiro, branco em fundo transparente.
const brasao = path.join(root, 'scripts/arte/brasao.png');
// recorte só no coqueiro com as letras (sem a moldura), centralizado num quadrado transparente
const alpha = await sharp(brasao)
  .extract({ left: 432, top: 178, width: 278, height: 462 })
  .resize(96, 96, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .extractChannel('alpha')
  .toBuffer();
await sharp({ create: { width: 96, height: 96, channels: 3, background: '#ffffff' } })
  .joinChannel(alpha)
  .png()
  .toFile(path.join(outDir, 'badge.png'));
console.log('ok badge.png');
