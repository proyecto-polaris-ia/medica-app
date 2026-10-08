# Tasks: agregar-filtro-proveedores-calendario

Filtro multi-selección de proveedores en la vista de calendario de
`/appointments` (issue
[#174](https://github.com/proyecto-polaris-ia/medica-app/issues/174)).

Convención de estado: `[ ]` pendiente · `[x]` completo. TDD activo
(`openspec/config.yaml` → `strict_tdd: true`): cada comportamiento escribe
primero la prueba que falla (**RED**), luego la implementación mínima
(**GREEN**) y después triangula bordes; el refactor queda en verde.

Runner (decisión #21 de `design.md`): `npm test` → `vitest run --exclude
'tests/e2e/**'`. Las pruebas de este cambio son de UI con `fetch` mockeado: **no
requieren Supabase** ni datos locales. Comandos auxiliares: `npx tsc --noEmit` y
`npm run build`.

Anclas de línea (verificadas en este worktree, `design.md` §Contexto):
`app/(admin)/appointments/page.tsx` → `urlProviderFilter` (:138),
`providerFilter` (:156), `blocksByDay` (:168), `visibleProviders` (:182),
`clearFilters` (:336), filtrado de lista (:344, :354), toggle de vista (:415),
fila `CalendarNav` + `ProviderLegend` (:527-534), `MonthCalendar` (:675);
`app/(admin)/appointments/page.test.tsx` → mock de `next/navigation` (:6-8);
`src/components/admin/calendar/__tests__/MonthCalendar.test.tsx` → montaje de
`ProviderLegend` (:197-214) y aserción de swatches (:211).

Etiquetas de escenario: cada tarea cita los escenarios cubiertos del delta spec
`specs/appointments-calendar-view/spec.md` (§ MODIFIED `Provider color legend` y
§ ADDED `Filtrado multi-selección de proveedores en el calendario`).

---

## Fase 0 — Artefactos SDD (completado)

- [x] 0.1 `proposal.md` — alcance, impacto, riesgos (colisión de `providerId`),
  criterios de éxito y rollback plan del change del issue #174.
- [x] 0.2 `specs/appointments-calendar-view/spec.md` — delta con el requirement
  `MODIFIED` "Provider color legend" (4 escenarios) y el `ADDED` "Filtrado
  multi-selección de proveedores en el calendario" (11 escenarios); 15 en total.
- [x] 0.3 `design.md` — 21 decisiones numeradas con archivos de ancla, contrato
  de `ProviderLegend`, pipeline de filtrado, mecanismo de URL y estrategia de
  pruebas (mapeo escenario → test); cero open questions.
- [x] 0.4 `exploration.md` — inventario de la pantalla, precedente de URL
  (`MetricsRangeSelector`), hallazgo del mock de `next/navigation` y rationale de
  la Opción C.
- [x] 0.5 `tasks.md` — este plan.

---

## Fase 1 — Pruebas e infraestructura (RED)

Toda la cobertura nueva se escribe **antes** de la implementación: al cerrar esta
fase la suite focal debe fallar por comportamiento ausente (o no compilar por
props inexistentes), nunca por una aserción mal escrita.

### 1. Extender el mock de `next/navigation` (infraestructura de prueba)

Archivo: `app/(admin)/appointments/page.test.tsx` (modificar, mock en :6-8).

- [x] 1.1 Reemplazar el mock actual (`useSearchParams: () => new
  URLSearchParams()`) por el patrón de `app/(admin)/dashboard/page.test.tsx:4-7`
  usando `vi.hoisted`: exponer `replaceMock: vi.fn()` y un
  `searchParamsRef: { value: URLSearchParams }` reasignable, y mockear
  `next/navigation` con `useRouter: () => ({ replace: replaceMock, push:
  vi.fn(), refresh: vi.fn() })` y `useSearchParams: () => searchParamsRef.value`.
  Dejar `searchParamsRef.value = new URLSearchParams()` y
  `replaceMock.mockClear()` en el `beforeEach` del describe de integración
  (decisión #9, #10).
  - Cubre: base de las pruebas de "La selección se refleja en la URL y es
    deep-linkable" y "La lista conserva su filtro de proveedor de un solo valor".
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    la suite existente sigue en verde (solo cambia la infraestructura del mock).

### 2. RED — filtrado del calendario (página)

Archivo: `app/(admin)/appointments/page.test.tsx` (modificar). Reutilizar el
helper `buildAppointmentsFetch` para servir meses con A, B y C y `userEvent`
para el clic en la leyenda.

- [x] 2.1 Escribir las pruebas de filtrado: con la leyenda en "todos", activar la
  entrada de B deja visibles solo las citas de A (los bloques de B desaparecen);
  con A/B/C, desactivar B deja A y C visibles y B ausente. Asertar sobre el
  `aria-label`/texto de los bloques del mes, no sobre estado interno.
  - Cubre: "Seleccionar un proveedor muestra solo sus citas" y "Seleccionar
    varios proveedores muestra solo los elegidos".
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    falla (hoy `blocksByDay` consume `appointments` completo; la leyenda no es
    interactiva).
- [x] 2.2 Añadir la prueba de no-filtrado y de precedencia de agrupamiento: al
  volver a `[]` se restauran todas las citas y la leyenda muestra "Mostrando
  todos los proveedores"; y en un día con una cita de A a las 09:00 y una de B a
  las 11:00, filtrar A elimina el bloque de B **y** conserva el bloque de A en su
  franja horaria (no solo "en el día").
  - Cubre: "Sin selección se muestran todos los proveedores" y "El filtrado
    precede al agrupamiento por día".
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    falla.
- [x] 2.3 Añadir las pruebas de URL: tras seleccionar A y B, `replaceMock` recibe
  `/appointments?providerId=<A>,<B>` (ids unidos por coma, sin el grupo
  `(admin)`); deep link con `searchParamsRef.value = new
  URLSearchParams('providerId=<A>,<B>')` **antes** del `render` restaura la
  selección (`aria-pressed` y bloques filtrados); clic en "Limpiar filtros" deja
  todos los bloques visibles y llama `replaceMock` con `/appointments` (sin el
  parámetro); un clic que no cambia la selección efectiva **no** vuelve a llamar
  `replaceMock` (guard de reescritura redundante).
  - Cubre: "La selección se refleja en la URL y es deep-linkable" y
    ""Limpiar filtros" reinicia la selección del calendario".
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    falla.
- [x] 2.4 Añadir la prueba de ids desconocidos: deep link `providerId=<A>,desconocido`
  renderiza sin lanzar, la leyenda conserva el universo del mes (A y B siguen
  listados como controles) y el id desconocido no coincide con ningún bloque.
  - Cubre: "Ids desconocidos en la URL no rompen el calendario".
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    falla (o no compila hasta la Fase 2/3).

### 3. RED — precedencia con la lista y cambio de vista (página)

Archivo: `app/(admin)/appointments/page.test.tsx` (modificar).

- [x] 3.1 Probar la precedencia de `providerId` (decisión #5): con
  `searchParamsRef.value = new URLSearchParams('providerId=<A>')` (un solo
  valor), el `<select>` de proveedor de la vista de Lista queda en `<A>` y la
  lista muestra solo las citas de A; el filtro del calendario no altera ese
  valor. Con `providerId=<A>,<B>` (coma), la lista queda en "todos"
  (`providerFilter === ''`) y el parámetro **no** se reescribe.
  - Cubre: "La lista conserva su filtro de proveedor de un solo valor" y el
    trade-off registrado en `design.md` §2.1.
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    falla solo en el caso multi-valor (el single ya pasa hoy).
- [x] 3.2 Probar supervivencia al cambio de vista (decisión #6): con A y B
  seleccionados, alternar a Lista y volver a Calendario conserva la selección
  (`aria-pressed` y bloques filtrados) y `replaceMock` **no** recibe ninguna
  llamada adicional por el cambio de vista.
  - Cubre: "La selección sobrevive el cambio Lista ↔ Calendario".
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    falla.
- [x] 3.3 Probar el layout de la fila del calendario (decisión #18): el contenedor
  que agrupa `CalendarNav` + leyenda expone las clases `mb-4 flex flex-col gap-4
  sm:flex-row sm:items-center sm:justify-between` y "Limpiar filtros" solo existe
  cuando hay filtro activo (ausente con `[]`, presente con selección).
  - Cubre: "La fila de filtros es usable en móvil".
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    falla.
- [x] 3.4 Registrar la evidencia RED: correr
  `npx vitest run "app/(admin)/appointments/page.test.tsx"` y anotar el conteo de
  fallos y el mensaje representativo (p. ej. "Unable to find ... aria-pressed" /
  `replaceMock` no llamado) antes de tocar `page.tsx`.
  - Verificación: salida RED adjunta en el PR; ninguna prueba nueva en verde
    todavía.

### 4. RED — contrato de `ProviderLegend` y desbloqueo del montaje existente

Archivos: `src/components/admin/calendar/__tests__/ProviderLegend.test.tsx`
(nuevo) y `src/components/admin/calendar/__tests__/MonthCalendar.test.tsx`
(modificar, :197-214).

- [x] 4.1 Crear `src/components/admin/calendar/__tests__/ProviderLegend.test.tsx`
  (Vitest + Testing Library; el directorio ya existe, hoy solo con
  `MonthCalendar.test.tsx`; no necesita mocks de `next/navigation`): una entrada
  por proveedor con su swatch (`data-testid="legend-swatch"` conservado, decisión
  #17); clic en una entrada llama `onToggle` con el `id` y solo con el `id`;
  `aria-pressed="true"` cuando `selectedIds.length === 0` o cuando el id está en
  `selectedIds`, y `"false"` en caso contrario; entrada inactiva con
  `aria-pressed="false"`, swatch con `opacity-40` y etiqueta `text-gray-500`
  (atenuada pero legible, decisión #15); con `selectedIds={[]}` todas las
  entradas en `aria-pressed="true"` **y** el texto visible "Mostrando todos los
  proveedores"; con `selectedIds={['<B>']}` la leyenda sigue listando A y B (el
  universo del mes no se encoge, decisión #8 aplicada en el componente);
  `providers={[]}` → no renderiza nada (guard preservado).
  - Cubre: "Entrada de la leyenda alterna su estado", "Entrada deseleccionada
    atenuada pero legible", "Sin filtrado la leyenda comunica que se muestran
    todos" y "La leyenda conserva el universo del mes".
  - Verificación: `npx vitest run
    src/components/admin/calendar/__tests__/ProviderLegend.test.tsx` → falla
    (props `selectedIds`/`onToggle` inexistentes).
- [x] 4.2 Añadir la prueba de operabilidad por teclado (decisión #14): enfocar la
  entrada con `userEvent.tab()` (o `getByRole('button', { name: /<proveedor>/ })`
  y `focus()`), activarla con `{Enter}` y con `Espacio`, y verificar que
  `onToggle` se llama y que `aria-pressed` refleja el estado aplicado.
  - Cubre: "Los controles de filtrado son operables por teclado".
  - Verificación: `npx vitest run
    src/components/admin/calendar/__tests__/ProviderLegend.test.tsx` → falla.
- [x] 4.3 Actualizar el montaje existente en
  `src/components/admin/calendar/__tests__/MonthCalendar.test.tsx:197-214` para
  pasar las props nuevas (`selectedIds={[]}` y `onToggle={vi.fn()}`) **conservando
  intactas** las aserciones de color sobre `getAllByTestId('legend-swatch')`
  (:211, fondo `#1f77b4` y respaldo `#64748b`). Evita que el cambio de firma
  rompa la compilación de la suite existente (decisión #17).
  - Cubre: escenario "Entrada deseleccionada atenuada pero legible" en su
    variante de swatch/color por proveedor.
  - Verificación: `npx vitest run
    src/components/admin/calendar/__tests__/MonthCalendar.test.tsx` → falla por
    tipo/props (la firma nueva aún no existe).

---

## Fase 2 — Componente `ProviderLegend` (GREEN → TRIANGULATE → REFACTOR)

Archivo de implementación: `src/components/admin/calendar/ProviderLegend.tsx`
(modificar). El componente sigue **puro y presentacional**: sin estado, sin
lectura de URL y sin importar `next/navigation` (decisión #13).

### 5. GREEN del contrato

- [x] 5.1 Cambiar el contrato a `ProviderLegendProps = { providers:
  LegendProvider[]; selectedIds: string[]; onToggle: (id: string) => void }`
  conservando `LegendProvider = { id, name, color: string | null }` y el guard
  `if (providers.length === 0) return null;`.
  - Cubre: requisito `MODIFIED` "Provider color legend" (contrato de control).
  - Verificación: `npx vitest run
    src/components/admin/calendar/__tests__/MonthCalendar.test.tsx` → vuelve a
    compilar y pasa; `npx tsc --noEmit` sin errores.
- [x] 5.2 Convertir cada entrada en `<button type="button" aria-pressed={...}
  onClick={() => onToggle(provider.id)}>` (botón nativo → Enter/Espacio), con
  `aria-pressed = selectedIds.length === 0 ? true : selectedIds.includes(id)`
  (decisión #14), conservando `data-testid="legend-swatch"` en el `<span>`
  interno del color (decisión #17).
  - Cubre: "Entrada de la leyenda alterna su estado", "Los controles de filtrado
    son operables por teclado".
  - Verificación: `npx vitest run
    src/components/admin/calendar/__tests__/ProviderLegend.test.tsx` → las
    pruebas de toggle/`aria-pressed`/teclado pasan.
- [x] 5.3 Aplicar las clases exactas de `design.md` §2.5: activa `inline-flex
  items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2 py-1
  text-sm font-medium text-gray-700 transition hover:bg-gray-50`; inactiva
  `inline-flex items-center gap-1.5 rounded-md border border-transparent
  bg-transparent px-2 py-1 text-sm text-gray-500 transition hover:bg-gray-50`;
  `opacity-40` **solo** en el swatch (decisión #15, mantiene contraste AA ≈ 4.8:1
  en la etiqueta). Conservar el contenedor `mt-4 flex flex-wrap items-center
  gap-3` y la etiqueta `Proveedores:` existente.
  - Cubre: "Entrada deseleccionada atenuada pero legible".
  - Verificación: `npx vitest run
    src/components/admin/calendar/__tests__/ProviderLegend.test.tsx` → pasa.

### 6. GREEN del anclaje textual de "todos"

- [x] 6.1 Renderizar el texto visible `Mostrando todos los proveedores` cuando
  `selectedIds.length === 0` (decisión #16), reutilizando el contenedor y la
  etiqueta `text-sm font-medium text-gray-700` ya presentes; no mostrarlo cuando
  hay selección activa.
  - Cubre: "Sin filtrado la leyenda comunica que se muestran todos".
  - Verificación: `npx vitest run
    src/components/admin/calendar/__tests__/ProviderLegend.test.tsx` → pasa.

### 7. TRIANGULATE / REFACTOR del componente

- [x] 7.1 Triangular los bordes del contrato: `selectedIds` con un id que **no**
  está en `providers` no altera `aria-pressed` de las entradas existentes y no
  lanza; `selectedIds` con varios ids deja presionadas solo esas entradas;
  `providers` vacío → `null` sin texto "Mostrando todos los proveedores".
  - Cubre: "Ids desconocidos en la URL no rompen el calendario" (a nivel
    componente) y "La leyenda conserva el universo del mes".
  - Verificación: `npx vitest run
    src/components/admin/calendar/__tests__/ProviderLegend.test.tsx` → sigue en
    verde con los casos nuevos.
- [x] 7.2 REFACTOR: extraer el cálculo de `isActive` y las clases a expresiones
  con nombre legible, sin cambiar el contrato ni los `data-testid`.
  - Verificación: `npx vitest run
    src/components/admin/calendar/__tests__/ProviderLegend.test.tsx` → sigue en
    verde.

---

## Fase 3 — Integración en la página (GREEN de `app/(admin)/appointments/page.tsx`)

Archivo de implementación: `app/(admin)/appointments/page.tsx` (modificar).
Archivo de prueba: `app/(admin)/appointments/page.test.tsx` (extendido en la
Fase 1). Ninguna tarea de esta fase toca `providerFilter` (:156),
`filteredAndSortedAppointments` (:344-391), `clearFilters` (:336) ni
`hasActiveFilters` (:393).

### 8. Estado del calendario y parseo (decisiones #2, #3, #5, #10)

- [x] 8.1 Añadir `parseProviderIds(raw: string | null | undefined): string[]`
  (helper de módulo) que parte por coma, recorta espacios y descarta segmentos
  vacíos y el literal `'all'` — el `'all'` se tolera **solo al parsear**; el
  estado interno nunca lo escribe (decisión #3).
  - Cubre: "La selección se refleja en la URL y es deep-linkable" (lado lectura).
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    las pruebas de deep link avanzan; `npx tsc --noEmit` sin errores.
- [x] 8.2 Añadir `const [calendarProviderFilter, setCalendarProviderFilter] =
  useState<string[]>(parseProviderIds(searchParams?.get('providerId')))` junto a
  los estados existentes (:155-161), sin tocar `providerFilter` (decisión #2);
  la inicialización única desde la URL es la que implementa el deep link, sin
  `useEffect` (decisión #10).
  - Cubre: "La selección se refleja en la URL y es deep-linkable".
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    falla solo por el filtrado/URL aún no aplicados; el deep link de
    `aria-pressed` pasa.
- [x] 8.3 Endurecer la lectura de la **lista** (decisión #5):
  `const rawProviderId = searchParams?.get('providerId') ?? '';` y
  `const urlProviderFilter = rawProviderId && !rawProviderId.includes(',') ?
  rawProviderId : undefined;` alimentando el `useState` existente de
  `providerFilter` (:156). Con `providerId` de un solo valor la lista se comporta
  igual que hoy; con `a,b` queda en "todos" sin reescribir el parámetro.
  - Cubre: "La lista conserva su filtro de proveedor de un solo valor".
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    las dos pruebas de precedencia de 3.1 en verde.

### 9. Pipeline de filtrado (decisiones #4, #7, #8)

- [x] 9.1 Crear el `useMemo` `calendarAppointments` **antes** de `blocksByDay`
  (:168) con el guard literal `if (calendarProviderFilter.length === 0) return
  appointments;` y, en caso contrario, filtrar con un `Set` de ids seleccionados
  (`appointments.filter((a) => selected.has(a.providerId))`). Dependencias:
  `[appointments, calendarProviderFilter]` (decisiones #4, #7).
  - Cubre: "Seleccionar un proveedor muestra solo sus citas", "Seleccionar varios
    proveedores muestra solo los elegidos", "Sin selección se muestran todos los
    proveedores".
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    las pruebas de filtrado de 2.1/2.2 avanzan.
- [x] 9.2 Cambiar la fuente de `blocksByDay` de `appointments` a
  `calendarAppointments` (en el `.map()` y en las dependencias), sin alterar el
  enriquecido ni `groupAppointmentsByDay(enriched, providerColor)`.
  - Cubre: "El filtrado precede al agrupamiento por día".
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    la prueba de franja horaria de 2.2 en verde.
- [x] 9.3 Confirmar por lectura y por prueba que `visibleProviders` (:182-185)
  **no cambia**: sigue derivando de `appointments` sin filtrar, de modo que un
  proveedor deseleccionado permanece como control reactivable (decisión #8).
  - Cubre: "La leyenda conserva el universo del mes" y "Ids desconocidos en la
    URL no rompen el calendario".
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    la prueba de ids desconocidos de 2.4 en verde.

### 10. Escritura de URL y alternancia (decisiones #9, #11)

- [x] 10.1 Importar `useRouter` junto a `useSearchParams` (:5), instanciar
  `const router = useRouter();` y añadir el handler `applyCalendarFilter` con
  `useCallback`: calcula `nextKey = next.join(',')`, retorna temprano si
  `nextKey === calendarProviderFilter.join(',')` (guard de reescritura
  redundante), aplica `setCalendarProviderFilter(next)` y llama
  `router.replace(next.length > 0 ? \`/appointments?providerId=${nextKey}\` :
  '/appointments')` — **sin** `useEffect` (decisión #9, ruta de decisión #11).
  - Cubre: "La selección se refleja en la URL y es deep-linkable",
    ""Limpiar filtros" reinicia la selección del calendario".
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    las pruebas de `replaceMock` de 2.3 en verde.
- [x] 10.2 Añadir `toggleCalendarProvider(id: string)`: calcular el conjunto
  visible efectivo (`calendarProviderFilter.length === 0 ? visibleProviders.map(
  (p) => p.id) : calendarProviderFilter`), quitar el id si está, agregarlo si no,
  y normalizar a `[]` cuando el resultado cubre todos los ids
  (`applyCalendarFilter(next.length === allIds.length ? [] : next)`). Documentar
  en el código el caso borde aceptado: desmarcar el último proveedor visible
  vuelve a "todos" (trade-off de `design.md` §2.5).
  - Cubre: "Entrada de la leyenda alterna su estado", "Sin selección se muestran
    todos los proveedores".
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    las pruebas de alternancia de 2.1 en verde.
- [x] 10.3 Verificar que el cambio de vista no escribe en la URL (decisión #6):
  `setView('list')` / `setView('calendar')` (:415) se mantienen tal cual, sin
  llamadas a `applyCalendarFilter` ni a `router.replace`, y sin
  `useEffect` que proyecte `providerId` sobre `providerFilter` o viceversa.
  - Cubre: "La selección sobrevive el cambio Lista ↔ Calendario".
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    la prueba de cambio de vista de 3.2 en verde y `replaceMock` sin llamadas
    extra.

### 11. Limpiar filtros y layout (decisiones #12, #18)

- [x] 11.1 Renderizar el botón "Limpiar filtros" **solo** cuando
  `calendarProviderFilter.length > 0`, con las clases del botón de limpieza de la
  lista (:433-440) `text-sm text-blue-600 hover:text-blue-800` y
  `onClick={() => applyCalendarFilter([])}`. No confundir con `clearFilters`
  (:336) ni con `hasActiveFilters` (:393), que son de la vista de lista.
  - Cubre: ""Limpiar filtros" reinicia la selección del calendario".
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    las pruebas de "Limpiar filtros" de 2.3 y 3.3 en verde.
- [x] 11.2 Cambiar la fila del calendario (:527-534) a `mb-4 flex flex-col gap-4
  sm:flex-row sm:items-center sm:justify-between` y agrupar leyenda + botón en
  `flex flex-wrap items-center gap-3`; pasar a `ProviderLegend` las props
  `providers={visibleProviders}`, `selectedIds={calendarProviderFilter}` y
  `onToggle={toggleCalendarProvider}` (decisiones #18 y contrato #13).
  - Cubre: "La fila de filtros es usable en móvil" y "Los controles de filtrado
    son operables por teclado".
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    la prueba de clases de 3.3 en verde; `npx tsc --noEmit` sin errores.

### 12. TRIANGULATE / REFACTOR de la página

- [x] 12.1 Triangular los bordes de integración: deep link con centinela
  (`providerId=all`) se parsea a `[]` y muestra todos; deep link con ids
  desconocidos no rompe y deja el calendario usable; alternar dos entradas
  consecutivas produce llamadas a `replace` con la unión en orden de selección y
  sin repetir la última; "Limpiar filtros" con `[]` no renderiza el botón.
  - Cubre: "Sin selección se muestran todos los proveedores", "Ids desconocidos
    en la URL no rompen el calendario", ""Limpiar filtros" reinicia la selección
    del calendario".
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    sigue en verde con los casos nuevos.
- [x] 12.2 REFACTOR: extraer a helpers con nombre el armado del siguiente arreglo
  y la escritura de la URL, manteniendo las dependencias de los `useMemo` y
  `useCallback` mínimas y estables; sin cambiar comportamiento observable.
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    sigue en verde.

---

## Fase 4 — Verificación

- [x] 13.1 Ejecutar la suite focal completa del change:
  `npx vitest run "app/(admin)/appointments/page.test.tsx"
  src/components/admin/calendar/__tests__/` → todo en verde.
- [x] 13.2 Ejecutar la suite completa: `npm test` → en verde (o registrar
  cualquier fallo preexistente ajeno al cambio; `strict_tdd: true` exige suite
  verde al cierre).
- [x] 13.3 Ejecutar el typecheck: `npx tsc --noEmit` → sin errores.
- [x] 13.4 Ejecutar el build: `npm run build` → sin errores.
  - Nota: build en verde (exit 0); evidencia en `verify-report.md` §1 fila 4 y §7.
- [x] 13.5 Trazabilidad de escenarios: confirmar el mapeo de los **15**
  escenarios del delta spec a pruebas que pasan (4 del requirement `MODIFIED`
  "Provider color legend"; 11 del `ADDED` "Filtrado multi-selección de
  proveedores en el calendario") y anotar la evidencia en el PR.
- [x] 13.6 Invariantes verificados por lectura y por diff: (a) `package.json`
  **sin cambios** y ninguna dependencia nueva (decisión #19); (b) `loadData`
  (:187-227) sin consultas ni endpoints nuevos, el calendario sigue cargando solo
  el mes visible (decisión #20); (c) `providerFilter` (:156),
  `filteredAndSortedAppointments` (:344-391), `clearFilters` (:336) y
  `hasActiveFilters` (:393) sin cambios (escenario "La lista conserva su filtro
  de proveedor de un solo valor"); (d) nada dentro de `travelhub-app` fue
  tocado; (e) `npm test` es el runner usado (decisión #21), sin cambios de
  configuración de Vitest.
- [x] 13.7 Registro de cierre: añadir el mapeo escenario → archivo de prueba,
  los comandos ejecutados y su salida al `verify-report.md` de la fase Verify.
  - Nota: `verify-report.md` creado en esta carpeta (mapeo 15/15 en §2, comandos en §1).

---

## Workload forecast

- **Tareas:** **43 checkboxes** en 5 grupos (Fase 0: 5 artefactos SDD, ya
  completados; Fase 1: 12 de infraestructura de prueba y RED; Fase 2: 6 del
  componente `ProviderLegend`; Fase 3: 13 de integración en la página; Fase 4: 7
  de verificación).
- **Archivos estimados: 6** (2 nuevos, 4 modificados), contando cada archivo una
  sola vez:
  - **Nuevos (2):** `src/components/admin/calendar/__tests__/ProviderLegend.test.tsx`,
    `openspec/changes/agregar-filtro-proveedores-calendario/tasks.md` (este
    archivo).
  - **Modificados (4):** `src/components/admin/calendar/ProviderLegend.tsx`,
    `src/components/admin/calendar/__tests__/MonthCalendar.test.tsx` (solo el
    montaje :197-214), `app/(admin)/appointments/page.tsx`,
    `app/(admin)/appointments/page.test.tsx`.
  - **Sin cambios:** `providerFilter` y el `<select>` de la lista, `package.json`,
    migraciones, API y `travelhub-app`.
- **Tamaño de diff aproximado: ~300–450 líneas** de código y pruebas (excluyendo
  este `tasks.md`): `ProviderLegend.tsx` ~50–70; `page.tsx` ~80–120;
  `ProviderLegend.test.tsx` ~120–160; `page.test.tsx` ~120–180;
  `MonthCalendar.test.tsx` ~5.
- **Tests existentes y ejecutables:** sí. `npm test` → `vitest run --exclude
  'tests/e2e/**'` (Vitest + Testing Library + `userEvent`); los focales son
  `npx vitest run "app/(admin)/appointments/page.test.tsx"` y `npx vitest run
  src/components/admin/calendar/__tests__/`. No requieren Supabase ni datos
  locales: `fetch` va mockeado. Comandos adicionales: `npx tsc --noEmit`,
  `npm run build` (y `npm run lint` como `eslint .`, disponible pero no exigido
  por `design.md`).
- **Riesgo de runner:** ninguno nuevo; no hay migraciones, base de datos ni
  escrituras, así que no se necesita `supabase start` en ninguna tarea.
- **Riesgo de tamaño de review: medio.** ~300–450 líneas queda pegado al umbral
  de ~400 líneas de `chained-pr`. Si el diff real excede las 400 líneas, el punto
  de corte ya está fijado por fase: **PR 1** = Fases 1–2 (infraestructura de
  prueba + componente `ProviderLegend` + sus suites, sin tocar `page.tsx`);
  **PR 2** = Fases 3–4 (integración en `page.tsx`, precedencia con la lista y
  verificación), apilado sobre PR 1. Ambos cortes son verificables de forma
  independiente (`npx vitest run src/components/admin/calendar/__tests__/` y
  `npx vitest run "app/(admin)/appointments/page.test.tsx"`).
- **Riesgo de acoplamiento:** la actualización del montaje de `ProviderLegend`
  en `MonthCalendar.test.tsx` (tarea 4.3) y la firma nueva del componente (5.1)
  deben entrar en la **misma unidad revisable**; separarlas rompe la compilación
  de la suite.

## Decision needed before apply

**Decision needed before apply: No.**

Estrategia de cadena recomendada: **PR único** (`feat/agregar-filtro-proveedores-calendario`
sobre `main`). El change es un solo rebanado coherente — un componente
presentacional, una página y sus pruebas — de ~300–450 líneas, sin migraciones,
sin API y sin dependencias; partirlo por la mitad obligaría a dejar el
`ProviderLegend` con la firma nueva y un consumidor sin actualizar en el mismo
árbol. `design.md` declara **cero open questions**: el contrato de la leyenda
(§2.5), la representación de "todos" (`[]`, §2.2), el punto de filtrado (§2.3),
el mecanismo de URL sin efecto (§2.4) y la precedencia de `providerId` (§2.1)
quedan fijados. El único caso borde (desmarcar el último proveedor visible vuelve
a "todos") está documentado como consecuencia de la spec, no como decisión
pendiente. Si el diff final rebasa las 400 líneas, el corte ya está definido en
el Workload Forecast (Fases 1–2 / Fases 3–4) y no requiere una decisión nueva del
humano.
