// Limpa o mural do site: apaga as mensagens de texto (e reações). As fotos ficam, a menos que passe --fotos.
// Uso: node scripts/limpar-mural.mjs <url-do-site> [--fotos]   (token em IMPORT_TOKEN ou data/import-token.txt)
import dns from 'node:dns';
import fs from 'node:fs';
import path from 'node:path';

dns.setDefaultResultOrder('ipv4first');
const baseUrl = process.argv.slice(2).find((a) => !a.startsWith('--'));
const tokenFile = path.resolve(import.meta.dirname, '../data/import-token.txt');
const token = process.env.IMPORT_TOKEN || (fs.existsSync(tokenFile) ? fs.readFileSync(tokenFile, 'utf8').trim() : '');
if (!baseUrl || !token) {
  console.error('Uso: node scripts/limpar-mural.mjs <url-do-site> [--fotos] (com IMPORT_TOKEN ou data/import-token.txt)');
  process.exit(1);
}
const res = await fetch(baseUrl.replace(/\/$/, '') + '/api/import/limpar-mural', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-import-token': token },
  body: JSON.stringify({ photos: process.argv.includes('--fotos') }),
});
console.log(res.status, JSON.stringify(await res.json().catch(() => ({}))));
if (!res.ok) process.exit(1);
