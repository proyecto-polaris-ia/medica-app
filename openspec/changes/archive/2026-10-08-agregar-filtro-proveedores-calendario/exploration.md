# Exploración — agregar-filtro-proveedores-calendario (issue #174)

Fase: sdd-explore. Gate: **Ready for Proposal: Yes**.

## 1. Estructura de la página (`app/(admin)/appointments/page.tsx`, 807 líneas)

- **Imports de calendario**: `MonthCalendar` (:11), `CalendarNav` (:12),
  `ProviderLegend` (:13).
- **Lectura de URL**: `useSearchParams` (:5, :137); `urlProviderFilter =
  searchParams?.get('providerId') ?? undefined` (:138). Hoy es solo lectura.
- **Estado**: `providerFilter` de la vista de lista, `string`, inicializado con
  `urlProviderFilter` (:156). Vive junto a `serviceFilter`, `patientFilter`,
  `dateFrom`, `dateTo`, `sortField`, `sortDirection`.
- **`blocksByDay`** (:168): `useMemo` que enriquece las citas y llama
  `groupAppointmentsByDay(enriched, providerColor)`. **Hoy no aplica ningún
  filtro**: consume el arreglo completo `appointments`.
- **`visibleProviders`** (:182): deriva de `appointments` los ids de proveedor
  presentes y filtra `providers`. Es la fuente de la leyenda.
- **Filtrado de lista** (:344): `filteredAndSortedAppointments`; el filtro de
  proveedor es un solo valor, `a.providerId === providerFilter` (:353-354).
- **`clearFilters`** (:336): limpia los filtros de la **lista** (no del
  calendario).
- **Toggle de vista** (:400): `role="group"` con botones Lista / Calendario;
  `onClick={() => setView('calendar')}` (:415).
- **Fila del calendario** (:528-533): contenedor `mb-4 flex items-center
  justify-between` con `CalendarNav` (:528) y `ProviderLegend
  providers={visibleProviders}` (:533).
- **`MonthCalendar`** (:675).
- **Convención responsiva** (:397 y encabezado de página):
  `flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between`.

## 2. Inventario de UI y leyenda

- **No hay UI kit**: ni shadcn ni radix; la pantalla usa Tailwind hecho a mano y
  `<select>`/`<button>`/`<input>` nativos.
- **`src/components/admin/calendar/ProviderLegend.tsx`** (31 líneas):
  `LegendProvider = { id, name, color }`; recibe `providers`; si la lista está
  vacía retorna `null`; renderiza `mt-4 flex flex-wrap items-center gap-3` con un
  `span data-testid="legend-swatch"` coloreado + nombre. **Es 100 % display-only**,
  sin interactividad. Convertirlo a botones de alternancia es trivial.
- **Color de proveedor**: `Provider.color: string | null` en
  `src/lib/admin/types.ts:41`; respaldo neutral `FALLBACK_COLOR`
  (`src/lib/admin/timezone.ts`), ya usado por la leyenda y por `providerColor`.
- Sin dependencias nuevas requeridas.

## 3. Precedente de sincronización con URL

- `app/(admin)/dashboard/components/MetricsRangeSelector.tsx`: `useRouter`
  (:37) + `useSearchParams` (:38); aplica con `router.push('/dashboard?...')`
  (:41, :50).
- `app/(admin)/dashboard/page.test.tsx:5`: mock `useRouter: () => ({ push:
  vi.fn(), replace: vi.fn(), refresh: vi.fn() })`; ya contempla `replace`.
- La página de citas hoy **no** usa `useRouter` y su test solo mockea
  `useSearchParams` (`app/(admin)/appointments/page.test.tsx:6-8`:
  `useSearchParams: () => new URLSearchParams()`). Habrá que ampliar el mock
  para el nuevo comportamiento de URL.

## 4. Pruebas

- Vitest + Testing Library + `userEvent`; runner `npm test`
  (`openspec/config.yaml` → `unit: npm run test`, `strict_tdd: true`).
- `app/(admin)/appointments/page.test.tsx` (446 líneas) ya prueba la vista de
  calendario, la leyenda y el toggle; es el punto natural para las pruebas del
  filtro multi-selección.
- `src/components/admin/calendar/__tests__/MonthCalendar.test.tsx` existe para el
  calendario; se puede crear un `ProviderLegend.test.tsx` para la leyenda
  interactiva.

## 5. Rationale de la recomendación (Opción C)

Se comparó: (A) filtro multi-select tipo `<select multiple>` en la fila del
calendario; (B) chip/checkbox nuevos junto a la navegación; (C) **extender
`ProviderLegend` a botones de alternancia**. Se recomienda **C** porque:

1. Reutiliza la leyenda existente (swatch + nombre), que ya comunica el mapeo
   color↔proveedor; no duplica UI.
2. Es accesible con HTML nativo (`<button aria-pressed>`), sin dependencias.
3. Encaja con la convención de la página (Tailwind a mano, sin UI kit).
4. El "reflejo visual del filtro activo" sale gratis: el mismo control muestra
   qué proveedores están visibles.

Restricciones de diseño que se fijaron para la fase de spec/design:

- **Estado separado** `calendarProviderFilter: string[]`; el `providerFilter`
  (`string`) de la lista no se toca.
- **Sin selección o `['all']` ⇒ todos**; filtrado **antes** de `blocksByDay`.
- **La leyenda conserva el universo sin filtrar** del mes, para poder
  reactivar proveedores deseleccionados.
- **URL `router.replace` con `?providerId=a,b`** (ids unidos por coma),
  deep-linkable y preservada entre Lista ↔ Calendario.
- **"Limpiar filtros"** reinicia la selección del calendario.

Punto no bloqueante a resolver en `design.md`: **precedencia del parámetro
`providerId`** entre la lista (un solo id) y el calendario (ids múltiples) para
que el cambio de vista no deje un valor inválido en el `<select>` de la lista.

## 6. Estado OpenSpec

No existía `openspec/changes/agregar-filtro-proveedores-calendario/`; el change
se crea en la fase propose. Capability afectada: `appointments-calendar-view`
(`openspec/specs/appointments-calendar-view/spec.md`), en particular el
requirement `Provider color legend` (MODIFIED) más un requirement nuevo de
filtrado multi-selección (ADDED).

## Ready for Proposal: Yes

Datos suficientes para redactar la propuesta. Único punto a fijar en
`design.md` (no bloqueante): precedencia y parseo del parámetro `providerId`
compartido entre la lista (single) y el calendario (múltiple).
