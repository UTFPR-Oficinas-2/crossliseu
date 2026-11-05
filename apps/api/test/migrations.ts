/// <reference types="vite/client" />
import type { MigrationInterface } from 'typeorm';

type MigrationClass = new () => MigrationInterface;

// TypeORM's own file glob loads migrations with Node's import, which can't read these .ts
// files under Vitest; Vite's glob transforms them instead.
const modules = import.meta.glob<Record<string, MigrationClass>>(
    '../src/database/migrations/*.ts',
    { eager: true },
);

export const migrationClasses: MigrationClass[] = Object.values(
    modules,
).flatMap((exports) => Object.values(exports));
