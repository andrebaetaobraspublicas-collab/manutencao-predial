FROM node:24-bookworm-slim AS build
WORKDIR /app

# Prisma 7 carrega a configuração durante o build. A URL abaixo é apenas
# sintaticamente válida para gerar o client; nenhuma conexão é feita nessa etapa.
ARG DATABASE_URL=mysql://build:build@127.0.0.1:3306/gestaopredios
ENV DATABASE_URL=$DATABASE_URL

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

COPY . .
RUN npm run prisma:generate -w @gestaopredios/api   && npm run build -w @gestaopredios/api

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# A imagem de runtime mantém o CLI e o schema do Prisma para executar
# `prisma migrate deploy` como release command no mesmo artefato da API.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/prisma.config.ts ./apps/api/prisma.config.ts
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/api/dist ./apps/api/dist

RUN mkdir -p /data/uploads   && chown -R node:node /data/uploads /app
USER node
EXPOSE 3001
CMD ["node", "apps/api/dist/main.js"]
