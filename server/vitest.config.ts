import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    // Las pruebas de integracion comparten PostgreSQL y RabbitMQ: se ejecutan en serie.
    fileParallelism: false,
  },
});
