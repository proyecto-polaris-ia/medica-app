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
6. [ ] Chain 3 — presentación por vista → PR 3 (`eliumontoya/user-tz-presentation`):
   appointments, calendario, snapshot, WCC, expediente.
7. [ ] Archive + cierre del issue (PR final con 'Closes #163').

## Decisiones

- SDD completo hasta PR; Eva/WhatsApp y wizard público = change futura.
- Fallback de skill: no existen subagentes `sdd-*`; se usan
  `gentle-ai-explore` / `gentle-ai-worker` / `gentle-ai-verify`.
- Prefijo de rama `eliumontoya/*` (convención del repo) sobre el patrón
  `feat/*` del skill chained-pr.
