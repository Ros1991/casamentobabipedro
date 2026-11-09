# Galera do Casamento — Pedro & Babi

Rede social do casamento (19/11/2026, Beach Club Aquiraz Riviera, Aquiraz/CE): quem fica onde, mural em tempo real, fotos tiradas na hora marcadas no mapa, "quem chega quando" e telão para a festa.

Clone do site feito para o casamento de Anna Carolina & Fernando ([Ros1991/casamentocarolfernando](https://github.com/Ros1991/casamentocarolfernando)), com os dados, as hospedagens e a identidade visual (coqueiros, terracota, Cinzel) do site oficial <https://noivos.casar.com/babitos>. O plano completo e as decisões estão em [PLANO.md](PLANO.md).

## Stack

- **Client:** React 19 + Vite 7 + TypeScript + Tailwind 4, Leaflet (OpenStreetMap), Socket.IO client, Zustand. PWA (manifest + ícones).
- **Server:** Node 22 + Fastify 5 + Socket.IO, SQLite (better-sqlite3 + Drizzle ORM), sharp para fotos.
- **Deploy:** um único serviço no Railway com um volume em `/data` (banco + fotos). Dockerfile multi-stage.

## Rodar localmente

```bash
npm install
cp .env.example .env   # ajuste INVITE_CODE, ADMIN_PHONES, TELAO_CODE
npm run dev            # server em :3000 e client (Vite) em :5173 (mude PORT e CLIENT_PORT no .env se as portas estiverem ocupadas)
```

Abra <http://localhost:5173>. O Vite faz proxy de `/api`, `/uploads` e `/socket.io` para o servidor.

Outros comandos:

```bash
npm run build          # compila client (client/dist) e server (server/dist)
npm start              # roda o build de produção (serve o client em :3000)
npm run db:generate    # gera migração SQL após mudar server/src/db/schema.ts
npm run icons          # regenera os ícones do PWA a partir de client/public/monograma.png
```

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `PORT` | não | Porta do servidor (o Railway injeta) |
| `DATA_DIR` | não | Pasta do banco (`galera.db`) e das fotos (`uploads/`). Local: `./data`. Railway: `/data` |
| `SESSION_SECRET` | **sim em produção** | Frase longa e aleatória que assina os cookies |
| `INVITE_CODE` | recomendado | Código que os convidados digitam na entrada. Vazio = sem código |
| `ADMIN_PHONES` | recomendado | Telefones (só dígitos, com 55) com acesso ao `/admin`, separados por vírgula |
| `TELAO_CODE` | recomendado | Código para abrir `/telao` sem login |
| `MAX_UPLOAD_MB` | não | Limite por foto (padrão 12) |
| `PUBLIC_URL` | recomendado | URL pública (usada no QR code do telão) |
| `MAP_TILE_URL` / `MAP_TILE_ATTRIBUTION` | não | Troca o provedor de tiles do mapa (padrão OpenStreetMap) |

## Deploy no Railway

O projeto já está no ar: **projeto `galera-babi-pedro`**, serviço **`galera`**, ligado ao repositório `Ros1991/casamentobabipedro` (branch `main`). **Todo push na `main` faz deploy automaticamente.**

- URL: <https://galera-production-e5fd.up.railway.app>
- Região `us-east4` (Virgínia, a de menor latência para o Brasil entre as disponíveis).
- Volume `galera-data` montado em `/data` (banco `galera.db` + `uploads/`).
- Variáveis cadastradas no serviço (ver tabela acima). Troque `INVITE_CODE`, `ADMIN_PHONES` e `TELAO_CODE` pelos valores definitivos no painel do Railway (Variables) ou com `railway variables --set "CHAVE=valor"`.

### Infraestrutura como código (`.railway/railway.ts`)

O `railway.json` foi aposentado pelo Railway (deixa de ser lido em 01/12/2026). A configuração do projeto vive em [`.railway/railway.ts`](.railway/railway.ts): serviço, fonte GitHub, volume, região, healthcheck e as variáveis (valores secretos ficam só no Railway, marcados com `preserve()`).

```bash
npm install                 # instala o SDK "railway" (devDependency)
railway link                # uma vez por máquina: projeto galera-babi-pedro, ambiente production
railway config plan         # mostra o que mudaria no Railway
railway config apply        # aplica (pede confirmação)
```

### Workflow do GitHub Actions

`.github/workflows/deploy.yml` compila o projeto em todo push e PR (verificação). O deploy em si é feito pela integração GitHub do Railway. Se um dia quiser que o deploy saia do Actions, cadastre o secret `RAILWAY_TOKEN` e a variable `RAILWAY_SERVICE=galera` no GitHub e desconecte o repositório no Railway, para não ter dois deploys por push.

### Observações

- Volume funciona com **uma réplica**; o redeploy tem alguns segundos de indisponibilidade.
- O container roda como root porque o volume é montado como root (rodar como `node` dava `EACCES` em `/data`).
- Backup: o admin baixa todas as fotos em `.zip` e a lista de convidados em `.csv` pela tela `/admin`. O banco é o arquivo `/data/galera.db`.
- O `.env` local **não** vai para o git (está no `.gitignore`).

## Rotas

| Rota | O que é |
|---|---|
| `/entrar` | Nome, WhatsApp, acompanhantes, hospedagem, datas de chegada/saída, código do convite |
| `/` | Início: contagem regressiva, infos do casamento, atalhos |
| `/mural` | Chat em grupo em tempo real, com fotos |
| `/mapa` | Hospedagens com quem fica em cada uma + fotos geolocalizadas |
| `/fotos` | Galeria |
| `/chegadas` | Quem chega e vai embora em cada dia |
| `/perfil` | Editar dados, foto de perfil, sair |
| `/telao` | Slideshow em tela cheia para a festa (código do telão ou login) |
| `/admin` | Estatísticas, lista de convidados, CSV e ZIP (só `ADMIN_PHONES`) |

## Estrutura

```
client/           React + Vite
  src/pages/      uma página por rota
  src/components/ Avatar, PhotoCapture (câmera + GPS + prévia), PhotoViewer, mapa…
  src/lib/        api, socket, geo (GPS/EXIF), image (compressão), offlineQueue, format
  src/store.ts    estado global (Zustand) + eventos do Socket.IO
server/           Fastify + Socket.IO
  src/routes/     auth, guests, messages, photos, telao, admin
  src/db/         schema Drizzle + conexão SQLite
  drizzle/        migrações SQL geradas
scripts/          make-icons.mjs
Dockerfile, .railway/railway.ts, .github/workflows/deploy.yml
```
