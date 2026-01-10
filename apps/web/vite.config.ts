import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const rootDir = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: rootDir,
  plugins: [react()],
  resolve: {
    alias: {
      '@kode/client': resolve(rootDir, '../../packages/client/src'),
      '@kode/protocol': resolve(rootDir, '../../packages/protocol/src'),
      '#client': resolve(rootDir, '../../packages/client/src'),
      '#protocol': resolve(rootDir, '../../packages/protocol/src'),
    },
  },
  build: {
    outDir: resolve(rootDir, 'dist'),
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})
