# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/console/package.json apps/console/package.json
RUN npm ci
COPY . .
ARG VITE_CONSOLE_URL=https://gestao.licitaro.com.br
ENV VITE_CONSOLE_URL=$VITE_CONSOLE_URL
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
USER node
CMD ["node", "apps/api/dist/index.js"]

FROM nginx:1.28-alpine AS nginx
COPY --from=build /app/apps/web/dist /srv/app
COPY --from=build /app/apps/console/dist /srv/console
COPY deploy/nginx/ /etc/licitaro-nginx/
COPY deploy/scripts/nginx-entrypoint.sh /usr/local/bin/licitaro-nginx
RUN chmod +x /usr/local/bin/licitaro-nginx
ENTRYPOINT ["/usr/local/bin/licitaro-nginx"]
