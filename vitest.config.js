import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.{js,jsx}'],
    exclude: ['node_modules', 'web/**', 'dist'],
    environment: 'node',
  },
})
