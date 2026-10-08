# Design: Vista de agenda (lista por día) en el calendario de `/appointments`

## Decisiones

### 1. `ViewMode` extendido a tres valores en `page.tsx`
En `app/(admin)/appointments/page.tsx:30`, `ViewMode` pasa de
`'list' | 'calendar'` a `'list' | 'calendar' | 'agenda'`. El estado sigue siendo
un solo `view` (`useState<ViewMode>('list')`), sin sub-estado de toggle.

- El render del toggle (botones con `role="group"`) agrega un tercer botón con la
  etiqueta exacta **Agenda**, junto a **Lista** y **Calendario**. La etiqueta
  **Calendario** se conserva intacta para no romper las coincidencias existentes
  (`/Calendario/` y `/^Calendario$/` en `page.test.tsx`).
- La fila de navegación y filtros que hoy se monta con
  `{view === 'calendar' && (...)}` (CalendarNav + ProviderLegend + ServiceFilter
  + "Limpiar filtros", ~línea 810) pasa a
  `{(view === 'calendar' || view === 'agenda') && (...)}`, de modo que la agenda
  ofrece el mismo control de mes y los mismos filtros.

### 2. La rama de fetch del mes se comparte entre `'calendar'` y `'agenda'`
En `loadData` (~línea 431) la condición
`view === 'calendar' ? clinicMonthRangeUtc(...) : listAppointmentsRequestUrl(...)`
pasa a `view === 'calendar' || view === 'agenda' ? ... : ...`. Así la agenda usa
**el mismo request de rango** (`/api/admin/appointments?start=&end=`) y no hay
fetch adicional. `calendarAppointments` y `blocksByDay` no cambian de forma: la
agenda consume el mismo `blocksByDay` que la grilla.

Consecuencia de estado: al alternar `calendar ↔ agenda` no cambia ningún
parámetro del request, así que no se dispara una recarga distinta por el cambio
de vista (el `useEffect` de carga depende de los parámetros del request, no de
`view` en sí; si en la implementación dependiera de `view`, debe incluir ambos
valores de calendario para no re-consultar).

### 3. Nuevo `AgendaView.tsx` con props espejo de `MonthCalendar`
Archivo nuevo: `src/components/admin/calendar/AgendaView.tsx` (client component).

```ts
type AgendaViewProps = {
  year: number;
  month: number;
  blocksByDay: Record<string, CalendarBlock[]>;
  timeZone?: string; // default CLINIC_TZ
  onSelectBlock: (id: string) => void;
  onSelectPatient?: (patientId: string) => void;
};
```

Estructura:

1. Deriva los días del mes con `getCalendarGrid(year, month, timeZone)` y filtra
   `cell.inMonth && cell.dayKey` (reutiliza la lógica de padding/día de pared ya
   probada, en vez de reimplementar `daysInMonth`).
2. Para cada `dayKey` en orden, renderiza una sección:
   - `<h3 id={`agenda-day-${dayKey}`}>` con `weekday + fecha` legible;
   - `blocksByDay[dayKey] ?? []`.
3. Encabezado de la sección: reutiliza el formateo de fecha de
   `DayAppointmentsModal.formatDayTitle` (es-MX, `timeZone: 'UTC'` sobre las
   partes del wall-date). Se extrae a un helper compartido
   `formatDayTitle(dayKey)` (p. ej. en `DayAppointmentsModal.tsx` exportado o en
   `src/lib/admin/timezone.ts`) para no duplicarlo; la firma y salida se
   conservan.
4. Contenedor raíz: `rounded-lg border border-gray-200 bg-white p-4 shadow-sm`
   (mismo vocabulario que `MonthCalendar`).

### 4. `endLabel` en `CalendarBlock` y `groupAppointmentsByDay`
En `src/lib/admin/timezone.ts`:

- `CalendarBlock` gana `endLabel: string` (requerido, derivado del rango que
  `groupAppointmentsByDay` ya recibe; no es un campo opcional porque siempre hay
  `endAt`).
- `groupAppointmentsByDay` agrega `endLabel: clinicTimeLabel(appointment.endAt,
  timeZone)` al construir el bloque. El input estructural ya declara `endAt`, así
  que no cambia su contrato.
- Efecto en consumidores: `DayCell`, `MonthCalendar` y `DayAppointmentsModal`
  ignoran el campo (no lo leen), por lo que no requieren cambios. La clave de
  orden por `startLabel` se mantiene.

### 5. Enriquecimiento de `blocksByDay` en `page.tsx`
El memo (~línea 342) agrega dos campos al `enriched` que ya construye:

```ts
providerName: refName(providers, appointment.providerId),
notes: appointment.notes,
```

`groupAppointmentsByDay` ya copia `providerName`/`notes` al bloque si vienen
presentes (aditivo desde #172). `providers` y `services` ya están cargados en la
página, así que no hay consultas nuevas. Se agrega `providers` a las dependencias
del memo (hoy depende de `providerColor`, que ya cambia con `providers`).

### 6. Fila de cita y acciones reutilizadas
Dentro de `AgendaView`, cada cita se renderiza como una fila con el mismo patrón
de `DayAppointmentsModal`:

- Contenedor de la fila clicable: `role="button"` + `tabIndex={0}` con
  `onClick`/`onKeyDown` (Enter/Space) → `onSelectBlock(block.id)`, y
  `aria-label` con hora + etiqueta de la cita. Es el patrón ya establecido en los
  chips de `DayCell` y en el modal del día.
- Hora: `{block.startLabel}–{block.endLabel}`.
- Paciente: si `block.patientId && onSelectPatient`, `<button type="button">`
  con `stopPropagation` → `onSelectPatient(block.patientId)` y
  `aria-label={`Ver expediente de ${block.patientName}`}`; si no, `<span>`.
- Servicio y proveedor: `block.serviceName` y `block.providerName` (separados por
  `·`, omitiendo el proveedor si no viene).
- Estado: `statusLabel(block.status)` desde
  `src/lib/admin/appointment-labels.ts`.
- Notas: `<p>` solo si `block.notes` es truthy.

### 7. Encabezado de día y scroll
- Encabezado de sección pegajoso: `sticky top-0 z-10 bg-white` dentro del
  contenedor con scroll, para no perder el contexto del día al desplazarse.
- Contenedor del listado: `max-h-[70vh] overflow-y-auto` con separación vertical
  (`flex flex-col gap-4`). El valor es coherente con el alto de panel usado en
  los modales y evita desbordar la página.

### 8. Botón "Hoy" (scroll, sin navegación)
- El botón se renderiza en `AgendaView` (es quien conoce el DOM de los días), en
  una barra superior de la agenda, junto a la etiqueta del mes o al inicio del
  listado.
- Al activarse: calcula el `dayKey` actual de la clínica con
  `clinicDayKey(new Date().toISOString(), timeZone)` y, si existe un elemento
  `agenda-day-${dayKey}` dentro del contenedor, llama
  `element.scrollIntoView({ block: 'start', behavior: 'smooth' })`.
- Si el día actual no está en el mes visible, el elemento no existe: el handler
  no hace nada y no lanza error (sin `throw`, sin `querySelector` sin guard).
- Decisión de producto: **no** navega al mes actual; solo desplaza. Si se
  quisiera navegar, sería un cambio aislado en `page.tsx` (actualizar
  `visibleMonth`) fuera de este alcance.

### 9. Qué NO cambia
- `CalendarNav`, `ProviderLegend`, `ServiceFilter`, `DayCell`, `MonthCalendar`,
  `DayAppointmentsModal`: sin cambios de comportamiento.
- El request de datos (`/api/admin/appointments?start=&end=`), `clinicMonthRangeUtc`
  y el conjunto de citas cargadas.
- La lógica de filtros (`calendarAppointments`, `applyCalendarFilters`,
  sincronía de URL `providerId`/`serviceId`).
- La vista de Lista y sus `<select>` de un solo valor.
- Esquema, migraciones y API.

## Plan de pruebas (RED → GREEN)

Runner existente: `npm test` (Vitest + Testing Library). No aplica
`test:local` (no hay capa de datos nueva) ni un runner nuevo.

1. **RED**
   - `src/components/admin/calendar/__tests__/AgendaView.test.tsx` (nuevo):
     agrupación por día y orden; encabezado con día/fecha; campos completos
     (inicio–fin, paciente, servicio, proveedor, estado, notas); "Sin citas" en
     días vacíos; clic en cita → `onSelectBlock`; clic en paciente →
     `onSelectPatient` (y no `onSelectBlock`); scroll container y clases
     `sm:flex-row`; `scrollIntoView` del botón "Hoy" (mock de
     `Element.prototype.scrollIntoView`).
   - `app/(admin)/appointments/page.test.tsx`: tercer botón presente; activar
     Agenda muestra la agenda con los datos ya cargados; alternar Calendario ↔
     Agenda no dispara un segundo rango; filtros de proveedor/servicio aplican a
     la agenda.
   - `src/lib/admin/__tests__/timezone.test.ts`: `groupAppointmentsByDay` deriva
     `endLabel` en la zona del observador.
2. **GREEN**
   - Agregar `endLabel` en `timezone.ts` y verificar la suite de `timezone`.
   - Implementar `AgendaView.tsx` y verificar su suite.
   - Extender `ViewMode`, el toggle, la rama de fetch y el enriquecimiento en
     `page.tsx`; verificar la suite de página.
3. **TRIANGULATE**
   - Día sin citas; filtro que deja un día vacío; notas ausentes; paciente sin
     `patientId`; "Hoy" con mes visible distinto; hora de fin en otra zona.
4. **REFACTOR**
   - Extraer `formatDayTitle` compartido sin cambiar salida; re-ejecutar las
     suites enfocadas en verde.

## No-goals

- Sin ruta/página nueva, sin sub-toggle, sin endpoint ni caché.
- Sin cambios en la cuadrícula, el modal del día ni la vista de Lista.
- Sin navegación automática de mes desde "Hoy".
- Sin dependencias nuevas.
