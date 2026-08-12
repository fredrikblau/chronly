import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

// Run from the repo root via `npm run preview:popup`, so `root` resolves
// against the project directory. Node APIs are avoided deliberately — this
// config is covered by the project typecheck, which has no node types.
export default defineConfig({
  root: 'harness',
  plugins: [svelte()],
  resolve: {
    alias: { 'wxt/browser': '/browser-stub.ts' },
  },
  server: { port: 5199 },
})
