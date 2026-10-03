# Reporte de archivo: dashboard-agenda-metrics

**Cambio**: `dashboard-agenda-metrics` (Métricas de ocupación de agenda y tasa de
no-show en el dashboard — Issue #88)
**Archivado**: 2026-10-03 (fecha ISO, prefijo de la convención de archivo del
repo)
**Archivado en**: `openspec/changes/archive/2026-10-03-dashboard-agenda-metrics/`
**Artefactos previos**: `proposal.md`, `design.md`, `tasks.md`,
`specs/dashboard-metrics/spec.md`

## Estado final (autoritativo — al cierre)

El cambio queda **COMPLETO y archivado**. Resultado de verificación reportado:
**PASS WITH WARNINGS**.

| Hecho | Valor |
|------|-------|
| Tareas | 66 `[x]`, 2 `[ ]` abiertas a propósito (16.3 y 21.4, verificación manual con datos reales), 0 con otra causa de aplazamiento |
| Verificación | `npm run test` → 1076 tests en verde; `npm run build` → exit 0 (el build de Next.js incluye el typecheck) |
| Lint | Omitido — no existe script `lint` en `package.json` (hueco preexistente, ajeno al cambio) |
| Requisitos | 6 requisitos / 29 escenarios / 1 capability |
| Entrega | 3 PRs apilados por fase (Fase 1 base sobre `main` → Fase 2 → Fase 3) |
| Commits | `cdb7ed7` (propuesta), `69e01a4` + `1c56a82` (Fase 1), `8aa71e5` (Fase 2), `a0eb6ad` (Fase 3) |

## Specs sincronizadas

| Dominio | Acción | Detalles |
|---------|--------|---------|
| `dashboard-metrics` | Created | Capacidad nueva — copia mecánica de la delta con `## ADDED Requirements` → `## Requirements` (6 requisitos, 29 escenarios). No existía spec previo; se creó el directorio. |

## Contenido del archive

- `proposal.md` ✅
- `design.md` ✅
- `specs/dashboard-metrics/spec.md` ✅ (delta de la capacidad nueva)
- `tasks.md` ✅ (66/68 completas; 16.3 y 21.4 abiertas a propósito)
- `verify-report.md` ⚠️ no existe — esta corrida no produjo artefacto `sdd-verify`
  en la carpeta del change; la evidencia de verificación vive en `tasks.md`
  (secciones 16 y 21) y en el resultado PASS WITH WARNINGS reportado por el
  orquestador.
- `state.yaml` ⚠️ no existe — el change activo no lo generó y el archive más
  reciente (`2026-10-03-confirm-appointment-from-reminder`) tampoco lo conserva;
  el estado final queda registrado en este reporte.

## Source of truth actualizado

El siguiente spec refleja el comportamiento nuevo:

- `openspec/specs/dashboard-metrics/spec.md`

## Pendientes (fuera del alcance de este archive)

1. Tarea 16.3 — verificación manual del panel con datos reales de la base viva:
   confirmar las 4 cards, el desglose por proveedor y el recálculo al cambiar el
   rango. No verificable en CI; registrar la evidencia en el PR.
2. Tarea 21.4 — verificación manual de la tendencia con datos reales (semana
   contra semana, mes contra mes, custom contra periodo anterior) y de la serie.
   No verificable en CI; registrar la evidencia en el PR.
3. Agregar un script `lint` a `package.json` (hueco de verificación preexistente,
   ajeno a este cambio).
4. La tasa de no-show depende de que el admin capture `no_show` / `attended`
   (riesgo operativo documentado en `proposal.md`); sin esa captura la tasa queda
   subestimada.

## Ciclo SDD completo

El cambio quedó planeado, especificado, diseñado, implementado, verificado y
archivado. Listo para el siguiente cambio.
