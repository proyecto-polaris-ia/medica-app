# Tasks: Vista de agenda (lista por día) en el calendario de `/appointments`

## Fase 1 — Documentación (este change)

- [ ] 1.1 Revisar y aprobar `proposal.md`, `design.md` y el delta
  `specs/appointments-calendar-view/spec.md`; confirmar que el delta MODIFIED
  reemplaza el requirement "View toggle from appointments page" completo y que
  los requirements ADDED cubren agenda, campos, "Sin citas", reutilización de
  edición/expediente, filtros, navegación + "Hoy" y presentación.
- [ ] 1.2 Confirmar etiquetas de UI definitivas: **Lista | Calendario | Agenda**
  (sin renombrar Calendario) y que "Hoy" solo hace scroll.

## Fase 2 — Datos de presentación (`endLabel`)

- [x] 2.1 RED: en `src/lib/admin/__tests__/timezone.test.ts`, agregar un caso que
  espere `endLabel` por bloque en la zona del observador y la hora de fin
  correspondiente; capturar el fallo (campo inexistente).
- [x] 2.2 GREEN: en `src/lib/admin/timezone.ts`, agregar `endLabel: string` a
  `CalendarBlock` y derivarlo en `groupAppointmentsByDay` con
  `clinicTimeLabel(appointment.endAt, timeZone)`; suite de `timezone` en verde.

## Fase 3 — Componente `AgendaView`

- [x] 3.1 RED: crear
  `src/components/admin/calendar/__tests__/AgendaView.test.tsx` con los casos de
  agrupación/orden, encabezado de día, campos completos, "Sin citas", clic en
  cita → `onSelectBlock`, clic en paciente → `onSelectPatient`, scroll
  vertical/clases responsivas y `scrollIntoView` de "Hoy" (mock).
- [x] 3.2 GREEN: implementar `src/components/admin/calendar/AgendaView.tsx`
  (props espejo de `MonthCalendar`, días vía `getCalendarGrid`, filas con el
  patrón de `DayAppointmentsModal`, encabezados pegajosos, contenedor con scroll,
  botón "Hoy" con guard); suite de `AgendaView` en verde.
- [ ] 3.3 REFACTOR (opcional): extraer `formatDayTitle` compartido sin cambiar su
  salida; re-ejecutar las suites de `AgendaView` y `DayAppointmentsModal`.

## Fase 4 — Integración en la página

- [x] 4.1 Extender `ViewMode` a `'list' | 'calendar' | 'agenda'` y agregar el
  tercer botón **Agenda** en `app/(admin)/appointments/page.tsx` (`role="group"`).
- [x] 4.2 Compartir la rama de fetch del mes entre `'calendar'` y `'agenda'`
  (`clinicMonthRangeUtc`) y montar la fila `CalendarNav`/filtros para ambas.
- [x] 4.3 Enriquecer el memo `blocksByDay` copiando `providerName: refName(providers,
  appointment.providerId)` y `notes: appointment.notes`; ajustar dependencias.
- [x] 4.4 Renderizar `<AgendaView ... />` con el mismo `blocksByDay`, `viewerTz`,
  `handleSelectBlock` y `openPatientRecord` cuando `view === 'agenda'`.
- [x] 4.5 RED→GREEN en `app/(admin)/appointments/page.test.tsx`: tres opciones de
  toggle; activar Agenda muestra las citas agrupadas; alternar Calendario ↔
  Agenda no dispara un segundo rango; filtros de proveedor y servicio aplican a
  la agenda; carga/errores se comparten.

## Fase 5 — Verificación

- [x] 5.1 Suite enfocada en verde: `npm test` sobre las suites de `AgendaView`,
  `timezone` y `page` (o `npm test` completo si es asequible).
- [x] 5.2 `npx tsc --noEmit` sin errores.
- [ ] 5.3 `npm run lint` sin errores nuevos.
- [ ] 5.4 `npm run build` sin errores.
- [ ] 5.5 Reporte de verificación (sdd-verify) con evidencia y comparación contra
  los escenarios del delta.

## Workload Forecast

- **Archivos nuevos (2):**
  `src/components/admin/calendar/AgendaView.tsx` (~120–170 líneas),
  `src/components/admin/calendar/__tests__/AgendaView.test.tsx` (~150–220 líneas).
- **Archivos modificados (4):**
  `src/lib/admin/timezone.ts` (~3–6 líneas),
  `src/lib/admin/__tests__/timezone.test.ts` (~15–30 líneas),
  `app/(admin)/appointments/page.tsx` (~25–45 líneas),
  `app/(admin)/appointments/page.test.tsx` (~80–140 líneas).
- **Artefactos del change (4):** `proposal.md`, `specs/appointments-calendar-view/spec.md`,
  `design.md`, `tasks.md`.
- **Tamaño de diff estimado: ~400–620 líneas** (código + pruebas, sin contar los
  artefactos SDD).
- **Sin cambios:** `CalendarNav.tsx`, `ProviderLegend.tsx`, `ServiceFilter.tsx`,
  `DayCell.tsx`, `MonthCalendar.tsx`, `DayAppointmentsModal.tsx`, `package.json`,
  migraciones, `openspec/specs/**` (el baseline se sincroniza solo al archivar) y
  `travelhub-app`.
- **Tests existentes y ejecutables:** sí, `npm test` (Vitest + RTL). No aplica
  `test:local` (sin capa de datos nueva). Sin runner nuevo.
- **Decision needed before apply: No.** Etiquetas de UI y comportamiento de
  "Hoy" quedan cerrados en `design.md` §1/§8; el único punto abierto es un
  posible follow-up (navegar al mes actual desde "Hoy"), fuera de alcance.
