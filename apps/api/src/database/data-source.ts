import 'reflect-metadata';
import { join } from 'node:path';
import { DataSource } from 'typeorm';

const databaseUrl = process.env.POSTGRES_URL;

if (!databaseUrl) {
  throw new Error('POSTGRES_URL is not defined');
}

export default new DataSource({
  type: 'postgres',
  url: databaseUrl,

  entities: [
    join(__dirname, '../modules/**/*.entity{.ts,.js}'),
  ],

  migrations: [
    join(__dirname, 'migrations/*{.ts,.js}'),
  ],

  synchronize: false,
  migrationsRun: false,
});