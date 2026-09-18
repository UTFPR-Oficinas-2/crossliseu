# Crossliseu

## How to run project

### Backend API

From the root of the project:

```bash
cd apps/api
npm run start:dev
```

### Web Frontend

From the root of the project:

```bash
cd apps/api
npm run dev
```

### PostgreSQL

To run docker you need to fill the credentials in you `.env` file. First you create the `.env` with:

```bash
cp .env.example .env
```

Then set a value for `POSTGRES_PASSWORD`.

After that, from the root of the project:

```bash
docker compose up -d postgres
```
