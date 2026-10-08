# Design: Vista de detalle para planes de tratamiento

## Contexto

La pestaña de planes vive en
`src/components/admin/patient-record/TreatmentPlansTab.tsx`: lista cards con
`STATUS_BADGES` (líneas 20–27), botones Editar/Eliminar solo para `draft`, y un
`TreatmentPlanEditFormWrapper` (líneas 222–291) que hace
`GET /api/admin/patients/${patientId}/treatment-plans/${planId}` esperando
`{ treatmentPlan }`. El endpoint ya existe en
`app/api/admin/patients/[id]/treatment-plans/[planId]/route.ts` y devuelve
`TreatmentPlanWithItems` (`src/lib/admin/types.ts:264–289`): plan + `items`
(`description`, `tooth`, `quantity`, `unitPrice`, `status: pending | done`) más
`totalAmount` en el plan. **No existen** `subtotal`, `discount` ni `tax`.

## Decisiones

### 1. Componente nuevo `TreatmentPlanDetailModal`, no reutilizar el formulario read-only

Se crea `src/components/admin/patient-record/TreatmentPlanDetailModal.tsx` en lugar
de reutilizar `TreatmentPlanForm` con `isReadOnly` (ya existe ese modo para
`status !== 'draft'`, usado al abrir el detalle desde la card en el flujo actual).

Rationale:

- `TreatmentPlanForm.tsx` (592 líneas) está orientado a **edición**: campos de
  formulario (`disabled={isReadOnly}` en 384, 398, 419, 440, 480, 490, 501, 513,
  522), selects de proveedor y diente, y `select` de estado de ítem. Un formulario
  deshabilitado comunica "podrías editar pero ahora no", que es la semántica
  equivocada para un plan `completed`.
- El formulario **recalcula** el total en vivo (`sumLineTotals`, línea 154) y lo
  pinta como `Total: {formatCurrency(total)}` (línea 570). El detalle debe mostrar
  el **snapshot** `plan.totalAmount`; mostrar el recálculo como "total" cambiaría
  el significado del acuerdo económico.
- El formulario no muestra `acceptedAt` ni las notas cuando el plan no es editable,
  y no presenta costo de línea por ítem; el detalle necesita ambos.
- Un componente de solo lectura dedicado es más simple de probar (sin flujo de
  guardado) y no arriesga regresiones en el flujo de edición, que ya está cubierto
  por `TreatmentPlanForm.test.tsx`.

Se reutiliza el **flujo de edición existente** tal cual: el botón "Editar" del
detalle (`draft`) cierra el detalle y abre `TreatmentPlanForm` vía el
`TreatmentPlanEditFormWrapper` que ya vive en `TreatmentPlansTab.tsx`. No se
duplica la lógica de mutación.

### 2. Fetch al abrir, con el mismo patrón del wrapper

`TreatmentPlanDetailModal` recibe `patientId` y `planId` (o `null` para cerrado) y
hace el fetch con el mismo patrón de `TreatmentPlanEditFormWrapper`:

```
fetch(`/api/admin/patients/${patientId}/treatment-plans/${planId}`)
  → data.treatmentPlan
```

Estado: `plan: TreatmentPlanWithItems | null`, `loading`, `error`. Al cerrar se
limpia el plan para no pintar datos del plan anterior si se reabre otro. El estado
de apertura vive en `TreatmentPlansTab` (`detailPlanId: string | null`), igual que
`editingPlan` hoy: mount/unmount como open/close, sin portal.

Se descarta prefetch desde el listado porque el `GET` de lista devuelve
`TreatmentPlan` **sin** ítems; el detalle siempre necesita la petición. Tampoco se
usa el objeto de la card como dato del modal: sería mostrar un plan incompleto
mientras carga.

### 3. Desglose financiero: subtotal de ítems + total guardado

Dentro del modal:

- **Subtotal** = `Σ (quantity × unitPrice)` sobre los ítems recibidos, con la misma
  aritmética en centavos que `sumLineTotals` (`moneyToCents` + `reduce`) para
  evitar drift de punto flotante.
- **Total** = `plan.totalAmount` (snapshot guardado).
- **Costo por línea** en la tabla de ítems = `quantity × unitPrice` del ítem.
- Sin líneas de descuento ni impuesto: no existen en el modelo y el issue las marca
  "(si aplican)".

El subtotal puede diferir del total solo por datos históricos (mutaciones de ítems
previas a la congelación del snapshot); por eso ambos se muestran como valores
distintos y **no** se sustituye el total por el subtotal.

### 4. Acceso: card clicable **y** botón "Ver detalle"

- La card (`<article>`) recibe `onClick` + `cursor-pointer`, `role="button"`,
  `tabIndex={0}` y `onKeyDown` que activa con `Enter`/`Space`, con
  `aria-label` descriptivo ("Ver detalle del plan <nombre>"). Es el patrón que ya
  usa `DayCell` para los chips del calendario; se sigue por consistencia.
- Además se agrega un botón nativo **"Ver detalle"** visible en cada card. Un
  `<button>` cubre teclado y lectores de pantalla sin código extra, y garantiza que
  el acceso no dependa de una card clicable.
- Los botones internos (Ver detalle, Editar, Eliminar) usan
  `stopPropagation` para no disparar el `onClick` de la card.
- Eliminar sigue siendo exclusivo de `draft`, con `window.confirm` como hoy. El
  detalle no ofrece Eliminar.

### 5. Read-only vs `draft` dentro del detalle

- `plan.status === 'draft'` → el modal muestra "Editar" en el pie. Al activarlo:
  `onEdit(plan.id)` cierra el detalle y abre el formulario de edición existente.
- Cualquier otro estado → el modal no renderiza ninguna acción de escritura ni
  botones de transición de estado. La etiqueta del estado se pinta con la misma
  tabla de etiquetas en español que ya usa la pestaña (`Borrador`, `Presentado`,
  `Aceptado`, `En progreso`, `Completado`, `Cancelado`).
- Esta es una garantía de UI; el backend ya rechaza mutaciones fuera de `draft`
  (requerimiento `Treatment plan total_amount snapshot semantics`).

### 6. Cierre: ✕, clic fuera y `Escape`

`FormModal.tsx` no cierra ni con `Escape` ni con clic en el overlay ni con ✕; el
criterio de aceptación exige los tres, así que el modal nuevo los implementa:

- `useEffect` con `document.addEventListener('keydown', ...)` que llama `onClose`
  cuando `event.key === 'Escape'`; cleanup en el return del effect.
- Overlay (`fixed inset-0 ... bg-black/50`) con `onClick` que solo cierra si
  `event.target === event.currentTarget` (clic dentro del panel no cierra).
- Botón ✕ con `aria-label="Cerrar"` en la esquina del panel, siempre visible.
- El listener se registra solo mientras el modal está montado/abierto.

### 7. Accesibilidad

- Panel: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` apuntando al
  `<h2 id>` del título del plan.
- Foco inicial en el botón ✕ (`autoFocus`), como en el modal de citas del día:
  garantiza que `Escape` funcione de inmediato.
- Estado de carga con texto visible ("Cargando plan de tratamiento...") y error con
  `role="alert"`; el botón de reintento es un `<button>` nativo.
- Sin `focus-trap` ni dependencias de a11y: primitivas nativas, igual que el resto
  del repo.

### 8. Responsive y vocabulario visual

- Overlay: `fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4`
  (mismo overlay/z que `FormModal` y `TreatmentPlanEditFormWrapper`).
- Panel: `w-full max-w-2xl rounded-lg bg-white p-6 shadow-lg` — más ancho que
  `max-w-lg` de `FormModal` para la tabla de ítems de 6 columnas.
- En móvil: `max-h-[90vh] overflow-y-auto` en el panel para que la tabla no
  desborde la pantalla, y `overflow-x-auto` alrededor de la tabla.
- Alternativa de legibilidad en pantallas pequeñas: por debajo de `sm`, la tabla de
  ítems puede renderizarse como lista de bloques etiqueta/valor por ítem
  (`sm:hidden` / `hidden sm:table`), reutilizando `array-helpers.ts` si se necesita
  normalizar la lista. Decisión de implementación dentro del mismo componente; el
  contrato de datos es el mismo.

### 9. Formato de moneda y fecha: reutilizar helpers locales (follow-up)

`formatCurrency` (MXN, es-MX) y `formatDate` están duplicados hoy en
`TreatmentPlansTab.tsx` y `TreatmentPlanForm.tsx`, y `STATUS_LABELS` está duplicado
en `TreatmentPlanForm.tsx`. El modal mantiene el **mismo** formato y las mismas
etiquetas con helpers locales de archivo, sin crear abstracción nueva, para no
ampliar el diff de este cambio.

Follow-up anotado (fuera de alcance): extraer `formatCurrency`, `formatDate` y las
etiquetas de estado a `src/lib/admin/treatment-plan-labels.ts` (o similar) y hacer
que las tres superficies importen de ahí, siguiendo el precedente de
`src/lib/admin/appointment-labels.ts`. Se difiere a un cambio propio para que este
PR quede revisable.

### 10. Pruebas (TDD, Vitest + Testing Library)

RED antes de implementar, usando el patrón `buildFetchMock` de
`src/components/admin/patient-record/TreatmentPlansTab.test.tsx` (mock de `fetch`
por URL y método, `PROVIDER`, `BASE_PLAN`, `PLAN_WITH_ITEMS` ya definidos ahí).

- **Nuevo** `src/components/admin/patient-record/TreatmentPlanDetailModal.test.tsx`:
  - muestra estado de carga mientras la petición está en curso;
  - muestra nombre, estado en español, dentista, fecha de creación, `acceptedAt`
    cuando existe y notas cuando existen;
  - lista ítems con descripción, diente FDI, cantidad, costo unitario, costo de
    línea y estado del ítem;
  - muestra Subtotal (`Σ`) y Total (`totalAmount` guardado), y no muestra
    descuento/impuesto;
  - en `draft` muestra "Editar" y llama `onEdit` con el id del plan;
  - en estados no-`draft` no muestra acciones de edición/eliminación;
  - cierra con ✕, con clic en el overlay (no al hacer clic dentro del panel) y con
    `Escape`;
  - muestra error + reintento + cierre cuando el fetch falla;
  - a11y básica: `role="dialog"`, `aria-modal="true"`, botón ✕ con
    `aria-label="Cerrar"`.
- **Extendido** `src/components/admin/patient-record/TreatmentPlansTab.test.tsx`:
  - clic en la card abre el detalle del plan correcto;
  - botón "Ver detalle" abre el detalle (y accesible por teclado);
  - "Editar" desde el detalle (`draft`) abre el formulario de edición y cierra el
    detalle;
  - en un plan no-`draft`, el botón "Ver detalle" existe y el detalle no ofrece
    Editar/Eliminar.

## No-goals

- No se modifica `FormModal.tsx` (cambio de comportamiento global fuera de alcance).
- No se agrega portal (`createPortal`) ni librerías nuevas.
- No se tocan API routes, migraciones, `types.ts` ni la capa de datos.
- No se implementa expansión inline de la card.
