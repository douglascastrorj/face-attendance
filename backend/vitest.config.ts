import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Cada arquivo usa seu próprio banco SQLite em memória/temporário.
    pool: 'forks',
  },
});
