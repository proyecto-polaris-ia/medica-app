# Exploración — agregar-filtro-servicios-calendario (issue #177)

Fase: sdd-propose. Gate: **Ready for Proposal: Yes**.

Worktree: `agregar-filtro-de-servicios-selecci-n-m-ltiple-e`
Rama: `feat/agregar-filtro-servicios-calendario`, base `main` @ `91e9575`
(merge de #174 / `feat/legend-toggle-filter`).

Este archivo captura las anclas verificadas para que las fases `design`, `spec`
y `apply` **no vuelvan a explorar**.

## 1. Estructura de la página (`app/(admin)/appointments/page.tsx`)

- **Imports de calendario**: `MonthCalendar` (:11), `CalendarNav` (:12),
  `ProviderLegend` (:13).
- **Tipo local `Reference = { id, name }`** (:27). `services` se carga como
  `Reference[]` desde `/api/admin/services`; no se importa el tipo `Service` en
  esta página.
- **Lectura de URL**: `useSearchParams` (:165); `useRouter` (:166);
  `rawProviderId = searchParams?.get('providerId') ?? ''` (:167). La lista solo
  honra un id único: `urlProviderFilter = rawProviderId &&
  !rawProviderId.includes(',') ? rawProviderId : undefined` (:169-170).
- **Helpers de módulo** (fuera del componente):
  - `parseProviderIds(raw)` (:139): split por coma, `trim`, descarta vacíos y
    `'all'`. El estado interno **nunca** usa el centinela `'all'`: `[]` es la
    única representación de "todos".
  - `nextCalendarSelection(effective, id)` (:148): agrega o quita un id.
  - `calendarFilterUrl(next)` (:158): devuelve `/appointments?providerId=a,b` o
    `/appointments` si no hay selección. **Hoy solo maneja `providerId`.**
- **Estado**:
  - `serviceFilter` (lista, `string`) (:186).
  - `providerFilter` (lista, `string`) inicializado desde `urlProviderFilter`
    (:188).
  - `calendarProviderFilter: string[]` inicializado con
    `parseProviderIds(searchParams?.get('providerId'))` (:189-191).
- **`calendarAppointments`** (:203-208): `useMemo` con guard
  `if (calendarProviderFilter.length === 0) return appointments;` y filtro
  `selected.has(a.providerId)`. **Es el punto exacto donde debe entrar el filtro
  de servicios, compuesto con AND.**
- **`blocksByDay`** (:210-223): enriquece las citas y llama
  `groupAppointmentsByDay(enriched, providerColor)`. Consume
  `calendarAppointments`, ya filtrado; enriquece `serviceName` con
  `refName(services, appointment.serviceId)` (:214) y `providerId`.
- **`visibleProviders`** (:224-227): deriva los ids de proveedor presentes en el
  arreglo **sin filtrar** `appointments` y filtra `providers`. Es la fuente de la
  leyenda de proveedores; el control de servicios necesita un análogo
  (`visibleServices`/equivalente) derivado también del mes **sin filtrar**.
- **`applyCalendarFilter(next)`** (:232-241): guard de redundancia
  (`next.join(',') === calendarProviderFilter.join(',')`), `setState` y
  `router.replace(calendarFilterUrl(next))`.
- **`toggleCalendarProvider(id)`** (:243-252): calcula `allIds` desde
  `visibleProviders`, expande `[]` a "todos los ids" y guarda `[]` cuando la
  selección equivale a todos.
- **`refName(list, id)`** local (:385): `list.find(...)?.name ?? id` (fallback
  al id si no está en el catálogo).
- **`clearFilters()`** (:403-409): limpia **solo la lista** (`serviceFilter`,
  `patientFilter`, `providerFilter`, `dateFrom`, `dateTo`); no toca el
  calendario.
- **Filtrado de lista** (:413-458): `serviceFilter` en :414-416
  (`a.serviceId === serviceFilter`), deps del `useMemo` en :458,
  `hasActiveFilters` en :460. **No debe modificarse.**
- **`<select>` de servicio de la lista** (:520-534): `value={serviceFilter}`,
  `onChange` a `setServiceFilter`. **No debe modificarse.**
- **Fila del calendario** (:593-615): `mb-4 flex flex-col gap-4 sm:flex-row
  sm:items-center sm:justify-between` con `CalendarNav` (:597) y, en un
  contenedor `flex flex-wrap items-center gap-3` (:600), `<ProviderLegend ...
  />` (:601-605) y el botón condicional "Limpiar filtros" (:606-614), que hoy se
  renderiza con `calendarProviderFilter.length > 0` (:606) y ejecuta
  `applyCalendarFilter([])` (:608).

## 2. La leyenda de proveedores como precedente directo

`src/components/admin/calendar/ProviderLegend.tsx`:

- Props: `{ providers: { id, name, color }[]; selectedIds: string[]; onToggle }`.
- Retorna `null` si `providers.length === 0`.
- `showAll = selectedIds.length === 0`; una entrada está activa si `showAll ||
  selectedIds.includes(id)`.
- Cada entrada es un `<button type="button" aria-pressed={isActive}>` con
  `ACTIVE_ENTRY_CLASSES` / `INACTIVE_ENTRY_CLASSES` (la inactiva usa
  `text-gray-500`, sin borde ni fondo).
- Renderiza el swatch (`data-testid="legend-swatch"`, `opacity-40` cuando está
  inactivo) y el nombre; con `showAll` agrega el texto "Mostrando todos los
  proveedores".

**Diferencia clave para servicios**: `Service` **no tiene `color`**
(`src/lib/admin/types.ts:52-58`; solo `id`, `name`, `durationMinutes`,
`createdAt`, `updatedAt`). El control de servicios debe ser **solo
nombre** (sin swatch) y distinguir el estado inactivo sin depender del color.
`Provider` sí tiene `color: string | null` (`types.ts:41`).
`Appointment.serviceId` existe (`types.ts:101`, no nulable).

## 3. Contratos de datos y reutilización

- `services` se carga con `fetch('/api/admin/services')` y se tipa como
  `Reference[]`; `refName(services, appointment.serviceId)` produce el nombre
  mostrado en los bloques. El control de servicios debe usar la misma fuente y
  el mismo fallback.
- `groupAppointmentsByDay(enriched, providerColor)` (desde
  `@/lib/admin/timezone`) consume el arreglo ya filtrado; el filtrado debe
  ocurrir **antes**, no dentro del agrupador.
- No hay UI kit (shadcn/radix): Tailwind a mano y elementos nativos.
- Sin dependencias nuevas requeridas.

## 4. Precedente de URL

- `app/(admin)/dashboard/components/MetricsRangeSelector.tsx`: `useRouter`
  (:37) + `useSearchParams` (:38); aplica con `router.push('/dashboard?...')`
  (:41, :50).
- `app/(admin)/dashboard/page.test.tsx:4-5`: mock de `useRouter: () => ({ push:
  vi.fn(), replace: vi.fn(), refresh: vi.fn() })` y `useSearchParams`.
- `app/(admin)/appointments/page.test.tsx:5-13`: ya mockea `next/navigation` con
  `vi.hoisted` (`replaceMock`, `searchParamsRef`) y `useRouter: () => ({ replace:
  replaceMock, push: vi.fn(), refresh: vi.fn() })`; `searchParamsRef.value`
  permite simular deep links, incluidos `providerId` y `serviceId`.

## 5. Puntos que la fase `design.md` debe cerrar

1. **Forma del componente**: componente nuevo espejo de `ProviderLegend` (p.
   ej. `ServiceFilterControl.tsx`) vs. generalizar la leyenda a un componente
   reutilizable que reciba "con o sin swatch". Preferencia registrada en la
   propuesta: simetría y reutilización, sin mandatar la forma.
2. **Clases exactas** del estado activo/inactivo de una entrada sin color.
3. **Composición de la URL**: helper único que construya
   `/appointments?...` desde `calendarProviderFilter` y `calendarServiceFilter`,
   omitiendo los parámetros vacíos y conservando el otro al alternar filtros.
4. **Precedencia de parseo**: `serviceId` es nuevo y no lo lee la lista (la
   lista no inicializa estado desde `serviceId`); confirmar que `providerId`
   múltiple se sigue ignorando en la lista.
5. **Ubicación visual** del control de servicios en la fila (junto a
   `ProviderLegend`) y comportamiento en móvil (`flex-wrap`).
6. **Equivalencia `[]` ⇔ "todos los ids"** para servicios, replicando el caso
   borde aceptado en #174 (`design.md` §2.5: desmarcar el último visible vuelve
   a "todos").

## 6. Pruebas

- Vitest + Testing Library + `userEvent`; runner `npm test`
  (`openspec/config.yaml` → `unit: npm run test`, `strict_tdd: true`).
- `app/(admin)/appointments/page.test.tsx` ya prueba la vista de calendario, la
  leyenda y el toggle de proveedores; es el punto natural para el filtro de
  servicios, la composición AND y la limpieza de ambos filtros.
- `src/components/admin/calendar/__tests__/ProviderLegend.test.tsx` existe; se
  puede crear el test del control de servicios o generalizarlo si la fase de
  diseño opta por un componente reutilizable.
- Las pruebas de #174 que asertan que "Limpiar filtros" aparece con un solo
  filtro de proveedor activo **deberán actualizarse** por el cambio de
  comportamiento registrado en la propuesta.

## 7. Estado OpenSpec

No existía `openspec/changes/agregar-filtro-servicios-calendario/`; el change se
crea en esta fase propose. Capability afectada: `appointments-calendar-view`
(`openspec/specs/appointments-calendar-view/spec.md`), con un requirement nuevo
de filtrado multi-selección de servicios (ADDED) y una modificación al
requirement de proveedores para la limpieza de ambos filtros (MODIFIED).

## Ready for Proposal: Yes

Datos suficientes para redactar la propuesta. Puntos a fijar en `design.md` (no
bloqueantes): forma del componente, clases exactas del estado inactivo sin color
y composición de la URL con dos parámetros.
