import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // relative paths so Electron can load from dist/ via file://
  build: {
    sourcemap: false,           // never ship source maps to production
    cssMinify: true,
    reportCompressedSize: false,
  },
})
