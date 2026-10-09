# Tasks: agregar-paginacion-filtro-horarios

Paginación server-side + filtro por proveedor en la lista de horarios
(issue [#171](https://github.com/proyecto-polaris-ia/medica-app/issues/171),
lógica de [#170](https://github.com/proyecto-polaris-ia/medica-app/issues/170)).

**Decision needed before apply: No.** La estrategia ya está decidida con el
usuario (paginación server-side + filtro server-side por proveedor, forma de
respuesta anidada, validación estricta `400`, orden `created_at desc, id desc`,
normalización de página fuera de rango, `Pagination` reutilizado, URL
`?page=n&providerId=…`).

Convención de estado: `[ ]` pendiente · `[x]` completo. TDD activo
(`openspec/config.yaml` → `strict_tdd: true`): cada comportamiento escribe
primero la prueba que falla (**RED**), luego la implementación mínima
(**GREEN**) y después triangula bordes; el refactor queda en verde.

Runners: `npm test` (Vitest, unitarias y UI), `npm run test:local`
(`SUPABASE_LOCAL=1` + `supabase start` + `supabase db reset`) para la suite de
datos. Auxiliares: `npx tsc --noEmit`, `npm run lint`, `npm run build`.

Cada tarea cita los requirements del delta
`specs/admin-business-hours/spec.md` y las decisiones (`D#`) de `design.md`.

## Pronóstico de carga de revisión

| Área | Archivos | Líneas estimadas |
|---|---|---|
| Datos (`src/lib/admin/business-hours.ts`) | 1 | +50 / −10 |
| Ruta (`app/api/admin/business-hours/route.ts`) | 1 | +45 / −6 |
| UI (`app/(admin)/business-hours/page.tsx`) | 1 | +120 / −25 |
| Pruebas de ruta (`app/api/admin/business-hours/route.test.ts`) | 1 | +75 |
| Pruebas de datos (`src/lib/admin/__tests__/business-hours.test.ts`) | 1 | +95 |
| Pruebas de UI (`app/(admin)/business-hours/page.test.tsx`) | 1 (nuevo) | +180 |
| Documentos del change | 4 (nuevos) | +550 |
| **Total producción + pruebas** | **6** | **≈565 añadidas / 41 eliminadas** |

Forecast: **2 unidades de trabajo** — (1) backend/datos + sus pruebas y (2)
frontend + sus pruebas — y por lo tanto 2 commits como máximo. El diff de
producción y pruebas supera el umbral de 400 líneas de `chained-pr`, así que el
orquestador SHOULD evaluar al cerrar si conviene un PR único (una sola slice
revisable: mismo contrato de lectura) o encadenar dos PRs (backend/datos primero,
frontend después). La decisión de PR no es de este plan.

---

## Fase 0 — Artefactos SDD

- [x] 0.1 `proposal.md` — why (#171 + #170), cambios, impacto, decisiones
  (incluida la del filtro `providerId`), riesgos, rollback y criterios de éxito.
- [x] 0.2 `specs/admin-business-hours/spec.md` — capability nueva (ADDED):
  paginación, metadatos sobre el conjunto filtrado, filtro por proveedor, orden
  estable, validación, `PGRST103`, control de paginación, URL, reset al filtrar,
  normalización, panel de filtro y estados vacíos.
- [x] 0.3 `design.md` — archivos tocados, decisiones D1–D10 y estrategia de
  pruebas.
- [x] 0.4 `tasks.md` — este plan.

## Fase 1 — Backend y datos (RED → GREEN)

### 1. Pruebas de datos — `src/lib/admin/__tests__/business-hours.test.ts` (`npm run test:local`)

- [ ] 1.1 RED (D1): `listBusinessHoursPage({ page: 1, pageSize: 2 })` con más de
  2 horarios devuelve 2 filas, `total` = total del conjunto y una página 2 con
  filas distintas. Requirement: "Paginación del listado de horarios del panel".
- [ ] 1.2 RED (D1, D8): `total` no depende de la página y `totalPages` del
  conjunto filtrado es coherente. Requirement: "Metadatos de paginación sobre el
  conjunto filtrado".
- [ ] 1.3 RED (D1): filtro por proveedor devuelve solo horarios de ese proveedor
  y `total` = 7 (fixture con dos proveedores). Requirement: "Filtro server-side
  por proveedor".
- [ ] 1.4 RED (D1): orden `created_at desc, id desc` estable — dos páginas
  consecutivas con `created_at` idénticos no repiten filas. Requirement: "Orden
  estable del listado de horarios".
- [ ] 1.5 RED (D1, D4): `parseUuid` inválido lanza `ValidationError`.
  Requirement: "Filtro server-side por proveedor".
- [ ] 1.6 RED (D2): página fuera de rango (`range` excedido, `PGRST103`)
  devuelve `businessHours: []` con `total` real y sin lanzar error.
  Requirement: "Paginación del listado de horarios del panel".
- [ ] 1.7 Actualizar las pruebas existentes de `listBusinessHours()` a la lectura
  paginada (la función se retira; D2).

### 2. Implementación de datos — `src/lib/admin/business-hours.ts` (GREEN)

- [ ] 2.1 GREEN (D1): `listBusinessHoursPage` con `count: 'exact'`, filtro
  `provider_id`, orden `created_at desc, id desc` y `range`.
- [ ] 2.2 GREEN (D2): manejo de `PGRST103` con reconteo sin `range`; retiro de
  `listBusinessHours()`.
- [ ] 2.3 Refactor en verde: reusar `SELECT_COLUMNS`/`mapRow` y sin lógica
  duplicada.

### 3. Pruebas de ruta — `app/api/admin/business-hours/route.test.ts` (`npm test`)

- [ ] 3.1 RED (D3, D5): `GET ?page=2&pageSize=20` llama a
  `listBusinessHoursPage` con los parámetros esperados y responde
  `{ businessHours, pagination }` con `totalPages` calculado.
  Requirement: "Paginación del listado de horarios del panel".
- [ ] 3.2 RED (D3): sin parámetros usa `page=1`, `pageSize=20`.
- [ ] 3.3 RED (D5): `businessHours` conserva forma y campos (respuesta aditiva).
- [ ] 3.4 RED (D3, D4): `400` con `{ error: 'invalid_request' }` para `page=0`,
  `pageSize=101`, `pageSize=abc` y `providerId` no UUID, sin cuerpo de datos.
  Requirement: "Validación de los parámetros de paginación" y "Filtro
  server-side por proveedor".
- [ ] 3.5 RED (D4): `providerId` vacío o ausente llega como `undefined` a la
  capa de datos (sin filtro).
- [ ] 3.6 RED: `401` sin sesión; `POST` conserva su contrato `201`
  `{ businessHour }`.

### 4. Implementación de ruta — `app/api/admin/business-hours/route.ts` (GREEN)

- [ ] 4.1 GREEN (D3): parsers locales `parsePageParam`/`parsePageSizeParam`
  (`/^\d+$/` + `Number.isSafeInteger`, `DEFAULT_PAGE_SIZE = 20`,
  `MAX_PAGE_SIZE = 100`).
- [ ] 4.2 GREEN (D4, D5): lectura de `providerId` (vacío → `undefined`),
  llamada a `listBusinessHoursPage` y respuesta
  `{ businessHours, pagination }` con `totalPages = Math.ceil(total / pageSize)`.
- [ ] 4.3 Refactor en verde: el `GET` conserva `handleAdminRequest` +
  `requireUser()`; `POST` intacto.

## Fase 2 — Frontend (RED → GREEN)

### 5. Pruebas de UI — `app/(admin)/business-hours/page.test.tsx` (nuevo, `npm test`)

- [ ] 5.1 RED (D6, D7): la página fetcha `/api/admin/business-hours?page=1` (o
  sin `page`) y monta `Pagination` debajo de la tabla con "Página 1 de Y (N
  resultados)". Requirement: "Control de paginación en la vista de horarios".
- [ ] 5.2 RED (D6, D7): avanzar de página refetcha con `page=2` y muestra las
  filas de esa página; el `select` de filtro conserva su valor.
- [ ] 5.3 RED (D8): `?page=2&providerId=<uuid>` inicializa página y filtro;
  cambiar de página escribe `page=2` con `router.replace`; página 1 no se
  escribe; `providerId` se escribe solo con filtro activo.
  Requirement: "Sincronización de la lista con la URL".
- [ ] 5.4 RED (D8, D9): activar la página ya activa no reescribe la URL ni
  refetcha.
- [ ] 5.5 RED (D9): seleccionar un proveedor vuelve a `page=1` y elimina `page`
  de la URL; "Limpiar filtro" vuelve a página 1 y elimina `providerId`.
  Requirement: "Reinicio a la primera página al cambiar el filtro".
- [ ] 5.6 RED (D10): panel de filtro con `<option value="">Todos</option>` y una
  opción por proveedor; "Limpiar filtro" solo visible con filtro activo.
  Requirement: "Panel de filtro por proveedor en la vista de horarios".
- [ ] 5.7 RED (D10): estado vacío diferenciado —
  "No hay horarios registrados." sin filtro y mensaje de filtro sin
  coincidencias con limpiar cuando el filtro no tiene resultados.
  Requirement: "Estados vacíos diferenciados en la vista de horarios".
- [ ] 5.8 RED (D9): `?page=99` con 1 página normaliza a la última página sin
  estado de error y sin tabla vacía. Requirement: "Normalización de una página
  fuera de rango".
- [ ] 5.9 RED (D6): la carga y el error conservan `LoadingState`/`ErrorState` y
  el reintento repite la combinación página + filtro vigente.

### 6. Implementación de UI — `app/(admin)/business-hours/page.tsx` (GREEN)

- [ ] 6.1 GREEN (D6): estado `page`, `providerFilter`, `hours` y `pagination`;
  `loadData()` construye `URLSearchParams` y consume `pagination`.
- [ ] 6.2 GREEN (D7): `Pagination` bajo el `DataTable` con
  `ariaLabel="Paginación de horarios"`; 20 filas por página; sin selector de
  `pageSize`.
- [ ] 6.3 GREEN (D8): `useSearchParams` + `router.replace` con guardia de
  reescritura; página 1 omitida; `providerId` solo con filtro.
- [ ] 6.4 GREEN (D9): reset a página 1 al cambiar o limpiar el filtro;
  normalización a `pagination.totalPages` cuando `page > totalPages` con
  `total > 0`.
- [ ] 6.5 GREEN (D10): panel de filtro (select + "Limpiar filtro") y estados
  vacíos diferenciados; `DataTable` solo con filas.
- [ ] 6.6 Refactor en verde: extraer helpers puros (`buildListQuery`,
  `normalizePage`) dentro del archivo si mejora la legibilidad; sin tocar
  `src/components/admin/Pagination.tsx`.

## Fase 3 — Verificación

- [ ] 7.1 `npm test` en verde (rutas + UI).
- [ ] 7.2 `supabase start` + `supabase db reset` + `npm run test:local` en verde
  (suite de datos de `business-hours`).
- [ ] 7.3 `npx tsc --noEmit`, `npm run lint` y `npm run build` en verde.
- [ ] 7.4 Validación del change: `npx openspec validate
  agregar-paginacion-filtro-horarios` (si el CLI está disponible en el entorno;
  si no, revisar a mano los requirements y los criterios de éxito del proposal).
- [ ] 7.5 Revisión manual de los criterios de éxito del `proposal.md` uno a uno,
  incluyendo que `knip` no reporte exports huérfanos tras retirar
  `listBusinessHours()`.

## Fase 4 — Cierre

- [ ] 8.1 Commits por unidad de trabajo (Conventional Commits), con pruebas y
  docs del change juntos: (1) backend/datos, (2) frontend. Presupuesto: ≤ 2
  commits.
- [ ] 8.2 PR hacia `main` con `Closes #171` (y referencia a #170); decidir PR
  único o encadenado según el pronóstico de carga y la política del repo.
- [ ] 8.3 `openspec archive` del change (mueve la carpeta a
  `openspec/changes/archive/YYYY-MM-DD-agregar-paginacion-filtro-horarios/` y
  hace merge del delta en `openspec/specs/admin-business-hours/spec.md`), tras
  el merge.
- [ ] 8.4 Revisión nativa (Gentle AI, RDD) sobre el diff de producción; el
  reporte de verificación de este change es la evidencia de registro y la
  revisión es el chequeo independiente.
