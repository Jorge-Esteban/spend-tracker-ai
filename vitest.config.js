import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 20_000,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.js'],
          setupFiles: ['tests/setup.js'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.js'],
          globalSetup: ['tests/globalSetup.js'],
          setupFiles: ['tests/setup.js'],
          // Todos los ficheros comparten una única base de datos en memoria.
          fileParallelism: false,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
