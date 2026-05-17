import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // relative paths so Electron can load from dist/ via file://
  build: {
    sourcemap: false,           // never ship source maps to production
    minify: 'esbuild',          // default, made explicit
    cssMinify: true,
    reportCompressedSize: false,
  },
  esbuild: {
    // Strip console.* and debugger statements from production bundle so
    // the deployed JS reveals less about internals.
    drop: ['console', 'debugger'],
  },
})
