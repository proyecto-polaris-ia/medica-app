import '@testing-library/jest-dom/vitest';

import fs from 'node:fs';
import path from 'node:path';

/**
 * Al correr con SUPABASE_LOCAL=1 (npm run test:local) se cargan las variables
 * de .env.test, que apuntan a la instancia local de Supabase. Los tests de
 * datos que migran a BD local se activan solo cuando esas variables existen;
 * con `npm run test` regular siguen corriendo el resto de la suite.
 */
if (process.env.SUPABASE_LOCAL === '1') {
  const envPath = path.resolve(__dirname, '.env.test');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && process.env[match[1]] === undefined) {
        process.env[match[1]] = match[2].trim();
      }
    }
  }
}
