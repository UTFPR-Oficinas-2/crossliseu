# ---- dev: used by compose.yml for local development (Vite dev server) ----
FROM node:26 AS dev

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# ---- build: produce static files ----
FROM dev AS build

# URL path the app is served under, e.g. /crossliseu/ for https://ediasv.dev/crossliseu/
ARG BASE_PATH=/

RUN npm run build-only -- --base="${BASE_PATH}"

# ---- prod: NGINX serving the static build ----
FROM nginx:1.29-alpine AS prod

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
