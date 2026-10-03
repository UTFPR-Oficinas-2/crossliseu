# ---- dev: used by compose.yml for local development (hot reload) ----
FROM node:26 AS dev

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

EXPOSE 3000

CMD ["npm", "run", "start:dev"]

# ---- build: compile TypeScript, then drop devDependencies ----
FROM dev AS build

RUN npm run build && npm prune --omit=dev

# ---- prod: small runtime image used on the VPS ----
FROM node:26-slim AS prod

ENV NODE_ENV=production

WORKDIR /app

COPY --from=build --chown=node:node /app/package*.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist

USER node

EXPOSE 3000

CMD ["node", "dist/main.js"]
