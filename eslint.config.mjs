import js from '@eslint/js';
import tseslint from 'typescript-eslint';
export default tseslint.config(
  {ignores: ['node_modules/**', 'backend/functions/lib/**', 'dist/**', 'dist-native/**', '.expo/**']},
  {files: ['backend/functions/src/**/*.ts', 'backend/tests/**/*.ts', 'src/services/**/*.ts'], extends: [js.configs.recommended, ...tseslint.configs.recommended], rules: {'@typescript-eslint/no-require-imports': 'off', '@typescript-eslint/no-explicit-any': 'error'}}
);
