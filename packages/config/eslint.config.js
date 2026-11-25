// ESLint dùng chung cho cả monorepo.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import boundaries from 'eslint-plugin-boundaries';

export const base = tseslint.config(
  { ignores: ['**/dist/**', '**/.next/**', '**/.expo/**', '**/coverage/**', '**/drizzle/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
);

/**
 * Cho apps/api: ranh giới mô-đun của modular monolith (eslint-plugin-boundaries v7).
 *  - Mô-đun A chỉ được import mô-đun B qua src/modules/B/public-api.ts
 *  - src/platform (hạ tầng dùng chung) không được phụ thuộc mô-đun nghiệp vụ
 */
export const nestModules = [
  ...base,
  {
    files: ['src/**/*.ts'],
    plugins: { boundaries },
    settings: {
      'boundaries/include': ['src/**/*.ts'],
      'boundaries/legacy-templates': false,
      'import/resolver': { typescript: { alwaysTryTypes: true } },
      'boundaries/elements': [
        { type: 'module', pattern: 'src/modules/*', capture: ['module'], partialMatch: false },
        { type: 'platform', pattern: 'src/platform', partialMatch: false },
        { type: 'app', pattern: 'src', partialMatch: false },
      ],
      'boundaries/files': [{ pattern: 'src/modules/*/public-api.ts', category: 'module-public' }],
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          message:
            'Import không hợp lệ ({{ from.element.type }} → {{ to.element.type }} "{{ to.element.captured.module }}"): giữa hai mô-đun chỉ dùng public-api.ts; platform/ không được phụ thuộc mô-đun nghiệp vụ.',
          policies: [
            { from: { element: { type: 'app' } }, allow: { to: { element: { type: ['app', 'module', 'platform'] } } } },
            { from: { element: { type: 'platform' } }, allow: { to: { element: { type: 'platform' } } } },
            {
              from: { element: { type: 'module' } },
              allow: {
                to: [
                  { element: { type: 'platform' } },
                  { file: { categories: 'module-public' } },
                  { element: { type: 'module', captured: { module: '{{ from.element.captured.module }}' } } },
                ],
              },
            },
          ],
        },
      ],
    },
  },
];

export default base;
