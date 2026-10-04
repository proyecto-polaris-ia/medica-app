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
    // No playwright in this project yet.
    e2e: { enabled: false },
  },
};
