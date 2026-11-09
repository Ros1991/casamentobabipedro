# Plano: "Galera do Casamento" — rede social do casamento Pedro & Babi

> Site complementar ao oficial (noivos.casar.com/babitos), publicado no Railway.
> Objetivo: conectar os convidados que vão viajar para o casamento — quem vai ficar onde, bate-papo em grupo e fotos tiradas na hora marcadas num mapa interativo.

**Veredito: é possível, e dá para fazer só com tecnologia de navegador (sem app nativo).** Câmera, GPS, mapa e mensagens em tempo real funcionam em qualquer celular moderno via site em HTTPS (o Railway já entrega HTTPS). Os detalhes e os cuidados estão abaixo.

---

## 1. Contexto (extraído do site oficial em 09/11/2026)

> Este repositório é um clone do projeto feito para o casamento de Anna Carolina & Fernando (`Ros1991/casamentocarolfernando`), com os dados, as hospedagens e a identidade visual trocados para o casamento de Pedro & Babi. As seções 2 em diante descrevem o produto e a arquitetura, que são os mesmos.

| Item | Valor |
|---|---|
| Noivos | Pedro & Babi (Instagram @casoriobabitos) |
| Data e hora | Quinta-feira, 19 de novembro de 2026, 15h30 (cerimônia e festa até as 23h) |
| Local | Beach Club Aquiraz Riviera, Aquiraz/CE — ~1h de Fortaleza, 10 min de carro da Praia do Presídio |
| Programação | 19/11 cerimônia e festa · 20/11 praia, piscina e pagode · 21/11 Beach Park (quem tem filhos) ou passeio de buggy · 22/11 despedida |
| Hospedagem sugerida | No Aquiraz Riviera: Manhattan Beach Riviera (hospedagem dos noivos), Riviera Beach Place, Hotel Dom Pedro Laguna; na Praia do Presídio: Hotel Jangadeiro, Pousada do Sol Praia; ou Fortaleza/Porto das Dunas (agência Conquistare Turismo) |
| Traje | Esporte fino (ao ar livre, na grama: salto grosso, plataforma ou anabela) |
| Identidade visual | Praia: foto de coqueiros com monograma "P/B" com coqueiro, terracota (#a47764 / #7c5546), dourado, fundo areia; tipografia Cinzel (títulos) + Lato + Dancing Script |
| Site oficial | Casar.com (noivos.casar.com/babitos): RSVP e lista de presentes no próprio site |

O casamento é em 19/11/2026: o site entrou no ar em 09/11/2026, dez dias antes.

---

## 2. Funcionalidades

### Fase 1 — MVP (o que precisa existir para valer a pena lançar)

1. **Entrada sem senha.** Nome, WhatsApp, onde vai ficar hospedado e **quando chega e quando vai embora** (para a galera programar passeios, caronas e jantares juntos; pode preencher depois no perfil). Um "código do convite" (palavra combinada no grupo da família) impede estranhos. Depois disso a pessoa cai direto no site e fica logada no aparelho.
2. **Mapa da galera.** Pino por hotel/pousada com contador de pessoas; tocar abre a lista de quem está lá. Pino do Beach Club Aquiraz Riviera como referência. Opção "Outro lugar" com pino arrastável para quem alugou casa/apto.
3. **Mural (chat em grupo).** Um único grupo, estilo WhatsApp: mensagens de texto e fotos em tempo real, histórico com rolagem infinita.
4. **Foto na hora, com localização.** Botão de câmera abre a câmera do celular; a localização é capturada no momento do envio; a pessoa confirma ou ajusta o pino antes de postar. A foto aparece no mural, na galeria e como miniatura no mapa.
5. **Galeria.** Grade cronológica de todas as fotos, com visualização em tela cheia (autor, hora, local).
6. **Perfil.** Editar nome, hospedagem, datas, mostrar ou não o WhatsApp para os outros, foto de perfil opcional; sair.
7. **Infos do casamento.** Data, hora, contagem regressiva, "como chegar" (link do Google Maps já usado no site oficial), traje, link para o site oficial e RSVP.
8. **Admin (noivos + você).** Ver e exportar a lista de convidados e hospedagens (CSV), apagar mensagem/foto imprópria.

### Fase 2 — se der tempo antes do casamento, ou para o dia da festa

- **Telão da festa (`/telao`).** Tela cheia com as fotos chegando em tempo real, para projetar na recepção. Diferencial grande e barato de fazer.
- Reações (❤️ 😂 🔥) em fotos e mensagens.
- **"Quem chega quando"**: linha do tempo de chegadas e saídas e quantas pessoas estarão na cidade em cada dia, para combinar carona, transfer e programas em grupo.
- Fila de envio offline: se o sinal no Beach Club Aquiraz Riviera for fraco, a foto fica guardada no celular e sobe quando voltar a conexão.
- Notificações push (Web Push) para mensagens novas.
- Download de todas as fotos em .zip ao final (presente para os noivos).

### Ideias futuras (fora do escopo por agora)

Pedidos de música para o DJ, enquetes ("quem vai no passeio de lancha domingo?"), subgrupos por hotel, recado para os noivos em vídeo.

---

## 3. Experiência do convidado (telas)

Mobile-first: praticamente todo o uso será pelo celular, muitas vezes no 4G.

| Rota | Tela | Conteúdo |
|---|---|---|
| `/entrar` | Entrada | Nome, WhatsApp (com máscara), cards de hospedagem (os do site + "Outro lugar" + "Ainda não sei"), data de chegada e de saída, código do convite |
| `/chegadas` | Quem chega quando | Linha do tempo de chegadas e saídas por dia; quantas pessoas na cidade em cada data |
| `/` | Início | Cabeçalho com monograma, contagem regressiva, infos do casamento, atalhos para Mural/Mapa/Fotos |
| `/mural` | Mural | Chat em grupo, campo de texto na base, botão de câmera |
| `/mapa` | Mapa | Pinos de hospedagem (agrupados) e miniaturas de fotos; filtro "pessoas / fotos"; toque abre painel inferior com detalhes |
| `/fotos` | Galeria | Grade de fotos; toque abre visualizador em tela cheia |
| `/perfil` | Perfil | Dados pessoais e preferências de privacidade |
| `/telao` | Telão (fase 2) | Slideshow em tela cheia, sem login, protegido por código |
| `/admin` | Admin | Convidados, hospedagens, moderação, exportação |

Navegação por barra fixa no rodapé: Início · Mural · Mapa · Fotos · Perfil.

---

## 4. Arquitetura e stack

Um único serviço web no Railway, servindo a API, o WebSocket e o front-end já compilado.

```
Celular do convidado ──HTTPS/WSS──> Railway (serviço Node)
                                      ├── API REST (Fastify)
                                      ├── Socket.IO (tempo real)
                                      ├── Front-end estático (React/Vite)
                                      └── Volume persistente (/data)
                                            ├── uploads/  ── fotos + miniaturas
                                            └── galera.db ── SQLite (convidados, mensagens, metadados)
```

| Camada | Escolha | Por quê |
|---|---|---|
| Front-end | React + Vite + TypeScript + Tailwind | Rápido de construir, ecossistema grande, build estático simples de servir |
| Mapa | Leaflet + tiles do OpenStreetMap + leaflet.markercluster | Zero chave de API, leve, funciona bem no celular. (O CARTO passou a exigir chave em 2026; o provedor é trocável por `MAP_TILE_URL` se quiser um visual mais clean com chave gratuita, ex.: Stadia/MapTiler) |
| Back-end | Node 22 + Fastify + Socket.IO | WebSocket nativo no mesmo processo; Railway suporta WSS sem configuração extra |
| Banco | SQLite (better-sqlite3 + Drizzle ORM), arquivo no mesmo volume das fotos | Zero configuração local (roda no Windows sem instalar nada), um único serviço no Railway, mais que suficiente para algumas centenas de convidados. Backup = copiar um arquivo. Trocar para Postgres depois é simples se precisar |
| Fotos | Volume do Railway montado em `/data` + `sharp` para miniaturas | Simples e barato; sem conta extra. Alternativa: Cloudflare R2 (S3 compatível, 10 GB grátis) se quiser durabilidade fora do Railway |
| Imagem no cliente | Redimensionar para ~1600 px e ~80% de qualidade antes de enviar | Fotos de celular têm 3–8 MB; no 4G do interior isso falha. Com compressão caem para ~300 KB |
| EXIF | `exifr` (cliente) | Ler GPS da foto quando disponível (fallback) |
| Sessão | Cookie httpOnly assinado | Sem senha; o celular "lembra" do convidado |
| PWA | `manifest.json` + ícone | "Adicionar à tela de início" com o monograma; sem service worker no MVP para evitar problemas de cache |

Estrutura do repositório:

```
/client        React + Vite (front-end)
/server        Fastify + Socket.IO + Drizzle (API)
/server/drizzle  migrações SQL geradas
Dockerfile     build do client, build do server, imagem final enxuta
railway.json   healthcheck, comando de start
```

A stack é trocável. Se preferir outra linguagem no back-end (PHP/Laravel, Python/FastAPI, Go), o desenho continua igual; só o Socket.IO muda para o equivalente.

---

## 5. Modelo de dados

```
accommodations   id, name, type (hotel|pousada|apto|casa|outro), city (Aquiraz Riviera|Praia do Presídio|Porto das Dunas|Fortaleza|Outro),
                 lat, lng, instagram, whatsapp, is_preset
                 → pré-carregado com os lugares do site oficial + Beach Club Aquiraz Riviera como ponto de referência

guests           id, name, phone (único, normalizado 55...), accommodation_id (opcional),
                 custom_place_label, custom_city, custom_lat, custom_lng, arrival_date, departure_date,
                 show_phone (bool), avatar_key, created_at, last_seen_at
                 (admin = telefone listado em ADMIN_PHONES)

sessions         token, guest_id, created_at, expires_at

messages         id, guest_id, text, photo_id (opcional), created_at, deleted_at
                 → o mural é a lista de mensagens; uma foto postada vira uma mensagem com photo_id

photos           id, guest_id, file_key, thumb_key, width, height, lat, lng,
                 location_source (gps|exif|manual|none), caption, taken_at, created_at, deleted_at

reactions        message_id, guest_id, emoji  (chave única pelos três)
```

Exclusões são "soft delete" (campo `deleted_at`), para o admin poder reverter um engano.

---

## 6. Como cada parte difícil funciona

### 6.1 Foto com localização

1. Na entrada (ou no primeiro uso da câmera) o site pede permissão de localização uma vez: *"Permitir localização para marcar suas fotos no mapa"*.
2. Tocar em **Tirar foto** abre a câmera do celular (`<input type="file" accept="image/*" capture="environment">`) e, em paralelo, lê a posição atual (`navigator.geolocation`, alta precisão, timeout de 8 s).
3. A foto é redimensionada no próprio celular. Aparece uma prévia com um mini-mapa: *"Sua foto será marcada aqui"*, com opção de arrastar o pino ou enviar sem local.
4. Ordem de prioridade da localização: GPS no momento do envio → GPS do EXIF da foto → ajuste manual → sem localização.
5. O servidor valida a imagem com `sharp`, gera miniatura em WebP de 400 px, salva no volume e grava os metadados no Postgres. Emite `photo:new` via Socket.IO para todos conectados.

**Por que não confiar só no EXIF:** o Safari do iPhone remove a localização das fotos enviadas pela web por privacidade. Usar o GPS do aparelho no momento do envio resolve, já que a proposta é foto "tirada na hora".

### 6.2 Mensagens em tempo real

- Uma sala única no Socket.IO. Eventos: `message:new`, `photo:new`, `guest:joined`, `guest:updated`, `content:deleted`.
- Envio otimista (a mensagem aparece na hora e é confirmada depois). Histórico paginado por cursor ao rolar para cima.
- Como é uma única instância no Railway, não precisa de Redis para sincronizar.

### 6.3 Mapa de hospedagem

- Cada hospedagem pré-cadastrada tem coordenadas fixas; um pino por lugar com badge de quantidade. Tocar abre painel inferior com a lista de pessoas (nome, avatar, datas, WhatsApp se a pessoa permitiu).
- "Outro lugar": o convidado digita um rótulo ("Casa da tia em Barra Bali") e posiciona o pino no mapa. Sem geocodificação externa no MVP, o que evita chaves de API e custos.
- Camadas alternáveis: **Pessoas** e **Fotos**. Miniaturas de fotos circulares no mapa; aglomeradas quando muito próximas.
- Visão em lista como alternativa ao mapa: agrupada por cidade → hospedagem → pessoas.

### 6.4 Entrada sem senha

- Telefone normalizado é a identidade. Se já existir, a pessoa entra na mesma conta (troca de celular, limpou o navegador).
- Cookie de sessão assinado, validade de 90 dias.
- Código do convite em variável de ambiente (`INVITE_CODE`), trocável a qualquer momento.
- Compromisso assumido: alguém poderia digitar o telefone de outra pessoa. Para um casamento de família é aceitável. Se incomodar, a fase 2 pode adicionar confirmação por código via WhatsApp.

---

## 7. Deploy no Railway

1. Criar projeto no Railway e conectar ao repositório GitHub (deploy automático a cada push na `main`).
2. Criar um **Volume** e montar em `/data` no serviço web (banco em `/data/galera.db`, fotos em `/data/uploads`).
3. Variáveis de ambiente:

   | Variável | Uso |
   |---|---|
   | `DATA_DIR` | `/data` (banco e fotos) |
   | `SESSION_SECRET` | assinatura dos cookies |
   | `INVITE_CODE` | código do convite |
   | `ADMIN_PHONES` | telefones com acesso ao admin (noivos, você) |
   | `MAX_UPLOAD_MB` | limite por foto (ex.: 12) |
   | `TELAO_CODE` | acesso ao telão |

4. Build via `Dockerfile` (multi-stage: compila client e server, imagem final só com o necessário). Start: `node server/dist/index.js`, porta lida de `PORT`. Healthcheck em `/health`.
5. Migrações do banco rodam automaticamente no start.
7. Domínio: o Railway dá `*.up.railway.app` com HTTPS. O site oficial fica no Casar.com (sem DNS próprio), então vale o subdomínio do Railway ou um domínio próprio barato.
8. Observação: volume só funciona com **uma réplica**; o redeploy tem alguns segundos de indisponibilidade. Aceitável para este uso.

**Custo estimado:** plano Hobby do Railway (US$ 5/mês, já inclui US$ 5 de uso). Um serviço + alguns GB de volume ficam na faixa de US$ 5–10/mês durante os ~2 meses de uso. Mapa e demais serviços: gratuitos. Nenhuma chave de API paga.

---

## 8. Identidade visual

Seguir o site oficial para o convidado sentir que é "o mesmo casamento":

- Fundo creme (#F0EFEA), verde-oliva para texto e botões (#747948, #36441D), azul-claro aquarela como detalhe (#CBD9E4).
- Serifada elegante para títulos (ex.: Cormorant Garamond) e uma caligráfica para destaques ("amigos", "fotos").
- Monograma A | F com antúrio como ícone do PWA e no cabeçalho.
- **Pedir aos noivos os arquivos originais** (monograma, aquarelas) com a designer, em vez de copiar do site do Canva. Enquanto não chegam, usar formas e cores equivalentes.

---

## 9. Privacidade e segurança

- Aviso curto na entrada: "seus dados serão vistos apenas pelos convidados e apagados após o casamento".
- WhatsApp visível para os outros só se a pessoa marcar a opção.
- Página só acessível com código do convite; conteúdo nunca indexado por buscadores (`noindex`).
- Limites de envio (mensagens por minuto, fotos por hora, tamanho de arquivo) e validação real do tipo de imagem no servidor.
- Admin pode apagar qualquer conteúdo; autor pode apagar o próprio.
- Após o casamento: exportar fotos para os noivos, depois apagar o banco e o volume (ou manter só a galeria em modo leitura por alguns meses).

---

## 10. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| iPhone remove GPS do EXIF | Usar GPS do aparelho no momento do envio (6.1); fallback manual |
| Sinal fraco no Beach Club Aquiraz Riviera | Compressão forte no cliente; barra de progresso; fase 2: fila offline |
| Fotos HEIC do iPhone | Safari converte para JPEG ao escolher pela câmera; servidor recusa formatos não suportados com mensagem clara |
| PWA em modo "standalone" no iOS tem histórico de bugs com câmera | Testar num iPhone real cedo; se der problema, manter abertura no Safari normal |
| Estranhos entrando | Código do convite + `noindex` + limites de envio |
| Perda de fotos | Volume persistente do Railway; exportação em .zip pelo admin a qualquer momento; cópia periódica do volume (ou R2 desde o início) |
| Pouco tempo (6 semanas) | MVP enxuto primeiro; beta com a família na semana 3; congelar funcionalidades em 12/12 |

---

## 11. Cronograma sugerido (08/11 → 19/12/2026)

| Semana | Período | Entregas |
|---|---|---|
| 1 | 09–15/11 | Esqueleto do projeto, Dockerfile, deploy no Railway com Postgres e volume; tela de entrada; mapa com hospedagens pré-cadastradas e pinos de pessoas |
| 2 | 16–22/11 | Mural em tempo real; envio de foto com compressão, localização e prévia; galeria; miniaturas no mapa |
| 3 | 23–29/11 | Perfil, infos do casamento, PWA, identidade visual, admin básico; **beta com a família** (10–15 pessoas) |
| 4 | 30/11–06/12 | Ajustes do beta; divulgação para todos os convidados via grupo de WhatsApp/site oficial |
| 5 | 07–13/12 | Fase 2 no que couber: telão, reações, "quem chega quando"; **congelamento em 12/12** |
| 6 | 14–19/12 | Só correções; teste no local se possível (sinal, telão); plantão no dia |

---

## 12. Decisões em aberto (para alinhar com você e os noivos)

1. **Nome e endereço do site:** domínio novo ou `*.up.railway.app`?
2. **Quem é admin:** só os noivos e você, ou também cerimonialista/padrinhos?
3. **WhatsApp visível por padrão?** Sugestão: oculto por padrão, opt-in.
4. **Telão na festa** interessa aos noivos? Precisa combinar com o espaço (projetor/TV e internet no local).
5. ~~Datas de chegada/saída~~ **Decidido (08/11):** perguntadas já na entrada, para a galera programar coisas juntos.
6. **Arquivos da identidade visual:** os noivos conseguem com a designer?
7. ~~Stack~~ **Decidido (08/11):** Node/React, com SQLite no lugar do Postgres (um serviço só, zero configuração local).

---

## 13. Status (08/11/2026)

**Implementado e testado localmente** (ver README.md para rodar):

- Fase 1 completa: entrada (com chegada/saída), início, mural em tempo real, foto com GPS/EXIF/ajuste manual e compressão no celular, mapa com hospedagens e fotos agrupadas, galeria, perfil com avatar, admin (CSV).
- Fase 2: telão da festa com QR code, reações, "quem chega quando" com gráfico por dia, fila offline de fotos, download de todas as fotos em .zip.
- Extras (09/11): código do convite pela URL (`?codigo=`) e no QR do telão; **acompanhantes** (casal/família) cadastrados pelo convidado, contando nos números do mapa, das chegadas e do admin.
- Infra: Dockerfile, railway.json, workflow do GitHub Actions (build + deploy opcional via token), PWA (manifest e ícones).

**Fora desta rodada:** notificações push (Web Push exige VAPID + service worker e, no iPhone, o site instalado na tela inicial; o mural já mostra contador de não lidas). Pode entrar depois do beta se fizer sentido.

**Deploy (09/11/2026):** código no GitHub (`Ros1991/casamentobabipedro`) e projeto `galera-babi-pedro` no Railway com serviço ligado ao repositório, volume em `/data`, variáveis e domínio <__PUBLIC_URL__>. Configuração em `.railway/railway.ts` (o `railway.json` foi aposentado pelo Railway). Códigos do convite/telão e telefones de admin estão **provisórios**.

## 14. Próximos passos

1. Trocar no Railway os valores provisórios: `INVITE_CODE`, `TELAO_CODE` e `ADMIN_PHONES` (noivos + Rodrigo).
1. Antes de divulgar, zerar os dados de teste em produção (convidado "Teste Produção" e foto de teste): apagar `/data/galera.db*` e `/data/uploads/*` via `railway ssh` e reiniciar.
2. Testar num iPhone e num Android reais (câmera, GPS, instalação na tela inicial).
3. Decidir o endereço final (subdomínio do site oficial via CNAME ou manter o do Railway) e atualizar `PUBLIC_URL`.
4. Beta com a família; pedir à designer os arquivos do monograma/aquarelas para substituir os placeholders.
