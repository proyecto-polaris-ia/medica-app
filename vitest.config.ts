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
