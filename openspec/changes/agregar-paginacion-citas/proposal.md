# Change: Paginación server-side en la lista de citas del panel

## Why

`GET /api/admin/appointments` devuelve **todas** las citas de la clínica sin
paginación (`listAppointments()` en `src/lib/admin/appointments.ts:89`,
consumido en `app/api/admin/appointments/route.ts:13-24`). La vista de lista de
`/appointments` carga ese arreglo completo y recién entonces filtra y ordena
**en el navegador** (`filteredAndSortedAppointments` en
`app/(admin)/appointments/page.tsx:480-527`). A medida que crece el historial de
la agenda, cada carga de la pantalla trae y renderiza filas que la secretaria no
necesita ver, y la lista se vuelve lenta y difícil de recorrer.

La lista tampoco tiene forma de moverse por páginas: el usuario depende del
scroll del `DataTable` (`src/components/admin/DataTable.tsx`) sobre un conjunto
que crece sin límite. La paginación de pacientes (issue
[#167](https://github.com/proyecto-polaris-ia/medica-app/issues/167)) todavía no
está implementada y no existe un componente de paginación reutilizable.

Este change cubre el issue
[#168](https://github.com/proyecto-polaris-ia/medica-app/issues/168) y ofrece el
componente `Pagination` que después podrá reutilizar #167.

## What Changes

- **El endpoint acepta paginación y filtros server-side.** `GET /api/admin/appointments`
  gana `page` (default `1`, mínimo `1`), `pageSize` (default `20`, mínimo `1`,
  máximo `100`), los filtros `serviceId`, `patientId`, `providerId` y el rango de
  fechas opcional `start`/`end` también para la lista. El orden se resuelve en el
  servidor con un whitelist de columnas (`start_at` por defecto, `created_at`) y
  `sortDir` (`asc`|`desc`, `desc` por defecto).
- **Metadatos de paginación.** La respuesta del **modo lista** pasa a
  `{ appointments: [...], pagination: { total, page, pageSize, totalPages } }`;
  `total` cuenta los resultados **después** de aplicar los filtros.
- **La paginación se aplica solo en modo lista.** La vista de calendario sigue
  usando el rango `start`+`end` y conserva la respuesta actual sin paginar
  (`{ appointments }`), por lo que su contrato no cambia.
- **Migración de filtros de client-side a server-side.** Los filtros de servicio,
  paciente, proveedor y rango de fechas de la lista dejan de aplicarse en memoria
  (`filteredAndSortedAppointments`) y viajan como parámetros del endpoint; la
  página renderiza únicamente las filas de la página actual.
- **Componente `Pagination` reutilizable.** Se crea
  `src/components/admin/Pagination.tsx` (primera / anterior / indicador
  actual–total / siguiente / última) y se monta debajo del `DataTable` en
  `/appointments`. Es genérico y no depende del dominio de citas, de modo que
  #167 pueda reutilizarlo.
- **Sincronía del número de página con la URL.** La página activa se refleja como
  `?page=n` (omitido cuando es `1`) siguiendo el patrón del filtro de calendario:
  estado local como fuente de verdad, inicialización única desde la URL y
  `router.replace` con guardia de reescritura redundante. El parámetro convive
  con los `providerId`/`serviceId` del calendario sin pisarlos.
- **La página vuelve a `1` al cambiar cualquier filtro**, para no quedar apuntando
  a una página que ya no existe con el nuevo conjunto filtrado.
- **Estado vacío claro.** Cuando la página actual no tiene filas, la UI muestra un
  estado vacío explícito en lugar de una tabla vacía, y la paginación sigue
  disponible para regresar a una página con resultados.

### Alcance

- Endpoint `GET /api/admin/appointments` (modo lista) y su capa de datos en
  `src/lib/admin/appointments.ts`; sin migraciones ni escrituras en base de datos.
- Vista de lista de `app/(admin)/appointments/page.tsx` y el nuevo componente
  reutilizable `src/components/admin/Pagination.tsx`.
- Pruebas: ruta mockeada (`app/api/admin/appointments/route.test.ts`), suite de
  datos contra Supabase local (`src/lib/admin/__tests__/appointments.test.ts`) y
  pruebas de UI de la lista y del componente.
- Sin dependencias nuevas y sin tocar `travelhub-app` (regla crítica del repo).

## Capabilities

### New Capability: `admin-appointments`

Se crea la capability **`admin-appointments`** en
`openspec/specs/admin-appointments/spec.md`. Captura el contrato de **lectura
paginada** del endpoint del panel (modo lista y modo calendario), los filtros y
el ordenamiento server-side, y el comportamiento de la paginación en la UI de la
lista. El baseline actual no tiene esta capability, así que el delta se expresa
íntegramente como **ADDED Requirements**.

El CRUD de citas (`Appointments CRUD`), la columna de notas y el modal de
edición siguen viviendo en `openspec/specs/admin-panel/spec.md` y **no se
modifican** en este change.

### Modified Capabilities

- Ninguna. No se modifica el baseline de `admin-panel` ni el de
  `appointments-calendar-view`.

## Impacto

Archivos esperados (sin modificar `travelhub-app`):

| Área | Impacto | Descripción |
|---|---|---|
| `src/lib/admin/appointments.ts` | Modified | Nueva función `listAppointmentsPaged(params)` con filtros, orden por whitelist, `count` exacto y `range(from, to)`, reutilizando `withReminders` (`:78`). `listAppointmentsRange` (`:127`) y `listAppointments` (`:89`) se conservan. |
| `app/api/admin/appointments/route.ts` | Modified | Parseo y validación de `page`, `pageSize`, `serviceId`, `patientId`, `providerId`, `start`, `end`, `sort`, `sortDir`; respuesta con `pagination` en modo lista y sin paginar en modo calendario. |
| `app/api/admin/appointments/route.test.ts` | Modified | Casos de metadatos, filtros, validación (400) y modo calendario sin cambios (response shape). |
| `src/lib/admin/__tests__/appointments.test.ts` | Modified | Suite contra Supabase local: filtros, `total` filtrado, orden por whitelist, límites de `page`/`pageSize`. |
| `src/components/admin/Pagination.tsx` | New | Componente reutilizable (primera / anterior / indicador / siguiente / última), accesible y sin dependencias. |
| `src/components/admin/__tests__/Pagination.test.tsx` | New | Pruebas del contrato del componente y de los bordes de página. |
| `app/(admin)/appointments/page.tsx` | Modified | `loadData` envía `page`, `pageSize`, filtros y orden al API; se retira el filtrado/orden client-side; `page` como estado con sincronía `?page=n`; reset a `1` al cambiar filtros; estado vacío por página; montaje de `Pagination`. |
| `app/(admin)/appointments/page.test.tsx` | Modified | Pruebas de URL `?page=n`, reset de página al filtrar, estado vacío y preservación de página entre vistas. |
| `openspec/specs/admin-appointments/spec.md` | New (delta) | Contrato ADDED de la capability nueva. |
| Dependencias / migraciones | Sin cambios | No se agregan librerías, no hay migración ni tabla nueva. |

## Decisions

| Decisión | Valor | Razón |
|---|---|---|
| Ubicación del filtrado | Server-side (antes de paginar) | Es la única forma de que `total` refleje el conjunto filtrado (criterio de aceptación del issue) y de que la paginación sea consistente entre páginas. |
| Discriminador de modo | Presencia de parámetros de paginación (`page`/`pageSize`) → modo lista; `start`+`end` sin ellos → modo calendario | Preserva byte a byte el contrato actual de la vista de calendario y permite que la lista filtre por fechas y pagine a la vez. |
| Forma de la respuesta | Lista: `{ appointments, pagination }`; calendario: `{ appointments }` | Mantiene compatibilidad con el calendario y agrega metadatos solo donde se usan. |
| Ordenamiento | Whitelist `start_at` (default, `desc` default) y `created_at`, con `sortDir` `asc`\|`desc` | Evita ordenar por columnas arbitrarias y permite un orden estable entre páginas. |
| Componente de paginación | `src/components/admin/Pagination.tsx`, genérico | Reutilizable por #167 (pacientes); no acopla la lista de citas. |
| Sincronía de URL | `?page=n` con estado local como fuente de verdad y `router.replace` con guardia | Sigue el patrón ya validado del filtro de calendario (`app/(admin)/appointments/page.tsx:277-296`) y es deep-linkable. |
| Reset de página | A `1` ante cualquier cambio de filtro u orden | Evita quedar en una página fuera de rango tras reducir el conjunto filtrado. |
| Dependencias | Ninguna | Solo Tailwind y HTML nativo; no hay UI kit en el repo. |

## Fuera de alcance

- Paginación de pacientes (issue #167). Este change solo deja listo el componente.
- Paginación de la vista de calendario y de cualquier otra superficie.
- Scroll infinito o carga incremental.
- Cambios de esquema, migraciones o índices de base de datos.
- Persistencia de la página por usuario, preferencias guardadas o sincronización
  entre dispositivos.
- Cambios de dependencias.
- Cualquier edición dentro de `travelhub-app`.

## Riesgos

- **Reconciliación del ordenamiento existente.** El whitelist server-side fija
  `start_at` y `created_at`, mientras que la UI actual ofrece seis columnas
  ordenables (`SortField`: `startAt`, `endAt`, `patient`, `service`, `provider`,
  `status`). Los campos fuera del whitelist no pueden ordenarse server-side sin
  una API nueva; la fase apply debe decidir su tratamiento (por ejemplo dejar de
  ofrecerlos o documentarlos como limitación) sin inventar endpoints. Se registra
  como punto abierto en `design.md`.
- **Discriminador de modo.** Si el cliente de la lista no envía `page`/`pageSize`,
  el endpoint respondería en modo calendario. Mitigación: la página envía siempre
  ambos parámetros en modo lista y una prueba de ruta cubre la ausencia de
  `pagination` en modo calendario.
- **Composición de la URL.** La lista (`?page=n`) y el calendario
  (`?providerId`/`?serviceId`) escriben el mismo historial. Mitigación: un único
  builder que compone los parámetros presentes y omite los vacíos/valores por
  defecto, con prueba de no-pisado.
- **Filtros reconstruidos en cada carga.** Al mover el filtrado al servidor,
  `loadData` pasa a depender de los filtros, la página y el orden; un manejo
  descuidado de las dependencias puede provocar cargas repetidas. Mitigación:
  deps explícitas y memoización, cubiertas por las pruebas de la página.
- **Consistencia de `total` con borrados concurrentes.** Si una cita se elimina
  entre la cuenta y la lectura de la página, `total` puede quedar desfasado en una
  unidad. Se acepta para un panel administrativo; no se agrega transacción.
- **Página fuera de rango.** Una URL `?page=99` con pocos resultados debe
  comportarse de forma predecible. Se documenta la respuesta vacía con metadatos
  y el estado vacío de la UI.

## Rollback plan

- **Reversión por commit.** El cambio no tiene migraciones ni escrituras: revertir
  los commits del endpoint y de la página devuelve la lista al filtrado
  client-side y la respuesta a `{ appointments }` con todas las filas.
- **Sin datos que revertir.** No se agregan tablas, columnas ni índices; no hay
  estado persistido que limpiar.
- **El parámetro `?page=n` es inerte si se revierte.** Tras revertir, la URL con
  `page` no rompe nada: la página simplemente lo ignora y muestra la lista
  completa como hoy.
- **Aislamiento del calendario.** El modo calendario conserva su contrato, así que
  revertir la paginación no afecta la vista de calendario.
- **Sin dependencias.** `package.json` no cambia; no hay nada que desinstalar.

## Criterios de éxito

- [ ] `GET /api/admin/appointments` en modo lista devuelve como máximo
      `pageSize` filas y los metadatos `{ total, page, pageSize, totalPages }`.
- [ ] `total` y `totalPages` reflejan el conjunto **después** de aplicar los
      filtros `serviceId`, `patientId`, `providerId` y `start`/`end`.
- [ ] El orden server-side respeta el whitelist `start_at`/`created_at` y
      `sortDir`; parámetros inválidos responden `400`.
- [ ] El modo calendario (`start`+`end` sin paginación) conserva exactamente el
      comportamiento y la forma de respuesta actuales.
- [ ] La lista muestra el componente `Pagination` (primera / anterior / indicador
      / siguiente / última) y se mueve entre páginas sin recargar filtros.
- [ ] La página activa se refleja como `?page=n`, es deep-linkable y vuelve a `1`
      al cambiar cualquier filtro.
- [ ] Una página sin filas muestra un estado vacío claro y permite regresar.
- [ ] La página se preserva al alternar Lista ↔ Calendario si los filtros no
      cambian.
- [ ] `npm run test` (unitarias), `npm run test:local` (datos), `npx tsc --noEmit`
      y `npm run build` en verde.
- [ ] No se agregan dependencias y no se modifica `travelhub-app`.
