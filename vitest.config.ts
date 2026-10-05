import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Tests unitaires de logique pure : aucune base de données, aucun appel réseau.
// Les modules qui importent Prisma (ex. @/lib/rateLimit) doivent être testés avec
// vi.mock('@/lib/prisma') / vi.mock('@prisma/client').
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    exclude: ['node_modules/**', '.next/**', 'mobile/**'],
    restoreMocks: true,
    unstubEnvs: true,
  },
});
