import { defineConfig, devices } from '@playwright/test';
import { spawnSync } from 'node:child_process';

/**
 * Playwright configuration for the public booking wizard (`/booking`).
 *
 * Design of record:
 * openspec/changes/2026-10-04-activate-playwright-e2e-booking/design.md
 *
 * Two dev servers are required because the Turnstile branch is decided server
 * side, per request: `booking` runs with Cloudflare's always-pass test keys and
 * `booking-no-captcha` runs without them, covering the graceful-degradation
 * branch of the public-booking spec. Both point at the same local Supabase
 * stack; test env vars live here instead of in `.env.test` files.
 */

// Public demo credentials of the Supabase CLI local stack; mirrors
// src/test-utils/local-db.ts (LOCAL_DEFAULTS). Not secrets.
const SUPABASE_LOCAL_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54331',
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
  SUPABASE_SERVICE_ROLE_KEY:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
};

// Cloudflare "always passes" test keys: the widget auto-issues a token without
// interaction and siteverify accepts any token when the test secret is used.
const TURNSTILE_TEST_ENV = {
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
  TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
};

const DEFAULT_BOOKING_PORT = 3001;
const DEFAULT_NO_CAPTCHA_PORT = 3002;
const MAX_PORT_CANDIDATES = 50;
const WEB_SERVER_TIMEOUT_MS = 120_000;

/**
 * True when something is already listening on `port`.
 *
 * Mirrors what Playwright probes before starting a `port`-based web server (both
 * loopback families), because a listener on a wildcard address — e.g. a Docker
 * container publishing `*:3003` — is enough for Playwright to consider the port
 * ready and silently reuse the foreign server when `reuseExistingServer` is on.
 * A bind-based check is not sufficient: on macOS a specific-address bind can
 * succeed while the wildcard address is already taken.
 */
function isPortInUse(port: number): boolean {
  const probe = (host: string) =>
    [
      "const net = require('node:net');",
      `const socket = net.connect({ port: ${port}, host: '${host}' });`,
      'socket.setTimeout(1000);',
      'socket.once("connect", () => { socket.destroy(); process.exit(0); });',
      'socket.once("error", () => process.exit(1));',
      'socket.once("timeout", () => { socket.destroy(); process.exit(1); });',
    ].join(' ');

  // exit 0 = connected (in use), exit 1 = connection refused (free). Any other
  // outcome means the probe itself failed, which counts as "in use" so we never
  // pick a port we cannot verify.
  return ['127.0.0.1', '::1'].some(
    (host) => spawnSync(process.execPath, ['-e', probe(host)], { stdio: 'ignore' }).status !== 1
  );
}

/**
 * The design pins the app ports at 3001/3002, but the suite must run unattended
 * on machines where an unrelated local service already publishes one of them:
 * Playwright would refuse to start ("... is already used") on CI, or reuse the
 * foreign server when `reuseExistingServer` is on, producing misleading
 * failures. Prefer the design port and fall back to the next free one.
 *
 * `E2E_BOOKING_PORT` / `E2E_NO_CAPTCHA_PORT` are honoured when set, which also
 * keeps the choice idempotent: Playwright evaluates this config file once in the
 * runner and again in every worker process, and the resolved port is written
 * back to the environment (workers are forked with the runner's `process.env`),
 * so a later evaluation does not probe a port our own dev server now occupies.
 */
function resolveServerPort(envName: string, preferred: number, taken: number[]): number {
  const configured = Number(process.env[envName]);
  if (Number.isInteger(configured) && configured > 0) {
    return configured;
  }

  const port = findFreePort(preferred, taken);
  process.env[envName] = String(port);
  return port;
}

function findFreePort(preferred: number, taken: number[]): number {
  for (let candidate = preferred; candidate < preferred + MAX_PORT_CANDIDATES; candidate += 1) {
    if (!taken.includes(candidate) && !isPortInUse(candidate)) {
      return candidate;
    }
  }
  throw new Error(`[playwright] No free TCP port for the e2e web server near ${preferred}.`);
}

const bookingPort = resolveServerPort('E2E_BOOKING_PORT', DEFAULT_BOOKING_PORT, []);
const noCaptchaPort = resolveServerPort('E2E_NO_CAPTCHA_PORT', DEFAULT_NO_CAPTCHA_PORT, [
  bookingPort,
]);

// stderr: with the json reporter, stdout must stay parseable for tooling
// (sanity-kit's e2e check JSON-parses playwright's stdout).
console.error(
  `[playwright] dev servers → booking=http://127.0.0.1:${bookingPort} no-captcha=http://127.0.0.1:${noCaptchaPort}`
);

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  // Serial: the specs share the seeded local agenda and assert on appointment
  // rows, so parallel workers could race for the same slots.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  use: {
    ...devices['Desktop Chrome'],
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'booking',
      testMatch: '**/*.spec.ts',
      grepInvert: /@no-captcha/,
      use: { baseURL: `http://127.0.0.1:${bookingPort}` },
    },
    {
      name: 'booking-no-captcha',
      testMatch: '**/booking-negative.spec.ts',
      grep: /@no-captcha/,
      use: { baseURL: `http://127.0.0.1:${noCaptchaPort}` },
    },
  ],
  webServer: [
    {
      // The repo's `dev` script hardcodes `-p 3001`, so the suite drives the
      // Next CLI directly to keep the port dynamic.
      command: `npx next dev -p ${bookingPort}`,
      port: bookingPort,
      reuseExistingServer: !process.env.CI,
      timeout: WEB_SERVER_TIMEOUT_MS,
      env: {
        ...SUPABASE_LOCAL_ENV,
        ...TURNSTILE_TEST_ENV,
        // Opt-out flag: force it on so an ambient `false` cannot 404 /booking.
        NEXT_PUBLIC_BOOKING_UI_ENABLED: 'true',
      },
    },
    {
      command: `npx next dev -p ${noCaptchaPort}`,
      port: noCaptchaPort,
      reuseExistingServer: !process.env.CI,
      timeout: WEB_SERVER_TIMEOUT_MS,
      env: {
        ...SUPABASE_LOCAL_ENV,
        // Empty (not absent) values so ambient Turnstile keys cannot leak in and
        // break the graceful-degradation path under test.
        NEXT_PUBLIC_TURNSTILE_SITE_KEY: '',
        TURNSTILE_SECRET_KEY: '',
        NEXT_PUBLIC_BOOKING_UI_ENABLED: 'true',
      },
    },
  ],
});
