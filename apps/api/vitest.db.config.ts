import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

// Opt-in suite against a real Postgres (`npm run test:db`). `npm test` never touches a database.
export default defineConfig({
    plugins: [tsconfigPaths()],
    test: {
        globals: true,
        root: './',
        include: ['test/**/*.db-spec.ts'],
        // One database for every file: run them one at a time
        fileParallelism: false,
        setupFiles: ['test/setup-env.ts'],
        globalSetup: 'test/global-setup.ts',
        testTimeout: 20_000,
        hookTimeout: 30_000,
    },
});
