# Change: Vista de agenda (lista por día) en el calendario de `/appointments`

## Why

La vista de **Calendario** de `/appointments` solo ofrece la cuadrícula mensual
(bloques posicionados por hora dentro de cada celda). Para un día cargado, la
celda recorta las citas y obliga a abrir el modal del desbordamiento para leer el
detalle; el administrador no puede recorrer el mes como una **agenda legible**
—cita por cita, con todos sus campos— sin cambiar a la vista de Lista, que a su
vez no agrupa por día del mes visible.

El issue [#175](https://github.com/proyecto-polaris-ia/medica-app/issues/175)
pide una sub-vista **Agenda** dentro de la vista de Calendario: las citas del mes
visible agrupadas por día, cada cita completamente legible (hora inicio–fin,
paciente, servicio, proveedor, estado y notas), con el mismo
comportamiento de edición y expediente, los mismos filtros y cero peticiones
extra al backend.

## What Changes

- **El toggle pasa de dos a tres opciones (Opción A del issue).** En
  `app/(admin)/appointments/page.tsx`, `ViewMode` se extiende a
  `'list' | 'calendar' | 'agenda'`. La tercera opción se etiqueta **Agenda**; la
  segunda conserva la etiqueta exacta **Calendario** (grilla mensual). No se usa
  un sub-toggle ni se renombra la vista existente, de modo que las pruebas y los
  deep links actuales del toggle siguen funcionando.
- **Nueva vista de agenda.** Componente
  `src/components/admin/calendar/AgendaView.tsx` que recibe los mismos datos que
  `MonthCalendar` (`year`, `month`, `blocksByDay`, `timeZone`, `onSelectBlock`,
  `onSelectPatient`) y renderiza el mes como secciones por día:
  - encabezado por día con día de la semana y fecha legible;
  - una fila por cita con **hora inicio–fin**, paciente, servicio, proveedor,
    estado (etiqueta en español) y notas cuando existan;
  - días sin citas con el texto **"Sin citas"**;
  - contenedor con **scroll vertical** y encabezados de día pegajosos.
- **`CalendarBlock` gana `endLabel`.** La fila de agenda necesita la hora de fin;
  `groupAppointmentsByDay` deriva `endLabel` con el `endAt` que ya recibe (vía
  `clinicTimeLabel`). Cambio aditivo en `src/lib/admin/timezone.ts`.
- **Enriquecimiento de los bloques en `page.tsx`.** El memo de `blocksByDay` ya
  tiene a la mano proveedor y notas; pasa a copiar `providerName` y `notes` al
  bloque (el tipo `CalendarBlock` ya los admite como opcionales desde #172). Sin
  consultas nuevas.
- **Cero peticiones extra.** La vista de agenda reutiliza exactamente
  `loadData` + `calendarAppointments` + `blocksByDay`: la rama de rango del mes
  (`clinicMonthRangeUtc`) se comparte entre `'calendar'` y `'agenda'`. Se
  reutilizan también `CalendarNav`, `ProviderLegend`, `ServiceFilter` y sus
  filtros de URL (#174/#177).
- **Interacciones reutilizadas.** Clic en una cita → formulario de edición
  existente (`onSelectBlock`); clic en el nombre del paciente → expediente
  existente (`onSelectPatient`). Sin comportamiento nuevo de datos.
- **Botón "Hoy".** Dentro de la agenda, un botón que hace scroll al día actual
  de la clínica; si el día actual no pertenece al mes visible, no rompe.
- **Presentación responsiva básica**, siguiendo el vocabulario de clases ya
  usado en el módulo (`flex-col sm:flex-row`, contenedores `rounded-lg border
  bg-white shadow-sm`).
- **Cobertura de pruebas** con Vitest + Testing Library: nueva suite
  `AgendaView.test.tsx`, casos nuevos en `page.test.tsx` (tercer modo, sin fetch
  extra, filtros) y de `endLabel` en `timezone.test.ts`, escritos en RED antes de
  la implementación.

### Alcance

- Vista de `/appointments`: extender el toggle, nuevo `AgendaView.tsx`,
  `endLabel` en `CalendarBlock`/`groupAppointmentsByDay`, enriquecimiento de
  `page.tsx` con `providerName`/`notes`.
- Reutilización sin cambios de `CalendarNav`, `ProviderLegend`, `ServiceFilter`,
  `DayCell`, `MonthCalendar` y `DayAppointmentsModal`.
- Sin cambios de datos, migraciones ni API. Sin dependencias nuevas. Sin tocar
  `travelhub-app` (regla crítica del repo).

### No-alcance

- No se implementa una ruta ni una página nueva: la agenda vive dentro de la
  vista de Calendario.
- No se cambia el formato de la grilla mensual ni el modal del día.
- No se agrega endpoint, caché, prefetch ni paginación a la agenda.
- No se toca la vista de Lista ni sus `<select>` de filtro de un solo valor.

## Capabilities

- `appointments-calendar-view` (delta en
  `specs/appointments-calendar-view/spec.md`, sobre el baseline
  `openspec/specs/appointments-calendar-view/spec.md`).

## Decisions

- **Opción A (tercer modo), no sub-toggle.** Coincide con la recomendación del
  issue y con el patrón `role="group"` de botones ya existente. Menor superficie
  de cambio y reutiliza el estado `view` de la página.
- **Etiqueta "Agenda" exacta.** Mantiene intactas las coincidencias de las
  pruebas existentes sobre `Calendario` (`/Calendario/` y `/^Calendario$/`).
- **`endLabel` en el bloque, no en el componente.** La hora de fin es un dato de
  presentación derivable del rango ya cargado; centralizarlo en
  `groupAppointmentsByDay` mantiene una sola fuente y sirve a futuros
  consumidores.
- **"Hoy" solo hace scroll, no navega.** El issue pide desplazarse al día actual;
  cambiar de mes automáticamente sería una decisión de producto no solicitada.

## Rollback Plan

Cambio de bajo riesgo: es **solo cliente**, aditivo y sin migraciones ni
escrituras.

- Revertir el commit de la unidad de trabajo restaura `ViewMode` de dos opciones
  y elimina `AgendaView.tsx`; `endLabel` y `providerName`/`notes` son campos
  **opcionales/aditivos** en `CalendarBlock`, así que revertirlos no rompe a
  otros consumidores (Lista, grilla, modal del día).
- No hay estado persistido, ni URL nueva, ni cambios de esquema que limpiar. La
  selección de filtros en la URL (`providerId`/`serviceId`) no se altera.

## Impact

- **Código:** `app/(admin)/appointments/page.tsx` (ViewMode, rama de fetch
  compartida, tercer botón, render de `AgendaView`, enriquecimiento),
  `src/components/admin/calendar/AgendaView.tsx` (nuevo),
  `src/lib/admin/timezone.ts` (`endLabel` en `CalendarBlock` y
  `groupAppointmentsByDay`).
- **Pruebas:** `src/components/admin/calendar/__tests__/AgendaView.test.tsx`
  (nuevo), `app/(admin)/appointments/page.test.tsx` y
  `src/lib/admin/__tests__/timezone.test.ts` (casos nuevos).
- **Riesgo:** bajo. La grilla, la Lista y el modal del día no cambian su
  comportamiento; el único riesgo es de layout/scroll en la nueva vista.

## Open Questions

- ¿"Hoy" debe además navegar al mes actual si el día actual no está en el mes
  visible? Este change lo deja **sin navegar**; si se desea, es un follow-up
  pequeño y aislado.
