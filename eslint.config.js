import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { globalIgnores } from 'eslint/config'

export default tseslint.config([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  // The website and admin (browser) must never import the admin server, database code or Node-only modules
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { regex: '^([.][.]?/)+(.+/)?server(/|$)', message: 'The browser code must not import the admin server (server/).' },
          { regex: '^(express|mongodb)(/|$)|^node:', message: 'The browser code must not import server-only packages.' },
        ],
      }],
    },
  },
  // Admin server, build scripts and shared code run in Node (shared code also runs in the browser)
  {
    files: ['backend/**/*.ts', 'frontend/scripts/**/*.ts', 'shared/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.node,
    },
    rules: {
      'react-refresh/only-export-components': 'off',
      'react-hooks/rules-of-hooks': 'off',
      'react-hooks/exhaustive-deps': 'off',
    },
  },
  // The admin server doesn't use the website's code
  {
    files: ['server/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{ regex: '^([.][.]?/)+(.+/)?frontend(/|$)', message: 'The admin server must not import the website code (frontend/). Put shared code in shared/.' }],
      }],
    },
  },
  // shared/ is imported by the browser and by Node: no Node-only or browser-only APIs, and no imports from frontend/ or backend/
  {
    files: ['shared/**/*.ts'],
    ignores: ['shared/**/*.test.ts'],
    languageOptions: {
      globals: globals['shared-node-browser'],
    },
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { regex: '^([.][.]?/)+(.+/)?(frontend|backend)(/|$)', message: 'shared/ must stand alone (it is used by the admin, the server and the build).' },
          { regex: '^node:|^(express|mongodb|react|react-dom|react-router-dom|lucide-react)(/|$)', message: 'shared/ must not use Node-only or browser-only packages.' },
        ],
      }],
      'no-restricted-globals': ['error', 'process', 'Buffer', 'require', '__dirname', '__filename', 'global', 'window', 'document', 'localStorage', 'sessionStorage', 'navigator'],
    },
  },
])
