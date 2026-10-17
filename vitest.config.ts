import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      'offline-resource-pack': fileURLToPath(new URL('./tests/fixtures/offline-resource-pack.ts', import.meta.url)),
      'idiomorph-source': fileURLToPath(new URL('./tests/fixtures/idiomorph-source.ts', import.meta.url)),
    },
  },
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['tests/**/*.test.{js,ts,tsx}'],
    environment: 'node',
    environmentOptions: {
      jsdom: {
        url: 'http://localhost/',
      },
    },
    setupFiles: ['./tests/setup.ts'],
    env: {
      NODE_ENV: 'test',
    },
  },
})
