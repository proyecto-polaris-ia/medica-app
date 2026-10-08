# Tasks: agregar-filtro-servicios-calendario

Filtro multi-selección de servicios en la vista de calendario de
`/appointments` (issue
[#177](https://github.com/proyecto-polaris-ia/medica-app/issues/177)).

Convención de estado: `[ ]` pendiente · `[x]` completo. TDD activo
(`openspec/config.yaml` → `strict_tdd: true`): cada comportamiento escribe
primero la prueba que falla (**RED**), luego la implementación mínima
(**GREEN**) y después triangula bordes; el refactor queda en verde.

Runner (decisión #24 de `design.md`): `npm test` → `vitest run --exclude
'tests/e2e/**'`. Las pruebas de este cambio son de UI con `fetch` mockeado: **no
requieren Supabase** ni datos locales. Comandos auxiliares: `npx tsc --noEmit`,
`npm run lint` y `npm run build`.

Anclas de línea (verificadas en este worktree, `design.md` §Contexto y
`exploration.md`):
`app/(admin)/appointments/page.tsx` → `parseProviderIds` (:139),
`nextCalendarSelection` (:148), `calendarFilterUrl` (:158),
`serviceFilter` de lista (:186), `calendarProviderFilter` (:189-191),
`calendarAppointments` (:203-208), `blocksByDay` (:210-223),
`visibleProviders` (:224-227), `applyCalendarFilter` (:232-241),
`toggleCalendarProvider` (:243-252), `refName` (:385), filtrado de lista
(:414-416), deps de lista (:458), `hasActiveFilters` (:460), `<select>` de
servicio de lista (:520-534), fila del calendario (:593-615),
`<ProviderLegend>` (:601-605), botón "Limpiar filtros" (:606-614);
`app/(admin)/appointments/page.test.tsx` → mock `vi.hoisted`
(`replaceMock`, `searchParamsRef`) (:6-13), `CAL_SERVICE` (:469),
`calAppointment` (:479-499), `buildCalendarFetch` (:504-517), describe de
proveedores (:542-550), suites de URL/limpieza/responsiva
(:648-666, :684-703, :706-724, :821-847, :850-905); control actual
`src/components/admin/calendar/ProviderLegend.tsx`.

Etiquetas de escenario: cada tarea cita los escenarios cubiertos del delta spec
`specs/appointments-calendar-view/spec.md` (§ MODIFIED `Filtrado multi-selección
de proveedores en el calendario`, 12 escenarios, y § ADDED `Filtrado
multi-selección de servicios en el calendario`, 16 escenarios; 28 en total).
Cada tarea referencia además las decisiones numeradas (`D#`) de `design.md` §3
que implementa o verifica.

---

## Fase 0 — Artefactos SDD (completado)

- [x] 0.1 `proposal.md` — alcance, impacto, riesgos (composición de URL,
  colisión de `serviceId`, cambio de contrato de "Limpiar filtros" de #174),
  criterios de éxito y rollback plan del change del issue #177.
- [x] 0.2 `specs/appointments-calendar-view/spec.md` — delta con el requirement
  `MODIFIED` "Filtrado multi-selección de proveedores en el calendario"
  (12 escenarios, incluida la limpieza de ambos filtros) y el `ADDED` "Filtrado
  multi-selección de servicios en el calendario" (16 escenarios); 28 en total.
- [x] 0.3 `design.md` — 24 decisiones numeradas con archivos de ancla, opción C
  de componente (`ServiceFilter.tsx`), pipeline de filtrado AND, mecanismo de
  URL con dos parámetros y estrategia de pruebas (mapeo escenario → test);
  cero open questions.
- [x] 0.4 `exploration.md` — inventario de la pantalla, precedente de
  `ProviderLegend`, precedente de URL (`MetricsRangeSelector`), ausencia de
  `color` en `Service` y hallazgo del mock de `next/navigation`.
- [x] 0.5 `tasks.md` — este plan.

---

## Fase 1 — Pruebas e infraestructura (RED)

Toda la cobertura nueva se escribe **antes** de la implementación: al cerrar esta
fase la suite focal debe fallar por comportamiento ausente (o no compilar por
props inexistentes), nunca por una aserción mal escrita.

### 1. Reutilizar el mock de `next/navigation` y extender fixtures (infraestructura de prueba)

Archivo: `app/(admin)/appointments/page.test.tsx` (modificar solo helpers de
fixture; **no** el mock).

- [x] 1.1 Confirmar y **reutilizar sin cambios** el mock `vi.hoisted` existente
  (`replaceMock`, `searchParamsRef`) en `app/(admin)/appointments/page.test.tsx`
  (:6-13): **no alterar su forma** (`vi.mock('next/navigation', …)`, `useRouter:
  () => ({ replace: replaceMock, push: vi.fn(), refresh: vi.fn() })`,
  `useSearchParams: () => searchParamsRef.value`). Para deep links, reasignar
  `searchParamsRef.value = new URLSearchParams('serviceId=…')` **antes** del
  `render`; en el `beforeEach` del describe de servicios dejar
  `searchParamsRef.value = new URLSearchParams()` y `replaceMock.mockClear()`
  (mismo patrón de :547-548) (D9, D11, §6.2).
  - Cubre: base de "La selección de servicios se refleja en la URL y es
    deep-linkable" y "La URL compone la selección de servicios con la de
    proveedores".
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    la suite de proveedores de #174 sigue en verde (solo se reutiliza el mock).
- [x] 1.2 Extender los fixtures **sin tocar el mock**: reemplazar
  `CAL_SERVICE` (:469) por `CAL_SERVICES` con al menos `service-1 Limpieza`,
  `service-2 Ortodoncia` y `service-3 Revisión`; añadir el parámetro
  `services` a `buildCalendarFetch` (:504-517, hoy hardcodea
  `services: [CAL_SERVICE]` en :519) y el parámetro `serviceId` (default
  `CAL_SERVICE.id`) a `calAppointment` (:479-499, hoy hardcodea
  `serviceId: CAL_SERVICE.id` en :489). Conservar los defaults para que las
  pruebas de #174 sigan sirviendo el mes de un solo servicio (D12, §6.2).
  - Cubre: base de "Seleccionar varios servicios muestra solo los elegidos" y
    "El filtro de servicios se compone con AND con el de proveedores".
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    la suite de proveedores de #174 sigue en verde (fixtures retrocompatibles).

### 2. RED — contrato del componente `ServiceFilter`

Archivo nuevo:
`src/components/admin/calendar/__tests__/ServiceFilter.test.tsx` (el directorio
ya existe, hoy con `MonthCalendar.test.tsx` y `ProviderLegend.test.tsx`; no
necesita mocks de `next/navigation`). Monta
`src/components/admin/calendar/ServiceFilter.tsx` (aún inexistente → RED por
módulo ausente / props inexistentes).

- [x] 2.1 Probar el contrato y el estado presionado: una entrada por servicio
  con su nombre; clic en una entrada llama `onToggle` con el `id` y **solo** con
  el `id`; `aria-pressed="true"` cuando `selectedIds.length === 0` (todos
  visibles) o cuando el id está en `selectedIds`, y `"false"` en caso contrario;
  con `selectedIds={[]}` aparece el texto visible
  `Mostrando todos los servicios` y todas las entradas quedan
  `aria-pressed="true"`; `services={[]}` → no renderiza nada (guard) sin el
  texto de "todos" (D2, D3, D6, D12).
  - Cubre: "Sin filtrado de servicios el control comunica que se muestran todos"
    y "El control de servicios conserva el universo del mes".
  - Verificación: `npx vitest run
    src/components/admin/calendar/__tests__/ServiceFilter.test.tsx` → falla
    (módulo/props inexistentes).
- [x] 2.2 Probar que las entradas son **solo nombre**: la entrada no renderiza
  swatch (`queryByTestId('legend-swatch')` nulo), no expone
  `style={{ backgroundColor }}` ni ningún nodo de color, y las clases del
  estado son exactamente las de `design.md` §3 D4: activa con `text-gray-700
  font-medium` y borde `border-gray-300`; inactiva con `text-gray-500` y sin
  borde/fondo (`border-transparent bg-transparent`) (D4, D5, D6).
  - Cubre: "Las entradas del control de servicios son solo nombre".
  - Verificación: `npx vitest run
    src/components/admin/calendar/__tests__/ServiceFilter.test.tsx` → falla.
- [x] 2.3 Probar la operabilidad por teclado: enfocar la entrada (por rol
  `button` y nombre, o `userEvent.tab()`) y activarla con `{Enter}` y con
  `{Espacio}`; verificar que `onToggle` se llama y que `aria-pressed` refleja el
  estado anunciado (D3).
  - Cubre: "Los controles de servicios son operables por teclado".
  - Verificación: `npx vitest run
    src/components/admin/calendar/__tests__/ServiceFilter.test.tsx` → falla.
- [x] 2.4 Registrar la evidencia RED del componente: correr
  `npx vitest run src/components/admin/calendar/__tests__/ServiceFilter.test.tsx`
  y anotar el error representativo (p. ej. "Failed to resolve import …
  ServiceFilter") antes de crear el archivo.
  - Verificación: salida RED adjunta en el PR; ningún test nuevo en verde.

### 3. RED — filtrado de servicios en la página

Archivo: `app/(admin)/appointments/page.test.tsx` (modificar). Nuevo
`describe('/appointments calendar service filter')`, espejo del describe de
proveedores (:542), con fixture multi-servicio de la tarea 1.2 y `userEvent`.

- [x] 3.1 Probar selección simple/múltiple y no-selección: con X/Y en el mes,
  seleccionar Y deja solo el bloque de Y y elimina el de X; con X/Y/Z,
  desactivar Y deja X y Z y elimina Y; desmarcar hasta `[]` restaura todo y
  muestra `Mostrando todos los servicios`. Asertar sobre el `aria-label`/nombre
  de los bloques del mes (el `aria-label` de `DayCell` incluye el nombre del
  servicio), no sobre estado interno (D3, D9, D13, D14).
  - Cubre: "Seleccionar un servicio muestra solo sus citas", "Seleccionar varios
    servicios muestra solo los elegidos" y "Sin selección se muestran todos los
    servicios".
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    falla (hoy el calendario no tiene filtro de servicios).
- [x] 3.2 Probar la composición AND y la precedencia sobre el agrupamiento: con
  las citas X/A, X/B e Y/A, seleccionar X y A deja solo X/A y elimina X/B e Y/A;
  en un día con X/A a las 09:00 y Y/B a las 11:00, filtrar X **y** A deja solo
  la franja de 09:00 y elimina la de 11:00 (no solo "en el día") (D13, D14).
  - Cubre: "El filtro de servicios se compone con AND con el de proveedores" y
    "El filtrado de servicios precede al agrupamiento por día".
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    falla.
- [x] 3.3 Probar la URL y el deep link: tras seleccionar X y Y, `replaceMock`
  recibe `/appointments?serviceId=service-1,service-2` (ids unidos por coma, sin
  el grupo `(admin)`); deep link con `searchParamsRef.value = new
  URLSearchParams('serviceId=service-1,service-2')` **antes** del `render`
  restaura la selección (`aria-pressed`) y los bloques filtrados; al seleccionar
  X/Y **y** A la URL es
  `/appointments?providerId=prov-a&serviceId=service-1,service-2`
  (**`providerId` primero**, `serviceId` después) y el deep link con ambos
  parámetros restaura ambos filtros (D11, D15, D17).
  - Cubre: "La selección de servicios se refleja en la URL y es deep-linkable" y
    "La URL compone la selección de servicios con la de proveedores".
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    falla.
- [x] 3.4 Probar la supervivencia al cambio de vista: con X/Y y A
  seleccionados, alternar a Lista y volver a Calendario conserva ambos filtros
  (`aria-pressed` y bloques filtrados) y `replaceMock` **no** recibe llamadas
  adicionales por el cambio de vista (sin `useEffect` que proyecte la URL)
  (D11, §2.6).
  - Cubre: "La selección de servicios sobrevive el cambio Lista ↔ Calendario".
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    falla.
- [x] 3.5 Probar "Limpiar filtros" con ambos ejes y su renderizado condicional:
  con proveedor y servicio activos, el botón escribe `/appointments` en **una
  sola** llamada a `replaceMock` y muestra todas las citas; **sin** ningún
  filtro el botón no existe; con **solo** servicio activo el botón aparece; con
  **solo** proveedor activo el botón aparece (D16, D18).
  - Cubre: "La misma acción \"Limpiar filtros\" deja el filtro de servicios en
    \"todos\"", "\"Limpiar filtros\" reinicia ambos filtros del calendario" y
    "El botón \"Limpiar filtros\" se muestra cuando cualquiera de los filtros
    está activo".
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    falla.
- [x] 3.6 Probar la coexistencia con la lista, los ids desconocidos y la
  responsividad: con `searchParamsRef.value = new
  URLSearchParams('serviceId=service-1,service-2')` y una selección de
  calendario, el `<select>` de servicio de la Lista sigue en `''`/"Todos" y
  filtra por su propio valor sin reescribir `serviceId`; deep link
  `serviceId=service-1,desconocido` renderiza sin lanzar, el id desconocido no
  coincide con ningún bloque y el control conserva el universo del mes; la fila
  del calendario conserva `mb-4 flex flex-col gap-4 sm:flex-row sm:items-center
  sm:justify-between` y ambos controles (leyenda + `ServiceFilter`) son visibles
  (D19, D20, D21).
  - Cubre: "La lista conserva su filtro de servicio de un solo valor", "Ids
    desconocidos en la URL no rompen el calendario" y "La fila de filtros con el
    control de servicios es usable en móvil".
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    falla.
- [x] 3.7 Probar el centinela de URL `serviceId=all`: deep link
  `searchParamsRef.value = new URLSearchParams('serviceId=all')` se parsea a
  `[]` (todos), muestra todas las citas y **no** deja el control con una entrada
  "all" (D9, D10).
  - Cubre: "Sin selección se muestran todos los servicios".
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    falla.
- [x] 3.8 Registrar la evidencia RED de la página: correr
  `npx vitest run "app/(admin)/appointments/page.test.tsx"` y anotar el conteo de
  fallos y el mensaje representativo (p. ej. "Unable to find role button name
  /Ortodoncia/" o `replaceMock` no llamado) antes de tocar `page.tsx`.
  - Verificación: salida RED adjunta en el PR; ninguna prueba nueva en verde.

### 4. Proteger las pruebas exactas de #174 (acoplamiento explícito)

Archivo: `app/(admin)/appointments/page.test.tsx` (sin cambios de aserción; solo
verificación).

- [x] 4.1 Confirmar que las pruebas de #174 siguen válidas y en verde **sin
  editar sus aserciones**: la URL exacta con solo proveedores se mantiene
  `/appointments?providerId=prov-a,prov-b` (:648-666, :869-905); "Limpiar
  filtros" sigue esperando `/appointments` (:684-703) y ahora se lee como
  "limpia ambos"; la responsiva (:821-847) sigue esperando ausencia del botón
  sin filtros y presencia al activar un proveedor. El orden determinista
  `providerId` antes que `serviceId` (D17) es lo que **preserva** estas
  aserciones: si `serviceId` quedara primero, se romperían.
  - Cubre: "La selección se refleja en la URL y es deep-linkable" y "La lista
    conserva su filtro de proveedor de un solo valor" (forma exacta de URL).
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    las aserciones exactas de #174 permanecen verdes tras la integración
    (Fase 3); cualquier cambio a una prueba de #174 exige justificarlo en el PR.
  - **Nota de acoplamiento:** esta tarea depende de que `calendarFilterUrl`
    omita `serviceId` cuando la selección de servicios es `[]` (D15) **y** de
    que el orden sea `providerId`→`serviceId` (D17). Cualquier refactor posterior
    debe re-ejecutar esta verificación.

---

## Fase 2 — Componente `ServiceFilter` (GREEN → TRIANGULATE → REFACTOR)

Archivo de implementación:
`src/components/admin/calendar/ServiceFilter.tsx` (nuevo). Componente **puro y
presentacional**: sin estado, sin lectura de URL y sin importar
`next/navigation` (D1, D2, opción C de `design.md` §1).

### 5. GREEN del contrato

- [x] 5.1 Crear `src/components/admin/calendar/ServiceFilter.tsx` con
  `FilterService = { id: string; name: string }` y el contrato
  `ServiceFilterProps = { services: FilterService[]; selectedIds: string[];
  onToggle: (id: string) => void }`, incluyendo el guard `if (services.length
  === 0) return null;` (D1, D2).
  - Cubre: requisito `ADDED` "Filtrado multi-selección de servicios en el
    calendario" (contrato del control).
  - Verificación: `npx vitest run
    src/components/admin/calendar/__tests__/ServiceFilter.test.tsx` → las
    pruebas del guard y el montaje avanzan; `npx tsc --noEmit` sin errores.
- [x] 5.2 Convertir cada entrada en `<button type="button"
  aria-pressed={isActive} onClick={() => onToggle(service.id)}>` con
  `isActive = selectedIds.length === 0 || selectedIds.includes(service.id)`
  (botón nativo → Enter/Espacio) (D3).
  - Cubre: "Sin filtrado de servicios el control comunica que se muestran
    todos" y "Los controles de servicios son operables por teclado".
  - Verificación: `npx vitest run
    src/components/admin/calendar/__tests__/ServiceFilter.test.tsx` → las
    pruebas de toggle/`aria-pressed`/teclado pasan.
- [x] 5.3 Aplicar las clases exactas de `design.md` §3 D4: activa `inline-flex
  items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2 py-1
  text-sm font-medium text-gray-700 transition hover:bg-gray-50`; inactiva
  `inline-flex items-center gap-1.5 rounded-md border border-transparent
  bg-transparent px-2 py-1 text-sm text-gray-500 transition hover:bg-gray-50`.
  Mantener la etiqueta contenedora `Servicios:` y el contenedor
  `mt-4 flex flex-wrap items-center gap-3` (D4, D5).
  - Cubre: "Las entradas del control de servicios son solo nombre".
  - Verificación: `npx vitest run
    src/components/admin/calendar/__tests__/ServiceFilter.test.tsx` → pasa.
- [x] 5.4 Renderizar el texto visible `Mostrando todos los servicios` cuando
  `selectedIds.length === 0`, con la etiqueta `text-sm font-medium
  text-gray-700`; **no** mostrarlo con selección activa (D6).
  - Cubre: "Sin filtrado de servicios el control comunica que se muestran
    todos".
  - Verificación: `npx vitest run
    src/components/admin/calendar/__tests__/ServiceFilter.test.tsx` → pasa.
- [x] 5.5 Confirmar la **ausencia de swatch** y de color: ninguna entrada
  renderiza `data-testid="legend-swatch"` ni `style={{ backgroundColor }}`; la
  diferencia activo/inactivo es solo de etiqueta/borde (D5).
  - Cubre: "Las entradas del control de servicios son solo nombre".
  - Verificación: `npx vitest run
    src/components/admin/calendar/__tests__/ServiceFilter.test.tsx` → pasa.

### 6. TRIANGULATE / REFACTOR del componente

- [x] 6.1 Triangular los bordes del contrato: `selectedIds` con un id que
  **no** está en `services` no altera `aria-pressed` de las entradas existentes
  y no lanza; `selectedIds` con varios ids deja presionadas solo esas entradas;
  `services` vacío → `null` sin texto "Mostrando todos los servicios"; un
  `selectedIds` que cubre todos los ids no muestra el texto de "todos"
  (porque `length > 0`) (D3, D5, D6, D12).
  - Cubre: "El control de servicios conserva el universo del mes" e "Ids
    desconocidos en la URL no rompen el calendario" (a nivel componente).
  - Verificación: `npx vitest run
    src/components/admin/calendar/__tests__/ServiceFilter.test.tsx` → sigue en
    verde con los casos nuevos.
- [x] 6.2 REFACTOR: extraer a expresiones con nombre legible el cálculo de
  `isActive` y las clases, sin cambiar el contrato (`selectedIds`, `onToggle`)
  ni la ausencia de swatch.
  - Verificación: `npx vitest run
    src/components/admin/calendar/__tests__/ServiceFilter.test.tsx` → sigue en
    verde.

---

## Fase 3 — Integración en la página (GREEN de `app/(admin)/appointments/page.tsx`)

Archivo de implementación: `app/(admin)/appointments/page.tsx` (modificar).
Archivo de prueba: `app/(admin)/appointments/page.test.tsx` (extendido en la
Fase 1). Ninguna tarea de esta fase toca `serviceFilter` (:186), el filtrado de
lista (:414-416), sus deps (:458), `hasActiveFilters` (:460) ni el `<select>` de
servicio de la lista (:520-534).

### 7. Parseo, estado y universo del control

- [x] 7.1 Extraer el cuerpo de `parseProviderIds` (:139-145) a
  `parseIdList(raw: string | null | undefined): string[]` (split por coma,
  `trim`, descarta vacíos y el literal `'all'`, deduplica) y conservar dos
  wrappers: `parseProviderIds` (comportamiento de #174) y `parseServiceIds`
  (D10).
  - Cubre: "La selección de servicios se refleja en la URL y es deep-linkable"
    (lado lectura) y "Sin selección se muestran todos los servicios" (tolerancia
    de `all`).
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    las pruebas de deep link/`all` avanzan; `npx tsc --noEmit` sin errores.
- [x] 7.2 Añadir `const [calendarServiceFilter, setCalendarServiceFilter] =
  useState<string[]>(parseServiceIds(searchParams?.get('serviceId')))` junto a
  `calendarProviderFilter` (:189-191), sin tocar `serviceFilter` (:186); la
  inicialización única desde la URL implementa el deep link **sin** `useEffect`
  (D8, D9, D11).
  - Cubre: "La selección de servicios se refleja en la URL y es deep-linkable".
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    el deep link de `aria-pressed` del control de servicios pasa.
- [x] 7.3 Añadir el `useMemo` `visibleServices` inmediatamente después de
  `visibleProviders` (:224-227), derivado de `appointments` **sin filtrar** y
  con `refName(services, id)` (:385) como fallback de nombre; el orden es el de
  primera aparición en el mes (D12).
  - Cubre: "El control de servicios conserva el universo del mes" e "Ids
    desconocidos en la URL no rompen el calendario".
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    la prueba de universo de 3.6 avanza.

### 8. Pipeline de filtrado (antes de `blocksByDay`)

- [x] 8.1 Extender el `useMemo` `calendarAppointments` (:203-208) con los
  guards independientes `providerActive`/`serviceActive` y la composición
  `(!providerActive || selectedProviders.has(a.providerId)) &&
  (!serviceActive || selectedServices.has(a.serviceId))`; con ambos vacíos
  devuelve `appointments` completo; deps `[appointments, calendarProviderFilter,
  calendarServiceFilter]` (D13, D14).
  - Cubre: "Seleccionar un servicio muestra solo sus citas", "Seleccionar varios
    servicios muestra solo los elegidos", "Sin selección se muestran todos los
    servicios" y "El filtro de servicios se compone con AND con el de
    proveedores".
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    las pruebas de filtrado/AND de 3.1/3.2 avanzan.
- [x] 8.2 Confirmar que `blocksByDay` (:210-223) **no cambia**: sigue
  consumiendo `calendarAppointments` (ya filtrado) y enriqueciendo `serviceName`
  vía `refName` (:214), de modo que los bloques caen en su franja horaria
  correcta (D13).
  - Cubre: "El filtrado de servicios precede al agrupamiento por día".
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    la prueba de franja horaria de 3.2 en verde.
- [x] 8.3 Confirmar por lectura y por prueba que `visibleProviders` (:224-227)
  **no cambia** (deriva de `appointments` sin filtrar) y que `visibleServices`
  tampoco se deriva de `calendarAppointments`, para que un servicio
  deseleccionado siga visible como control aunque haya filtro de proveedor
  activo (D12).
  - Cubre: "El control de servicios conserva el universo del mes".
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    la prueba de universo de 3.6 en verde.

### 9. URL única con ambos parámetros

- [x] 9.1 Extender `calendarFilterUrl` (:158-163) a
  `calendarFilterUrl(providerIds: string[], serviceIds: string[]): string`,
  construida con `URLSearchParams` que fija `providerId` **primero** y
  `serviceId` después, omite cada parámetro vacío y devuelve `/appointments`
  cuando ambos están vacíos (D15, D17).
  - Cubre: "La URL compone la selección de servicios con la de proveedores" y
    preserva "La selección se refleja en la URL y es deep-linkable" de #174.
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    las pruebas de URL de 3.3 y las exactas de #174 (tarea 4.1) en verde.
- [x] 9.2 Sustituir `applyCalendarFilter` (:232-241) por
  `applyCalendarFilters(nextProvider: string[], nextService: string[])` con
  `useCallback`: guard de redundancia que retorna temprano si ambos
  `join(',')` no cambiaron (preserva la prueba de no-reescritura de #174 :706-724),
  aplica ambos `setState` y realiza **un único** `router.replace(
  calendarFilterUrl(nextProvider, nextService))`; deps `[calendarProviderFilter,
  calendarServiceFilter, router]`; sin `useEffect` (D15, D16).
  - Cubre: "La selección de servicios se refleja en la URL y es deep-linkable" y
    "La misma acción \"Limpiar filtros\" deja el filtro de servicios en
    \"todos\"".
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    las pruebas de `replaceMock` de 3.3 y 3.5 en verde; la de no-reescritura de
    #174 sigue en verde.

### 10. Alternancia y renderizado del control

- [x] 10.1 Actualizar `toggleCalendarProvider` (:243-252) para que llame a
  `applyCalendarFilters(next.length === allIds.length ? [] : next,
  calendarServiceFilter)` —preservando la selección de servicios al alternar un
  proveedor (allIds desde `visibleProviders`, normalización `[]` = todos) (D3,
  §2.7).
  - Cubre: "La selección de servicios se compone con AND con la de proveedores"
    (al alternar un proveedor no se pierde el servicio) y "Entrada de la leyenda
    alterna su estado" (de #174).
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    las pruebas de AND de 3.2 avanzan.
- [x] 10.2 Añadir `toggleCalendarService(id: string)` con la misma normalización
  `allIds` (desde `visibleServices`) que `toggleCalendarProvider`, llamando
  `applyCalendarFilters(calendarProviderFilter, next.length === allIds.length ?
  [] : next)`; documentar en el código el caso borde aceptado (desmarcar el
  último servicio visible vuelve a "todos") (D3, D9, D12, §2.7).
  - Cubre: "Seleccionar un servicio muestra solo sus citas", "Seleccionar varios
    servicios muestra solo los elegidos" y "Sin selección se muestran todos los
    servicios".
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    las pruebas de alternancia de 3.1 en verde.
- [x] 10.3 Insertar `<ServiceFilter services={visibleServices}
  selectedIds={calendarServiceFilter} onToggle={toggleCalendarService} />`
  dentro del contenedor `flex flex-wrap items-center gap-3` (:600), **después**
  de `<ProviderLegend>` (:601-605) y antes del botón "Limpiar filtros"
  (:606-614), sin cambiar el layout (D7).
  - Cubre: "La fila de filtros con el control de servicios es usable en móvil".
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    la prueba de fila de 3.6 y las de filtrado de 3.1 en verde.

### 11. Limpieza conjunta y layout

- [x] 11.1 Cambiar el botón "Limpiar filtros" (:606-614) para que se renderice
  cuando `calendarProviderFilter.length > 0 || calendarServiceFilter.length > 0`
  y ejecute `onClick={() => applyCalendarFilters([], [])}`, conservando las
  clases `text-sm text-blue-600 hover:text-blue-800`. No confundir con
  `clearFilters` (:403-409) ni con `hasActiveFilters` (:460), que son de la
  vista de lista (D16, D18).
  - Cubre: "\"Limpiar filtros\" reinicia ambos filtros del calendario", "El
    botón \"Limpiar filtros\" se muestra cuando cualquiera de los filtros está
    activo" y "La misma acción \"Limpiar filtros\" deja el filtro de servicios
    en \"todos\"".
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    las pruebas de limpieza de 3.5 en verde y las de #174 (:684-703, :821-847)
    también.
- [x] 11.2 Confirmar que la fila del calendario (:593-615) conserva `mb-4 flex
  flex-col gap-4 sm:flex-row sm:items-center sm:justify-between` y que el
  contenedor `flex flex-wrap` absorbe el segundo control sin recortes en móvil
  (D21).
  - Cubre: "La fila de filtros con el control de servicios es usable en móvil".
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    la prueba de clases de 3.6 en verde.

### 12. Invariantes de la página

- [x] 12.1 Verificar por lectura y por diff que la **lista queda intacta**:
  `serviceFilter` (:186), el filtrado de lista (:414-416), sus deps (:458),
  `hasActiveFilters` (:460) y el `<select>` de servicio (:520-534) no cambian;
  `serviceId` de la URL es inerte para la lista y **no** hay colisión, porque la
  lista solo lee `providerId` (:167-170) (D19, D20).
  - Cubre: "La lista conserva su filtro de servicio de un solo valor".
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    la prueba de coexistencia de 3.6 en verde.
- [x] 12.2 Verificar por lectura que **no** se agregan consultas ni endpoints:
  `loadData` (:254-315) sigue cargando solo el mes visible y el catálogo
  `services`; el filtrado y el control operan en memoria (D22, D23).
  - Cubre: invariante de alcance de datos (`design.md` §2.10).
  - Verificación: `git diff --stat` no muestra cambios en `loadData` ni en
    `package.json`; `npx tsc --noEmit` sin errores.
- [x] 12.3 Verificar por lectura que el cambio de vista no escribe en la URL:
  `setView('list')` / `setView('calendar')` se mantienen tal cual, sin llamadas
  a `applyCalendarFilters` ni `router.replace`, y sin `useEffect` que proyecte
  la URL (D11).
  - Cubre: "La selección de servicios sobrevive el cambio Lista ↔ Calendario".
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    la prueba de cambio de vista de 3.4 en verde y `replaceMock` sin llamadas
    extra.

### 13. TRIANGULATE / REFACTOR de la página

- [x] 13.1 Triangular los bordes de integración: deep link `serviceId=all` se
  parsea a `[]` y muestra todos; deep link con ids desconocidos no rompe y deja
  el calendario usable; alternar dos servicios consecutivos produce llamadas a
  `replace` con la unión sin repetir la última; "Limpiar filtros" con solo
  servicio activo deja la URL en `/appointments`; deep link con ambos parámetros
  restaura ambos filtros (D9, D15, D18).
  - Cubre: "Sin selección se muestran todos los servicios", "Ids desconocidos en
    la URL no rompen el calendario", "\"Limpiar filtros\" reinicia ambos filtros
    del calendario" y "La URL compone la selección de servicios con la de
    proveedores".
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    sigue en verde con los casos nuevos.
- [x] 13.2 REFACTOR: extraer a helpers con nombre el armado de la selección
  efectiva (expansión `[]`→`allIds`) y la construcción de la URL, manteniendo
  mínimas y estables las dependencias de los `useMemo`/`useCallback`; sin cambiar
  comportamiento observable.
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` →
    sigue en verde.

---

## Fase 4 — Verificación

- [x] 14.1 Ejecutar la suite focal completa del change: `npx vitest run
  "app/(admin)/appointments/page.test.tsx"
  src/components/admin/calendar/__tests__/` → todo en verde.
- [x] 14.2 Ejecutar la suite completa: `npm test` → en verde (o registrar
  cualquier fallo preexistente ajeno al cambio; `strict_tdd: true` exige suite
  verde al cierre).
- [x] 14.3 Ejecutar el typecheck: `npx tsc --noEmit` → sin errores (incluye la
  firma de `ServiceFilterProps`).
- [x] 14.4 Ejecutar el lint: `npm run lint` → sin errores. Registrado en
  `verify-report.md`: 0 errores y 26 advertencias preexistentes.
- [x] 14.5 Ejecutar el build: `npm run build` → sin errores. Registrado en
  `verify-report.md`: compilación exitosa y 0 errores.
- [x] 14.6 Trazabilidad de escenarios: confirmar el mapeo de los **28**
  escenarios del delta spec a pruebas que pasan (12 del requirement `MODIFIED`
  "Filtrado multi-selección de proveedores en el calendario" —incluida la
  limpieza conjunta— y 16 del `ADDED` "Filtrado multi-selección de servicios en
  el calendario") y anotar la evidencia en el PR.
- [x] 14.7 Cobertura de las 24 decisiones de `design.md`: confirmar que cada una
  queda implementada y verificada por su tarea (D1-D7 componente; D8-D14 estado,
  parseo, universo y pipeline; D15-D18 URL y limpieza; D19-D21 invariantes de
  lista, colisión y layout; D22-D24 dependencias, alcance de datos y runner) y
  anotar el mapeo decisión → tarea en el PR.
- [x] 14.8 Invariantes verificados por lectura y por diff: (a) `package.json`
  **sin cambios** y ninguna dependencia nueva (D22); (b) `loadData` sin consultas
  ni endpoints nuevos, el calendario sigue cargando solo el mes visible (D23);
  (c) `serviceFilter` (:186), filtrado de lista (:414-416), deps (:458),
  `hasActiveFilters` (:460) y `<select>` de servicio (:520-534) sin cambios
  (D19, D20); (d) nada dentro de `travelhub-app` fue tocado; (e) el runner usado
  es `npm test` (D24), sin cambios de configuración de Vitest.
- [x] 14.9 Verificar que las pruebas exactas de #174 siguen verdes sin editar
  sus aserciones (tarea 4.1) y que la única prueba de #174 que cambia de lectura
  es "Limpiar filtros" (ahora "limpia ambos"), documentado en el PR.
- [x] 14.10 Registro de cierre: añadir al `verify-report.md` de la fase Verify
  el mapeo escenario → archivo de prueba (28/28), el mapeo decisión → tarea
  (24/24) y los comandos ejecutados con su salida. Registrado en
  `verify-report.md` (trazabilidad 28/28 y decisiones D1-D24 comprobadas).

---

## Workload forecast

- **Tareas:** **55 checkboxes** en 5 grupos (Fase 0: 5 artefactos SDD, ya
  completados; Fase 1: 15 de infraestructura de prueba y RED —incluida la
  protección de #174—; Fase 2: 7 del componente `ServiceFilter`; Fase 3: 18 de
  integración en la página; Fase 4: 10 de verificación).
- **Archivos estimados: 6** (3 nuevos, 3 modificados), contando cada archivo una
  sola vez:
  - **Nuevos (3):** `src/components/admin/calendar/ServiceFilter.tsx`,
    `src/components/admin/calendar/__tests__/ServiceFilter.test.tsx`,
    `openspec/changes/agregar-filtro-servicios-calendario/tasks.md` (este
    archivo).
  - **Modificados (3):** `app/(admin)/appointments/page.tsx`,
    `app/(admin)/appointments/page.test.tsx` (fixtures + nueva suite),
    `openspec/specs/appointments-calendar-view/spec.md` (delta, fase spec).
  - **Sin cambios:** `ProviderLegend.tsx` y su prueba, `serviceFilter` y el
    `<select>` de la lista, `package.json`, migraciones, API y `travelhub-app`.
- **Tamaño de diff aproximado: ~600–750 líneas** de código y pruebas
  (excluyendo este `tasks.md`): `ServiceFilter.tsx` ~50–70;
  `page.tsx` ~90–130; `ServiceFilter.test.tsx` ~120–170; `page.test.tsx`
  ~250–330; delta spec ~60–90.
- **Tests existentes y ejecutables:** sí. `npm test` → `vitest run --exclude
  'tests/e2e/**'` (Vitest + Testing Library + `userEvent`); los focales son
  `npx vitest run "app/(admin)/appointments/page.test.tsx"` y `npx vitest run
  src/components/admin/calendar/__tests__/ServiceFilter.test.tsx`. No requieren
  Supabase ni datos locales: `fetch` va mockeado. Comandos adicionales:
  `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- **Riesgo de runner:** ninguno nuevo; no hay migraciones, base de datos ni
  escrituras, así que no se necesita `supabase start` en ninguna tarea.
- **Riesgo de tamaño de review: medio-alto.** ~600–750 líneas rebasa el umbral
  de ~400 líneas de `chained-pr`. **Punto de corte ya definido** (no requiere
  decisión humana nueva): **PR 1** = Fases 1 (tareas 1, 2, 4) + Fase 2
  (componente `ServiceFilter.tsx` + `ServiceFilter.test.tsx`, sin tocar
  `page.tsx`); **PR 2** = Fase 1 (tareas 3) + Fase 3 + Fase 4 (integración en
  `page.tsx`, suites de servicios en `page.test.tsx` y verificación), apilado
  sobre PR 1. Ambos cortes son verificables de forma independiente
  (`npx vitest run src/components/admin/calendar/__tests__/ServiceFilter.test.tsx`
  y `npx vitest run "app/(admin)/appointments/page.test.tsx"`).
- **Riesgo de acoplamiento:** las aserciones exactas de URL de #174 (tarea 4.1)
  dependen del orden `providerId`→`serviceId` (D17) y de omitir `serviceId`
  cuando está vacío (D15); la firma de `ServiceFilter` (5.1) y su montaje en
  `page.tsx` (10.3) deben entrar en la **misma unidad revisable**.

## Decision needed before apply

**Decision needed before apply: No.**

Estrategia de cadena recomendada: **dos PRs encadenados** por tamaño estimado
(~600–750 líneas > 400). **PR 1**
(`feat/agregar-filtro-servicios-calendario-parte-1` sobre `main`) contiene el
componente nuevo `ServiceFilter.tsx` y su suite de pruebas, sin tocar
`page.tsx`; **PR 2** (`…-parte-2`, apilado sobre PR 1) contiene el estado,
parseo, universo, pipeline AND, URL de dos parámetros, limpieza conjunta,
alternancia, montaje en la fila y la suite de servicios de `page.test.tsx`.
`design.md` declara **cero open questions**: la forma del componente y su
contrato (§2.1, opción C, D1-D2), el estado presionado (D3), las clases
exactas (D4), la ausencia de swatch (D5), el anclaje textual de "todos" (D6), la
ubicación (D7), el estado separado (D8), la representación `[]` = todos (D9),
el parseo compartido (D10), el deep link (D11), el universo `visibleServices`
(D12), el punto de filtrado y la composición AND (D13-D14), la URL única con
orden determinista (D15, D17), el guard de reescritura (D16), la limpieza
conjunta (D18) y la ausencia de colisión (D19) quedan fijados. El único caso
borde (desmarcar el último servicio visible vuelve a "todos") está documentado
como consecuencia de la spec (D9/§4), no como decisión pendiente. Si el diff
final excede las 400 líneas, el corte ya está definido en el Workload Forecast
(PR 1 = componente + test; PR 2 = integración + verificación) y no requiere una
decisión nueva del humano.
