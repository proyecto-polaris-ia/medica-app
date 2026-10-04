import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    environmentMatchGlobs: [
      ['src/components/**/*.test.ts*', 'jsdom'],
      ['app/**/*.test.ts*', 'jsdom'],
    ],
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      // Keep producing coverage summaries even when tests fail, so the
      // sanity-kit dashboard can report coverage independently of test health.
      reportOnFailure: true,
    },
  },
});