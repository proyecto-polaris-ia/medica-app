# Feature: multi-timezone-app (issue #163, lado app)

Issue: https://github.com/proyecto-polaris-ia/medica-app/issues/163
Worktree: `.worktrees/medica-app/multi-zona-horaria`
OpenSpec change: `openspec/changes/user-timezone-preferences/`
Estrategia: Stacked PRs to main — 3 PRs encadenados (decisión del usuario).

## Tareas

1. [x] Exploración: consumidores de tz + modelo de usuarios. Evidencia:
   `openspec/changes/user-timezone-preferences/exploration.md`. Sin tabla de
   perfiles (primera preferencia por usuario); captura datetime-local solo en
   `app/(admin)/appointments/page.tsx`.
2. [x] Artefactos OpenSpec (proposal, delta specs RFC 2119+GWT, design, tasks,
   state.yaml). Decisiones D1 (user_settings + RLS), D5 (helpers
   parametrizados, default clínica), D8 (wizard público fuera), D9 (métricas
   clínicas). Correcciones post-review: migración con timestamp UTC (no
   secuencial), naming en proposal.
3. [x] Aprobación del proposal (usuario: aprobar + 3 PRs encadenados).
4. [x] Chain 1 — BD + núcleo tz → PR #185 (`eliumontoya/user-tz-core`):
   - `424e015` docs(openspec): artefactos del change
   - `7e75f9e` feat(db): user_settings + RLS por dueño (+ FORCE RLS)
   - `879d673` refactor(admin): helpers tz parametrizados + validador IANA
   - Verificación: 38 tests RED→GREEN, `supabase db reset` OK, FORCE RLS
     inspeccionado en psql, tsc/lint limpios.
   - Review nativa: aprobada y acuse quemado (review-94ee28bb66b9debe);
     5 hallazgos advisory no bloqueantes (hour-24 handling, tests, idioma SQL).
5. [x] Chain 2 — preferencia + settings → PR #186 (`eliumontoya/user-tz-settings`):
   - `e94c2ef` feat(admin): lib de preferencia (sesión RLS) + API GET/PUT
   - `7ed1ebe` feat(admin): TimezoneProvider + layout + /settings
   - Verificación: test:local 1587 tests, tsc, lint, build (rutas dinámicas).
   - Review nativa aprobada y quemada (review-2742d4f7c994ba02, 2 advisory:
     amplificación de fallo de BD en layout, hooks de suite skipped).
   - Nota: falta route.test.ts dedicado para la API (fuera de superficies del
     worker) — follow-up.
6. [x] Chain 3 — presentación por vista → PR #190 (`eliumontoya/user-tz-presentation`, Closes #163):
   - `7107a81` feat(admin): agenda /appointments en zona del observador
   - `066073f` feat(admin): snapshot, Nora, expediente, follow-up, WCC
   - Desviación aprobada: ProviderSnapshot/NoraSection como cliente con
     useViewerTimezone() (enmienda D4 en design.md). WCC appointments cierra el
     escenario de spec con "En tu zona" (server + getViewerTimezone).
   - Verificación: 56 tests enfocados RED→GREEN, npm run test 1347 passed,
     WCC local-db 8 passed, tsc/lint/build limpios.
   - Review nativa aprobada y quemada (review-e9e43fd623223fb7, 3 advisory).
   - `docs(openspec)`: state.yaml apply/verify complete.
7. [ ] Archive + cierre del issue: tras fusionarse #185 → #186 → #190, mover el
   change a `openspec/changes/archive/2026-..-user-timezone-preferences/`,
   fusionar deltas en `openspec/specs/` y abrir PR de archive.

## Follow-ups (hallazgos advisory acumulados, no bloqueantes)

- R3-layout-db-failure-amplification: el layout amplifica fallos de BD al leer
  preferencia (layout.tsx:17-22) — WARNING recurrente.
- R3-timezone-route-untested: API `/api/admin/settings/timezone` sin
  route.test.ts dedicado — SUGGESTION recurrente.
- R3-datetime-local-hour-rollover / R3-dst-ambiguous-capture-unspecified:
  semántica de hora 24/DST ambigua en captura datetime-local.
- R3-nora-mixed-day-semantics: mezcla de semánticas de día en NoraSection.
- Doble constante clínica (CLINIC_TZ / CLINIC_TIME_ZONE) — deuda menor (D5).

## Decisiones

- SDD completo hasta PR; Eva/WhatsApp y wizard público = change futura.
- Fallback de skill: no existen subagentes `sdd-*`; se usan
  `gentle-ai-explore` / `gentle-ai-worker` / `gentle-ai-verify`.
- Prefijo de rama `eliumontoya/*` (convención del repo) sobre el patrón
  `feat/*` del skill chained-pr.
