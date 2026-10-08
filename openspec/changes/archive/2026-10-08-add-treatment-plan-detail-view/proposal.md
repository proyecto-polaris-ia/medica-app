# Change: Vista de detalle para planes de tratamiento en el expediente

## Why

En la pestaña "Planes de tratamiento" del expediente (`/patients/[id]`), cada plan
se muestra como una card con estado, dentista responsable, monto total y fecha de
creación. La card **no es interactiva** y el único camino al contenido del plan es
el botón "Editar", que solo existe para planes en estado `draft`.

Consecuencias observables del problema (issue
[#178](https://github.com/proyecto-polaris-ia/medica-app/issues/178)):

- Un plan `presented` / `accepted` / `in_progress` / `completed` / `cancelled` es
  **opaco**: no hay forma de ver sus ítems, dientes, cantidades, precios unitarios,
  notas ni fecha de aceptación desde el expediente. El staff tiene que abrir la
  base de datos o pedir los datos por otra vía.
- El desglose económico del acuerdo no es visible en la interfaz: la card muestra
  un único `totalAmount` sin la suma de partidas que lo explica.
- El botón "Editar" sobre un plan `draft` mezcla dos intenciones: **consultar** y
  **mutar**. No existe una lectura de solo lectura segura del plan.
- La card no es operable por teclado en su totalidad ni ofrece una acción explícita
  de consulta para lectores de pantalla.

Este cambio agrega una **vista de detalle de solo lectura** (modal) que se abre
desde la card o desde una acción explícita, y que solo ofrece "Editar" cuando el
plan es `draft`, reutilizando el flujo de edición existente.

## What Changes

- **Nuevo componente `TreatmentPlanDetailModal`** en
  `src/components/admin/patient-record/TreatmentPlanDetailModal.tsx`. Al abrirse,
  hace `GET /api/admin/patients/[id]/treatment-plans/[planId]` y muestra el plan
  completo con sus ítems. Estado de carga y estado de error con reintento y cierre.
- **Card clicable y acción explícita.** La card del plan se vuelve clicable
  (`onClick` + `cursor-pointer`, operable por teclado con `Enter`/`Space` y
  `role="button"` + `tabIndex`, siguiendo el patrón ya usado en los chips del
  calendario) y además se agrega un botón "Ver detalle" visible y accesible por
  teclado en cada card, para no depender de una card clicable.
- **Contenido del modal.** Estado del plan (etiqueta en español), dentista
  responsable, fecha de creación, fecha de aceptación (cuando existe), notas
  (cuando existen) y tabla de ítems con: descripción, diente (notación FDI),
  cantidad, costo unitario, costo de la línea (`cantidad × costo unitario`) y estado
  del ítem (`Pendiente` / `Realizado`).
- **Desglose financiero explícito y honesto.** El modal muestra **Subtotal**
  (`Σ cantidad × costo unitario` de los ítems recibidos) y **Total** (el
  `totalAmount` guardado como snapshot del acuerdo). **No** se muestran líneas de
  descuento ni de impuesto: el modelo `treatment_plan_items` no las tiene
  (`src/lib/admin/types.ts:264–289`) y el issue las menciona solo como "(si
  aplican)".
- **Read-only vs `draft`.** Para planes `draft`, el modal muestra un botón
  "Editar" que cierra el detalle y abre el flujo de edición existente
  (`TreatmentPlanForm` vía el wrapper que ya hace el fetch en
  `TreatmentPlansTab.tsx:222–291`). Para cualquier otro estado, el modal es de solo
  lectura y **no** expone acciones de escritura (el backend ya rechaza mutaciones
  fuera de `draft`; la UI no las ofrece).
- **Cierre y accesibilidad.** El modal cierra con el botón ✕ (`aria-label`),
  clic fuera del panel y `Escape`. `role="dialog"`, `aria-modal="true"`,
  `aria-labelledby` apuntando al título y foco inicial en el botón ✕.
  `FormModal` (`src/components/admin/FormModal.tsx`) no ofrece ninguno de estos
  cierres; el modal nuevo sí, como criterio de aceptación del issue.
- **Responsive.** Panel `max-w-2xl` en desktop (más ancho que el `max-w-lg` de
  `FormModal`, para la tabla de ítems) con scroll interno; en móvil el panel ocupa
  el ancho disponible y la tabla de ítems se mantiene legible en una columna.
- **Cobertura de pruebas** con Vitest + Testing Library, escritas en RED antes de
  la implementación: suite nueva del modal y casos nuevos en la suite de la
  pestaña (apertura desde card y desde botón, contenido, desglose, draft vs
  no-draft, cierres, carga y error).

### Alcance

- Pestaña de planes del expediente: `TreatmentPlansTab.tsx` (cards + estado del
  modal de detalle) y el nuevo `TreatmentPlanDetailModal.tsx`.
- Sin cambios de datos, migraciones ni API: el endpoint `GET` del plan con ítems ya
  existe.
- Sin dependencias nuevas. Sin tocar `travelhub-app` (regla crítica del repo).

## Capabilities

- `treatment-plans` — delta en `specs/treatment-plans/spec.md` (sección
  `## MODIFIED Requirements`, requerimiento "Treatment plan tab in patient
  record").

### Impact on affected capabilities

| Capability | Impact | Descripción |
|------------|--------|-------------|
| `treatment-plans` | Modified (UI delta) | El requerimiento "Treatment plan tab in patient record" se reemplaza completo. Se preservan sus cuatro escenarios actuales (lista con estado/dentista/total, estado vacío, editor con total en vivo, editor de solo lectura para no-draft) y se agregan los escenarios de la vista de detalle: apertura desde card clicable, apertura desde el botón "Ver detalle", contenido de ítems, desglose subtotal/total, "Editar" disponible solo en `draft`, solo lectura en el resto, cierre por ✕ / clic fuera / `Escape`, estados de carga y error del fetch, y legibilidad en móvil. |

Otras capacidades (`patient-record-summary`, `admin-panel`) no cambian: la
pestaña ya existe y no se altera la enumeración de pestañas ni la API.

## Impact

| Area | Impact | Description |
|------|--------|-------------|
| `src/components/admin/patient-record/TreatmentPlanDetailModal.tsx` | New | Modal de detalle de solo lectura con fetch del plan e ítems, desglose subtotal/total y cierres ✕ / backdrop / `Escape`. |
| `src/components/admin/patient-record/TreatmentPlansTab.tsx` | Modified | Card clicable + botón "Ver detalle"; estado `detailPlanId`; apertura del detalle y paso a edición en `draft`. |
| `src/components/admin/patient-record/TreatmentPlanDetailModal.test.tsx` | New | Suite del modal (contenido, desglose, draft vs no-draft, cierres, carga, error, a11y). |
| `src/components/admin/patient-record/TreatmentPlansTab.test.tsx` | Modified | Casos de apertura del detalle desde card y desde botón, y de transición detalle → edición en `draft`. |

## Rollback plan

Cambio puramente de UI, sin migraciones, sin cambios de esquema y sin cambios de
API (el endpoint `GET` del plan ya existe):

1. **Código**: `git revert` del commit del cambio. Elimina
   `TreatmentPlanDetailModal.tsx` y su test, y revierte los cambios de
   `TreatmentPlansTab.tsx`. La pestaña vuelve a su comportamiento anterior (cards
   estáticas con Editar/Eliminar solo para `draft`).
2. **Specs**: el delta `treatment-plans` se descarta; el requerimiento
   "Treatment plan tab in patient record" del spec principal queda intacto con sus
   cuatro escenarios originales.
3. **Datos**: no hay rollback de datos. No se persiste nada nuevo, no se alteran
   filas y no se cambian columnas ni políticas RLS.
4. **Verificación del rollback**: `npm run test`, `npx tsc --noEmit` y
   `npm run build` deben quedar en verde y el detalle debe dejar de existir en la
   pestaña.

## Out of scope

- Totales de descuento e impuestos en el modelo de datos: `treatment_plan_items`
  no tiene esos campos y este cambio no los agrega. El modal muestra únicamente
  subtotal (suma de ítems) y total guardado.
- Breadcrumbs o navegación jerárquica nueva en el expediente.
- Vista inline expandible de la card (expansión en el árbol, sin modal): se elige
  modal para no alterar el layout de la lista.
- Impresión / PDF del plan de tratamiento.
- Extraer `formatCurrency`, `formatDate` y las etiquetas de estado a módulos
  compartidos (`src/lib/admin/*`): se reutilizan las copias locales existentes y el
  refactor queda anotado como follow-up en `design.md`.
- Cualquier modificación a `travelhub-app` (regla crítica: copiar + adaptar, nunca
  editar).
