# Archive Report: Treatment Plans (Fase 2 del expediente)

**Change**: `treatment-plans`
**Archived on**: 2026-09-29
**Archived to**: `openspec/changes/archive/2026-09-29-treatment-plans/`
**Mode**: openspec (sync de delta specs + move a archive; sin persistencia en Engram)

## Estado final

El cambio implementa la fase 2 del expediente clínico: planes de tratamiento.
Incluye la migración `0015_treatment_plans` (tablas `treatment_plans` y
`treatment_plan_items` con enums, RLS y revoke a `anon`, idempotente), tipos y
validadores (estados, FDI, dinero con precisión de 2 decimales, cantidades), capa
de datos con transiciones de estado y snapshot de `total_amount`, 4 rutas de API
bajo `/api/admin/patients/[id]/treatment-plans` y la pestaña "Plan de tratamiento"
en el expediente del paciente con editor de ítems y total en vivo.

Entregado vía PR #77, MERGED a `main` (merge commit `5a9f134`). Suite completa
668/668 verde, `tsc --noEmit` limpio, `npm run build` limpio.

## Specs sincronizadas (source of truth)

| Dominio | Acción | Detalles |
|---------|--------|----------|
| `treatment-plans` | Created | Capacidad nueva; spec completo copiado a `openspec/specs/treatment-plans/spec.md` (8 requirements, 44 scenarios). No existía spec previo; se creó el directorio. |
| `patient-record-summary` | Updated | Delta `## MODIFIED Requirements` aplicada sobre `openspec/specs/patient-record-summary/spec.md`: 1 requirement reemplazada por su versión completa (`Patient data section` — añade la pestaña "Plan de tratamiento" a la enumeración de tabs y 2 escenarios nuevos: "Plan de tratamiento tab is visible" y "Plan de tratamiento tab lists patient plans"). 0 añadidas, 0 removidas. Los otros 3 requirements quedaron intactos. Se conservaron los escenarios completos de la delta y se omitió la nota `(Previously: ...)` de bookkeeping. |

## Contenido del archive

- `proposal.md` ✅
- `specs/treatment-plans/spec.md` ✅
- `specs/patient-record-summary/spec.md` ✅
- `design.md` ✅
- `tasks.md` ✅ (40/40 tareas completas, 0 pendientes)
- `apply-progress.md` ✅
- `exploration.md` ✅

Nota: este cambio no generó `verify-report.md` (la verificación se reportó inline al
orquestador: suite 668/668 verde, typecheck y build limpios, PR #77 merged). El
archive queda completo con los artefactos de las fases previas.

## Verificación

- **Task Completion Gate**: 40/40 `[x]`, 0 `[ ]` en `tasks.md` — sin tareas sin marcar.
- **Reconciliación excepcional registrada**: la tarea opcional 4.5.5 (E2E humo) se
  marcó como completada con nota de diferimiento inline: requiere app corriendo +
  automatización de navegador no configurada en el worktree; la feature quedó
  verificada vía build + tests de componente/ruta (668/668 verde). El diff de git
  confirma que el único cambio sobre el estado commiteado de `tasks.md` es esa línea.
- **Review receipt gate**: N/A — SDD no ofrece RDD; el `sdd-status` nativo no tiene
  campo `reviewGate`. Entrega bajo política ordinaria del repositorio.
- **Action context**: `repo-local` — operaciones confinadas al worktree.
- **Archivo verificado**: `openspec/changes/` ya no contiene la carpeta activa
  `treatment-plans`; las specs de main reflejan el comportamiento nuevo.

## Notas de auditoría

- El archive es un audit trail: no se modifica ni elimina después de su creación.
- La migración se renumeró a `0015_treatment_plans` (0014 estaba ocupado por
  `patient_identity_columns` de main).
- La verificación de idempotencia de la migración y su rollback se confirman por
  construcción (`IF NOT EXISTS` / guards `pg_type`, `down` en orden de dependencia);
  la confirmación en base viva queda diferida a deploy (sin Supabase en el worktree).
- Los fallos preexistentes de booking-tool (11, fechas vencidas en fixtures) no
  relacionados, documentados en `tasks.md`.