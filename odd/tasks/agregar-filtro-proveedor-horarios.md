# Feature: agregar-filtro-proveedor-horarios (issue #170)

Filtro por proveedor en la lista de horarios (`/business-hours`), client-side,
sincronizado con la URL, con estado vacío propio.

Ciclo SDD completo hasta PR (decisión del usuario). Change OpenSpec:
`openspec/changes/agregar-filtro-proveedor-horarios/`.

## Tasks

- [ ] 1. Change OpenSpec: proposal.md, specs/admin-panel/spec.md (ADDED), design.md, tasks.md
- [ ] 2. Implementar filtro: panel arriba de la tabla (patrón /appointments), select de proveedores + "Todos", botón "Limpiar filtro", filtrado client-side de `hours`, persistencia tras loadData(), EmptyState con mensaje propio, sync URL ?providerId=
- [ ] 3. Pruebas (TDD RED→GREEN): suite de la página para filtro, URL y estado vacío
- [ ] 4. Verificar: npm test, npx tsc --noEmit, npm run build
- [ ] 5. Archivar change, commits por unidad de trabajo, push, PR "Closes #170"

## Evidencia de exploración (key line refs)

- `app/(admin)/business-hours/page.tsx` :28-36 estado; :38-60 loadData(); :144+ render; :141 providerName(); sin URL params ni filtros hoy.
- `app/(admin)/appointments/page.tsx` :781+ panel de filtros (markup/clases); :855-877 select proveedor id `filter-provider`; :219-236 helpers URL con router.replace; :749-761 clearFilters/hasActiveFilters; :763-769 mensajes vacíos diferenciados.
- `src/components/admin/EmptyState.tsx` — props `{ message?: string }`.
- Tests: `app/(admin)/appointments/page.test.tsx` (Vitest + RTL + userEvent), proyectos vitest node/jsdom, alias `@`→`./src`.
- Baseline spec: `openspec/specs/admin-panel/spec.md` :133 "Business hours CRUD".

## Commits

(registrar por unidad de trabajo)
