FROM node:26-bookworm

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

EXPOSE 3030

CMD ["npm", "run", "start:dev"]