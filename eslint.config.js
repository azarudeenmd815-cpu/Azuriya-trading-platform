import js from '@eslint/js';
import ts from 'typescript-eslint';
import globals from 'globals';
import hooks from 'eslint-plugin-react-hooks';
export default ts.config(js.configs.recommended, ...ts.configs.recommended, {
  files: ['**/*.{ts,tsx}'], languageOptions: { globals: { ...globals.node, ...globals.browser } },
  plugins: { 'react-hooks': hooks }, rules: { ...hooks.configs.recommended.rules, '@typescript-eslint/no-explicit-any': 'error' }
}, { ignores: ['dist/**', 'node_modules/**'] });
