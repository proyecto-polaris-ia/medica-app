# Tasks: agregar-paginacion-citas

Paginación server-side en la lista de citas del panel (issue
[#168](https://github.com/proyecto-polaris-ia/medica-app/issues/168)).

Convención de estado: `[ ]` pendiente · `[x]` completo. TDD activo
(`openspec/config.yaml` → `strict_tdd: true`): cada comportamiento escribe
primero la prueba que falla (**RED**), luego la implementación mínima
(**GREEN**) y después triangula bordes; el refactor queda en verde.

Runners: `npm test` (Vitest, unitarias) y `npm run test:local`
(`SUPABASE_LOCAL=1` + `supabase start`) para la suite de datos. Comandos
auxiliares: `npx tsc --noEmit`, `npm run lint`, `npm run build`.

Cada tarea cita los escenarios del delta
`specs/admin-appointments/spec.md` y las decisiones numeradas (`D#`) de
`design.md` §3 que implementa o verifica.

---

## Fase 0 — Artefactos SDD (completado)

- [x] 0.1 `proposal.md` — alcance, impacto, riesgos (reconciliación del orden,
  discriminador de modo, composición de URL), criterios de éxito y rollback plan
  del issue #168.
- [x] 0.2 `specs/admin-appointments/spec.md` — delta `ADDED` de la capability
  nueva: paginación, metadatos filtrados, filtros server-side, orden con
  whitelist, validación, modo calendario sin cambios, componente reutilizable,
  URL, reset de página, estado vacío y preservación entre vistas.
- [x] 0.3 `design.md` — migración client-side → server-side (§1.1), contrato de
  metadatos (§1.2), discriminador de modo (§1.3), whitelist de orden (§1.4),
  componente (§1.5), URL (§1.6), reset/preservación (§1.7) y estado vacío (§1.8),
  con 22 decisiones numeradas y dos open questions.
- [x] 0.4 `tasks.md` — este plan.

---

## Fase 1 — Pruebas e infraestructura (RED)

### 1. Ruta mockeada — `app/api/admin/appointments/route.test.ts`

Mock de `@/lib/admin/appointments` extendido con `listAppointmentsPaged`
(el archivo ya mockea `listAppointments`, `listAppointmentsRange` y
`createAppointment`).

- [ ] 1.1 RED: `GET ?page=2&pageSize=20` llama `listAppointmentsPaged` con los
  parámetros esperados y responde `{ appointments, pagination }` con
  `total`/`totalPages` coherentes (D1, D3, D5, D6).
  - Cubre: "Paginación del listado de citas del panel" y "Metadatos de
    paginación sobre el conjunto filtrado".
  - Verificación: `npx vitest run app/api/admin/appointments/route.test.ts` →
    falla (función inexistente).
- [ ] 1.2 RED: los filtros `serviceId`, `patientId`, `providerId` y `start`/`end`
  se reenvían a `listAppointmentsPaged` (D10).
  - Cubre: "Filtros server-side del listado de citas".
  - Verificación: `npx vitest run app/api/admin/appointments/route.test.ts` →
    falla.
- [ ] 1.3 RED: parámetros inválidos → `400` (`page=0`, `pageSize=101`,
  `pageSize=abc`, `sort=patient_name`, `sortDir=up`, `start` sin `end`) y sin
  cuerpo de `appointments`/`pagination` (D9).
  - Cubre: "Validación de los parámetros de consulta".
  - Verificación: `npx vitest run app/api/admin/appointments/route.test.ts` →
    falla.
- [ ] 1.4 RED: `?start=…&end=…` sin paginación llama `listAppointmentsRange`,
  responde `{ appointments }` sin `pagination` y **no** llama a
  `listAppointmentsPaged`; más de 20 citas del rango no se recortan (D2, D4).
  - Cubre: "Modo calendario sin paginación".
  - Verificación: `npx vitest run app/api/admin/appointments/route.test.ts` →
    falla.
- [ ] 1.5 Verificar que los casos existentes (401 sin sesión, POST, 409, rango
  inválido) siguen sin cambios de aserción.

### 2. Suite de datos — `src/lib/admin/__tests__/appointments.test.ts`

Con `localDbEnabled` y fixtures de dominio (`createPatient`, `createService`,
`createProvider`, `createAppointment`).

- [ ] 2.1 RED: `total` refleja el conjunto filtrado (no el universo) y
  `totalPages = ceil(total/pageSize)` (D1, D5, D6).
  - Cubre: "Metadatos de paginación sobre el conjunto filtrado".
  - Verificación: `npm run test:local` → falla.
- [ ] 2.2 RED: filtros combinados (`serviceId` + `providerId` + rango de fechas)
  aplican antes de paginar, con intersección AND (D1, D10).
  - Cubre: "Filtros server-side del listado de citas".
  - Verificación: `npm run test:local` → falla.
- [ ] 2.3 RED: `page`/`pageSize` devuelven el subconjunto correcto y no repiten
  filas entre páginas; `pageSize` en el borde `100`; página más allá del total
  devuelve `appointments: []` con `total` intacto (D5, D6, D7).
  - Cubre: "Paginación del listado de citas del panel".
  - Verificación: `npm run test:local` → falla.
- [ ] 2.4 RED: orden por `start_at` asc/desc y `created_at` asc/desc (D8).
  - Cubre: "Ordenamiento server-side con whitelist".
  - Verificación: `npm run test:local` → falla.
- [ ] 2.5 Verificar que `withReminders` sigue enriqueciendo la página devuelta.

### 3. Componente — `src/components/admin/__tests__/Pagination.test.tsx`

- [ ] 3.1 RED: render del indicador "Página X de Y" y llamada a `onPageChange`
  con la página correcta en primera/anterior/siguiente/última (D12).
  - Cubre: "Componente de paginación reutilizable en la lista".
  - Verificación: `npx vitest run src/components/admin/__tests__/Pagination.test.tsx`
    → falla (módulo inexistente).
- [ ] 3.2 RED: acciones deshabilitadas en los extremos y ausencia de controles
  con una sola página (D12).
  - Cubre: "Componente de paginación reutilizable en la lista".
  - Verificación: `npx vitest run src/components/admin/__tests__/Pagination.test.tsx`
    → falla.
- [ ] 3.3 RED: operable por teclado (`<button>` nativo) y `aria-label` por acción
  (D12).
  - Cubre: "Componente de paginación reutilizable en la lista".
  - Verificación: `npx vitest run src/components/admin/__tests__/Pagination.test.tsx`
    → falla.

### 4. Página — `app/(admin)/appointments/page.test.tsx`

Extender el mock de `next/navigation` y de `fetch` ya presentes.

- [ ] 4.1 RED: la URL del request de la lista incluye `page`, `pageSize` y los
  filtros activos (D10, D11).
  - Cubre: "Filtros server-side del listado de citas" y "Paginación del listado
    de citas del panel".
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    falla.
- [ ] 4.2 RED: `?page=3` (deep link) inicializa la página y solicita la página 3;
  avanzar de página escribe `?page=2` con `router.replace`; activar la página
  actual no reescribe la URL (D14, D15).
  - Cubre: "Sincronización de la página con la URL".
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    falla.
- [ ] 4.3 RED: cambiar un filtro o el orden resetea la página a `1` y la URL deja
  de incluir `page` (D17).
  - Cubre: "Reinicio a la primera página al cambiar filtros".
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    falla.
- [ ] 4.4 RED: una página fuera de rango con `total > 0` muestra el estado vacío
  "No hay citas en esta página." y mantiene visible la paginación; el estado
  vacío por filtros sin coincidencias se conserva (D19).
  - Cubre: "Estado vacío de una página sin filas".
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    falla.
- [ ] 4.5 RED: alternar Lista ↔ Calendario conserva la página si los filtros no
  cambian y no dispara `replace` extra (D18).
  - Cubre: "Preservación de la página al alternar vistas".
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    falla.
- [ ] 4.6 RED: la URL de la lista conserva `providerId`/`serviceId` del calendario
  al cambiar de página (D16).
  - Cubre: "Sincronización de la página con la URL".
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    falla.

### 5. Registrar evidencia RED

- [ ] 5.1 Anotar la salida RED de la ruta, la suite de datos, el componente y la
  página (conteo de fallos y mensaje representativo) antes de implementar.

---

## Fase 2 — Backend (GREEN → TRIANGULATE → REFACTOR)

### 6. Capa de datos — `src/lib/admin/appointments.ts`

- [ ] 6.1 GREEN: agregar `listAppointmentsPaged(params)` con
  `.select(SELECT_COLUMNS, { count: 'exact' })`, filtros `.eq`, rango
  `validateDateRange` + `.gte`/`.lt`, orden por whitelist, `.range(from, to)` y
  `withReminders`; devolver `{ appointments, total }` (D1, D5, D8).
  - Cubre: "Paginación del listado de citas del panel", "Filtros server-side del
    listado de citas" y "Ordenamiento server-side con whitelist".
  - Verificación: `npm run test:local` → pruebas de la tarea 2 en verde;
    `npx tsc --noEmit` sin errores.
- [ ] 6.2 Conservar `listAppointments()` y `listAppointmentsRange()` tal cual
  (D20).
  - Verificación: `npx tsc --noEmit` y pruebas existentes de la suite de datos en
    verde.

### 7. Ruta — `app/api/admin/appointments/route.ts`

- [ ] 7.1 GREEN: parsear y validar `page`, `pageSize`, `sort`, `sortDir` con
  defaults y `ValidationError` → `400` (D8, D9).
  - Cubre: "Validación de los parámetros de consulta".
  - Verificación: `npx vitest run app/api/admin/appointments/route.test.ts` →
    tareas 1.3 en verde.
- [ ] 7.2 GREEN: discriminar modo por presencia de parámetros de paginación;
  modo calendario → `listAppointmentsRange` y `{ appointments }`; modo lista →
  `listAppointmentsPaged`, filtros reenviados y `{ appointments, pagination }`
  (D2, D3, D4, D6, D7, D10).
  - Cubre: "Paginación del listado de citas del panel", "Metadatos de paginación
    sobre el conjunto filtrado", "Filtros server-side del listado de citas" y
    "Modo calendario sin paginación".
  - Verificación: `npx vitest run app/api/admin/appointments/route.test.ts` →
    tareas 1.1, 1.2, 1.4 y 1.5 en verde.

### 8. TRIANGULATE / REFACTOR del backend

- [ ] 8.1 Triangular bordes: `pageSize=100` (borde superior válido),
  `pageSize=1`, `page` como página exactamente igual a `totalPages`, `total=0`
  (`totalPages=0`), y `start`/`end` con rango de exactamente 62 días (D6, D7, D9).
- [ ] 8.2 REFACTOR: extraer helpers con nombre para el parseo/validación de
  parámetros y para el armado de `pagination`, sin cambiar el contrato observable.
  - Verificación: `npx vitest run app/api/admin/appointments/route.test.ts` y
    `npm run test:local` siguen en verde.

---

## Fase 3 — Frontend (GREEN → TRIANGULATE → REFACTOR)

### 9. Componente `Pagination`

Archivo nuevo: `src/components/admin/Pagination.tsx`.

- [ ] 9.1 GREEN: crear el componente con el contrato `{ page, pageSize, total,
  totalPages, onPageChange }`, botones primera/anterior/siguiente/última,
  indicador de página y `disabled` en los extremos (D12).
  - Cubre: "Componente de paginación reutilizable en la lista".
  - Verificación: `npx vitest run src/components/admin/__tests__/Pagination.test.tsx`
    → tareas 3.1-3.3 en verde; `npx tsc --noEmit` sin errores.
- [ ] 9.2 TRIANGULATE: bordes `total=0`, `totalPages=1`, `page` fuera de rango y
  `pageSize` distinto de 20.
- [ ] 9.3 REFACTOR: extraer el arreglo de acciones a datos con nombre legible sin
  cambiar el contrato.

### 10. Integración en `/appointments`

- [ ] 10.1 GREEN: `loadData` envía `page`, `pageSize`, filtros y orden al API en
  modo lista y guarda `appointments` + `pagination` (D10, D11).
  - Cubre: "Filtros server-side del listado de citas".
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    tarea 4.1 en verde.
- [ ] 10.2 GREEN: retirar el filtrado/orden client-side de
  `filteredAndSortedAppointments`; la lista renderiza la página recibida (D11).
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` en
    verde sin aserciones de filtrado client-side pendientes.
- [ ] 10.3 GREEN: estado `page` inicializado una vez desde `?page=n` (helper
  `parsePage`), `handlePageChange` con guardia de redundancia y `router.replace`
  (D14, D15).
  - Cubre: "Sincronización de la página con la URL".
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    tarea 4.2 en verde.
- [ ] 10.4 GREEN: reset de página a `1` al cambiar cualquier filtro u orden
  (D17).
  - Cubre: "Reinicio a la primera página al cambiar filtros".
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    tarea 4.3 en verde.
- [ ] 10.5 GREEN: estado vacío por página fuera de rango y paginación visible con
  `total > 0` (D19).
  - Cubre: "Estado vacío de una página sin filas".
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    tarea 4.4 en verde.
- [ ] 10.6 GREEN: montar `<Pagination>` bajo el `DataTable` y preservar la página
  al alternar vistas (D13, D18).
  - Cubre: "Componente de paginación reutilizable en la lista" y "Preservación de
    la página al alternar vistas".
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    tareas 4.5 en verde.
- [ ] 10.7 GREEN: builder único de URL que compone `page`, `providerId` y
  `serviceId` sin pisarlos, y `page` omitido cuando es `1` (D15, D16).
  - Cubre: "Sincronización de la página con la URL".
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    tarea 4.6 y pruebas de URL del calendario en verde.

### 11. TRIANGULATE / REFACTOR de la página

- [ ] 11.1 Triangular bordes: `?page=0`, `?page=abc` y `?page=` se tratan como
  página `1`; `?page=1` no se escribe en la URL; la última página deshabilita
  "siguiente"/"última"; una carga de filtro seguida de otra no genera requests
  duplicados con deps inestables.
- [ ] 11.2 REFACTOR: extraer a helpers con nombre el parseo de `page` y el builder
  de URL, y estabilizar las dependencias de `loadData`/handlers sin cambiar el
  comportamiento observable.
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` sigue
    en verde.

### 12. Invariantes

- [ ] 12.1 Verificar que la vista de calendario no cambia: sigue pidiendo
  `start`/`end`, no usa `pagination` y no pasa por el reset de página.
  - Verificación: pruebas de calendario existentes en verde.
- [ ] 12.2 Verificar que no se agregan dependencias (`package.json` intacto) ni se
  toca `travelhub-app`, y que el whitelist de orden no habilita campos fuera de
  `start_at`/`created_at` (D8, D21).
  - Verificación: `git diff --stat` sin cambios en `package.json`.

---

## Fase 4 — Verificación

- [ ] 13.1 Suite focal: `npx vitest run app/api/admin/appointments/route.test.ts
  src/components/admin/__tests__/Pagination.test.tsx
  "app/(admin)/appointments/page.test.tsx"` → verde.
- [ ] 13.2 Suite completa: `npm test` → verde (registrar cualquier fallo
  preexistente ajeno al change).
- [ ] 13.3 Datos: `supabase start` + `supabase db reset` + `npm run test:local` →
  verde.
- [ ] 13.4 Typecheck: `npx tsc --noEmit` → sin errores.
- [ ] 13.5 Lint: `npm run lint` → sin errores nuevos.
- [ ] 13.6 Build: `npm run build` → sin errores.
- [ ] 13.7 Trazabilidad: mapear todos los escenarios de
  `specs/admin-appointments/spec.md` a pruebas que pasan.
- [ ] 13.8 Trazabilidad de decisiones: confirmar las 22 decisiones de `design.md`
  §3 implementadas y verificadas (D1-D9 backend, D10-D11 migración, D12-D19 UI y
  URL, D20-D22 compatibilidad, dependencias y runner).
- [ ] 13.9 Invariantes por diff: sin migraciones, sin dependencias, sin cambios en
  `travelhub-app`, calendario intacto.

---

## Workload forecast

- **Tareas:** 42 checkboxes en grupos: Fase 0 (4 artefactos SDD, completados),
  Fase 1 (RED: ruta 5, datos 5, componente 3, página 6, evidencia 1), Fase 2
  (backend 6), Fase 3 (frontend 12 + invariantes 2), Fase 4 (verificación 9).
- **Archivos estimados: 8** (3 nuevos, 5 modificados), contando cada archivo una
  sola vez:
  - **Nuevos (3):** `src/components/admin/Pagination.tsx`,
    `src/components/admin/__tests__/Pagination.test.tsx`,
    `openspec/changes/agregar-paginacion-citas/` (artefactos SDD).
  - **Modificados (5):** `src/lib/admin/appointments.ts`,
    `app/api/admin/appointments/route.ts`,
    `app/api/admin/appointments/route.test.ts`,
    `src/lib/admin/__tests__/appointments.test.ts`,
    `app/(admin)/appointments/page.tsx` y
    `app/(admin)/appointments/page.test.tsx`.
  - **Sin cambios:** `listAppointments()`/`listAppointmentsRange()`,
    `src/components/admin/DataTable.tsx`, `appointments-calendar-view`,
    `package.json`, migraciones y `travelhub-app`.
- **Tamaño de diff aproximado: ~700–850 líneas** (código + pruebas, excluyendo
  los artefactos SDD): backend ~150–200; `Pagination.tsx` ~60–80; pruebas del
  componente ~80–120; `page.tsx` ~120–180; pruebas de página ~200–280.
- **Tests existentes y ejecutables:** sí. `npm test` y `npm run test:local`
  (Supabase local para la suite de datos). Sin runner nuevo.
- **Riesgo de runner:** la suite de datos requiere `supabase start` + `supabase db
  reset`; las unitarias de ruta, componente y página no requieren Supabase
  (`fetch` mockeado).
- **Punto abierto antes de apply:** reconciliación del ordenamiento por columna
  (ver `design.md` §7). Los headers no soportados por el whitelist
  (`endAt`, `patient`, `service`, `provider`, `status`) deben tratarse **sin**
  enviar un `sort` inválido; la decisión de producto (limitarlos o retirarlos) no
  se inventa en este change.
