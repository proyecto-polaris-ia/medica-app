# Tasks: Modal de citas del día desde "+N más"

- [x] 1. Extraer `statusLabel` a `src/lib/admin/appointment-labels.ts` y que `page.tsx` lo importe (sin cambio de comportamiento); commit de unidad.
- [x] 2. Enriquecer `CalendarBlock` con `providerName?` y `notes?`, copiarlos en `groupAppointmentsByDay` y enriquecerlos en `page.tsx` (`refName(providers, ...)`, `appointment.notes`); commit de unidad.
- [x] 3. Tests RED: suite `DayAppointmentsModal.test.tsx` (contenido ordenado, campos por cita, estado en español, notas, cierre Escape/fondo/✕, a11y del diálogo) y casos nuevos en `MonthCalendar.test.tsx` (botón `+N más` accesible, apertura con todas las citas, editar cita y abrir expediente cierran el modal).
- [x] 4. Implementar `DayAppointmentsModal` (diálogo accesible, Escape/backdrop/✕, foco, responsivo) y GREEN de su suite.
- [x] 5. Conectar `DayCell` (botón overflow con `dayKey`/`onSelectDay`) y `MonthCalendar` (estado + render del modal); GREEN de su suite; commit de unidad con tests.
- [ ] 6. Verificación: suites de componentes relevantes en verde, build/tsc sin errores, y reporte en `verify-report.md`.
