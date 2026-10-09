# Tasks: agregar-filtro-proveedor-horarios

Filtro por proveedor en la lista de horarios (`/business-hours`), client-side,
sincronizado con la URL y con estado vacío propio (issue
[#170](https://github.com/proyecto-polaris-ia/medica-app/issues/170)).

Convención de estado: `[ ]` pendiente · `[x]` completo. TDD activo
(`openspec/config.yaml` → `strict_tdd: true`): cada comportamiento escribe primero
la prueba que falla (**RED**), luego la implementación mínima (**GREEN**) y
después triangula bordes; el refactor queda en verde.

Runners: `npm test` (Vitest, proyectos `node` y `jsdom`) y `npx vitest run` para
la suite focal. Comandos auxiliares: `npx tsc --noEmit`, `npm run build`. No se
requiere `npm run test:local`: este change no toca la capa de datos.

Cada tarea cita los requirements/escenarios del delta
`specs/admin-panel/spec.md` y las decisiones numeradas (`D#`) de `design.md` §3.

---

## Fase 0 — Artefactos SDD (completado)

- [x] 0.1 `proposal.md` — alcance, impacto, decisiones (D1-D6), riesgos (filtro
  perdido tras recargar, URL desincronizada, `providerId` desconocido, doble
  mensaje de vacío), criterios de éxito y rollback plan del issue #170.
- [x] 0.2 `specs/admin-panel/spec.md` — delta `ADDED` de la capability existente
  `admin-panel`: filtro y "Todos", limpieza, sincronización con la URL y
  persistencia con estado vacío del proveedor.
- [x] 0.3 `design.md` — filtrado client-side (D1), select nativo (D2), URL con
  lectura única y `router.replace` (D3), estado del filtro independiente de los
  datos (D4), copy del estado vacío (D5) y pruebas (D6).
- [x] 0.4 `tasks.md` — este plan.
  - Verificación: `find openspec/changes/agregar-filtro-proveedor-horarios -type f | sort`
    → los cuatro artefactos presentes.

---

## Fase 1 — Pruebas de la página (RED)

Suite nueva: `app/(admin)/business-hours/page.test.tsx` (proyecto `jsdom`; patrón
de `app/(admin)/appointments/page.test.tsx`: mock de `next/navigation` —
`useSearchParams`/`useRouter` — y mock de `fetch` para
`/api/admin/business-hours` y `/api/admin/providers`).

- [x] 1.1 RED: el panel de filtros renderiza el título "Filtros" y un `<select>`
  de proveedores con las opciones del catálogo y "Todos" seleccionado por defecto,
  mostrando la tabla completa.
  - Cubre: "Filtro por proveedor en la lista de horarios" → escenario "Selección
    por defecto muestra todos los horarios" (D2, D6).
  - Verificación: `npx vitest run "app/(admin)/business-hours/page.test.tsx"` → falla.
- [x] 1.2 RED: seleccionar un proveedor muestra solo sus horarios y "Todos"
  restaura la lista completa, sin emitir una nueva petición al endpoint.
  - Cubre: "Filtro por proveedor en la lista de horarios" → escenarios "Seleccionar
    un proveedor filtra sus horarios", "Regresar a 'Todos' restaura la lista
    completa" y "El filtro no cambia la petición al endpoint" (D1, D6).
  - Verificación: `npx vitest run "app/(admin)/business-hours/page.test.tsx"` → falla.
- [x] 1.3 RED: "Limpiar filtro" no existe sin filtro, aparece al seleccionar un
  proveedor, devuelve a "Todos" y no altera los horarios cargados.
  - Cubre: "Limpieza del filtro por proveedor" → sus tres escenarios (D4, D6).
  - Verificación: `npx vitest run "app/(admin)/business-hours/page.test.tsx"` → falla.
- [x] 1.4 RED: seleccionar escribe `?providerId=` con `router.replace`; un deep
  link inicializa el filtro; sin parámetro se muestran todos; un `providerId`
  desconocido cae en "Todos".
  - Cubre: "Sincronización del filtro con la URL" → sus tres escenarios, más el
    borde de `providerId` desconocido (§4.1 de `design.md`) (D3, D6).
  - Verificación: `npx vitest run "app/(admin)/business-hours/page.test.tsx"` → falla.
- [x] 1.5 RED: el filtro se conserva cuando editar y eliminar recargan los datos.
  - Cubre: "Persistencia del filtro y estado vacío del proveedor" → escenarios "El
    filtro sobrevive a la edición" y "El filtro sobrevive a la eliminación" (D4, D6).
  - Verificación: `npx vitest run "app/(admin)/business-hours/page.test.tsx"` → falla.
- [x] 1.6 RED: un proveedor sin horarios muestra el estado vacío propio; una lista
  sin horarios conserva el mensaje general.
  - Cubre: "Persistencia del filtro y estado vacío del proveedor" → escenario
    "Proveedor sin horarios muestra su propio estado vacío" (D5, D6).
  - Verificación: `npx vitest run "app/(admin)/business-hours/page.test.tsx"` → falla.
- [x] 1.7 Registrar la evidencia RED de la suite (conteo de fallos y mensaje
  representativo) antes de implementar.

---

## Fase 2 — Implementación (GREEN → TRIANGULATE → REFACTOR)

Archivo: `app/(admin)/business-hours/page.tsx`.

- [x] 2.1 GREEN: agregar `useSearchParams`/`useRouter`, el estado `providerFilter`
  inicializado desde `?providerId=`, la derivación `activeProviderFilter` validada
  contra `providers` y el helper `businessHoursUrl(providerId)` (D3).
  - Verificación: `npx vitest run "app/(admin)/business-hours/page.test.tsx"` →
    tarea 1.4 en verde; `npx tsc --noEmit` sin errores.
- [x] 2.2 GREEN: agregar el panel de filtros arriba del `DataTable` con el título
  "Filtros", el `<select id="filter-provider">` con "Todos" y el botón "Limpiar
  filtro" visible solo con filtro activo (D2, D4).
  - Verificación: `npx vitest run "app/(admin)/business-hours/page.test.tsx"` →
    tareas 1.1 y 1.3 en verde.
- [x] 2.3 GREEN: derivar `filteredHours` en memoria y pasarlo al `DataTable`; el
  handler reescribe la URL con `router.replace` (D1, D3).
  - Verificación: `npx vitest run "app/(admin)/business-hours/page.test.tsx"` →
    tareas 1.2 y 1.4 en verde.
- [x] 2.4 GREEN: renderizar `EmptyState` con el mensaje propio del proveedor
  cuando hay filtro y cero filas, conservando el mensaje general sin filtro (D5).
  - Verificación: `npx vitest run "app/(admin)/business-hours/page.test.tsx"` →
    tarea 1.6 en verde.
- [x] 2.5 GREEN: confirmar que `handleSubmit` (`:84-109`) y `handleDelete`
  (`:111-122`) conservan el filtro tras `loadData()` y ajustar solo si la
  derivación lo requiere (D4).
  - Verificación: `npx vitest run "app/(admin)/business-hours/page.test.tsx"` →
    tarea 1.5 en verde.
- [x] 2.6 TRIANGULATE: bordes — `providerId` desconocido en la URL, catálogo de
  proveedores vacío, limpiar tras editar, seleccionar → limpiar → seleccionar,
  proveedor sin horarios con `hours` total no vacío y `hours` total vacío.
- [x] 2.7 REFACTOR: extraer a helpers con nombre la derivación de filas y el
  mensaje vacío sin cambiar el contrato observable.
  - Verificación: `npx vitest run "app/(admin)/business-hours/page.test.tsx"`
    sigue en verde.

---

## Fase 3 — Verificación

- [x] 3.1 Suite focal:
  `npx vitest run "app/(admin)/business-hours/page.test.tsx"` → verde.
- [x] 3.2 Suite completa: `npm test` → verde (registrar cualquier fallo
  preexistente ajeno al change).
- [x] 3.3 Typecheck: `npx tsc --noEmit` → sin errores.
- [x] 3.4 Build: `npm run build` → sin errores.
- [x] 3.5 Trazabilidad: mapear los 4 requirements de
  `specs/admin-panel/spec.md` y sus escenarios a pruebas que pasan.
- [x] 3.6 Trazabilidad de decisiones: confirmar las 6 decisiones de `design.md` §3
  implementadas y verificadas (D1 filtrado client-side, D2 select nativo, D3 URL,
  D4 persistencia, D5 estado vacío, D6 pruebas).
- [x] 3.7 Invariantes por diff: `app/api/admin/business-hours/route.ts`,
  `src/lib/admin/business-hours.ts`, `src/components/admin/EmptyState.tsx`,
  `DataTable.tsx`, `FormModal.tsx`, `LoadingState.tsx`, `ErrorState.tsx`,
  `Pagination.tsx` y `package.json` sin cambios; `travelhub-app` intacto.
  - Verificación: `git diff --stat` y `git status --porcelain` acotados a los
    archivos del change.

---

## Fase 4 — Archive y PR

- [x] 4.1 Verificar el conjunto de artefactos del change:
  `find openspec/changes/agregar-filtro-proveedor-horarios -type f | sort` →
  `proposal.md`, `design.md`, `tasks.md`, `specs/admin-panel/spec.md`.
- [x] 4.2 Validación estructural del delta (el repo no tiene el CLI de OpenSpec
  instalado; `.opencode/skill/_shared/openspec-convention.md` describe el formato):
  encabezado `# Delta for Admin Panel` + `**Change**` + `**Baseline**`, sección
  `## ADDED Requirements`, cada requirement con al menos un escenario
  `GIVEN/WHEN/THEN` y uso de RFC 2119 (`MUST`/`SHOULD`/`MAY`).
  - Verificación: `grep -c "^### Requirement" openspec/changes/agregar-filtro-proveedor-horarios/specs/admin-panel/spec.md`
    → `4`; `grep -n "^## " openspec/changes/agregar-filtro-proveedor-horarios/specs/admin-panel/spec.md`
    → `## ADDED Requirements`.
- [x] 4.3 Preparar el archive (ejecutado por el orquestador/padre, no en apply):
  mover el change a
  `openspec/changes/archive/YYYY-MM-DD-agregar-filtro-proveedor-horarios/` y
  mergear el delta en `openspec/specs/admin-panel/spec.md` **sin** duplicar el
  requirement "Business hours CRUD" (`:133-139`) ni el requirement nuevo.
  - Verificación: revisión manual del spec mergeado (todos los requirements del
    delta presentes una sola vez).
- [ ] 4.4 Commits por unidad de trabajo (artefactos SDD, implementación + pruebas,
  archive) y PR con "Closes #170" (acciones del orquestador/padre).

---

## Workload forecast

- **Tareas:** 30 checkboxes en grupos: Fase 0 (4 artefactos SDD, completados),
  Fase 1 (RED: 7), Fase 2 (implementación: 7), Fase 3 (verificación: 7), Fase 4
  (OpenSpec/PR: 4).
- **Archivos estimados: 3** (2 nuevos, 1 modificado), contando cada archivo una
  sola vez:
  - **Nuevos (2):** `app/(admin)/business-hours/page.test.tsx` (~120-180 líneas) y
    los artefactos SDD del change (este folder).
  - **Modificados (1):** `app/(admin)/business-hours/page.tsx` (~50-90 líneas:
    imports, estado, helper de URL, derivación de filas, panel de filtros y
    estados vacíos).
  - **Sin cambios:** `src/components/admin/EmptyState.tsx`, `DataTable.tsx`,
    `FormModal.tsx`, `LoadingState.tsx`, `ErrorState.tsx`, `Pagination.tsx`,
    `app/api/admin/business-hours/route.ts`, `src/lib/admin/business-hours.ts`,
    `package.json`, migraciones y `travelhub-app`.
- **Tamaño de diff aproximado: ~180-270 líneas** (código + pruebas, excluyendo los
  artefactos SDD): `page.tsx` ~50-90; prueba de página ~120-180.
- **Tests existentes y ejecutables:** sí. `npm test` (Vitest, proyectos `node` y
  `jsdom`) y `npx vitest run` focal. Sin runner nuevo y sin Supabase local.
- **Riesgo de runner:** bajo; no hay suite de datos involucrada. El único riesgo
  de ejecución es construir bien el mock de `next/navigation` y de las dos
  peticiones paralelas de `loadData()`.
- **Punto abierto antes de apply:** el copy exacto del mensaje de estado vacío del
  proveedor ("No hay horarios registrados para este proveedor.") es una propuesta
  y puede ajustarse en apply sin cambiar el contrato.
