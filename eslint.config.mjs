import tsParser from '@typescript-eslint/parser'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import prettierPlugin from 'eslint-plugin-prettier'
import reactHooksPlugin from 'eslint-plugin-react-hooks'

const commonTypeScriptRules = {
  '@typescript-eslint/no-unused-vars': [
    'error',
    { argsIgnorePattern: '^_', ignoreRestSiblings: true },
  ],
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/explicit-function-return-type': 'off',
  '@typescript-eslint/explicit-module-boundary-types': 'off',
  'prefer-const': 'error',
}

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/blob-report/**',
      'apps/api/api/**',
      'api/**',
      '.vercel/**',
    ],
  },
  {
    files: ['apps/api/src/**/*.ts', 'apps/api/test/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        sourceType: 'module',
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        fetch: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      prettier: prettierPlugin,
    },
    rules: {
      ...commonTypeScriptRules,
      // `warn`/`error` sao telemetria legitima; `log`/`info`/`debug` quase
      // sempre sao sobra de depuracao e nao deveriam chegar em producao.
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'prettier/prettier': 'error',
    },
  },
  {
    // Scripts de linha de comando: a saida no console e o proprio resultado.
    files: ['apps/api/src/scripts/**/*.ts', 'scripts/**/*.{ts,mjs,cjs}'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    // Mock de teste com `any` e proposital: tipar o dublê inteiro do Prisma
    // custa mais do que entrega. A regra segue valendo no codigo de producao.
    files: [
      'apps/api/src/**/*.spec.ts',
      'apps/api/test/**/*.ts',
      'apps/desktop/src/**/*.spec.{ts,tsx}',
      'apps/desktop/src/**/*.test.{ts,tsx}',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    files: ['apps/desktop/src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        Response: 'readonly',
        AbortSignal: 'readonly',
        MessageEvent: 'readonly',
        React: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      prettier: prettierPlugin,
      'react-hooks': reactHooksPlugin,
    },
    rules: {
      ...commonTypeScriptRules,
      // `warn`/`error` sao telemetria legitima; `log`/`info`/`debug` quase
      // sempre sao sobra de depuracao e nao deveriam chegar em producao.
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'prettier/prettier': 'error',
      // Hook chamado dentro de condicao/loop quebra o React em runtime, e o
      // erro aparece longe da causa. Vale como erro desde ja.
      'react-hooks/rules-of-hooks': 'error',
      // `exhaustive-deps` fica fora por enquanto: a base tem efeitos com deps
      // propositalmente reduzidas e ligar agora inundaria o portao. Ligar
      // depois, arquivo a arquivo.
      'react-hooks/exhaustive-deps': 'off',
    },
  },
]
