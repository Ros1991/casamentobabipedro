# ---------- Etapa 1: build ----------
FROM node:22-bookworm-slim AS build

# Ferramentas de compilação como garantia para módulos nativos (better-sqlite3, sharp),
# caso o binário pré-compilado não esteja disponível.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci

COPY . .
RUN npm run build \
  && npm prune --omit=dev \
  && mkdir -p server/node_modules

# ---------- Etapa 2: runtime ----------
FROM node:22-bookworm-slim

ENV NODE_ENV=production
ENV DATA_DIR=/data
WORKDIR /app

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/server/node_modules ./server/node_modules
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/drizzle ./server/drizzle
COPY --from=build /app/client/dist ./client/dist

# O volume do Railway é montado em /data como root; por isso o processo roda como root
# (padrão em containers no Railway). Rodar como usuário "node" causa EACCES ao criar /data/uploads.
RUN mkdir -p /data

EXPOSE 3000
CMD ["node", "server/dist/index.js"]
