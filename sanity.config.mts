/**
 * sanity-kit configuration — deterministic quality dashboard.
 * Validated and merged by sanity-kit (defaults in sanity-kit/src/config.ts).
 * Docs: ../sanity-kit/SETUP.md
 */
export default {
  project: "medica-app",
  checks: {
    types: true,
    lint: true,
    deadCode: true,
    audit: true,
    secrets: true,
    tests: true,
    coverage: {
      enabled: true,
      // Baseline ratchet (calibrated 2026-10-04 to current levels):
      // raise only as coverage improves; CI fails on regressions.
      minLines: 70,
      minBranches: 74,
      minFunctions: 75,
      minStatements: 70,
    },
    // Playwright e2e (issue: activate-playwright-e2e-booking, archived). The
    // playwright.config.ts pins its own env and dev servers; `pre` reuses the
    // same Supabase reset gate as `npm run test:e2e`.
    e2e: { enabled: true, pre: "node scripts/e2e-pretest.mjs" },
  },
};
