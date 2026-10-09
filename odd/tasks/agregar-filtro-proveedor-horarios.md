# Feature: agregar-filtro-proveedor-horarios (issue #170)

Filtro por proveedor en la lista de horarios (`/business-hours`), client-side,
sincronizado con la URL, con estado vacío propio.

Ciclo SDD completo hasta PR (decisión del usuario). Change OpenSpec archivado en
`openspec/changes/archive/2026-10-08-agregar-filtro-proveedor-horarios/`.

## Tasks

- [x] 1. Change OpenSpec: proposal.md, specs/admin-panel/spec.md (ADDED), design.md, tasks.md
- [x] 2. Implementar filtro: panel arriba de la tabla (patrón /appointments), select de proveedores + "Todos", botón "Limpiar filtro", filtrado client-side de `hours`, persistencia tras loadData(), EmptyState con mensaje propio, sync URL ?providerId=
- [x] 3. Pruebas (TDD RED→GREEN): suite colocalizada con 10 tests, 13 escenarios del delta + bordes (providerId desconocido)
- [x] 4. Verificar: npm test (174 archivos, 1809 tests), tsc --noEmit, build, lint — PASS WITH WARNINGS (no bloqueantes)
- [x] 5. Archivar change, commits por unidad de trabajo, push, PR "Closes #170"

## Commits (evidencia)

- `120dcea` docs(sdd): add openspec change for provider filter on business-hours (#170)
- `8e4067d` feat(business-hours): add provider filter with URL sync and empty state (#170)
- `b15c04c` chore(openspec): archive provider filter change and merge delta into admin-panel spec (#170)

## Revisión nativa (RDD)

- Lineage `review-c9eef2d10c7ae6fa`, riesgo medium, lens review-reliability.
- Resultado: **approved** con 4 hallazgos informativos (R3-001 WARNING en tasks.md:105-111; R3-002..004 SUGGESTION en page.tsx:38-39 y page.test.tsx:40-44,65). Autoridad quemada (`acknowledge-approved`).

## Evidencia de exploración (key line refs)

- `app/(admin)/business-hours/page.tsx`: estado `providerFilter` init desde `?providerId=`; `activeProviderFilter` validado contra catálogo; `filteredHours` en memoria; helper `businessHoursUrl()` + router.replace.
- Baseline spec: `openspec/specs/admin-panel/spec.md` — delta mergeado (27 requirements totales).
