// Lint con tipos: solo reglas que atrapan errores reales, no estilo (de eso se
// ocupan `tsc` estricto, `check:skills` y la revisión). Corre dentro de
// `npm run build`, la compuerta oficial, y por tanto en la CI.
import tseslint from 'typescript-eslint';

export default tseslint.config({
  files: ['src/**/*.ts', 'test/**/*.ts'],
  ignores: ['src/generated/**'],
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
  },
  linterOptions: { reportUnusedDisableDirectives: 'error' },
  plugins: { '@typescript-eslint': tseslint.plugin },
  rules: {
    // Una promesa sin esperar pierde su error en silencio. El trabajo de fondo
    // va por `enSegundoPlano()` (captura y registra) o con `void` explícito.
    '@typescript-eslint/no-floating-promises': ['error', {
      // `test()`/`describe()` de node:test devuelven una promesa que el runner
      // gestiona: no se espera en el nivel superior.
      allowForKnownSafeCalls: [{ from: 'package', package: 'node:test', name: ['test', 'describe', 'it', 'suite'] }],
    }],
    '@typescript-eslint/no-misused-promises': 'error',
    '@typescript-eslint/await-thenable': 'error',
    // Un enum de Prisma (Rol, TipoInforme…) que gana un valor debe romper el `switch` que no lo trata.
    '@typescript-eslint/switch-exhaustiveness-check': ['error', { considerDefaultExhaustiveForUnions: true }],
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/only-throw-error': 'error',
    '@typescript-eslint/no-unnecessary-type-assertion': 'error',
    eqeqeq: ['error', 'always', { null: 'ignore' }],
  },
});
