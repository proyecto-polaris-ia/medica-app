# Diseño: Paginación server-side en la lista de citas del panel

## Contexto y objetivos

Este diseño implementa los requirements **ADDED** de la capability nueva
`admin-appointments`
(`openspec/changes/agregar-paginacion-citas/specs/admin-appointments/spec.md`) y
resuelve el issue
[#168](https://github.com/proyecto-polaris-ia/medica-app/issues/168).

Estado actual (anclas verificadas en este worktree):

- `GET /api/admin/appointments` (`app/api/admin/appointments/route.ts:13-24`)
  elige entre `listAppointmentsRange(start, end)` cuando hay `start` y `end`, o
  `listAppointments()` en cualquier otro caso; responde `{ appointments }` sin
  metadatos en ambos modos.
- `listAppointments()` (`src/lib/admin/appointments.ts:89-101`) trae todas las
  filas con `.order('start_at', { ascending: false })`. `listAppointmentsRange`
  (`:127-145`) valida el rango (`validateDateRange`, `:107`, máximo `MAX_RANGE_DAYS =
  62`, `:102`) y ordena `start_at asc`. Ambas enriquecen con recordatorios mediante
  `withReminders` (`:78-86`), que hace **una** consulta batch a
  `appointment_reminders`.
- La lista del panel filtra y ordena en el cliente:
  `filteredAndSortedAppointments` (`app/(admin)/appointments/page.tsx:480-527`)
  aplica `serviceFilter`, `patientFilter`, `providerFilter`, `dateFrom`, `dateTo`
  y el `switch (sortField)` sobre el arreglo completo que llegó del API. Los
  estados de filtro viven en `:201-215`.
- `loadData` (`app/(admin)/appointments/page.tsx:323-363`) construye la URL del
  API según `view` (`:328-337`) y depende de `[view, visibleMonth]`; el arreglo
  completo se guarda en `appointments` (`:187`) y alimenta tanto la lista como el
  calendario.
- La sincronía de URL del calendario ya existe y es el patrón a seguir:
  `parseProviderIds`/`parseServiceIds` (`:139-153`), `calendarFilterUrl`
  (`:168-175`), el estado `calendarProviderFilter`/`calendarServiceFilter`
  (`:204-211`) y `applyCalendarFilters` (`:277-296`) con guardia de reescritura
  redundante y `router.replace`.
- `DataTable` (`src/components/admin/DataTable.tsx`) es genérico
  (`columns`/`rows`/acciones) y **no** incluye paginación; la lista lo monta en
  `app/(admin)/appointments/page.tsx:703+`.
- El estado vacío de la lista se decide por `filteredAndSortedAppointments.length
  === 0` (`:696-701`) con `hasActiveFilters` (`:529`).
- El row type es `SortField = 'startAt' | 'endAt' | 'patient' | 'service' |
  'provider' | 'status'` (`app/(admin)/appointments/page.tsx`, ver `:214` y el
  `switch` de `:497-522`).
- Suites existentes a extender: ruta mockeada
  `app/api/admin/appointments/route.test.ts`, datos contra Supabase local
  `src/lib/admin/__tests__/appointments.test.ts` (corre con `npm run test:local`,
  `localDbEnabled`) y UI `app/(admin)/appointments/page.test.tsx`.

Objetivos técnicos:

- **Filtrar en el servidor antes de paginar**, para que `total` represente el
  conjunto filtrado.
- **No romper el modo calendario**: su petición y su respuesta quedan intactas.
- **Un componente `Pagination` reutilizable**, listo para #167.
- **URL deep-linkable** y convivencia con los parámetros del calendario.
- **Cero dependencias nuevas** y sin tocar `travelhub-app`.

---

## 1. Decisiones clave

### 1.1 Migración de filtros de client-side a server-side

Hoy la lista filtra y ordena **después** de traer todas las citas. Con
paginación, eso es inviable: si el servidor pagina sin conocer los filtros, cada
página tendría un subconjunto arbitrario y `total` no reflejaría lo que el
usuario ve. Por lo tanto:

- Los filtros `serviceFilter`, `patientFilter`, `providerFilter`, `dateFrom` y
  `dateTo` (`app/(admin)/appointments/page.tsx:201-212`) pasan a viajar como
  parámetros del request (`serviceId`, `patientId`, `providerId`, `start`,
  `end`).
- `loadData` (`:323-363`) construye la URL del modo lista con esos parámetros
  **más** `page`, `pageSize`, `sort` y `sortDir`, y deja de traer el arreglo
  completo.
- El `useMemo filteredAndSortedAppointments` (`:480-527`) deja de filtrar y
  ordenar: la lista renderiza `appointments` tal como llega del API. El `switch`
  de orden client-side se retira y el orden lo resuelve el servidor (ver §1.4).
- `hasActiveFilters` (`:529`) se conserva para decidir el mensaje del estado
  vacío; su semántica no cambia.

**Consecuencia de diseño:** el estado `appointments` (`:187`) pasa a contener
**solo la página actual**. El calendario, en cambio, sigue solicitando el rango
del mes y recibiendo el conjunto completo del rango (ver §1.3), por lo que su
comportamiento no se ve afectado. `visibleProviders` (`:253-256`) y
`visibleServices` (`:262-275`) se calculan a partir de `appointments`; en la
vista de calendario siguen derivando del mes completo, y en la lista no se usan.

**Alternativas rechazadas:**

- **Paginar en el cliente sobre el arreglo completo.** No resuelve el problema
  (se sigue descargando todo) y contradice el criterio de `total` filtrado.
- **Traer todo y paginar solo en memoria para la lista, dejando el filtrado
  client-side.** Mantiene la carga completa y hace imposible un `total` fiel.
- **Mantener un endpoint aparte para la lista paginada.** Duplica la ruta y la
  lógica de auth/errores; se prefiere extender el endpoint existente.

### 1.2 Contrato de metadatos de paginación

Modo lista (respuesta):

```jsonc
{
  "appointments": [ /* hasta pageSize filas, ya filtradas y ordenadas */ ],
  "pagination": { "total": 137, "page": 3, "pageSize": 20, "totalPages": 7 }
}
```

- `total`: número de filas que cumplen **todos** los filtros, contado con
  `count: 'exact'` sobre la misma consulta filtrada y **antes** de aplicar
  `range(from, to)`.
- `page`: la página solicitada (1-based, ya validada).
- `pageSize`: el tamaño solicitado (ya validado).
- `totalPages`: `Math.ceil(total / pageSize)`; `0` cuando `total === 0`.
- `from = (page - 1) * pageSize`, `to = from + pageSize - 1` (`.range(from, to)`,
  inclusivo en PostgREST).
- La paginación se aplica **después** de los filtros, de modo que `total` y
  `totalPages` describen el conjunto filtrado.
- Si `page` excede `totalPages`, la respuesta es `appointments: []` con los
  metadatos intactos (ver §2.1 y la decisión D7). No se reescribe ni se recorta
  `page` para que la URL y la respuesta siempre coincidan.

**Alternativa rechazada:** devolver solo el arreglo y calcular `total` en el
cliente (imposible sin traer todo) o clavar `page` a `totalPages` en el servidor
(haría que la URL y la respuesta discrepen y complicaría el estado local).

### 1.3 Distinción entre modo lista y modo calendario

El endpoint conserva una sola ruta con dos modos, distinguidos de forma
determinista por los parámetros:

- **Modo calendario (rango):** la petición trae `start` **y** `end` y **no** trae
  parámetros de paginación (`page` ni `pageSize`). Se comporta **exactamente**
  como hoy: valida el rango con `validateDateRange` (máximo 62 días) y responde
  `{ appointments }` con todas las filas del rango, sin `pagination`. Es la
  petición que ya hace `loadData` en `view === 'calendar'`
  (`app/(admin)/appointments/page.tsx:328-337`).
- **Modo lista (paginado):** la petición trae `page` y/o `pageSize`. Se aplican
  filtros (incluidos `start`/`end` opcionales), orden y paginación, y la
  respuesta incluye `pagination`.

**Por qué:** preservar el contrato del calendario byte a byte (requisito
"calendario sin cambios") y, a la vez, permitir que la lista filtre por fechas y
pagine. La página de lista **siempre** envía `page` y `pageSize`. Una petición sin
paginar del todo (`GET` sin parámetros) se mantiene en modo lista con los
defaults (`page=1`, `pageSize=20`), lo que es un cambio observable del endpoint
documentado en el delta spec.

### 1.4 Ordenamiento server-side con whitelist

- Parámetro `sort`, whitelist: `start_at` (default) y `created_at`.
- Parámetro `sortDir`: `asc` | `desc`; default `desc`.
- Mapeo en la capa de datos: `sort` → columna (`start_at` | `created_at`) y
  `sortDir` → `ascending: sortDir === 'asc'`.
- Cualquier `sort`/`sortDir` fuera del whitelist o del dominio responde `400` con
  `ValidationError` (ver §2.2), igual que un rango inválido.

**Punto abierto (documentado, no inventado).** La UI actual ofrece seis columnas
ordenables (`SortField`: `startAt`, `endAt`, `patient`, `service`, `provider`,
`status`). El whitelist server-side solo cubre `start_at` y `created_at`. Este
change **no** agrega endpoints ni columnas al whitelist; la fase apply debe
reconciliar los headers restantes (por ejemplo, limitar los controles de orden a
los campos soportados o dejar su ordenamiento fuera de la paginación). Mientras no
se resuelva, ordenar por un campo no soportado no debe producir un request con un
`sort` inválido. Ver §7 "Open Questions".

### 1.5 Componente `Pagination` reutilizable

- Archivo nuevo: `src/components/admin/Pagination.tsx`, presentacional y sin
  dependencias (`tailwind` + HTML nativo).
- Contrato propuesto: `{ page: number; pageSize: number; total: number;
  totalPages: number; onPageChange: (page: number) => void }`.
- Renderiza **primera / anterior / indicador "Página X de Y (N resultados)" /
  siguiente / última**, con botones `disabled` en los extremos y en el rango
  `page < 1` o `page > totalPages`.
- Botones `<button type="button">` nativos (operables por teclado) con
  `aria-label` en español; el contenedor expone `role="navigation"` y
  `aria-label="Paginación de citas"`.
- No lee estado global, no lee la URL y no importa `next/navigation`.
- Se monta debajo del `DataTable` en `/appointments` y se reutilizará en #167.

### 1.6 Sincronía del estado de paginación con la URL

Se sigue el patrón ya validado del filtro de calendario
(`app/(admin)/appointments/page.tsx:277-296`):

- **Estado local como fuente de verdad:** `const [page, setPage] =
  useState(parsePage(searchParams?.get('page')))` (init única desde la URL, sin
  `useEffect`).
- **Guardia de reescritura redundante:** el handler retorna sin escribir ni
  cambiar estado si la página destino es la actual.
- **`router.replace`** (no `push`) para no llenar el historial en cada clic.
- **Parámetro omitido en el default:** `page=1` no se escribe en la URL.
- **Composición sin pisar parámetros:** un único builder que compone `page`
  (solo si `> 1`), `providerId` y `serviceId` en orden determinista, omitiendo los
  vacíos, y que devuelve `/appointments` si no queda ninguno. Así los
  `applyCalendarFilters` del calendario y el cambio de página comparten la misma
  forma de URL y no se borran mutuamente.

### 1.7 Reset de página y preservación entre vistas

- **Reset a `1` al cambiar cualquier filtro u orden:** cuando cambia
  `serviceFilter`, `patientFilter`, `providerFilter`, `dateFrom`, `dateTo`,
  `sortField` o `sortDirection`, el estado de página vuelve a `1` y la URL deja de
  llevar `page`. Evita apuntar a una página fuera del nuevo rango.
- **Preservación al alternar Lista ↔ Calendario:** `view` es estado local y no
  forma parte del request de paginación; el valor de `page` no se reinicia al
  cambiar de vista si los filtros no cambiaron. La URL conserva `?page=n` (inerte
  para el calendario) y volver a la lista restaura la página.

### 1.8 Estado vacío por página

- Cuando el modo lista no tiene filas en la página actual, la UI muestra un
  estado vacío claro y **no** renderiza el `DataTable`.
- Mensaje diferenciado:
  - `hasActiveFilters` verdadero → "No hay citas que coincidan con los filtros."
    (mensaje actual, `:696-701`).
  - `hasActiveFilters` falso y `pagination.total === 0` → "No hay citas
    registradas." (mensaje actual).
  - `hasActiveFilters` falso y `pagination.total > 0` (página fuera de rango) →
    "No hay citas en esta página." con la paginación visible para regresar.
- El componente `Pagination` se renderiza cuando `total > 0`, incluso si la
  página actual está vacía, para que el usuario pueda navegar de vuelta.

---

## 2. Enfoque técnico

### 2.1 Capa de datos: `listAppointmentsPaged`

`src/lib/admin/appointments.ts` agrega:

```ts
export type AppointmentSortColumn = 'start_at' | 'created_at';

export type ListAppointmentsPagedParams = {
  page: number;          // 1-based, ya validado por la ruta
  pageSize: number;      // ya validado (1..100)
  serviceId?: string;
  patientId?: string;
  providerId?: string;
  startAtIso?: string;   // start opcional
  endAtIso?: string;     // end opcional
  sort?: AppointmentSortColumn; // default 'start_at'
  sortDir?: 'asc' | 'desc';     // default 'desc'
};

export type ListAppointmentsPagedResult = {
  appointments: Appointment[];
  total: number;
};

export async function listAppointmentsPaged(
  params: ListAppointmentsPagedParams
): Promise<ListAppointmentsPagedResult>;
```

Implementación:

- Construye la consulta con `.select(SELECT_COLUMNS, { count: 'exact' })`.
- Aplica filtros con `.eq('service_id', serviceId)`, `.eq('patient_id',
  patientId)`, `.eq('provider_id', providerId)`.
- Si vienen `start`/`end`, valida con `validateDateRange` (reutiliza la regla de
  máximo 62 días) y aplica `.gte('start_at', ...)` + `.lt('start_at', ...)`,
  igual que `listAppointmentsRange` (`:127-145`).
- Ordena con `.order(sort ?? 'start_at', { ascending: (sortDir ?? 'desc') ===
  'asc' })`; el whitelist se garantiza en la ruta (§2.2) y el tipo lo acota.
- Aplica `.range(from, to)` con `from = (page - 1) * pageSize` y `to = from +
  pageSize - 1`.
- Devuelve `{ appointments: await withReminders((data ?? []).map(mapRow)),
  total: count ?? 0 }`, reutilizando `withReminders` (`:78-86`) y sin N+1.

`listAppointments()` (`:89`) y `listAppointmentsRange()` (`:127`) **se
conservan** para no romper consumidores ni pruebas existentes.

### 2.2 Ruta: `app/api/admin/appointments/route.ts`

`GET` (`:13-24`) pasa a:

1. `requireUser()` (sin cambios).
2. Leer `URLSearchParams`.
3. Determinar el modo (§1.3): `hasPagination = page != null || pageSize != null`;
   `isRange = start != null && end != null && !hasPagination`.
   - `isRange` → `listAppointmentsRange(start, end)` y responder
     `{ appointments }` (sin `pagination`).
   - En otro caso (modo lista) → parsear y validar `page`, `pageSize`, `sort`,
     `sortDir` y filtros, llamar `listAppointmentsPaged` y responder
     `{ appointments, pagination }`.
4. Validación (todas lanzan `ValidationError`, que `handleAdminRequest` traduce a
   `400`, ver `app/api/admin/_lib/responses.ts`):
   - `page`: entero ≥ 1; default `1`.
   - `pageSize`: entero entre `1` y `100`; default `20`.
   - `sort`: `start_at` | `created_at`; default `start_at`.
   - `sortDir`: `asc` | `desc`; default `desc`.
   - `start`/`end`: si uno viene sin el otro en modo lista, `400`; si ambos
     vienen, `validateDateRange` valida orden y máximo 62 días.
5. Construir `pagination: { total, page, pageSize, totalPages }` con
   `totalPages = Math.ceil(total / pageSize)`.

`POST` no cambia.

### 2.3 Componente `Pagination`

`src/components/admin/Pagination.tsx`:

```tsx
type PaginationProps = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
};
```

- Botones "Primera", "Anterior", "Siguiente", "Última" con `disabled` en los
  extremos; indicador "Página {page} de {totalPages} ({total} resultados)".
- `aria-label` por botón (p. ej. "Ir a la primera página") y contenedor
  `<nav aria-label="Paginación de citas">`.
- No renderiza nada (o solo el indicador) cuando `totalPages <= 1`, según se fije
  en apply; el comportamiento por defecto documentado es **no renderizar
  controles** con una sola página.
- Puro y controlado: recibe todo por props; no conoce el dominio de citas.

### 2.4 Integración en `/appointments`

`app/(admin)/appointments/page.tsx`:

- Nuevo estado `page` inicializado una vez desde `?page=n` (`parsePage`), y
  `pageSize` constante `20` (o estado si se decide exponer un selector, fuera de
  alcance).
- `loadData` (`:323-363`) en modo lista construye la URL con `page`, `pageSize`,
  filtros y orden, y guarda `appointments` + `pagination` en estado. Sus deps
  pasan a incluir los filtros, la página y el orden.
- Se retira el filtrado/orden client-side de `filteredAndSortedAppointments`
  (`:480-527`); la lista renderiza `appointments` y el `DataTable`
  (`:703+`) recibe esas filas.
- Se monta `<Pagination …/>` debajo del `DataTable`, visible cuando
  `pagination.total > 0`.
- `handlePageChange(nextPage)` aplica el estado, la guardia de redundancia y
  `router.replace` con el builder de URL (§1.6).
- Efecto/reset: al cambiar cualquier filtro u orden, `setPage(1)` antes de
  recargar (§1.7).
- El estado vacío (`:696-701`) se ajusta a los tres mensajes de §1.8.
- La vista de calendario (`view === 'calendar'`) no cambia: sigue pidiendo el
  rango y no usa `pagination`.

### 2.5 Estrategia de URL

Un único builder, por ejemplo
`appointmentsListUrl({ page, providerIds, serviceIds })`, que:

- Emite `page` solo si `page > 1`.
- Emite `providerId`/`serviceId` solo si no están vacíos.
- Conserva el orden determinista `page` → `providerId` → `serviceId` y devuelve
  `/appointments` cuando no queda ningún parámetro.
- Se usa tanto en `applyCalendarFilters` (`:277-296`) como en
  `handlePageChange`, de modo que ambos no se pisen.

---

## 3. Decisiones (numeradas)

| # | Decisión | Valor | Alternativas / razón |
|---|---|---|---|
| D1 | Punto de filtrado | Server-side, antes de paginar (`src/lib/admin/appointments.ts` → `listAppointmentsPaged`) | Único modo de que `total` describa el conjunto filtrado. |
| D2 | Discriminador de modo | `page`/`pageSize` presentes → modo lista; `start`+`end` sin paginación → modo calendario (`app/api/admin/appointments/route.ts`) | Preserva el contrato del calendario y permite filtrar por fechas en la lista. |
| D3 | Forma de respuesta (lista) | `{ appointments, pagination }` (`app/api/admin/appointments/route.ts`) | Metadatos donde se usan; el calendario conserva `{ appointments }`. |
| D4 | Forma de respuesta (calendario) | `{ appointments }` sin `pagination` (`app/api/admin/appointments/route.ts`) | Compatibilidad byte a byte con la vista actual. |
| D5 | Cálculo del `total` | `count: 'exact'` sobre la consulta filtrada, antes de `range` (`src/lib/admin/appointments.ts`) | `total` y `totalPages` describen el conjunto filtrado. |
| D6 | `totalPages` | `Math.ceil(total / pageSize)`; `0` si `total === 0` (`app/api/admin/appointments/route.ts`) | Convención estándar y predecible. |
| D7 | Página fuera de rango | `appointments: []` con metadatos intactos; no se recorta `page` (`app/api/admin/appointments/route.ts`) | La URL y la respuesta siempre coinciden; la UI ofrece regresar con la paginación visible. |
| D8 | Whitelist de orden | `sort ∈ {start_at, created_at}`, default `start_at`; `sortDir ∈ {asc, desc}`, default `desc` (`src/lib/admin/appointments.ts`, `app/api/admin/appointments/route.ts`) | Evita ordenar por columnas arbitrarias y da un orden estable entre páginas. |
| D9 | Validación | `page` entero ≥1 (default 1), `pageSize` entero 1..100 (default 20), `sort`/`sortDir` en dominio, rango con `validateDateRange`; todo inválido → `400` (`app/api/admin/appointments/route.ts`) | Reutiliza `ValidationError`/`handleAdminRequest` y la regla de 62 días. |
| D10 | Filtros de la lista | `serviceId`, `patientId`, `providerId`, `start`, `end` como parámetros del request; el cliente deja de filtrar (`app/(admin)/appointments/page.tsx`) | Los filtros deben ejecutarse antes de paginar. |
| D11 | Retiro del filtrado client-side | `filteredAndSortedAppointments` (`:480-527`) deja de filtrar y ordenar; la lista renderiza la página recibida | Evita inconsistencias entre `total` y lo mostrado. |
| D12 | Componente | Nuevo `src/components/admin/Pagination.tsx`, puro y controlado | Reutilizable por #167; no acopla el dominio. |
| D13 | Montaje | Debajo del `DataTable` en `app/(admin)/appointments/page.tsx`, visible si `pagination.total > 0` | Ubicación convencional de la paginación. |
| D14 | Estado de página | `page` como estado local inicializado una vez desde `?page=n` (`app/(admin)/appointments/page.tsx`) | Deep link sin `useEffect`, patrón del calendario. |
| D15 | Escritura de URL | `router.replace` con guardia de redundancia y `page` omitido cuando es `1` (`app/(admin)/appointments/page.tsx`) | Evita historial ruidoso y reescrituras repetidas. |
| D16 | Composición de URL | Builder único que compone `page`, `providerId` y `serviceId` sin pisarlos (`app/(admin)/appointments/page.tsx`) | La lista y el calendario comparten el historial. |
| D17 | Reset de página | A `1` al cambiar cualquier filtro u orden (`app/(admin)/appointments/page.tsx`) | No quedar fuera de rango tras reducir el conjunto. |
| D18 | Preservación entre vistas | `page` no se reinicia al alternar Lista ↔ Calendario si los filtros no cambian (`app/(admin)/appointments/page.tsx`) | `view` es estado local y no afecta la paginación del calendario. |
| D19 | Estado vacío | Tres mensajes según §1.8; la paginación sigue visible si `total > 0` | Comunica con claridad y permite regresar. |
| D20 | Compatibilidad | `listAppointments()` y `listAppointmentsRange()` se conservan (`src/lib/admin/appointments.ts`) | No romper consumidores ni pruebas existentes. |
| D21 | Dependencias | Ninguna (`package.json` intacto) | Tailwind + HTML nativo; no hay UI kit. |
| D22 | Runner de pruebas | `npm test` (Vitest/Testing Library) y `npm run test:local` (Supabase local) | `openspec/config.yaml` → `testing.strict_tdd: true`. |

---

## 4. Trade-offs

- **Cambio observable del `GET` sin parámetros.** Hoy devuelve todas las filas;
  con este change cae en modo lista y devuelve la primera página de 20. Es el
  precio de paginar el endpoint; se documenta en el delta spec y se cubre con la
  prueba de ruta del modo calendario, que permanece sin cambios.
- **Solo dos columnas ordenables en el servidor.** El whitelist es deliberado
  (orden estable y seguro entre páginas). Obliga a reconciliar los headers de
  orden actuales; queda como punto abierto (§7), no como decisión inventada.
- **`loadData` con más dependencias.** Al incluir filtros, página y orden, el
  callback se recrea más seguido. Se mitiga con deps explícitas y sin introducir
  bucles; las pruebas de la página cubren el reset y la no-reescritura.
- **`appointments` deja de ser el conjunto completo en modo lista.** Cualquier
  cálculo que asumiera el histórico completo (p. ej. contadores) debe revisarse;
  en este change la lista solo lo usa para renderizar la página y
  `visibleProviders`/`visibleServices` solo importan en calendario.
- **Página fuera de rango devuelve vacío.** Se acepta a cambio de que la URL y la
  respuesta coincidan; la paginación visible permite regresar.

---

## 5. Rollback

Sin migraciones, sin escrituras y sin dependencias, el rollback es el del
`proposal.md`. En términos de este diseño:

- Revertir la ruta y la capa de datos devuelve `{ appointments }` con todas las
  filas y elimina `listAppointmentsPaged`.
- Revertir la página restaura el filtrado y orden client-side
  (`filteredAndSortedAppointments`) y retira el componente `Pagination`.
- Un `?page=n` remanente en la URL es inerte: la página lo ignora y muestra todo.
- El modo calendario nunca cambió, así que no requiere rollback.
- `package.json` no cambia.

---

## 6. Estrategia de pruebas

Runner unitario: `npm test` (Vitest + Testing Library; `openspec/config.yaml` →
`unit: npm run test`). Suite de datos: `npm run test:local` (`SUPABASE_LOCAL=1` +
`supabase start`). Política test-first (RED → GREEN → TRIANGULATE), `strict_tdd:
true`.

### 6.1 Ruta mockeada — `app/api/admin/appointments/route.test.ts`

Mockear `listAppointmentsPaged` junto a `listAppointments`/`listAppointmentsRange`
(patrón `vi.mock('@/lib/admin/appointments', …)` ya presente). Casos:

- Modo lista: `?page=2&pageSize=20` llama `listAppointmentsPaged` con los
  parámetros esperados y responde `pagination`.
- `total`/`totalPages` coherentes.
- Filtros reenviados: `serviceId`, `patientId`, `providerId`, `start`, `end`.
- `page`/`pageSize` inválidos (0, negativos, no enteros, > 100) → `400`.
- `sort`/`sortDir` fuera del dominio → `400`.
- `start` sin `end` (o al revés) en modo lista → `400`.
- Modo calendario: `?start=…&end=…` llama `listAppointmentsRange`, responde
  `{ appointments }` **sin** `pagination` y no llama a `listAppointmentsPaged`.
- Sin sesión → `401` (sin cambios).

### 6.2 Datos contra Supabase local — `src/lib/admin/__tests__/appointments.test.ts`

Con `localDbEnabled` y fixtures de dominio (`createPatient`, `createService`,
`createProvider`, `createAppointment`):

- `total` refleja el conjunto filtrado, no el universo.
- Paginación: `page`/`pageSize` devuelven el subconjunto correcto y `totalPages`
  derivado.
- Filtros combinados (`serviceId` + `providerId` + rango) aplicados antes de
  paginar.
- Orden `start_at` asc/desc y `created_at` asc/desc.
- Límites: `pageSize` en el borde (`100`) y página más allá del total devuelve
  `appointments: []` con `total` intacto.
- `withReminders` sigue enriqueciendo la página devuelta.

### 6.3 Componente — `src/components/admin/__tests__/Pagination.test.tsx`

- Render del indicador "Página X de Y".
- `onPageChange` con la página correcta en primera/anterior/siguiente/última.
- Botones deshabilitados en los extremos.
- No renderiza controles con una sola página.
- Operable por teclado (`<button>` nativo).

### 6.4 Página — `app/(admin)/appointments/page.test.tsx`

Extender el mock de `next/navigation` (`replaceMock`, `searchParamsRef`) y el mock
de `fetch` (ya presente en las suites de calendario):

- La URL del request incluye `page`, `pageSize` y los filtros activos.
- Cambiar un filtro resetea `page` a `1` (request sin `page` o con `page=1`).
- `?page=3` (deep link) inicializa la página y pide la página 3.
- Cambiar de página escribe `?page=2` con `router.replace` y **no** reescribe si
  la página no cambió.
- Alternar Lista ↔ Calendario conserva la página si los filtros no cambian y no
  dispara `replace` extra.
- Página sin filas con `total > 0` muestra el estado vacío "No hay citas en esta
  página." y la paginación sigue visible.
- La URL de la lista no pisa `providerId`/`serviceId` del calendario.

### 6.5 Comandos de validación

```bash
npm test                                   # unitarias (ruta, componente, página)
supabase start && supabase db reset        # base local
npm run test:local                         # suite de datos
npx tsc --noEmit                           # typecheck
npm run build                              # build de Next.js
```

---

## 7. Open Questions

1. **Reconciliación del ordenamiento por columna.** El whitelist server-side
   cubre `start_at` y `created_at`, pero la UI ofrece seis columnas ordenables
   (`SortField`). ¿La fase apply debe limitar los controles de orden a los campos
   soportados, retirar los no soportados o dejarlos documentados como limitación?
   Este change no inventa un whitelist más amplio. **Impacto:** solo en las
   columnas de orden no cubiertas; no bloquea la paginación ni los filtros.
2. **`pageSize` configurable en la UI.** El contrato fija el default `20` (máx
   `100`). No se especifica un selector de tamaño de página; se asume constante
   `20` en la lista. Si se quiere exponer, es un alcance adicional, no requerido
   por #168.
