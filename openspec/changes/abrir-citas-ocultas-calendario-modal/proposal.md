# Change: Modal de citas del día desde el desbordamiento "+N más" del calendario

## Why

En la vista de **Calendario** de `/appointments`, cuando un día tiene más de 4
citas, `DayCell` muestra las primeras 4 y renderiza un texto estático
`+N más` (`<span>` sin `onClick`, sin `role`, sin `tabIndex`). Ese texto **no es
interactivo**: las citas ocultas son inaccesibles desde la vista de calendario y
el administrador no puede verlas, editarlas ni abrir el expediente del paciente
sin cambiar a la vista de Lista.

Este cambio convierte `+N más` en un botón accesible que abre un **modal con la
lista completa de citas del día** (las visibles y las ocultas), reutilizando el
patrón visual de los modales existentes de la app. Preserva la grilla estable del
mes y escala para días muy cargados. Cubre el issue
[#172](https://github.com/proyecto-polaris-ia/medica-app/issues/172).

## What Changes

- **`+N más` pasa de texto estático a botón.** En `DayCell`, el desbordamiento
  se renderiza como `<button type="button">` nativo (operable por teclado sin
  código extra), con `cursor-pointer`, estilo distinguible y `aria-label`
  descriptivo ("Ver N citas más del día").
- **Nuevo `DayAppointmentsModal`.** Componente en
  `src/components/admin/calendar/DayAppointmentsModal.tsx` que muestra **todas**
  las citas del día seleccionado, ordenadas por hora de inicio. Cada fila
  muestra: hora (`startLabel`), paciente (botón que abre el expediente),
  servicio, proveedor y estado (en español). Las notas se muestran cuando
  existen.
- **El modal reutiliza los callbacks existentes.** Clic en una fila → cierra el
  modal y abre el formulario de edición vía `onSelectBlock` (mismo comportamiento
  que un chip de la celda). Clic en el paciente → cierra el modal y abre el
  expediente vía `onSelectPatient` (mismo patrón que `PatientRecordModal`).
- **El estado del modal vive en `MonthCalendar`.** `MonthCalendar` ya recibe
  `blocksByDay`; agrega `overflowDayKey` y propaga `dayKey` + handler de
  desbordamiento a `DayCell`. Sin cambios en la página para la interacción.
- **`CalendarBlock` se enriquece con `providerName` y `notes`.** El modal debe
  mostrar proveedor y notas; `groupAppointmentsByDay` copia los campos opcionales
  que la página ya tiene a la mano (`refName(providers, ...)`, `appointment.notes`).
- **`statusLabel` se extrae a módulo compartido.** La función local de
  `app/(admin)/appointments/page.tsx` pasa a `src/lib/admin/appointment-labels.ts`
  para que el modal muestre los estados con las mismas etiquetas en español sin
  duplicar lógica.
- **Accesibilidad del modal como buen precedente.** `role="dialog"`,
  `aria-modal`, `aria-labelledby`, cierre con Escape, clic en el fondo y botón ✕,
  foco inicial en el modal y trampa de foco simple con Tab. Ningún modal actual
  de la app tiene esto; este lo establece.
- **Responsivo.** En pantallas pequeñas el panel ocupa toda la pantalla; en
  desktop queda centrado con ancho máximo, siguiendo el vocabulario de clases de
  `FormModal`/`PatientRecordModal`.
- **Cobertura de pruebas** del nuevo flujo (botón accesible, apertura, contenido
  ordenado, acciones, cierre por Escape/fondo/✕) con Vitest + Testing Library,
  en tests RED antes de la implementación.

### Alcance

- Vista de calendario de `/appointments`: `DayCell`, `MonthCalendar`, nuevo
  modal y el enriquecimiento mínimo de `CalendarBlock`.
- Refactor puntual de `statusLabel` a módulo compartido (sin cambio de
  comportamiento).
- Sin cambios de datos, migraciones ni API. Sin dependencias nuevas. Sin tocar
  `travelhub-app` (regla crítica del repo).

## Capabilities

- `appointments-calendar-view` (delta en `specs/appointments-calendar-view/spec.md`)

## Impact

- **Código:** `src/components/admin/calendar/DayCell.tsx`,
  `src/components/admin/calendar/MonthCalendar.tsx`,
  `src/components/admin/calendar/DayAppointmentsModal.tsx` (nuevo),
  `src/lib/admin/timezone.ts` (campos opcionales en `CalendarBlock` y
  `groupAppointmentsByDay`), `src/lib/admin/appointment-labels.ts` (nuevo),
  `app/(admin)/appointments/page.tsx` (enriquecimiento + import compartido).
- **Pruebas:** `src/components/admin/calendar/__tests__/MonthCalendar.test.tsx`
  (actualizado) y `src/components/admin/calendar/__tests__/DayAppointmentsModal.test.tsx`
  (nuevo).
- **Riesgo bajo:** el modal es condicional y no altera el render de la grilla ni
  el flujo existente de selección de bloques.
