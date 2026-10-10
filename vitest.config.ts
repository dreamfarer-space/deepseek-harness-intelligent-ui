import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      'idiomorph-source': fileURLToPath(new URL('./tests/fixtures/idiomorph-source.ts', import.meta.url)),
    },
  },
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['tests/**/*.test.{js,ts,tsx}'],
    environment: 'node',
    env: {
      NODE_ENV: 'test',
    },
  },
})
