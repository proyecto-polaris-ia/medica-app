import react from '@vitejs/plugin-react';
import path from 'path';
import { configDefaults, defineConfig } from 'vitest/config';

// Vitest 5 eliminó `environmentMatchGlobs`. El reemplazo canónico son
// proyectos (`test.projects`): un proyecto `node` para lógica/API y otro
// `jsdom` para componentes de UI, conservando exactamente los mismos globs
// que declaraba `environmentMatchGlobs`.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // Las suites de datos locales (test:local) serializan el truncado del
    // esquema public con un advisory lock (src/test-utils/local-db.ts). Con
    // ~25 suites en paralelo, la espera del lock puede superar los 10s
    // default y matar el beforeAll ("Hook timed out"). El lock serializa de
    // todos modos: dar margen suficiente para esperar el turno.
    hookTimeout: 60_000,
    coverage: {
      // Keep producing coverage summaries even when tests fail, so the
      // sanity-kit dashboard can report coverage independently of test health.
      reportOnFailure: true,
    },
    projects: [
      {
        // Todo lo que antes corría en `node`: lógica de negocio y rutas de
        // API, excluyendo los directorios que van a `jsdom`.
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: configDefaults.include,
          exclude: [
            ...configDefaults.exclude,
            'tests/e2e/**',
            'src/components/**',
            'app/**',
          ],
        },
      },
      {
        // Mismo conjunto de archivos que `environmentMatchGlobs` enviaba a
        // `jsdom`: componentes y páginas de UI.
        extends: true,
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: ['src/components/**/*.test.ts*', 'app/**/*.test.ts*'],
          exclude: [...configDefaults.exclude, 'tests/e2e/**'],
        },
      },
    ],
  },
});
