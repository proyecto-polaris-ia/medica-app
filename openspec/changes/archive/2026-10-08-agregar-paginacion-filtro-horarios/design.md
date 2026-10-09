# Design: agregar-paginacion-filtro-horarios

Issue [#171](https://github.com/proyecto-polaris-ia/medica-app/issues/171)
(paginación) + lógica del issue
[#170](https://github.com/proyecto-polaris-ia/medica-app/issues/170) (filtro por
proveedor). Patrones heredados de #168 (`admin-appointments`) y #167
(`admin-patients-api` / `admin-patients-ui`).

## 0. Archivos tocados

| Archivo | Acción | Contenido |
|---|---|---|
| `src/lib/admin/business-hours.ts` | Modified | Nueva `listBusinessHoursPage(params)` con `count: 'exact'`, filtro por `provider_id`, `range` y orden estable; manejo de `PGRST103`. Se retira `listBusinessHours()` (queda sin consumidores). |
| `app/api/admin/business-hours/route.ts` | Modified | `GET` con `page`, `pageSize` y `providerId`: validación estricta, filtro, paginación y respuesta `{ businessHours, pagination }`. `POST` intacto. |
| `app/(admin)/business-hours/page.tsx` | Modified | Consumo paginado, `Pagination`, panel de filtro por proveedor, sincronía de URL, reset de página al filtrar, normalización de página fuera de rango y estados vacíos diferenciados. |
| `src/components/admin/Pagination.tsx` | Sin cambios | Se reutiliza tal cual (`{ page, pageSize, total, onPageChange, ariaLabel }`). |
| `app/api/admin/business-hours/route.test.ts` | Modified | Mock de `listBusinessHoursPage`; casos de paginación, metadatos, filtro y `400`/`401`. |
| `src/lib/admin/__tests__/business-hours.test.ts` | Modified | Suite contra Supabase local: `range`, `total` filtrado, orden estable, `PGRST103`. |
| `app/(admin)/business-hours/page.test.tsx` | New | Pruebas de UI de la página (patrón `app/(admin)/appointments/page.test.tsx`). |
| `openspec/changes/agregar-paginacion-filtro-horarios/**` | New | Este change (proposal, spec delta, design, tasks). |

Sin cambios en: `app/api/admin/_lib/pagination.ts` (sigue siendo específico de
las rutas del expediente, `10`/`50`), `app/api/admin/_lib/responses.ts`,
`app/api/admin/providers/route.ts`, `src/lib/admin/types.ts` (tipos de
`BusinessHour` reutilizados), `DataTable.tsx`, `FormModal.tsx`, `EmptyState.tsx`,
`ErrorState.tsx`, `LoadingState.tsx`, supabase/migraciones y `travelhub-app`.

## 1. Capa de datos — `src/lib/admin/business-hours.ts`

### D1 — Firma de la lectura paginada

```ts
export type ListBusinessHoursPageParams = {
  providerId?: string;
  page: number;
  pageSize: number;
};

export type ListBusinessHoursPageResult = {
  businessHours: BusinessHour[];
  total: number;
};

export async function listBusinessHoursPage(
  params: ListBusinessHoursPageParams
): Promise<ListBusinessHoursPageResult>
```

Reutiliza `SELECT_COLUMNS` y `mapRow` existentes. Construye la consulta con
`select(SELECT_COLUMNS, { count: 'exact' })` y aplica, en este orden:

1. `providerId` → `parseUuid(params.providerId, 'providerId')` + `.eq('provider_id', id)`
   (filtro antes del conteo),
2. `.order('created_at', { ascending: false })`,
3. `.order('id', { ascending: false })` (desempate estable, requerido por el
   delta "Orden estable del listado de horarios"),
4. `.range(from, from + pageSize - 1)` con `from = (page - 1) * pageSize`.

`total` sale del `count` exacto de la misma consulta; `totalPages` se calcula en
la ruta con `Math.ceil(total / pageSize)` (patrón de
`app/api/admin/appointments/route.ts:110`).

### D2 — `PGRST103` y retiro de `listBusinessHours()`

Cuando el `range` excede el total, PostgREST responde `PGRST103` con
`count: null`. Mismo recurso que `src/lib/admin/patients.ts:170-176` y
`src/lib/admin/appointments.ts:275-308`: se reconoce el error
(`error.code === 'PGRST103'` o `/range not satisfiable/i`), se repite la misma
consulta **sin** `range` solo para obtener el `count` exacto y se devuelve
`{ businessHours: [], total }`, de modo que la ruta conserve `page` sin
recortar y los metadatos reales (requirement "Paginación del listado de horarios
del panel").

`listBusinessHours()` se retira: su único consumidor es `GET
/api/admin/business-hours` y la suite de datos (verificado con `grep`), así que
mantenerla dejaría un export huérfano que `knip` reportaría.

## 2. Ruta — `app/api/admin/business-hours/route.ts`

### D3 — Parsers locales estrictos (defaults 20/100)

Se copia el patrón de `app/api/admin/appointments/route.ts:24-48`
(`parsePositiveIntegerParam` con `/^\d+$/` + `Number.isSafeInteger`), con las
cifras del listado global:

```ts
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
```

Un valor inválido lanza `ValidationError`, que `handleAdminRequest`
(`app/api/admin/_lib/responses.ts:6-21`) traduce a `400`
`{ error: 'invalid_request', field }` (requirement "Validación de los
parámetros de paginación").

**Decisión (convención):** los parsers quedan locales a la ruta y **no** se
extiende `app/api/admin/_lib/pagination.ts`. Ese módulo declara explícitamente
cifras del expediente (`10`/`50`, issue #180) y lo consumen dos rutas de
paciente; parametrizarlo ahora cambiaría un contrato compartido fuera del
alcance de este change. Se sigue el precedente de la ruta de citas, que también
mantiene sus propios parsers.

### D4 — `providerId` validado con `parseUuid`

```ts
const rawProviderId = searchParams.get('providerId');
const providerId = rawProviderId === null || rawProviderId === '' ? undefined : rawProviderId;
```

Un `providerId` con contenido se valida con `parseUuid` dentro de la capa de
datos (`D1`) y, si no es UUID, responde `400` (requirement "Filtro server-side
por proveedor"). Cadena vacía o ausente equivale a "sin filtro", para que la URL
sin filtro (`?providerId=`) no rompa la vista.

**Decisión (mejora sobre el precedente):** la ruta de citas pasa `providerId`
sin validar, lo que con un valor malformado termina en `500` por el cast `uuid`
de Postgres. Aquí se valida explícitamente porque `business-hours.ts` ya expone
`parseUuid`/`ValidationError` y el `400` es el comportamiento observable
correcto. Queda anotado como divergencia deliberada del precedente.

### D5 — Forma de la respuesta

```json
{
  "businessHours": [ ... ],
  "pagination": { "total": 45, "page": 2, "pageSize": 20, "totalPages": 3 }
}
```

**Decisión (convención):** se adopta la forma **anidada** de
`pagination` de #168/#212 (`openspec/changes/agregar-paginacion-citas/specs/admin-appointments/spec.md`)
en lugar de la forma plana de #167
(`openspec/changes/archive/2026-10-08-patient-list-search-pagination/specs/admin-patients-api/spec.md`),
porque es la más reciente y la única ya en producción en el panel; dos formas de
metadatos para listados del mismo panel encarecen cada consumidor nuevo. La
clave `businessHours` conserva forma y campos, así que la respuesta es aditiva.

## 3. UI — `app/(admin)/business-hours/page.tsx`

### D6 — Estado y carga

Estado local de la página:

```ts
const [page, setPage] = useState(initialPage);              // desde ?page=
const [providerFilter, setProviderFilter] = useState(urlProviderFilter); // desde ?providerId=
const [hours, setHours] = useState<BusinessHour[]>([]);
const [pagination, setPagination] = useState<PaginationMeta | null>(null);
```

`loadData()` se reescribe para construir la URL con `URLSearchParams`
(`page` solo cuando `> 1`, `providerId` solo cuando hay filtro) y hacer
`fetch('/api/admin/business-hours?…')`. La llamada a `GET /api/admin/providers`
se mantiene una sola vez (el endpoint sigue devolviendo la lista completa; ver
`app/api/admin/providers/route.ts`) y alimenta tanto el `select` del filtro como
el del formulario. `useEffect` refetchea al cambiar `page` o `providerFilter`
(una sola carga por combinación, con guardia de respuesta obsoleta).

### D7 — Control de paginación

Se monta el componente compartido bajo el `DataTable`:

```tsx
<Pagination
  page={pagination.page}
  pageSize={pagination.pageSize}
  total={pagination.total}
  onPageChange={handlePageChange}
  ariaLabel="Paginación de horarios"
/>
```

Sin cambios en `src/components/admin/Pagination.tsx`: el componente ya devuelve
`null` con `total <= 0`, oculta las acciones con una sola página y las conserva
cuando la página activa quedó fuera de rango. No se agrega selector de
`pageSize` (requirement "Control de paginación en la vista de horarios").

### D8 — Sincronía de URL (patrón #168/#167)

- `useSearchParams()` una sola vez para inicializar `page` (entero `>= 1` válido,
  default `1`) y `providerFilter`.
- `router.replace(buildUrlValue(page, providerFilter))` con una guardia que
  compara contra `searchParams.toString()` y contra la página activa, de modo que
  MUST NOT reescribir la URL ni disparar carga cuando destino = activa
  (requirement "Sincronización de la lista con la URL").
- `page = 1` se omite de la URL; `providerId` se escribe solo cuando hay filtro.
- Se preservan los parámetros preexistentes de la ruta (no se reconstruye la URL
  desde cero).

### D9 — Reset de página al filtrar y normalización fuera de rango

- `handleProviderChange(value)`: setea el filtro, vuelve `page` a `1` y solicita
  la página 1 del nuevo conjunto en una sola actualización de estado
  (requirement "Reinicio a la primera página al cambiar el filtro").
- Tras cada respuesta con `total > 0` y `page > pagination.totalPages`, la vista
  normaliza a `pagination.totalPages` y refetchea esa página sin pasar por un
  estado de error; hasta que llegue la respuesta normalizada no renderiza tabla
  vacía y mantiene el `Pagination` visible (requirement "Normalización de una
  página fuera de rango"). Esto cubre `?page=99` y el borrado del último horario
  de la última página.

### D10 — Panel de filtro y estados vacíos

- Panel antes de la tabla con el patrón visual de `/appointments`
  (`app/(admin)/appointments/page.tsx:760-865`): `select` con `<option value="">Todos</option>`
  + una opción por proveedor, y botón "Limpiar filtro" renderizado solo cuando
  `providerFilter` tiene valor (requirement "Panel de filtro por proveedor en la
  vista de horarios").
- Mensajes: catálogo vacío → `"No hay horarios registrados."` (mensaje vigente);
  filtro activo y `total === 0` → mensaje propio de filtro sin coincidencias con
  acción para limpiarlo (requirement "Estados vacíos diferenciados en la vista de
  horarios"). `LoadingState` / `ErrorState` con reintento de la combinación
  vigente (página + filtro) se conservan.
- El `DataTable` solo se renderiza cuando `hours.length > 0`.

## 4. Pruebas (estrategia TDD, `strict_tdd: true`)

| Capa | Archivo | Runner |
|---|---|---|
| Datos | `src/lib/admin/__tests__/business-hours.test.ts` (extendido): `range` por página, `total` del conjunto filtrado, orden `created_at desc, id desc`, filtro por proveedor, `PGRST103` | `npm run test:local` (Supabase local, advisory lock, `truncateAllTables`) |
| Ruta | `app/api/admin/business-hours/route.test.ts` (ajustado): mock de `listBusinessHoursPage`; metadatos anidados, defaults 1/20, `pageSize=101`, `page=0`, `providerId` malformado, `401` | `npm test` |
| UI | `app/(admin)/business-hours/page.test.tsx` (nuevo): control bajo la tabla, 20 filas por página, `?page=`/`?providerId=`, reset a página 1 al filtrar, panel con "Todos"/"Limpiar filtro", estados vacíos, normalización | `npm test` |

El `Pagination` ya tiene cobertura propia en
`src/components/admin/__tests__/Pagination.test.tsx`; no se duplica.

## Open questions

- Ninguna bloqueante. `pageSize` configurable, ordenamiento por columna y
  paginación del endpoint de proveedores quedaron explícitamente fuera de
  alcance (proposal §Fuera de alcance).
- El nombre de la carpeta del change (`agregar-paginacion-filtro-horarios`) y el
  nombre de la feature en `odd/tasks/agregar-paginacion-en-la-lista-de-horarios.md`
  no coinciden; este change respeta el nombre de carpeta indicado por el
  orquestador y no edita el documento ODD (fuera de la superficie de edición).
