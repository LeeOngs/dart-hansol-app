/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  // Inlines all JS/CSS into index.html so the built app can be opened
  // directly via file:// (double-click) without hitting the browser's
  // CORS block on loading separate <script type="module"> files from disk.
  plugins: [react(), tailwindcss(), viteSingleFile()],
  server: {
    proxy: {
      '/api/dart': {
        target: 'https://opendart.fss.or.kr',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/dart/, '/api'),
      },
    },
  },
  test: {
    environment: 'jsdom',
  },
})

