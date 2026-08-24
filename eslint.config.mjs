import { defineConfig, globalIgnores } from 'eslint/config';
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default defineConfig([
  globalIgnores([
    '**/node_modules/',
    '**/.next/',
    '**/coverage/',
    '**/playwright-report/',
    '**/test-results/',
  ]),
  {
    extends: [...nextCoreWebVitals, ...nextTypescript, ...compat.extends('prettier')],

    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],

      '@typescript-eslint/no-explicit-any': 'warn',

      // New in this eslint-config-next version (React Compiler-oriented
      // rules). Downgraded rather than fixed at every call site: this
      // codebase's established dialog/form pattern is "sync local state
      // from a prop, or close a dialog, when a server action result
      // changes" (react-hooks/set-state-in-effect fires on ~11
      // pre-existing, working call sites doing exactly that); and
      // react-hooks/immutability flags a plain `document.cookie` write
      // inside an event handler (language-switch.tsx) as if it were an
      // effect mutating React state, which it isn't. Kept as warnings
      // (not silenced) so genuinely new problematic patterns still show up.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
    },
  },
]);
