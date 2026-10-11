import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import svelte from 'eslint-plugin-svelte'
import svelteParser from 'svelte-eslint-parser'

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...svelte.configs['flat/recommended'],
  {
    // Everything here runs in a browser context (popup, new tab, offscreen
    // document, and the worker). Without these, naming a DOM type such as
    // SubmitEvent or AudioContext trips no-undef.
    languageOptions: {
      globals: { ...globals.browser, ...globals.serviceworker },
    },
  },
  {
    // svelte-eslint-parser handles the markup, but needs the TS parser handed
    // to it explicitly to read `<script lang="ts">` blocks.
    files: ['**/*.svelte'],
    languageOptions: {
      parser: svelteParser,
      parserOptions: { parser: tseslint.parser },
    },
  },
  {
    // Build scripts, Playwright specs, and tool configs run in Node.
    files: ['scripts/**', 'e2e/**', '*.config.ts', '*.config.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    ignores: ['.output/', '.wxt/', 'node_modules/', 'test-results/', 'playwright-report/'],
  },
)
