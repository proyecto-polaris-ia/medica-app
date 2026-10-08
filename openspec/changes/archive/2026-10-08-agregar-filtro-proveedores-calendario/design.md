# Diseño: Filtro multi-selección de proveedores en el calendario de citas

## Contexto y objetivos

Este diseño implementa el requirement **ADDED** "Filtrado multi-selección de
proveedores en el calendario" y el **MODIFIED** "Provider color legend" de
`openspec/changes/agregar-filtro-proveedores-calendario/specs/appointments-calendar-view/spec.md`,
sobre el baseline de la capability en `openspec/specs/appointments-calendar-view/spec.md:60`
("Provider color legend"). Resuelve el
issue [#174](https://github.com/proyecto-polaris-ia/medica-app/issues/174).

Estado actual (anclas re-verificadas en este worktree):

- La leyenda es **solo lectura**: `src/components/admin/calendar/ProviderLegend.tsx:1-31`,
  `LegendProvider = { id, name, color }`, props `{ providers }`, guard `if
  (providers.length === 0) return null` y `span data-testid="legend-swatch"` en
  `ProviderLegend.tsx:22`.
- El filtro de proveedor **solo** vive en la vista de lista:
  `const [providerFilter, setProviderFilter] = useState(urlProviderFilter ?? '')`
  en `app/(admin)/appointments/page.tsx:156`, aplicado en el filtrado de lista
  `a.providerId === providerFilter` en `app/(admin)/appointments/page.tsx:354`
  (dentro del `useMemo` de `:344-391`).
- `blocksByDay` en `app/(admin)/appointments/page.tsx:168-181` consume el arreglo
  **completo** `appointments`; **no** hay ningún filtro de proveedor en el
  calendario.
- El universo de la leyenda es `visibleProviders` en
  `app/(admin)/appointments/page.tsx:182-185`, derivado de `appointments` sin
  filtrar.
- La URL hoy es **solo lectura**: `useSearchParams` en
  `app/(admin)/appointments/page.tsx:5,137` y
  `urlProviderFilter = searchParams?.get('providerId') ?? undefined` en
  `app/(admin)/appointments/page.tsx:138`.
- La fila del calendario es `mb-4 flex items-center justify-between` en
  `app/(admin)/appointments/page.tsx:527-534`, con `ProviderLegend
  providers={visibleProviders}` en `:533`; `MonthCalendar` en `:675-681`.
- No hay UI kit (ni shadcn ni radix); la pantalla usa Tailwind a mano y
  `<button>`/`<select>`/`<input>` nativos. `Provider` es
  `{ id, name, color: string | null, ... }` en `src/lib/admin/types.ts:38-45` y el
  respaldo neutral `FALLBACK_COLOR` ya se usa en
  `ProviderLegend.tsx:1,20`.
- Precedente de escritura de URL en cliente: `useRouter`/`useSearchParams` en
  `app/(admin)/dashboard/components/MetricsRangeSelector.tsx:37-50`, con mock de
  `replace` ya contemplado en `app/(admin)/dashboard/page.test.tsx:4-7`.

Objetivos técnicos:

- **Reutilizar la leyenda, sin UI nueva.** `ProviderLegend` pasa de pasiva a
  control de alternancia; no se duplica el mapeo color↔proveedor.
- **Estado de calendario separado** del de lista, para no tocar el `<select>` de
  un solo valor.
- **Filtrado antes del agrupamiento por día**, para que los bloques se posicionen
  en su franja correcta.
- **URL como deep link**, con `providerId=a,b`.
- **Cero dependencias nuevas** (Tailwind + HTML nativo) y sin tocar
  `travelhub-app`.

---

## 1. Alternativas de UI consideradas (A / B / C)

| Opción | Descripción | Por qué se descarta / se elige |
|---|---|---|
| A | `<select multiple>` de proveedores en la fila del calendario, junto a `CalendarNav` (`app/(admin)/appointments/page.tsx:527-534`). | El `<select multiple>` nativo requiere Ctrl/Cmd+clic, es poco descubrible en móvil y **duplica** la UI de proveedores que ya existe en `ProviderLegend.tsx`. Descartada. |
| B | Chips/checkboxes nuevos (conjunto alterno de controles) junto a la navegación. | Añade controles que repiten la información de color↔proveedor ya presente en `ProviderLegend.tsx:22` y desplaza el layout; costo de UI y de a11y mayor sin beneficio. Descartada. |
| **C** | **Extender `ProviderLegend` (`src/components/admin/calendar/ProviderLegend.tsx`) a botones de alternancia.** | **Elegida.** Reutiliza el control que ya comunica color↔proveedor, es accesible con `<button aria-pressed>` nativo, encaja con la convención de la página (Tailwind a mano) y el "estado de filtro activo" sale gratis: la misma leyenda muestra qué proveedores están visibles. |

---

## 2. Enfoque técnico

### 2.1 Precedencia del parámetro `providerId` (calendario múltiple vs. lista single)

**Regla elegida:** el parámetro `providerId` es **compartido pero con dos
lecturas independientes**; ninguna vista reescribe la lectura de la otra y el
valor **no se transforma al cambiar de vista**.

- **Calendario** lee `providerId` como lista separada por comas (parse en
  §2.2). Es el único escritor del parámetro en este cambio.
- **Lista** conserva su lectura de un solo id, endurecida así en
  `app/(admin)/appointments/page.tsx:138` y su semilla en `:156`:

  ```ts
  const rawProviderId = searchParams?.get('providerId') ?? '';
  // La lista solo honra un id único; `a,b` es del calendario y no le corresponde.
  const urlProviderFilter = rawProviderId && !rawProviderId.includes(',')
    ? rawProviderId
    : undefined;
  const [providerFilter, setProviderFilter] = useState(urlProviderFilter ?? '');
  ```

- **Regla observable:** con `providerId` de un solo valor, el `<select>` de la
  lista se comporta **igual que hoy**. Con `providerId` multi-valor
  (`a,b`), la lista se muestra en "todos" (`providerFilter === ''`) y **no** se
  altera ni se reescribe el parámetro.
- **Cambio de vista:** `setView('calendar')`/`setView('list')`
  (`app/(admin)/appointments/page.tsx:415` y el botón "Lista") **no tocan la
  URL**, así que el calendario recupera su estado y la selección sobrevive el
  recorrido Lista ↔ Calendario. La lista sigue usando su propio `providerFilter`
  (estado de cliente) como hoy; este cambio **no** la hace escribir en la URL.
- **Sin reescritura entre vistas:** no hay efecto que proyecte `providerId` sobre
  `providerFilter` ni viceversa; cada uno se inicializa una sola vez desde la URL
  en el montaje (`useState`), por lo que una navegación posterior no cambia el
  valor ya montado del otro.

### 2.2 Representación interna del filtro del calendario

- **Estado:** `const [calendarProviderFilter, setCalendarProviderFilter] =
  useState<string[]>(parseProviderIds(searchParams?.get('providerId')))` en
  `app/(admin)/appointments/page.tsx`, junto a los estados existentes
  (`:155-161`).
- **Sin centinela `['all']`.** La **selección vacía `[]` significa "todos"** y es
  la única representación del estado sin filtro. Se prohíbe el centinela
  `['all']` en el estado interno para que exista una sola forma de decir "todos"
  (evita dos verdades que puedan divergir).
- **Parse defensivo** (deep link) — `providerId` se parte por coma, se recortan
  espacios y se descartan segmentos vacíos y el literal `'all'` (por
  compatibilidad con enlaces escritos a mano; la UI nunca lo escribe):

  ```ts
  function parseProviderIds(raw: string | null | undefined): string[] {
    if (!raw) return [];
    return raw
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0 && value !== 'all');
  }
  ```

- **IDs desconocidos en la URL** (sin proveedor en el mes visible): se conservan
  en el estado y simplemente no coinciden con ninguna cita. El guard de §2.3
  hace que un arreglo **no vacío** de ids desconocidos filtre a cero citas; el
  calendario sigue renderizando y la leyenda conserva el universo del mes
  (`visibleProviders`, `app/(admin)/appointments/page.tsx:182-185`). No se
  lanza, no se limpia la URL automáticamente.

### 2.3 Pipeline de filtrado (antes de `blocksByDay`)

Nuevo `useMemo` que filtra las citas del calendario **antes** del agrupamiento, y
`blocksByDay` pasa a consumirlo. El guard literal es
`if (calendarProviderFilter.length === 0) return appointments;`:

```ts
// app/(admin)/appointments/page.tsx — nuevo, antes de blocksByDay (:168)
const calendarAppointments = useMemo(() => {
  if (calendarProviderFilter.length === 0) return appointments;
  const selected = new Set(calendarProviderFilter);
  return appointments.filter((a) => selected.has(a.providerId));
}, [appointments, calendarProviderFilter]);

// app/(admin)/appointments/page.tsx:168-181 — cambia la fuente y la dependencia
const blocksByDay = useMemo(() => {
  const enriched = calendarAppointments.map((appointment) => ({ /* …igual… */ }));
  return groupAppointmentsByDay(enriched, providerColor);
}, [calendarAppointments, patients, services, providerColor]);
```

- **Universo de la leyenda = citas del mes SIN filtrar (decisión confirmada del
  proposal).** `visibleProviders` en
  `app/(admin)/appointments/page.tsx:182-185` **no cambia**: sigue derivando de
  `appointments`, de modo que un proveedor deseleccionado sigue visible como
  botón y puede reactivarse. Si la leyenda derivara de
  `calendarAppointments`, deseleccionar todos la vaciaría (riesgo registrado en
  `proposal.md`).
- **Nota de alcance de datos:** en la vista de calendario, `loadData`
  (`app/(admin)/appointments/page.tsx:187-227`) ya carga **solo el mes visible**
  vía `clinicMonthRangeUtc`; por eso el filtro y la leyenda operan sobre el mes,
  no sobre toda la agenda. No se agregan consultas.
- **Efecto cero sobre la lista:** `filteredAndSortedAppointments`
  (`app/(admin)/appointments/page.tsx:344-391`) y `providerFilter` (`:156`) no se
  tocan.

### 2.4 Mecanismo de actualización de URL

**Decisión: escritura dirigida por el handler del toggle (sin `useEffect`), con
guard por cambio de valor.** El estado local es la fuente de verdad; la URL es su
proyección. Se rechaza el efecto de sincronización (evita el riesgo de loop y
una re-render extra, y no es necesario porque el estado se inicializa una sola
vez desde la URL). Precedente de escritura de URL en cliente:
`app/(admin)/dashboard/components/MetricsRangeSelector.tsx:37-50`.

```ts
import { useRouter, useSearchParams } from 'next/navigation'; // :5

const router = useRouter();

const applyCalendarFilter = useCallback(
  (next: string[]) => {
    const nextKey = next.join(',');
    if (nextKey === calendarProviderFilter.join(',')) return; // solo si cambia
    setCalendarProviderFilter(next);
    router.replace(next.length > 0 ? `/appointments?providerId=${nextKey}` : '/appointments');
  },
  [calendarProviderFilter, router]
);
```

- **Deep link / recarga:** la lectura es la inicialización por `useState` de
  §2.2 (`parseProviderIds(searchParams?.get('providerId'))`), así que recargar
  `?providerId=a,b` restaura la selección sin efectos adicionales.
- **`replace` vs. `push`:** se usa `router.replace` para no llenar el historial
  con cada clic de filtro; el enlace sigue siendo copiable/compartible. Nota: a
  diferencia de `MetricsRangeSelector.tsx:41,50` (que usa `push` porque cada
  cambio de rango es una navegación deliberada), aquí el filtro es una acción
  incremental.
- **Ruta destino:** `/appointments?providerId=…` (el segmento de ruta no incluye
  el grupo `(admin)`), consistente con el `/dashboard?…` de
  `MetricsRangeSelector.tsx:41`.
- **No se preservan otros parámetros** porque la página de citas no escribe hoy
  ningún otro parámetro de URL; si en el futuro los hubiera, el builder debe
  partir de `new URLSearchParams(searchParams?.toString())`.
- **Prueba:** el mock de `next/navigation` en
  `app/(admin)/appointments/page.test.tsx:6-8` debe extenderse con `useRouter` y
  `replace: vi.fn()` (precedente `app/(admin)/dashboard/page.test.tsx:4-7`).

### 2.5 Conversión de `ProviderLegend` a control interactivo

`src/components/admin/calendar/ProviderLegend.tsx` sigue siendo **puro y
presentacional** (controlado por la página): no guarda estado, no lee URL, no
importa `next/navigation`. Contrato nuevo:

```ts
type LegendProvider = { id: string; name: string; color: string | null };

type ProviderLegendProps = {
  providers: LegendProvider[];      // universo sin filtrar (mes visible)
  selectedIds: string[];            // selección explícita; [] = todos
  onToggle: (id: string) => void;   // el padre normaliza y escribe la URL
};
```

- **Guard preservado:** `if (providers.length === 0) return null;`
- **Estado presionado = visibilidad efectiva.** Una entrada está activa si
  `selectedIds.length === 0` (todo visible) o si `selectedIds.includes(id)`.
  Esto hace que `aria-pressed` refleje el comportamiento observable (la
  cuadrícula muestra o no las citas de ese proveedor) y cubre el escenario
  "Sin filtrado la leyenda comunica que se muestran todos" sin ambigüedad.
- **Atributo accesible:** `<button type="button" aria-pressed={isActive} onClick={() => onToggle(id)}>`
  (botón nativo → operable por teclado con Enter/Espacio). El `data-testid="legend-swatch"`
  de `ProviderLegend.tsx:22` **se conserva** en el `<span>` interno del color
  (lo usan `src/components/admin/calendar/__tests__/MonthCalendar.test.tsx:197-214`).
- **Clases exactas (Tailwind), entrada:**
  - Activa: `inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm font-medium text-gray-700 transition hover:bg-gray-50`
  - Inactiva: `inline-flex items-center gap-1.5 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm text-gray-500 transition hover:bg-gray-50`
  - **Atenuado:** `opacity-40` se aplica **solo al `span` del swatch**
    (`data-testid="legend-swatch"`), no a la etiqueta. Así la entrada se ve
    atenuada y el nombre permanece legible: `text-gray-500` (#6B7280) sobre
    blanco tiene contraste ≈ 4.8:1 (AA para texto normal), mientras que atenuar
    toda la entrada con `opacity-40` bajaría el contraste por debajo de AA.
- **Comunicar "se muestran todos":** cuando `selectedIds.length === 0`, la
  leyenda renderiza un texto visible `Mostrando todos los proveedores` (mismo
  contenedor `mt-4 flex flex-wrap items-center gap-3`, etiqueta
  `text-sm font-medium text-gray-700` ya existente). Es el anclaje textual del
  escenario "Sin filtrado la leyenda comunica que se muestran todos".
- **Botón "Limpiar filtros":** se renderiza **en la fila de filtros del
  calendario** (`app/(admin)/appointments/page.tsx:527-534`), **no** dentro de
  `ProviderLegend`, y **solo cuando** `calendarProviderFilter.length > 0`. Usa la
  misma apariencia que el botón de limpieza de la lista
  (`app/(admin)/appointments/page.tsx:433-440`):
  `text-sm text-blue-600 hover:text-blue-800`. Su handler llama a
  `applyCalendarFilter([])` (§2.4), que deja la URL en `/appointments` y la
  selección en "todos".
- **Impacto en prueba existente:** `MonthCalendar.test.tsx:197-214` hoy monta
  `<ProviderLegend providers={[…]} />` sin las props nuevas; la fase de Tasks
  debe actualizar ese montaje para pasar `selectedIds={[]}` y `onToggle={() => {}}`
  (o un `vi.fn()`) conservando las aserciones de color sobre `legend-swatch`.

**Cambio de firma de `onToggle` → semántica de alternancia (normalización en el
padre):** el botón solo reporta el `id`; la página calcula el siguiente arreglo
sobre el **conjunto visible efectivo** y normaliza:

```ts
function toggleCalendarProvider(id: string) {
  const allIds = visibleProviders.map((p) => p.id);
  const effective = calendarProviderFilter.length === 0 ? allIds : calendarProviderFilter;
  const next = effective.includes(id)
    ? effective.filter((value) => value !== id)
    : [...effective, id];
  // [] y "todos los ids" son equivalentes ⇒ se guarda [] (representación única).
  applyCalendarFilter(next.length === allIds.length ? [] : next);
}
```

Comportamiento resultante: en el estado sin filtro, activar A **oculta** A y el
resto queda seleccionado (A pasa a `aria-pressed=false`); con un subconjunto
activo, activar una entrada inactiva la agrega. **Trade-off aceptado:** como `[]`
es indistinguible de "todos" (§2.2), desmarcar el **último** proveedor visible
vuelve al estado "todos" (no existe una representación de "ninguno visible", y la
spec exige que la selección vacía muestre todos). Es un caso borde documentado,
no un defecto: el escenario "Entrada de la leyenda alterna su estado" se cumple
siempre que quede al menos un proveedor seleccionado o se parta del estado "todos".

### 2.6 Layout responsivo de la fila de calendario

`app/(admin)/appointments/page.tsx:527-534` pasa de
`mb-4 flex items-center justify-between` a:

```
mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between
```

y agrupa la leyenda y el botón de limpieza en un contenedor
`flex flex-wrap items-center gap-3`:

```tsx
{view === 'calendar' && (
  <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
    <CalendarNav … />
    <div className="flex flex-wrap items-center gap-3">
      <ProviderLegend
        providers={visibleProviders}
        selectedIds={calendarProviderFilter}
        onToggle={toggleCalendarProvider}
      />
      {calendarProviderFilter.length > 0 && (
        <button type="button" onClick={() => applyCalendarFilter([])}
          className="text-sm text-blue-600 hover:text-blue-800">
          Limpiar filtros
        </button>
      )}
    </div>
  </div>
)}
```

Es exactamente la convención responsiva ya usada en el encabezado de la página y
en el toggle (`app/(admin)/appointments/page.tsx:397,400`), y la leyenda ya usa
`flex-wrap` (`ProviderLegend.tsx:15`), así que en móvil se apila sin recortes.

---

## 3. Decisiones

Todas las decisiones referencian rutas de archivo concretas (gate de fase).

| # | Decisión | Valor | Alternativas / razón |
|---|---|---|---|
| 1 | Enfoque de UI | **Opción C**: extender `src/components/admin/calendar/ProviderLegend.tsx` a botones `aria-pressed` | A (`<select multiple>` en la fila de `app/(admin)/appointments/page.tsx:527-534`) y B (chips/checkboxes nuevos) descartadas en §1. |
| 2 | Estado del filtro | `calendarProviderFilter: string[]` nuevo en `app/(admin)/appointments/page.tsx` (`:155-161`) | No reutilizar `providerFilter` (`:156`, single) para no romper el `<select>` de la lista. |
| 3 | Representación de "todos" | `[]` = todos; **sin** centinela `['all']` en estado | Una sola forma de decir "todos"; `'all'` solo se tolera al **parsear** la URL en `app/(admin)/appointments/page.tsx` (§2.2). |
| 4 | Guard explícito | `if (calendarProviderFilter.length === 0) return appointments;` | Literal en el `useMemo` nuevo de `app/(admin)/appointments/page.tsx` (§2.3). |
| 5 | Precedencia de `providerId` | Lecturas independientes: la lista en `app/(admin)/appointments/page.tsx:138,156` solo honra un id único (si hay coma → `''`, "todos"); el calendario parsea la lista completa | Resuelve la colisión registrada en `proposal.md` (§Riesgos) sin que ninguna vista reescriba a la otra. |
| 6 | Cambio de vista | `setView` (`app/(admin)/appointments/page.tsx:415`) **no** toca la URL; el parámetro `providerId` se preserva tal cual | Cumple "la selección sobrevive Lista ↔ Calendario" sin sincronizar estado entre vistas. |
| 7 | Punto de filtrado | Nuevo `useMemo` `calendarAppointments` en `app/(admin)/appointments/page.tsx`, **antes** de `blocksByDay` (`:168-181`) | Los bloques caen en su franja horaria correcta (escenario "El filtrado precede al agrupamiento por día"). |
| 8 | Universo de la leyenda | `visibleProviders` en `app/(admin)/appointments/page.tsx:182-185` sigue derivando de `appointments` **sin filtrar** | Permite reactivar un proveedor deseleccionado; evita la leyenda vacía (riesgo de `proposal.md`). |
| 9 | Escritura de URL | `router.replace` desde el handler `applyCalendarFilter` en `app/(admin)/appointments/page.tsx`, con guard `nextKey === calendarProviderFilter.join(',')`; **sin** `useEffect` | Precedente `app/(admin)/dashboard/components/MetricsRangeSelector.tsx:37-50`; el guard evita reescrituras redundantes y el efecto se descarta por riesgo de loop. |
| 10 | Deep link | Inicialización por `useState` desde `parseProviderIds(searchParams?.get('providerId'))` en `app/(admin)/appointments/page.tsx` | Recargar la URL restaura la selección sin efectos (requisito de spec). |
| 11 | Ruta destino de la URL | `/appointments?providerId=a,b` (sin el grupo `(admin)`) y `/appointments` al limpiar | Consistente con `/dashboard?…` de `app/(admin)/dashboard/components/MetricsRangeSelector.tsx:41`. |
| 12 | Limpieza | Botón "Limpiar filtros" en la fila del calendario (`app/(admin)/appointments/page.tsx:527-534`), solo con filtro activo; clases iguales a `:433-440` | Evita un segundo botón permanente; `applyCalendarFilter([])` elimina `providerId`. |
| 13 | Contrato de `ProviderLegend` | `src/components/admin/calendar/ProviderLegend.tsx`: `{ providers, selectedIds, onToggle }`, puro/controlado | Mantiene el componente testeable y sin dependencia de `next/navigation`. |
| 14 | Estado presionado | `aria-pressed = selectedIds.length === 0 ? true : selectedIds.includes(id)` en `src/components/admin/calendar/ProviderLegend.tsx` | Refleja visibilidad efectiva y cubre el escenario "se muestran todos". |
| 15 | Atenuado | `opacity-40` solo en el swatch (`data-testid="legend-swatch"`) + etiqueta `text-gray-500`; activo `text-gray-700 font-medium` | Mantiene legibilidad (AA ≈ 4.8:1); atenuar toda la entrada con `opacity-40` rompería el contraste exigido por la spec. |
| 16 | Anclaje de "todos" | Texto visible `Mostrando todos los proveedores` cuando `selectedIds.length === 0` en `src/components/admin/calendar/ProviderLegend.tsx` | Da contenido textual verificable al escenario "Sin filtrado la leyenda comunica que se muestran todos". |
| 17 | `data-testid` | Se conserva `legend-swatch` en `ProviderLegend.tsx:22` | `src/components/admin/calendar/__tests__/MonthCalendar.test.tsx:211` depende de ese selector. |
| 18 | Layout | `mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between` en `app/(admin)/appointments/page.tsx:527-534` | Convención existente en el encabezado y toggle (`:397,400`); escenario "La fila de filtros es usable en móvil". |
| 19 | Dependencias | Ninguna (`package.json` intacto) | No hay UI kit; Tailwind + HTML nativo. |
| 20 | Alcance de datos | Sin consultas nuevas; `loadData` (`app/(admin)/appointments/page.tsx:187-227`) ya trae el mes visible | Filtro y leyenda operan en memoria sobre el mes cargado. |
| 21 | Runner de pruebas | `npm test` (Vitest + Testing Library), sin Supabase | `openspec/config.yaml` → `testing.commands.unit: npm run test`, `strict_tdd: true`. |

---

## 4. Trade-offs

- **"Ninguno visible" no es representable.** `[] = todos` (§2.2) implica que
  desmarcar el último proveedor visible vuelve a "todos". Es la consecuencia
  directa de exigir que la selección vacía muestre todo; se documenta y se cubre
  en pruebas como transición válida, no como error.
- **El botón "Limpiar filtros" del calendario solo limpia el filtro del
  calendario.** No toca `clearFilters` (`app/(admin)/appointments/page.tsx:336-342`)
  ni `hasActiveFilters` (`:393`), que son de la lista. Son dos conceptos de
  filtro distintos y se mantienen separados por diseño.
- **La lista no hereda el filtro del calendario.** Al cambiar a Lista con
  `providerId=a,b`, la lista muestra "todos". Es el precio de no romper el
  `<select>` single; el proposal lo acepta explícitamente.
- **URL como única persistencia.** La selección no se guarda por usuario ni en
  `localStorage` (fuera de alcance del `proposal.md`); un enlace compartido con
  ids de otro mes no coincide con nada y el calendario queda usable (escenario
  "Ids desconocidos en la URL no rompen el calendario").
- **`router.replace` no crea entradas de historial.** El botón "atrás" del
  navegador no revierte filtro por filtro; se considera aceptable porque el
  filtro es incremental y la URL sigue siendo copiable.

---

## 5. Rollback

Sin migraciones, sin API y sin dependencias, el rollback es el del `proposal.md`
(sección "Rollback plan": reversión por commit; el parámetro de URL es inerte al
revertir; la lista queda aislada). En términos de este diseño:

- Revertir el commit de la vista de calendario devuelve
  `src/components/admin/calendar/ProviderLegend.tsx` a leyenda pasiva y
  `blocksByDay` (`app/(admin)/appointments/page.tsx:168-181`) a consumir
  `appointments` completo.
- `providerFilter` (`app/(admin)/appointments/page.tsx:156`) y el filtrado de
  lista (`:354`) nunca se modifican, así que la lista no requiere rollback.
- `package.json` no cambia; no hay que desinstalar nada.

---

## 6. Estrategia de pruebas

Runner: `npm test` (Vitest + Testing Library + `userEvent`;
`openspec/config.yaml` → `unit: npm run test`). No requiere Supabase: son pruebas
de UI con `fetch` mockeado. Política test-first (RED → GREEN → TRIANGULATE).

### 6.1 Mapeo escenario de spec → caso de prueba

| Escenario (delta spec) | Test | Archivo |
|---|---|---|
| Seleccionar un proveedor muestra solo sus citas | Con leyenda en "todos", clic en B deja solo las citas de A visibles en la cuadrícula | `app/(admin)/appointments/page.test.tsx` |
| Seleccionar varios proveedores muestra solo los elegidos | Con A/B/C, desactivar B deja visibles A y C | `app/(admin)/appointments/page.test.tsx` |
| Sin selección se muestran todos los proveedores | Desactivar hasta quedar en `[]` restaura todas las citas y `Mostrando todos los proveedores` | `app/(admin)/appointments/page.test.tsx` |
| El filtrado precede al agrupamiento por día | Día con cita de A a las 09:00 y de B a las 11:00: filtrando A, el bloque de B no aparece y el de A conserva su franja | `app/(admin)/appointments/page.test.tsx` |
| La selección se refleja en la URL y es deep-linkable | `replace` llamado con `/appointments?providerId=A,B`; y deep link con `providerId=A,B` restaura la selección | `app/(admin)/appointments/page.test.tsx` |
| La selección sobrevive el cambio Lista ↔ Calendario | Alternar a Lista y volver a Calendario conserva `calendarProviderFilter` (bloques filtrados y `aria-pressed`) | `app/(admin)/appointments/page.test.tsx` |
| "Limpiar filtros" reinicia la selección del calendario | Clic en "Limpiar filtros" deja todos los bloques visibles y `replace` con `/appointments` | `app/(admin)/appointments/page.test.tsx` |
| La lista conserva su filtro de proveedor de un solo valor | Con `providerId=a` (single), el `<select>` de la lista filtra por `a` y el calendario no altera su valor | `app/(admin)/appointments/page.test.tsx` |
| Ids desconocidos en la URL no rompen el calendario | Deep link `providerId=a,desconocido` renderiza sin lanzar y la leyenda conserva el universo del mes | `app/(admin)/appointments/page.test.tsx` |
| La fila de filtros es usable en móvil | Aserción de clases `flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between` en la fila del calendario | `app/(admin)/appointments/page.test.tsx` |
| Los controles de filtrado son operables por teclado | Tab hasta la entrada de la leyenda + Enter: cambia `aria-pressed` y el filtrado | `app/(admin)/appointments/page.test.tsx` y `src/components/admin/calendar/__tests__/ProviderLegend.test.tsx` |
| La leyenda conserva el universo del mes | Con B desactivado, la leyenda sigue mostrando A y B | `src/components/admin/calendar/__tests__/ProviderLegend.test.tsx` |
| Entrada de la leyenda alterna su estado | Clic cambia `aria-pressed` y llama `onToggle` con el id | `src/components/admin/calendar/__tests__/ProviderLegend.test.tsx` |
| Entrada deseleccionada atenuada pero legible | Entrada inactiva expone `aria-pressed="false"` y el swatch tiene `opacity-40` | `src/components/admin/calendar/__tests__/ProviderLegend.test.tsx` |
| Sin filtrado la leyenda comunica que se muestran todos | `selectedIds={[]}` → todas las entradas `aria-pressed="true"` + texto `Mostrando todos los proveedores` | `src/components/admin/calendar/__tests__/ProviderLegend.test.tsx` |

### 6.2 Mecánica de los mocks

- `app/(admin)/appointments/page.test.tsx:6-8` hoy solo mockea `useSearchParams`.
  Se extiende con `useRouter` (patrón `app/(admin)/dashboard/page.test.tsx:4-7`):

  ```ts
  const { replaceMock, searchParamsRef } = vi.hoisted(() => ({
    replaceMock: vi.fn(),
    searchParamsRef: { value: new URLSearchParams() },
  }));

  vi.mock('next/navigation', () => ({
    useRouter: () => ({ replace: replaceMock, push: vi.fn(), refresh: vi.fn() }),
    useSearchParams: () => searchParamsRef.value,
  }));
  ```

  `searchParamsRef.value` se reasigna en los casos de deep link antes del
  `render`, y `replaceMock.mockClear()` en `beforeEach`.
- **Nuevo archivo** `src/components/admin/calendar/__tests__/ProviderLegend.test.tsx`
  (el directorio ya existe, hoy con `MonthCalendar.test.tsx`): toggle,
  `aria-pressed`, atenuado (`opacity-40` en `legend-swatch`) y texto
  "se muestran todos". No necesita mocks de `next/navigation`.
- **Actualización requerida en prueba existente**:
  `src/components/admin/calendar/__tests__/MonthCalendar.test.tsx:197-214` monta
  `<ProviderLegend providers={[…]}/>` sin las props nuevas; debe pasar
  `selectedIds={[]}` y `onToggle={vi.fn()}`, conservando las aserciones de color
  sobre `getAllByTestId('legend-swatch')` (`:211`).

### 6.3 Comandos de validación

```bash
npm test            # vitest run — foco: page.test.tsx y ProviderLegend.test.tsx
npx tsc --noEmit    # typecheck (incluye la nueva firma de ProviderLegend)
npm run build       # build de Next.js
```

---

## 7. Open Questions

Ninguna. La precedencia de `providerId` queda fijada en §2.1 (lecturas
independientes; la lista no honra valores múltiples), la representación de
"todos" en §2.2 (`[]`, sin centinela), el punto de filtrado en §2.3, el mecanismo
de URL en §2.4 (handler sin efecto) y el contrato de la leyenda en §2.5. El único
caso borde (desmarcar el último proveedor visible vuelve a "todos") es una
consecuencia documentada de la spec, no una decisión pendiente.
