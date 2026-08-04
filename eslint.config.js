import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import svelte from 'eslint-plugin-svelte'

export default tseslint.config(js.configs.recommended, ...tseslint.configs.recommended, ...svelte.configs['flat/recommended'], {
  ignores: ['.output/', '.wxt/', 'node_modules/'],
})
