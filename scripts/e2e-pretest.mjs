#!/usr/bin/env node
/**
 * Prepares the local Supabase stack before the Playwright e2e suite runs.
 *
 * Runs as the `pretest:e2e` script, so `npm run test:e2e` needs no manual
 * infrastructure step beyond having the Supabase CLI installed:
 *
 *   1. `supabase start`   — tolerated failure (the stack is usually already up).
 *   2. `supabase db reset` — applies migrations + supabase/seed.sql; must succeed
 *      so every run starts from the same deterministic seed.
 */
import { execSync } from 'node:child_process';

function log(message) {
  console.log(`[e2e-pretest] ${message}`);
}

function run(command) {
  execSync(command, { stdio: 'inherit' });
}

try {
  execSync('supabase --version', { stdio: 'ignore' });
} catch {
  console.error(
    '[e2e-pretest] Supabase CLI not found. Install it before running the e2e suite: https://supabase.com/docs/guides/local-development/cli/getting-started'
  );
  process.exit(1);
}

try {
  run('supabase start');
  log('Local Supabase stack is up.');
} catch {
  // `supabase start` exits non-zero when the stack is already running, which is
  // the normal state on repeated runs. The reset below is the real gate.
  log(
    'WARNING: `supabase start` reported an error (the stack may already be running); continuing with `supabase db reset`.'
  );
}

try {
  run('supabase db reset');
} catch {
  console.error('[e2e-pretest] `supabase db reset` failed; aborting the e2e run.');
  process.exit(1);
}

log('Database reset: migrations and seed.sql applied.');
