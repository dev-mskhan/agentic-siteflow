import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'coverage/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      'no-console': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/modules/*/*', '**/modules/*/**'],
              message:
                'Modules must expose a public API through their index.ts. Import from "../<module>" only — never a module internal file.',
            },
          ],
        },
      ],
    },
  },
  prettier,
);