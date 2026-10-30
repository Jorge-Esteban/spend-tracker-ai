import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 20_000,
    // Los ficheros de integración comparten una única base de datos en memoria,
    // así que se ejecutan de uno en uno (en Vitest 3 esta opción es global).
    fileParallelism: false,
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
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
