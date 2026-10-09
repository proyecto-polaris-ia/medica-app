# Design: Sub-vista Grilla / Agenda en el calendario de `/appointments` con vista y modo en la URL

Archivo principal: `app/(admin)/appointments/page.tsx`. No se crean componentes
nuevos; `src/components/admin/calendar/AgendaView.tsx` se reutiliza tal cual.

## 1. Modelo de estado

En `app/(admin)/appointments/page.tsx` (~línea 39):

```ts
type ViewMode = 'list' | 'calendar';
type CalendarSubMode = 'grid' | 'agenda';
```

Dos estados, ambos inicializados **una sola vez** desde la URL (patrón ya usado
para `page`, `providerId` y `serviceId`, sin `useEffect`; la URL se escribe en el
handler, no al revés):

```ts
const [view, setView] = useState<ViewMode>(() => initialState.view);
const [mode, setMode] = useState<CalendarSubMode>(() => initialState.mode);
```

`visibleMonth` (`getCurrentClinicMonth(viewerTz)`), `calendarProviderFilter` y
`calendarServiceFilter` no cambian de forma. `mode` es **dormido** cuando
`view === 'list'`: se conserva en memoria y vuelve a codificarse cuando el usuario
regresa a Calendario; la URL solo lo escribe con `view=calendar`.

`requestMode` permanece intacto:

```ts
const requestMode: 'list' | 'calendar' = view === 'list' ? 'list' : 'calendar';
```

Consecuencia: el `useEffect` de `loadData` depende de `requestMode`,
`visibleMonth`, `viewerTz` y los filtros; **no** de `mode`. Alternar
`Grilla ↔ Agenda` no cambia ninguna dependencia y por tanto no re-consulta el
rango del mes. `blocksByDay` (memo) alimenta a `MonthCalendar` y a `AgendaView`
por igual.

## 2. Parseo de `view` / `mode` (incluida la migración legacy)

Helper puro junto a `parsePage`/`parseIdList` (~líneas 164–243), con la misma
filosofía defensiva:

```ts
type ViewState = { view: ViewMode; mode: CalendarSubMode };

function parseViewState(params: URLSearchParams | null | undefined): ViewState {
  const rawView = params?.get('view') ?? '';
  const rawMode = params?.get('mode') ?? '';

  // Legacy #175: ?view=agenda => calendar + agenda.
  if (rawView === 'agenda') return { view: 'calendar', mode: 'agenda' };

  if (rawView === 'calendar') {
    // `mode` solo se honra con view=calendar; ausente o inválido => grid.
    return { view: 'calendar', mode: rawMode === 'agenda' ? 'agenda' : 'grid' };
  }

  // view ausente o inválido => lista (y el modo se ignora).
  return { view: 'list', mode: 'grid' };
}
```

Reglas:

| Entrada | `view` | `mode` |
|---|---|---|
| `?view=agenda` | `calendar` | `agenda` (legacy) |
| `?view=calendar` | `calendar` | `grid` |
| `?view=calendar&mode=agenda` | `calendar` | `agenda` |
| `?view=calendar&mode=<otro>` | `calendar` | `grid` |
| `?view=list` | `list` | `grid` |
| `?view=<otro>` | `list` | `grid` |
| sin `view` (aunque haya `mode=agenda`) | `list` | `grid` |

Se llama una sola vez al inicializar:

```ts
const initialState = parseViewState(searchParams);
```

Idealmente mediante un único `useState` si el orden de hooks lo permite, o con
dos `useState` perezosos que reciban `initialState` (evitando recomputar el
parseo). No se usa `useEffect` para sincronizar URL → estado.

## 3. Serialización de la URL

Se extiende `appointmentsUrl` (~línea 217), que hoy compone
`page → providerId → serviceId`, para aceptar `view` y `mode` y mantener el orden
determinista:

```ts
function appointmentsUrl(
  page: number,
  providerIds: string[],
  serviceIds: string[],
  view: ViewMode,
  mode: CalendarSubMode
): string {
  const params = new URLSearchParams();
  if (page > 1) params.set('page', String(page));
  if (view === 'calendar') params.set('view', 'calendar');       // default: omitido
  if (view === 'calendar' && mode === 'agenda') params.set('mode', 'agenda');
  if (providerIds.length > 0) params.set('providerId', providerIds.join(','));
  if (serviceIds.length > 0) params.set('serviceId', serviceIds.join(','));
  const query = params.toString().replace(/%2C/g, ',');
  return query.length > 0 ? `/appointments?${query}` : '/appointments';
}
```

Propiedades:

- `view=list` y `mode=grid` son **por defecto** y se omiten (URLs limpias;
  `/appointments` es la lista).
- `view=calendar` sin `mode` significa grilla; `mode=agenda` solo aparece con
  `view=calendar`.
- El enlace legacy `?view=agenda` se normaliza a `?view=calendar&mode=agenda` en
  la primera escritura (cambio de vista, modo, filtros o página).
- Los tres llamadores existentes (`applyCalendarFilters` ~línea 391,
  `clearFilters` ~línea 618, `handlePageChange` ~línea 629) pasan a incluir
  `view`/`mode` actuales. Se agregan dos handlers:

```ts
function handleViewChange(next: ViewMode) {
  if (next === view) return;            // guard de reescritura redundante
  setView(next);
  router.replace(appointmentsUrl(page, calendarProviderFilter,
    calendarServiceFilter, next, mode));
}

function handleModeChange(next: CalendarSubMode) {
  if (next === mode || view !== 'calendar') return;
  setMode(next);
  router.replace(appointmentsUrl(page, calendarProviderFilter,
    calendarServiceFilter, view, next));
}
```

El toggle principal usa `handleViewChange` en lugar de `setView` directo; las
sub-opciones usan `handleModeChange`. Los guards evitan escrituras redundantes y
alinean con el patrón de `applyCalendarFilters`.

## 4. Toggle principal y sub-toggle (JSX)

- **Toggle principal** (~líneas 695–737): se elimina el tercer botón **Agenda** y
  sus clases pasan a `rounded-r-md` en el botón **Calendario** (que hoy no tiene
  radio derecho). Se conservan las etiquetas exactas `Lista` y `Calendario`, el
  `role="group"`, `aria-pressed` y el estilo activo/inactivo actual.
- **Sub-toggle**: se monta al inicio de la fila que hoy se renderiza con
  `(view === 'calendar' || view === 'agenda') && (...)` (~línea 835). Esa
  condición pasa a `view === 'calendar'`. El sub-toggle se coloca como primer
  hermano dentro de esa fila, antes de `CalendarNav` (o en un contenedor
  `flex items-center gap-3` con `CalendarNav`), respetando el layout
  `flex-col sm:flex-row sm:items-center sm:justify-between` existente.

```tsx
<div className="inline-flex rounded-md shadow-sm" role="group"
     aria-label="Modo de calendario">
  <button type="button" onClick={() => handleModeChange('grid')}
    aria-pressed={mode === 'grid'}
    className={[
      'rounded-l-md border px-3 py-1.5 text-sm font-medium',
      mode === 'grid'
        ? 'border-blue-600 bg-blue-600 text-white'
        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
    ].join(' ')}>
    Grilla
  </button>
  <button type="button" onClick={() => handleModeChange('agenda')}
    aria-pressed={mode === 'agenda'}
    className={[
      'rounded-r-md border px-3 py-1.5 text-sm font-medium',
      mode === 'agenda'
        ? 'border-blue-600 bg-blue-600 text-white'
        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
    ].join(' ')}>
    Agenda
  </button>
</div>
```

- **Render de sub-vistas** (~líneas 1010–1031):
  `view === 'calendar' && mode === 'grid'` → `MonthCalendar`;
  `view === 'calendar' && mode === 'agenda'` → `AgendaView`. Ambas reciben el
  mismo `blocksByDay`, `viewerTz`, `handleSelectBlock` y `openPatientRecord`; no
  cambian las props de `AgendaView` (`src/components/admin/calendar/AgendaView.tsx`).

## 5. Qué NO cambia

- `src/components/admin/calendar/AgendaView.tsx`: sin cambios de contrato ni de
  render.
- `src/components/admin/calendar/MonthCalendar.tsx`, `CalendarNav.tsx`,
  `ProviderLegend.tsx`, `ServiceFilter.tsx`, `DayCell.tsx`,
  `DayAppointmentsModal.tsx`: sin cambios.
- `src/lib/admin/timezone.ts` (`CalendarBlock`, `groupAppointmentsByDay`): sin
  cambios.
- El request de datos (`/api/admin/appointments?start=&end=` en modo calendario),
  `clinicMonthRangeUtc`, el conjunto de citas cargadas y `blocksByDay`.
- La lógica de filtros (`calendarAppointments`, `applyCalendarFilters`) y la
  semántica de la vista de Lista.
- Esquema, migraciones y API.

## 6. Estrategia de pruebas

Runner existente: `npm test` (Vitest + Testing Library), con
`app/(admin)/appointments/page.test.tsx` como suite primaria. No aplica
`test:local` (no hay capa de datos nueva) ni un runner nuevo. El mock de
`next/navigation` ya expone `replaceMock` y `searchParamsRef`
(`page.test.tsx:12-19`), de modo que la URL es testeable sin router real.

1. **RED — actualizar pruebas existentes al nuevo UI**
   - `openAgenda` (`page.test.tsx:2308`) pasa a: clic en `Calendario`, luego clic
     en la sub-opción `Agenda` (`/^Agenda$/` dentro del sub-toggle), luego esperar
     `agenda-day`.
   - `14.1 "el toggle ofrece las tres vistas"` (líneas 2342–2360) se reescribe:
     dos opciones de primer nivel (`Lista`, `Calendario`), ausencia del botón
     superior `Agenda`; en Calendario, `Grilla` activo por defecto y sub-toggle
     operable.
   - `14.6` (líneas 2459–2480) se actualiza para alternar
     `Grilla ↔ Agenda` vía sub-toggle y seguir usando `rangeRequestCalls` para
     comprobar que no hay petición de rango adicional.
2. **GREEN — casos nuevos de #176**
   - Sin `view`/`mode` en `searchParamsRef`, la vista por defecto es Lista y el
     sub-toggle no se renderiza.
   - `searchParamsRef.value = new URLSearchParams('view=calendar')` → Calendario
     con `Grilla` activa.
   - `view=calendar&mode=agenda` → agenda renderizada con `agenda-day`.
   - Legacy `view=agenda` → agenda renderizada; la primera escritura llama
     `replaceMock` con `/appointments?view=calendar&mode=agenda`.
   - `view=desconocido` → Lista; `mode=otro` con `view=calendar` → Grilla.
   - Composición con filtros: activar Agenda con `providerId=prov-a,prov-b`
     conserva la selección y la URL compuesta; alternar modo no borra
     `providerId`/`serviceId`.
   - Alternar `Grilla ↔ Agenda` no incrementa `rangeRequestCalls(fetchMock)` ni
     cambia el mes visible.
   - Operabilidad por teclado y `aria-pressed` del sub-toggle.
3. **TRIANGULATE**
   - `?view=calendar&mode=agenda&providerId=...&page=2` (composición completa y
     orden determinista de parámetros).
   - Modo huérfano `?mode=agenda` sin `view` → Lista.
   - Regreso Lista → Calendario conserva el último `mode` local.
   - Mes distinto tras alternar modo (junio 2026 permanece).
4. **REFACTOR**
   - Mantener `parseViewState` y `appointmentsUrl` como funciones puras del módulo
     (testeables por la suite de página); sin cambio de comportamiento.

## 7. Decisiones y supuestos

- **`mode` es un sub-estado de `view`, no un valor de `ViewMode`.** Mantiene
  `requestMode` binario y evita ramas de fetch adicionales.
- **`mode` solo válido con `view=calendar`.** Determinista ante URLs escritas a
  mano; el modo huérfano cae a Lista.
- **URL limpia por defecto.** `list` y `grid` se omiten; solo se emiten valores
  no-default (`view=calendar`, `mode=agenda`).
- **Legacy se normaliza en la primera escritura**, no se mantiene una segunda
  forma de lectura.
- **El modo local persiste al alternar Lista ↔ Calendario** (decisión cerrada).
  Si se prefiere reiniciar a `grid`, es un cambio de una línea en
  `handleViewChange` y un caso de prueba.
