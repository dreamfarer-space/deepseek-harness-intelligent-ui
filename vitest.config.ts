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
    // A test that dynamic-imports a heavy module graph (TurnTail + PatchView)
    // needs headroom when the runner starts ~40 workers at once; the default 5s
    // is a worker-startup race, not a hang.
    testTimeout: 15_000,
    env: {
      NODE_ENV: 'test',
    },
  },
})
