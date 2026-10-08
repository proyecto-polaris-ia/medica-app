# Design: Modal de citas del día desde "+N más"

## Decisiones

### 1. El estado del modal vive en `MonthCalendar`, no en la página
`MonthCalendar` ya recibe `blocksByDay: Record<string, CalendarBlock[]>`; el
modal solo necesita el `dayKey` activo y los callbacks que ya fluyen hacia
`DayCell`. Mantener el estado (`overflowDayKey: string | null`) en
`MonthCalendar` evita tocar `page.tsx` para la interacción y mantiene la grilla y
su modal en un solo componente cohesivo.

- `DayCell` recibe dos props nuevas: `dayKey: string | null` y
  `onSelectDay?: (dayKey: string) => void`.
- El overflow se renderiza como `<button type="button" onClick={() => onSelectDay?.(dayKey)}>`
  con `aria-label={`Ver ${overflowCount} citas más de este día`}`. Botón nativo ⇒
  teclado (Enter/Space) gratis; no repetimos el patrón manual `role="button"` +
  `tabIndex` de los chips porque ya no es necesario.
- `MonthCalendar` renderiza condicionalmente
  `<DayAppointmentsModal dayKey={overflowDayKey} blocks={...} .../>`. Mount/unmount
  como open/close, igual que `PatientRecordModal`.

### 2. Nuevo `DayAppointmentsModal` reutiliza callbacks existentes
Props: `{ dayKey: string; blocks: CalendarBlock[]; onClose: () => void;
onSelectBlock: (id: string) => void; onSelectPatient?: (patientId: string) => void }`.

- Filas ordenadas por `startLabel` (defensivo: `groupAppointmentsByDay` ya
  ordena, el modal re-ordena con el mismo comparador por si el consumidor pasa
  otro arreglo).
- Clic en fila (o Enter/Space con `role="button"` + `tabIndex={0}`, patrón de los
  chips de `DayCell`) → `onSelectBlock(id)` + `onClose()`.
- Clic en paciente (botón interno con `stopPropagation`) →
  `onSelectPatient(patientId)` + `onClose()`. Un solo modal a la vez, igual que
  el resto de la página.

### 3. Enriquecimiento de `CalendarBlock` (campos opcionales)
El modal debe mostrar proveedor y notas; `CalendarBlock` no los tiene. Se agregan
como **opcionales** (`providerName?: string; notes?: string | null`) para no
romper a otros consumidores del tipo:

- `groupAppointmentsByDay` declara los campos en su input estructural y los copia
  al bloque si están presentes.
- `page.tsx` ya tiene todo a la mano en el memo de enriquecimiento:
  `providerName: refName(providers, appointment.providerId)` y
  `notes: appointment.notes`. Sin consultas nuevas.

### 4. `statusLabel` extraído a `src/lib/admin/appointment-labels.ts`
`page.tsx` tiene una `statusLabel` local con las etiquetas correctas en español.
El modal necesita las mismas etiquetas; duplicarlas sería una fuente de verdad
doble. Se extrae el módulo y `page.tsx` importa de ahí. Cambio de import, cero
cambio de comportamiento.

### 5. Accesibilidad del modal (precedente nuevo, sin dependencias)
Ningún modal actual tiene a11y real; este lo establece con primitivas nativas:

- Contenedor: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` apuntando
  al `<h2>` del título.
- Título: fecha legible del `dayKey` (formato es-MX con
  `Intl.DateTimeFormat` y `timeZone: 'UTC'` sobre las partes del wall-date, para
  que el día no se corra por zona horaria).
- Cierre: listener de `keydown` (Escape) en `document` dentro de `useEffect`;
  clic en el backdrop (solo si el target es el backdrop, no el panel); botón ✕
  con `aria-label="Cerrar"`.
- Foco: `autoFocus` en el botón ✕ al montar; trampa de foco simple en el handler
  de `Tab` del contenedor (cicla entre los elementos enfocables del panel).
- El botón ✕ con foco inicial garantiza que Escape funcione incluso sin trampa.

### 6. Responsivo con el vocabulario de clases existente
Backdrop: `fixed inset-0 z-50 flex items-center justify-center bg-black/50`
(mismo z/overlay que `FormModal`). Panel móvil: `h-full w-full bg-white`;
desktop: `sm:h-auto sm:max-w-lg sm:rounded-lg`, con lista en contenedor
`overflow-y-auto` (patrón de `PatientRecordModal`). Sin clases nuevas de
breakpoints exóticos.

## No-goals

- No se implementa Opción B (expansión inline de la celda).
- No se agrega portal (`createPortal`); los modales existentes renderizan en el
  árbol y el modal del día sigue el mismo patrón.
- No se toca la vista de Lista ni el flujo de edición existente.
- Sin `focus-trap` ni librerías de a11y: primitivas nativas bastan y el repo no
  tiene dependencias de este tipo.
