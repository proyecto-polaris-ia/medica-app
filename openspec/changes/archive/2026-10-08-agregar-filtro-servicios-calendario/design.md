# Diseño: Filtro multi-selección de servicios en el calendario de citas

## Contexto y objetivos

Este diseño implementa el requirement **ADDED** "Filtrado multi-selección de
servicios en el calendario" y las modificaciones del requirement **MODIFIED**
"Filtrado multi-selección de proveedores en el calendario" de
`openspec/changes/agregar-filtro-servicios-calendario/specs/appointments-calendar-view/spec.md`,
sobre el baseline de la capability en `openspec/specs/appointments-calendar-view/spec.md`.
Resuelve el issue
[#177](https://github.com/proyecto-polaris-ia/medica-app/issues/177) y continúa
el precedente directo de #174 en
`openspec/changes/archive/2026-10-08-agregar-filtro-proveedores-calendario/design.md`.

Estado actual (anclas re-verificadas en este worktree):

- El filtro de proveedor del calendario ya existe: `parseProviderIds`
  (`app/(admin)/appointments/page.tsx:139`), `nextCalendarSelection` (`:148`),
  `calendarFilterUrl` (`:158`, **hoy solo `providerId`**), estado
  `calendarProviderFilter` (`:189-191`), `calendarAppointments` (`:203-208`),
  `visibleProviders` (`:224-227`), `applyCalendarFilter` (`:232-241`),
  `toggleCalendarProvider` (`:243-252`) y `<ProviderLegend>` (`:601-605`).
- El filtro de servicio **solo** vive en la vista de lista: `serviceFilter`
  (`app/(admin)/appointments/page.tsx:186`, `string`), aplicado en `:414-416`,
  con `<select>` en `:520-534`. **No se toca.**
- La lista **no** lee `serviceId` de la URL: solo inicializa su `providerFilter`
  desde `providerId` (`:167-170`, `:188`). `serviceId` es exclusivo del
  calendario y no hay colisión.
- La URL hoy es de solo lectura salvo por `applyCalendarFilter` (escritura única
  desde el handler, sin `useEffect`); `calendarFilterUrl` produce
  `/appointments?providerId=a,b` o `/appointments`.
- El control de servicios necesita una fuente análoga a `visibleProviders`
  (`:224-227`), derivada de `appointments` **sin filtrar**.
- `Service` **no tiene `color`** (`src/lib/admin/types.ts:52-58`); `Appointment.serviceId`
  existe y no es nulable (`src/lib/admin/types.ts:101`). `Provider` sí tiene
  `color: string | null` (`src/lib/admin/types.ts:41`).
- La fila del calendario es `mb-4 flex flex-col gap-4 sm:flex-row sm:items-center
  sm:justify-between` (`app/(admin)/appointments/page.tsx:593-615`) con un
  contenedor `flex flex-wrap items-center gap-3` (`:600`) que agrupa
  `<ProviderLegend>` (`:601-605`) y el botón condicional "Limpiar filtros"
  (`:606-614`).
- No hay UI kit (ni shadcn ni radix): Tailwind a mano y elementos nativos.

Objetivos técnicos:

- **Simetría de contrato, no generalización.** Un control de servicios con el
  mismo contrato que `ProviderLegend` (`aria-pressed`, `[]` = todos), pero
  **sin swatch**, sin acoplarlo a la leyenda de proveedores.
- **Estado de calendario separado** (`calendarServiceFilter`), para no tocar el
  `<select>` de un solo valor de la lista.
- **Universo del mes sin filtrar**, para poder reactivar un servicio
  deseleccionado aunque haya un filtro de proveedores activo.
- **Filtrado antes de `blocksByDay`**, compuesto con AND respecto de proveedores.
- **URL única con ambos parámetros**, como deep link, sin perder `providerId`.
- **Cero dependencias nuevas** (Tailwind + HTML nativo) y sin tocar
  `travelhub-app`.

---

## 1. Alternativas de UI consideradas (A / B / C)

| Opción | Descripción | Por qué se descarta / se elige |
|---|---|---|
| A | Generalizar `src/components/admin/calendar/ProviderLegend.tsx` para que reciba un "swatch opcional" (o `renderSwatch`) y usarlo también para servicios. | Acopla dos dominios que hoy divergen: los proveedores **siempre** tienen swatch y color (`ProviderLegend.tsx:41-47`, `data-testid="legend-swatch"` que usa `src/components/admin/calendar/__tests__/MonthCalendar.test.tsx:211`), mientras que los servicios **nunca** lo tendrán (`Service` sin `color`, `src/lib/admin/types.ts:52-58`). Exigiría condicionales/discriminated props, pondría en riesgo las 7 pruebas de `src/components/admin/calendar/__tests__/ProviderLegend.test.tsx` y no ahorra más de ~25 líneas. Descartada. |
| B | Extraer un componente genérico de filtro ("leyenda de entradas") a una carpeta compartida y reescribir `ProviderLegend` sobre él. | Refactor de arrastre sobre el código de #174 (mismo archivo y pruebas) sin beneficio funcional para el issue #177; viola la regla de "sin refactors de arrastre" de la fase apply. Descartada. |
| **C** | **Crear `src/components/admin/calendar/ServiceFilter.tsx` como espejo del contrato de `ProviderLegend` sin swatch.** | **Elegida.** Cero riesgo de regresión sobre #174 (no se toca `ProviderLegend.tsx` ni su test), mismo patrón de accesibilidad (`<button type="button" aria-pressed>`), misma representación `[]` = todos, y la única diferencia observable (sin color) queda explícita en el archivo nuevo. La duplicación es pequeña, pura y presentacional. |

---

## 2. Enfoque técnico

### 2.1 Componente nuevo `ServiceFilter`

`src/components/admin/calendar/ServiceFilter.tsx` (archivo nuevo) replica la
forma de `src/components/admin/calendar/ProviderLegend.tsx`, **omitiendo el
swatch**:

```tsx
type FilterService = { id: string; name: string };

type ServiceFilterProps = {
  services: FilterService[];
  selectedIds: string[];
  onToggle: (id: string) => void;
};

// Entrada activa: borde y etiqueta con contraste pleno (mismas clases que
// ProviderLegend.tsx:17-18).
const ACTIVE_ENTRY_CLASSES =
  'inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm font-medium text-gray-700 transition hover:bg-gray-50';

// Entrada inactiva: atenuada pero legible (text-gray-500 sobre blanco ≈ AA).
const INACTIVE_ENTRY_CLASSES =
  'inline-flex items-center gap-1.5 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm text-gray-500 transition hover:bg-gray-50';

export function ServiceFilter({ services, selectedIds, onToggle }: ServiceFilterProps) {
  if (services.length === 0) return null;

  // `[]` significa "todos": una sola representación del estado sin filtro.
  const showAll = selectedIds.length === 0;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <span className="text-sm font-medium text-gray-700">Servicios:</span>
      {services.map((service) => {
        const isActive = showAll || selectedIds.includes(service.id);
        return (
          <button
            key={service.id}
            type="button"
            aria-pressed={isActive}
            onClick={() => onToggle(service.id)}
            className={isActive ? ACTIVE_ENTRY_CLASSES : INACTIVE_ENTRY_CLASSES}
          >
            <span>{service.name}</span>
          </button>
        );
      })}
      {showAll && (
        <span className="text-sm font-medium text-gray-700">
          Mostrando todos los servicios
        </span>
      )}
    </div>
  );
}
```

- **Puro y controlado**: no guarda estado, no lee la URL y no importa
  `next/navigation` (igual que `src/components/admin/calendar/ProviderLegend.tsx`).
- **Sin centinela `['all']`** en el estado: `[]` es la única representación de
  "todos".
- **Clases exactas** copiadas de `ProviderLegend.tsx:17-20`. La clase `gap-1.5`
  es inerte con un solo hijo (la etiqueta); se conserva a propósito para que el
  diff contra `ProviderLegend` sea mínimo y evidente.
- **Estados sin color**: activa `text-gray-700` + `font-medium` + borde
  `border-gray-300`; inactiva `text-gray-500` sin borde ni fondo. `text-gray-500`
  (#6B7280) sobre blanco da contraste ≈ 4.8:1 (AA para texto normal), sin
  depender del color.
- **Sin `data-testid` de swatch** y sin `style={{ backgroundColor }}`: la
  ausencia de swatch es verificable (`queryByTestId('legend-swatch')` nulo).

### 2.2 Ubicación en la fila del calendario

En `app/(admin)/appointments/page.tsx:600` (contenedor
`flex flex-wrap items-center gap-3`), después de `<ProviderLegend>` (`:601-605`)
y antes del botón "Limpiar filtros" (`:606-614`):

```tsx
<ProviderLegend
  providers={visibleProviders}
  selectedIds={calendarProviderFilter}
  onToggle={toggleCalendarProvider}
/>
<ServiceFilter
  services={visibleServices}
  selectedIds={calendarServiceFilter}
  onToggle={toggleCalendarService}
/>
```

El contenedor ya usa `flex-wrap` y la fila ya es
`flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between` (`:593`), la
misma convención responsiva del encabezado y del toggle (`:461,479`), así que el
segundo control se apila sin recortes en móvil. No se cambia el layout.

### 2.3 Universo del control: `visibleServices`

Se agrega un `useMemo` análogo a `visibleProviders`
(`app/(admin)/appointments/page.tsx:224-227`), inmediatamente después, derivado
de `appointments` **sin filtrar** y con el fallback `refName` ya existente
(`:385`):

```ts
const visibleServices = useMemo(() => {
  const seen = new Set<string>();
  const result: Reference[] = [];
  for (const appointment of appointments) {
    const id = appointment.serviceId;
    if (seen.has(id)) continue;
    seen.add(id);
    result.push({ id, name: refName(services, id) });
  }
  return result;
}, [appointments, services]);
```

**Decisión: el universo son los servicios presentes en las citas del mes sin
filtrar, no el catálogo completo de `/api/admin/services`.** Razones:

- La spec lo exige: "MUST listar **todos** los servicios con citas en el mes
  visible, incluidos los que estén deseleccionados" y "MUST seguir listando ambos
  aun con un filtro de proveedores activo". El catálogo completo incluiría
  servicios sin citas en el mes, cuyo toggle es un no-op de filtrado.
- Simetría con `visibleProviders` (`:224-227`), derivado de `appointments`
  **sin filtrar** (no de `calendarAppointments`), de modo que un servicio
  deseleccionado sigue visible como botón.
- Se deriva del arreglo de citas (no de `services.filter(...)`) para tolerar un
  `serviceId` sin entrada en el catálogo: `refName(services, id)` devuelve el id
  como nombre en ese caso (mitigación del riesgo "Control vacío o sin nombres"
  de `proposal.md`). El orden es el de primera aparición en el mes, determinista
  para el fixture de pruebas.

### 2.4 Estado y parseo

- **Estado nuevo** en `app/(admin)/appointments/page.tsx`, junto a
  `calendarProviderFilter` (`:189-191`):

  ```ts
  const [calendarServiceFilter, setCalendarServiceFilter] = useState<string[]>(
    parseServiceIds(searchParams?.get('serviceId'))
  );
  ```

- **Parseo genérico, sin duplicar cuerpo.** Se extrae el cuerpo actual de
  `parseProviderIds` (`app/(admin)/appointments/page.tsx:139-145`) a
  `parseIdList` y se conservan dos wrappers con nombre semántico:

  ```ts
  function parseIdList(raw: string | null | undefined): string[] {
    if (!raw) return [];
    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of raw.split(',')) {
      const trimmed = value.trim();
      if (trimmed.length === 0 || trimmed === 'all') continue;
      if (seen.has(trimmed)) continue;
      seen.add(trimmed);
      result.push(trimmed);
    }
    return result;
  }

  // #174: se conserva el nombre y el comportamiento (tolerante a `all`, vacíos).
  function parseProviderIds(raw: string | null | undefined): string[] {
    return parseIdList(raw);
  }

  // #177: mismo contrato de parseo para servicios.
  function parseServiceIds(raw: string | null | undefined): string[] {
    return parseIdList(raw);
  }
  ```

  `parseProviderIds` se mantiene tal cual a nivel de call site (`:190`) para no
  tocar la ruta de #174; el body compartido evita dos parsers divergentes. La
  deduplicación es aditiva e idempotente (el filtro usa `Set`).

- **La lista queda intacta.** `serviceFilter` (`:186`) sigue siendo `string` sin
  semilla desde la URL; el filtro de lista (`:414-416`), sus deps (`:458`),
  `hasActiveFilters` (`:460`) y el `<select>` (`:520-534`) no se modifican.

### 2.5 Pipeline de filtrado (antes de `blocksByDay`)

Se extiende el `useMemo` `calendarAppointments` de
`app/(admin)/appointments/page.tsx:203-208` para aplicar ambos guards con AND,
manteniendo su posición **antes** de `blocksByDay` (`:210-223`):

```ts
const calendarAppointments = useMemo(() => {
  const providerActive = calendarProviderFilter.length > 0;
  const serviceActive = calendarServiceFilter.length > 0;
  // `[]` = todos en ambos filtros: sin nada activo se devuelve el mes completo.
  if (!providerActive && !serviceActive) return appointments;
  const selectedProviders = new Set(calendarProviderFilter);
  const selectedServices = new Set(calendarServiceFilter);
  return appointments.filter(
    (a) =>
      (!providerActive || selectedProviders.has(a.providerId)) &&
      (!serviceActive || selectedServices.has(a.serviceId))
  );
}, [appointments, calendarProviderFilter, calendarServiceFilter]);
```

- **Composición exacta**: proveedor AND servicio, cada uno con su guard de
  "vacío = todos". Con ambos activos, la cuadrícula muestra únicamente las citas
  que cumplen ambos criterios.
- `blocksByDay` (`:210-223`) no cambia: ya consume `calendarAppointments`, así
  que el enriquecimiento (`serviceName` vía `refName`, `:214`) y
  `groupAppointmentsByDay` reciben la intersección y los bloques caen en su
  franja correcta.
- **Ids desconocidos**: un arreglo no vacío con ids sin coincidencia filtra a
  cero citas; el calendario sigue renderizando y `visibleServices` conserva el
  universo del mes. No se lanza ni se limpia la URL.

### 2.6 Sincronización de la URL

**Decision: un solo `router.replace` que escribe ambos parámetros** (extensión
de `calendarFilterUrl`, `app/(admin)/appointments/page.tsx:158-163`):

```ts
// URL del filtro del calendario: compone ambos parámetros y omite los vacíos.
function calendarFilterUrl(providerIds: string[], serviceIds: string[]): string {
  const params = new URLSearchParams();
  if (providerIds.length > 0) params.set('providerId', providerIds.join(','));
  if (serviceIds.length > 0) params.set('serviceId', serviceIds.join(','));
  const query = params.toString();
  return query.length > 0 ? `/appointments?${query}` : '/appointments';
}
```

- **Orden determinista**: `providerId` primero, `serviceId` después. Esto
  preserva las aserciones exactas de #174 (p. ej.
  `app/(admin)/appointments/page.test.tsx:662` espera
  `/appointments?providerId=prov-a,prov-b` sin `serviceId`).
- **Guard de reescritura redundante** en el único aplicador, que sustituye a
  `applyCalendarFilter` (`app/(admin)/appointments/page.tsx:232-241`):

  ```ts
  const applyCalendarFilters = useCallback(
    (nextProvider: string[], nextService: string[]) => {
      // Guard: solo se escribe la URL si cambió cualquiera de los dos filtros.
      if (
        nextProvider.join(',') === calendarProviderFilter.join(',') &&
        nextService.join(',') === calendarServiceFilter.join(',')
      ) {
        return;
      }
      setCalendarProviderFilter(nextProvider);
      setCalendarServiceFilter(nextService);
      router.replace(calendarFilterUrl(nextProvider, nextService));
    },
    [calendarProviderFilter, calendarServiceFilter, router]
  );
  ```

- **Sin `useEffect`**: el estado local es la fuente de verdad y la URL su
  proyección, igual que en #174; se evita el riesgo de loop.
- **Deep link / recarga**: la inicialización por `useState` (§2.4) restaura
  `serviceId` y `providerId` al montar, sin efectos adicionales.
- **`router.replace`** (no `push`) para no llenar el historial con cada clic de
  filtro (mismo criterio que #174 y distinto de
  `app/(admin)/dashboard/components/MetricsRangeSelector.tsx:41,50`, donde cada
  cambio de rango es una navegación deliberada).
- **Ruta destino** `/appointments` (sin el grupo `(admin)`), consistente con el
  `/dashboard?…` de `MetricsRangeSelector.tsx:41`.

### 2.7 Handlers de alternancia

`toggleCalendarProvider` (`app/(admin)/appointments/page.tsx:243-252`) se
actualiza para preservar la selección de servicios, y se agrega
`toggleCalendarService` con la misma normalización `allIds` (reutiliza
`nextCalendarSelection`, `:148`):

```ts
function toggleCalendarProvider(id: string) {
  const allIds = visibleProviders.map((p) => p.id);
  const effective =
    calendarProviderFilter.length === 0 ? allIds : calendarProviderFilter;
  const next = nextCalendarSelection(effective, id);
  applyCalendarFilters(
    next.length === allIds.length ? [] : next,
    calendarServiceFilter
  );
}

function toggleCalendarService(id: string) {
  const allIds = visibleServices.map((s) => s.id);
  const effective =
    calendarServiceFilter.length === 0 ? allIds : calendarServiceFilter;
  const next = nextCalendarSelection(effective, id);
  applyCalendarFilters(
    calendarProviderFilter,
    next.length === allIds.length ? [] : next
  );
}
```

**Caso borde aceptado (heredado de #174, `design.md §2.5`)**: como `[]` es
indistinguible de "todos", desmarcar el **último** servicio visible vuelve a
"todos". No existe representación de "ninguno visible" y la spec exige que la
selección vacía muestre todos.

### 2.8 "Limpiar filtros" reinicia ambos

El botón de `app/(admin)/appointments/page.tsx:606-614` cambia su condición y su
handler:

```tsx
{(calendarProviderFilter.length > 0 || calendarServiceFilter.length > 0) && (
  <button
    type="button"
    onClick={() => applyCalendarFilters([], [])}
    className="text-sm text-blue-600 hover:text-blue-800"
  >
    Limpiar filtros
  </button>
)}
```

- Se renderiza con **cualquiera** de los dos filtros activo (solo proveedores,
  solo servicios, o ambos) y no se renderiza sin ninguno.
- `applyCalendarFilters([], [])` reinicia ambos a "todos" y, al no quedar
  parámetros, escribe `/appointments` en **un solo** `router.replace`.
- **Modifica el comportamiento de #174** (que solo limpiaba proveedores y solo
  aparecía con ese filtro), tal como registra el requirement MODIFIED de la
  delta spec. No confundir con `clearFilters` de la lista
  (`app/(admin)/appointments/page.tsx:403-409`) ni con `hasActiveFilters`
  (`:460`), que siguen siendo exclusivos de la lista.

### 2.9 Colisión de parámetros `serviceId`

Confirmado en el baseline: la vista de lista **no** lee `serviceId`. Solo lee
`providerId` (`app/(admin)/appointments/page.tsx:167-170`) y su estado
`serviceFilter` se inicializa en `''` (`:186`). Por lo tanto:

- `?serviceId=x,y` es inerte para la lista: su `<select>` (`:520-534`) queda en
  "Todos" y no reescribe la URL.
- `providerId` multi-valor sigue ignorado por la lista (`urlProviderFilter`
  vuelve `undefined` con coma, `:169-170`), como en #174.
- Ni la lista ni el calendario se pisan entre sí: cada uno inicializa su estado
  una sola vez desde la URL y el calendario es el único escritor.

### 2.10 Alcance de datos

Sin consultas nuevas: `loadData` (`app/(admin)/appointments/page.tsx:254-315`)
ya carga **solo el mes visible** vía `clinicMonthRangeUtc` y ya trae el catálogo
`services` (`Reference[]`, `:27`). Filtro y control operan en memoria sobre el
mes cargado. `groupAppointmentsByDay` (desde `@/lib/admin/timezone`) sigue
recibiendo el arreglo ya filtrado; no se filtra dentro del agrupador.

---

## 3. Decisiones

Todas las decisiones referencian rutas de archivo concretas (gate de fase).

| # | Decisión | Valor | Alternativas / razón |
|---|---|---|---|
| 1 | Forma del componente | **Opción C**: crear `src/components/admin/calendar/ServiceFilter.tsx` como espejo del contrato de `src/components/admin/calendar/ProviderLegend.tsx`, sin swatch | A (swatch opcional en `ProviderLegend.tsx`) y B (componente genérico compartido) descartadas en §1; cero riesgo de regresión para #174. |
| 2 | Contrato del componente | `{ services, selectedIds, onToggle }`, puro/controlado, en `src/components/admin/calendar/ServiceFilter.tsx` | Idéntico a `ProviderLegend.tsx:6-15`; no importa `next/navigation` ni guarda estado. |
| 3 | Estado presionado | `aria-pressed = selectedIds.length === 0 ? true : selectedIds.includes(id)` en `src/components/admin/calendar/ServiceFilter.tsx` | Misma semántica de visibilidad efectiva que `ProviderLegend.tsx:38`; cubre "se muestran todos". |
| 4 | Clases exactas | Activa: `inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm font-medium text-gray-700 transition hover:bg-gray-50`. Inactiva: `inline-flex items-center gap-1.5 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm text-gray-500 transition hover:bg-gray-50`, en `src/components/admin/calendar/ServiceFilter.tsx` | Copiadas de `ProviderLegend.tsx:17-20`; `gap-1.5` es inerte con un solo hijo y se conserva por simetría. |
| 5 | Sin swatch | Ninguna entrada renderiza swatch ni `style={{ backgroundColor }}` en `src/components/admin/calendar/ServiceFilter.tsx` | `Service` no tiene `color` (`src/lib/admin/types.ts:52-58`); el estado inactivo se distingue con `text-gray-500` (AA) sin depender del color. |
| 6 | Anclaje de "todos" | Texto visible `Mostrando todos los servicios` cuando `selectedIds.length === 0` en `src/components/admin/calendar/ServiceFilter.tsx` | Espejo de `ProviderLegend.tsx:51-55`; da contenido textual verificable al escenario "Sin filtrado de servicios el control comunica que se muestran todos". |
| 7 | Ubicación | Dentro del contenedor `flex flex-wrap items-center gap-3` de `app/(admin)/appointments/page.tsx:600`, tras `<ProviderLegend>` (`:601-605`) | Misma fila de filtros; `flex-wrap` absorbe el segundo control sin cambiar el layout. |
| 8 | Estado | `calendarServiceFilter: string[]` nuevo en `app/(admin)/appointments/page.tsx`, junto a `calendarProviderFilter` (`:189-191`) | No reutilizar `serviceFilter` (`app/(admin)/appointments/page.tsx:186`, `string`) para no romper el `<select>` de la lista. |
| 9 | Representación de "todos" | `[]` = todos; sin centinela `['all']` en el estado interno | Misma regla que #174; `'all'` solo se tolera al parsear la URL (`app/(admin)/appointments/page.tsx` §2.4). |
| 10 | Parseo | `parseIdList` compartido + wrappers `parseProviderIds` (`app/(admin)/appointments/page.tsx:139`) y `parseServiceIds` | Toleran `all`, descartan vacíos y deduplican; el body único evita parsers divergentes y no toca la ruta de #174. |
| 11 | Deep link | Inicialización por `useState` desde `parseServiceIds(searchParams?.get('serviceId'))` en `app/(admin)/appointments/page.tsx` | Recargar la URL restaura la selección sin `useEffect`. |
| 12 | Universo del control | `visibleServices` derivado de `appointments` **sin filtrar** en `app/(admin)/appointments/page.tsx` (tras `:224-227`), con `refName(services, id)` (`:385`) como fallback de nombre | La spec exige los servicios con citas en el mes visible, incluidos los deseleccionados y aun con filtro de proveedores activo; el catálogo completo de `/api/admin/services` incluiría servicios cuyo toggle es un no-op. |
| 13 | Punto de filtrado | Extender el `useMemo` `calendarAppointments` en `app/(admin)/appointments/page.tsx:203-208`, **antes** de `blocksByDay` (`:210-223`) | Los bloques caen en su franja horaria correcta (escenario "El filtrado de servicios precede al agrupamiento por día"). |
| 14 | Composición AND | Guards independientes `providerActive`/`serviceActive` con `(!providerActive \|\| selectedProviders.has(a.providerId)) && (!serviceActive \|\| selectedServices.has(a.serviceId))` en `app/(admin)/appointments/page.tsx:203-208` | Con ambos filtros activos solo quedan las citas que cumplen ambos; vacío = todos en cada eje. |
| 15 | Escritura de URL | `calendarFilterUrl(providerIds, serviceIds)` en `app/(admin)/appointments/page.tsx:158-163` construida con `URLSearchParams`, y **un único** `router.replace` desde `applyCalendarFilters` | Compone ambos parámetros y omite los vacíos; evita perder uno al alternar el otro (riesgo de `proposal.md`). |
| 16 | Guard de reescritura | `applyCalendarFilters` retorna sin escribir si ambos `join(',')` no cambiaron (`app/(admin)/appointments/page.tsx`, sustituye a `:232-241`) | Conserva la prueba de no reescritura de #174 (`app/(admin)/appointments/page.test.tsx:705`). |
| 17 | Orden de parámetros | `providerId` antes que `serviceId` en `URLSearchParams` | Determinista y compatible con las aserciones exactas de URL de #174. |
| 18 | Limpieza | Botón en `app/(admin)/appointments/page.tsx:606-614` visible si `calendarProviderFilter.length > 0 \|\| calendarServiceFilter.length > 0`, y `onClick={() => applyCalendarFilters([], [])}` | Cumple el requirement MODIFIED ("limpia ambos y aparece con cualquiera activo"); **modifica** el comportamiento de #174. |
| 19 | Sin colisión de `serviceId` | La lista no lee `serviceId`: solo `providerId` (`app/(admin)/appointments/page.tsx:167-170`) y su estado `serviceFilter` nace en `''` (`:186`) | `?serviceId=x,y` es inerte para la lista; el calendario es el único escritor. |
| 20 | Lista intacta | `serviceFilter` (`:186`), filtro de lista (`:414-416`), deps (`:458`), `hasActiveFilters` (`:460`) y `<select>` (`:520-534`) no se modifican | Invariante del requirement: el filtro de servicio de un solo valor de la lista conserva semántica y valor. |
| 21 | Layout | La fila de `app/(admin)/appointments/page.tsx:593-615` conserva `mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between` y el contenedor `flex flex-wrap` | Convención existente; el control nuevo se apila en móvil y permanece operable. |
| 22 | Dependencias | Ninguna (`package.json` intacto) | No hay UI kit; Tailwind + HTML nativo. |
| 23 | Alcance de datos | Sin consultas nuevas; `loadData` (`app/(admin)/appointments/page.tsx:254-315`) ya trae el mes visible y el catálogo `services` | Filtro y control operan en memoria sobre el mes cargado. |
| 24 | Runner de pruebas | `npm test` (Vitest + Testing Library), sin Supabase | `openspec/config.yaml` → `testing.commands.unit: npm run test`, `strict_tdd: true`. |

---

## 4. Trade-offs

- **Duplicación pequeña y deliberada.** `ServiceFilter.tsx` repite ~25 líneas del
  contrato de `ProviderLegend.tsx` en lugar de generalizar. Se acepta porque el
  precio (una copia pura y presentacional) es menor que el acoplamiento de un
  swatch opcional y el riesgo de regresión sobre #174.
- **"Ninguno visible" no es representable (heredado de #174).** `[] = todos`
  implica que desmarcar el último servicio visible vuelve a "todos". Es
  consecuencia directa de la spec; se cubre como transición válida, no como error.
- **La lista no hereda el filtro del calendario.** Con `?serviceId=x,y`, la lista
  muestra "Todos" porque su `<select>` es de un solo valor y no lee la URL. Es el
  precio de no romper el filtro de lista; el `proposal.md` lo acepta.
- **El botón "Limpiar filtros" del calendario solo limpia el calendario.** No
  toca `clearFilters` (`app/(admin)/appointments/page.tsx:403-409`) ni
  `hasActiveFilters` (`:460`), que son de la lista. Son conceptos distintos y se
  mantienen separados por diseño.
- **Cambio de contrato de "Limpiar filtros" (#174).** Pasa de limpiar solo
  proveedores a limpiar ambos, y de aparecer con un filtro a aparecer con
  cualquiera. Mitigación: requirement MODIFIED de la delta spec y pruebas de
  limpieza conjunta; las pruebas de #174 siguen válidas al leerse como "limpia
  ambos" (`app/(admin)/appointments/page.test.tsx:684-703,821-847`).
- **URL como única persistencia.** La selección no se guarda por usuario ni en
  `localStorage` (fuera de alcance del `proposal.md`); un enlace con ids de otro
  mes no coincide con nada y el calendario queda usable.
- **`router.replace` no crea entradas de historial.** El botón "atrás" no
  revierte filtro por filtro; aceptable porque la URL sigue siendo copiable.

---

## 5. Rollback

Sin migraciones, sin API y sin dependencias, el rollback es el del `proposal.md`
(sección "Rollback plan": reversión por commit; el parámetro `serviceId` es
inerte al revertir; la lista queda aislada). En términos de este diseño:

- Revertir el commit de la vista de calendario elimina
  `src/components/admin/calendar/ServiceFilter.tsx`, devuelve
  `calendarAppointments` (`app/(admin)/appointments/page.tsx:203-208`) a filtrar
  solo por proveedor, `calendarFilterUrl` (`:158`) a escribir solo `providerId`,
  y el botón "Limpiar filtros" (`:606-614`) a su condición de #174.
- `serviceFilter` (`app/(admin)/appointments/page.tsx:186`) y el filtrado de
  lista (`:414-416`) nunca se modifican, así que la lista no requiere rollback.
- `providerId` multi-valor y su precedencia (`app/(admin)/appointments/page.tsx:167-170`)
  no cambian; el rollback no afecta el comportamiento entregado por #174.
- `package.json` no cambia; no hay que desinstalar nada.

---

## 6. Estrategia de pruebas

Runner: `npm test` (Vitest + Testing Library + `userEvent`;
`openspec/config.yaml` → `unit: npm run test`). No requiere Supabase: son pruebas
de UI con `fetch` mockeado. Política test-first (RED → GREEN → TRIANGULATE),
`strict_tdd: true`.

### 6.1 Mapeo escenario de spec → caso de prueba

| Escenario (delta spec) | Test | Archivo |
|---|---|---|
| Seleccionar un servicio muestra solo sus citas | Con X/Y en el mes, clic en Y deja solo Y; el bloque de X desaparece | `app/(admin)/appointments/page.test.tsx` |
| Seleccionar varios servicios muestra solo los elegidos | Con X/Y/Z, desactivar Y deja X y Z | `app/(admin)/appointments/page.test.tsx` |
| Sin selección se muestran todos los servicios | Desmarcar hasta `[]` restaura todo y aparece `Mostrando todos los servicios` | `app/(admin)/appointments/page.test.tsx` |
| El filtro de servicios se compone con AND con el de proveedores | Cita X/A, X/B, Y/A: seleccionar X y A deja solo X/A | `app/(admin)/appointments/page.test.tsx` |
| El filtrado de servicios precede al agrupamiento por día | Día con X/A a las 09:00 y Y/B a las 11:00: filtrar X y A deja solo la franja de 09:00 | `app/(admin)/appointments/page.test.tsx` |
| La selección de servicios se refleja en la URL y es deep-linkable | Tras alternar, `replace` con `/appointments?serviceId=service-1,service-2`; deep link `serviceId=service-1,service-2` restaura `aria-pressed` y bloques | `app/(admin)/appointments/page.test.tsx` |
| La URL compone la selección de servicios con la de proveedores | Seleccionar X/Y + A escribe `/appointments?providerId=prov-a&serviceId=service-1,service-2`; deep link restaura ambos | `app/(admin)/appointments/page.test.tsx` |
| La selección de servicios sobrevive el cambio Lista ↔ Calendario | Ir a Lista y volver conserva `calendarServiceFilter` y `calendarProviderFilter` sin nuevas llamadas a `replace` | `app/(admin)/appointments/page.test.tsx` |
| El control de servicios conserva el universo del mes | Con Y deseleccionado y proveedor A activo, el control sigue listando X e Y | `app/(admin)/appointments/page.test.tsx` y `src/components/admin/calendar/__tests__/ServiceFilter.test.tsx` |
| Las entradas del control de servicios son solo nombre | La entrada no contiene swatch (`queryByTestId('legend-swatch')` nulo) y no expone color; inactiva usa `text-gray-500` | `src/components/admin/calendar/__tests__/ServiceFilter.test.tsx` |
| Los controles de servicios son operables por teclado | Foco en la entrada + Enter/Espacio cambia `aria-pressed` y llama `onToggle` | `app/(admin)/appointments/page.test.tsx` y `src/components/admin/calendar/__tests__/ServiceFilter.test.tsx` |
| Sin filtrado de servicios el control comunica que se muestran todos | `selectedIds={[]}` → todas las entradas `aria-pressed="true"` + texto `Mostrando todos los servicios` | `src/components/admin/calendar/__tests__/ServiceFilter.test.tsx` |
| Ids desconocidos en la URL no rompen el calendario | Deep link `serviceId=service-1,desconocido`: renderiza sin lanzar y el control conserva el universo | `app/(admin)/appointments/page.test.tsx` |
| La fila de filtros con el control de servicios es usable en móvil | La fila conserva `flex-col gap-4 sm:flex-row sm:items-center sm:justify-between` y ambos controles son visibles | `app/(admin)/appointments/page.test.tsx` |
| La misma acción "Limpiar filtros" deja el filtro de servicios en "todos" | Con proveedor y servicio activos, "Limpiar filtros" escribe `/appointments` y muestra todo | `app/(admin)/appointments/page.test.tsx` |
| El botón "Limpiar filtros" se muestra cuando cualquiera de los filtros está activo | Sin filtros no existe; con solo servicio activo aparece | `app/(admin)/appointments/page.test.tsx` |
| La lista conserva su filtro de servicio de un solo valor | Con `serviceId` en la URL y una selección de calendario, el `<select>` de la lista sigue en `''`/"Todos" y filtra por su propio valor | `app/(admin)/appointments/page.test.tsx` |

### 6.2 Mecánica de los mocks

- `app/(admin)/appointments/page.test.tsx` ya mockea `next/navigation` con
  `vi.hoisted` (`replaceMock`, `searchParamsRef`) en `:5-13`; **no se requiere
  cambio de mock**. `searchParamsRef.value` se reasigna antes de `render` para
  los deep links (`serviceId`, `providerId` o ambos).
- **Fixtures multi-servicio**: hoy `CAL_SERVICE = { id: 'service-1', name:
  'Limpieza' }` (`app/(admin)/appointments/page.test.tsx:479`) y
  `buildCalendarFetch` (`:500-517`) hardcodea `services: [CAL_SERVICE]` y
  `calAppointment` (`:483-499`) hardcodea `serviceId: CAL_SERVICE.id`. Se
  extienden así: una constante `CAL_SERVICES` con al menos
  `service-1 Limpieza`, `service-2 Ortodoncia` y `service-3 Revisión`; un
  parámetro `services` en `buildCalendarFetch`; y un parámetro `serviceId` (con
  default `CAL_SERVICE.id`) en `calAppointment`. Los bloques del calendario
  exponen el nombre del servicio en su `aria-label`
  (`src/components/admin/calendar/DayCell.tsx:55`), así que las aserciones por
  nombre siguen funcionando.
- **Nuevo archivo** `src/components/admin/calendar/__tests__/ServiceFilter.test.tsx`
  (el directorio ya existe): toggle y `onToggle(id)` con **solo el id**,
  `aria-pressed` con `[]` y con subconjunto, texto "se muestran todos", ausencia
  de swatch, `text-gray-500` en la inactiva, lista vacía → `null` (sin texto
  "Mostrando todos los servicios"), ids desconocidos y teclado. No necesita
  mocks de `next/navigation`.
- **Pruebas de #174 que siguen válidas sin cambios**: la de "Limpiar filtros"
  (`app/(admin)/appointments/page.test.tsx:684-703`) sigue esperando
  `/appointments`; la responsiva (`:821-847`) sigue esperando ausencia del botón
  sin filtros y presencia al activar un proveedor; las de URL exacta
  (`:648-666,869-905`) siguen esperando solo `providerId` cuando no hay servicios
  seleccionados.

### 6.3 Mapeo de suites en `page.test.tsx`

Nuevo `describe('/appointments calendar service filter')`, espejo del existente
`describe('/appointments calendar provider filter')` (`app/(admin)/appointments/page.test.tsx:542`),
con `beforeEach` que restablece `searchParamsRef.value`, limpia `replaceMock` y
restaura `fetch` (mismo patrón de `:543-550`): selección, AND con proveedores,
precedencia sobre `blocksByDay`, URL/deep link/composición, supervivencia al
cambio de vista, limpieza conjunta, botón con solo servicio activo, coexistencia
con la lista, ids desconocidos, `serviceId=all` y responsividad.

### 6.4 Comandos de validación

```bash
npm test            # vitest run — foco: page.test.tsx y ServiceFilter.test.tsx
npx tsc --noEmit    # typecheck (incluye la firma de ServiceFilter)
npm run build       # build de Next.js
```

---

## 7. Estimación de carga y dependencias

Puntero para la fase **Tasks**: el trabajo se agrupa en (1) componente nuevo
`src/components/admin/calendar/ServiceFilter.tsx` con su prueba, (2) estado,
parseo, universo y pipeline en `app/(admin)/appointments/page.tsx`, (3) URL y
limpieza conjunta en `app/(admin)/appointments/page.tsx`, y (4) suites de
servicios en `app/(admin)/appointments/page.test.tsx`. Esfuerzo esperado
comparable al de #174 menos el trabajo de transformar la leyenda existente: una
tarea de UI nueva con pruebas, una de estado/filtrado y una de URL/limpieza, cada
una con su verificación RED → GREEN.

**Dependencias nuevas: ninguna.** No se agregan paquetes, migraciones ni
endpoints; solo Tailwind y elementos nativos, y no se toca `travelhub-app`.

---

## 8. Open Questions

Ninguna. La forma del componente queda fijada en §2.1 (componente nuevo espejo,
sin swatch), el contrato en §2.1/§2.2, el universo en §2.3 (citas del mes sin
filtrar), el estado y parseo en §2.4, el punto de filtrado y la composición AND
en §2.5, la URL única con ambos parámetros en §2.6, los handlers en §2.7, la
limpieza conjunta en §2.8 y la ausencia de colisión en §2.9. El único caso borde
(desmarcar el último servicio visible vuelve a "todos") es una consecuencia
documentada de la spec, no una decisión pendiente.
