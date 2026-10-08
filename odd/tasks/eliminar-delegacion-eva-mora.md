# Feature: Eliminar sistema de delegación Eva→Mora (issue #160, Fase 3)

## Contexto
Parte de la migración a topología multi-agente (épico #140). Tras la Fase 2
(#159, mergeada), Mora es agente raíz independiente con Discord propio; el
sistema de delegación (bindings, hooks, tabla de BD) quedó obsoleto.

## Estado de exploración (verificado)
- `agents/eva/agent/hooks/delegation-identity.ts`: ya eliminado en Fase 2. No existe.
- `src/lib/agent/delegation-bindings.ts` + `__tests__/delegation-bindings.test.ts`
  + `__tests__/delegation-bindings.local.test.ts`: presentes, sin imports externos.
- Migración `20261006080000_agent_delegation_bindings.sql` + par down presentes.
  Tabla sin políticas RLS públicas (solo service role).
- Referencias de docs: `docs/eve-runbook.md` (líneas 10 y 25 aprox.).
- Specs principales (`openspec/specs/mora-agent/spec.md`): ya describen el
  estado post-delegación; ningún requisito vigente depende del binding.
- `odd/tasks/separacion-de-agentes.md` y `openspec/changes/separate-mora-agent/`:
  registros históricos (audit trail); no se editan.

## Decisiones
- Migración: **nueva migración forward** que dropee índice + tabla
  (`IF EXISTS`) + par down que los recree. Motivo: `supabase db reset`
  reproduce las migraciones up; aplicar solo la down dejaría la tabla viva en
  resets futuros.
- El drop en producción es irreversible: se coordina/debe aprobar por el equipo
  al desplegar (nota del issue #160).

## Tareas
- [x] 1. SDD: crear `openspec/changes/remove-agent-delegation/` (proposal,
  design, tasks, state.yaml; sin delta de spec: ningún requisito cambia).
- [x] 2. Eliminar `src/lib/agent/` (módulo + 2 tests + directorio vacío).
- [x] 3. Nueva migración drop de `agent_delegation_bindings` + par down
  (`20261202000000`).
- [x] 4. Limpiar referencias en `docs/eve-runbook.md`.
- [x] 5. Verificación (gentle-ai-verify): `supabase db reset` OK (tabla e
  índice ausentes), test:local secuencial 168 archivos / 1643 tests PASS,
  `npm run build` OK, `npx tsc --noEmit` limpio, `eve build` por agente OK
  (eva y mora exit 0; `eve info` sin diagnósticos, 0 subagents), greps
  estructurales en 0. Ver `verify-report.md` del change.
- [x] 6. Commits por unidad de trabajo + cierre.

## Evidencia de commits
- `c12d9be` docs(openspec): add remove-agent-delegation change (#160)
- `1512b2c` refactor(agents): remove obsolete Eva→Mora delegation system (#160)
- (archive + docs) ver commit final de cierre

## Review nativo (RDD)
- Preflight inspect: 10 archivos, 813 líneas, riesgo medium. Selección de
  untracked resuelta con `exclude` (verify-report y doc ODD quedan fuera del
  candidato).
- Resultado: **consent declined para este candidato**
  (`consent-declined-this-candidate`, resuelto por el host; sin linaje
  creado, sin authority quemada). El decline es acotado al candidato; la
  verificación independiente (gentle-ai-verify) cubre el path RDD-off. No se
  reintentó START sin orden del dueño.

## Notas
- Fragilidad preexistente: `npm run test:local` paralelo falla por advisory
  lock bajo carga; usar `SUPABASE_LOCAL=1 npx vitest run --exclude
  'tests/e2e/**' --no-file-parallelism`.
- SDD artifacts en inglés (convención del repo); docs de usuario en español
  de México.
