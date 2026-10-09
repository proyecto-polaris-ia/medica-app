# Change: Ensanchar el modal de plan de tratamiento (prop `size` en `FormModal`)

## Why

El modal de captura del plan de tratamiento es demasiado estrecho. Su contenedor
viene del componente compartido `FormModal`
(`src/components/admin/FormModal.tsx`), que fija el ancho con `max-w-lg`
(hardcodeado, 512 px) sin ofrecer ninguna forma de ajustarlo:

```tsx
<div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-lg">
```

`TreatmentPlanForm` monta dentro de ese modal una tabla de ítems de **7 columnas**
(Diente, Cantidad, Precio, Servicio, Estado, …) con controles de captura muy
estrechos: cantidad `w-16` (64 px) y precio `w-24` (96 px). Con ese ancho el
usuario:

- no puede ver el valor completo de cantidades y precios mientras captura, lo
  que impide **verificar** que lo tecleado corresponde a lo que quiso capturar;
- puede confundir dígitos, mezclar cantidad con precio o dejar valores truncados
  fuera de la vista;
- incrementa el riesgo de errores de captura que después se traducen en errores
  de **facturación** (montos de plan y totales derivados).

Este change cubre el issue
[#183](https://github.com/proyecto-polaris-ia/medica-app/issues/183) y se apoya en
precedentes ya existentes en el panel: `PatientRecordModal.tsx` ya usa
`max-w-4xl` para vistas de expediente y `TreatmentPlanDetailModal.tsx` usa
`max-w-2xl` para la vista de solo lectura del plan. La ruta de captura
(`TreatmentPlanForm`) es la que necesita más espacio.

## What Changes

- **`FormModal` gana una prop opcional `size`.** Acepta
  `'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full'` y traduce a un ancho máximo:
  `sm` = `max-w-md`, `md` = `max-w-lg`, `lg` = `max-w-2xl`, `xl` = `max-w-4xl`,
  `2xl` = `max-w-6xl`, `full` = `max-w-full`. El default es `'md'` =
  `max-w-lg`, exactamente el ancho actual.
- **Compatibilidad hacia atrás garantizada.** Los otros 6 call sites de
  `FormModal` (`ClinicalVisitForm.tsx`, `patients/page.tsx`,
  `appointments/page.tsx`, `providers/page.tsx`, `business-hours/page.tsx`,
  `services/page.tsx`) no se tocan y siguen renderizando `max-w-lg`; la prop es
  opt-in.
- **`TreatmentPlanForm` usa `size="xl"` (`max-w-4xl`, 896 px).** El modal de
  captura del plan de tratamiento pasa de 512 px a 896 px, dando aire a la tabla
  de 7 columnas sin llegar a pantalla completa.
- **Controles numéricos legibles y alineados.** En la tabla de ítems:
  - cantidad (`quantity`): de `w-16` a `w-24` (96 px) y `text-right`;
  - precio unitario (`unitPrice`): de `w-24` a `w-40` (160 px), `text-right` y
    `inputMode="decimal"` (teclado numérico con decimales tipo `type="number"`
    en `step="0.01"`);
  - Diente (`tooth`) conserva `w-16`: es una notación FDI de 2 dígitos y no
    presenta el problema de longitud.
- **Sin dependencias, sin migraciones y sin backend.** Cambio exclusivamente de
  presentación en componentes React del panel administrativo.

### Alcance

- `src/components/admin/FormModal.tsx`: nueva prop `size` + mapa de clases.
- `src/components/admin/patient-record/TreatmentPlanForm.tsx`: `size="xl"` y
  ajuste de ancho/alineación/teclado de los inputs numéricos.
- Prueba nueva `src/components/admin/FormModal.test.tsx` (Vitest + Testing
  Library) que cubre el default y `size="xl"`.
- Sin cambios en rutas, capa de datos, Supabase, migraciones ni `travelhub-app`
  (regla crítica del repo).

## Capabilities

### New Capability: `admin-ui-modals`

Se crea la capability **`admin-ui-modals`** en
`openspec/specs/admin-ui-modals/spec.md`. Captura el contrato observable de
tamaño de los modales de formulario del panel (`FormModal`): prop `size`, mapa de
anchos, default compatible, ancho amplio para el plan de tratamiento y
legibilidad de los inputs numéricos de su tabla, incluido el
desbordamiento horizontal en móvil.

Se elige una capability nueva en lugar de un delta sobre `admin-panel` porque
`admin-panel` describe autenticación, CRUD y preferencias, y solo menciona
modales concretos (notas de cita, expediente), pero **no** existe hoy ninguna
capability que describa el comportamiento genérico y reutilizable de los modales
de formulario. Meter la prop `size` de `FormModal` dentro de un requisito de
`admin-panel` la dejaría acoplada a un CRUD que no la posee.

### Modified Capabilities

Ninguna.

## Impacto

| Área | Impacto | Descripción |
|---|---|---|
| `src/components/admin/FormModal.tsx` | Modified | Prop opcional `size` (`'sm'\|'md'\|'lg'\|'xl'\|'2xl'\|'full'`) con mapa de clases; default `md` = `max-w-lg`. El contenedor sigue siendo el mismo elemento; solo cambia la clase de ancho máximo. |
| `src/components/admin/patient-record/TreatmentPlanForm.tsx` | Modified | `size="xl"` en el `FormModal`; cantidad `w-16` → `w-24`, precio `w-24` → `w-40`, ambos `text-right`; precio con `inputMode="decimal"`. Diente conserva `w-16`. |
| `src/components/admin/FormModal.test.tsx` | New | Prueba de componente: default renderiza `max-w-lg`; `size="xl"` renderiza `max-w-4xl`. |
| `src/components/admin/patient-record/TreatmentPlanForm.test.tsx` | Conservado / ajustado | La suite existente sigue cubriendo la captura de ítems; se ajusta solo si alguna aserción depende del ancho (no esperado). |
| Los otros 6 call sites de `FormModal` | Conservados | `ClinicalVisitForm.tsx`, `patients/page.tsx`, `appointments/page.tsx`, `providers/page.tsx`, `business-hours/page.tsx`, `services/page.tsx` sin cambios; siguen con `max-w-lg`. |
| Dependencias / migraciones / backend | Sin cambios | No se agregan librerías ni esquema; no se tocan rutas ni Supabase. |

## Decisions

| Decisión | Valor | Razón |
|---|---|---|
| Cómo ensanchar | Prop `size` con mapa semántico en `FormModal` | El ancho está hardcodeado y es compartido por 7 call sites; una prop opt-in evita hardcodear `max-w-4xl` en un call site y deja el default intacto. |
| Valores de `size` | `sm`/`md`/`lg`/`xl`/`2xl`/`full` | Escala semántica y serializable; deja cubiertos los modales existentes y futuros sin exponer clases Tailwind crudas por call site. |
| Default | `md` = `max-w-lg` | Preserva byte a byte el ancho actual; los 6 call sites que no cambian no se ven afectados. |
| Ancho para el plan | `xl` = `max-w-4xl` (896 px) | Alinea con el precedente `PatientRecordModal.tsx:44` (`max-w-4xl`) y da espacio a la tabla de 7 columnas sin ocupar toda la pantalla. |
| Anchos de inputs | Diente `w-16`, cantidad `w-24`, precio `w-40` | Diente es FDI (2 dígitos) y no lo necesita; cantidad y precio son los que hoy se recortan y causan el error de captura. |
| Tipo de prop | `size?: FormModalSize` (string plano) | Serializable y seguro para server components; no se agregan callbacks ni directivas de cliente. |
| Solo presentación | Sin cambios de contrato ni datos | El fix es de ancho/alineación; el payload de guardado y las rutas no se tocan. |

## Fuera de alcance

- Cambiar la disposición/columnas de la tabla de ítems del plan de tratamiento.
- Aplicar `size` distinto a los otros 6 call sites de `FormModal` (siguen con el
  default `md`).
- Unificar `TreatmentPlanDetailModal` (solo lectura) o rediseñar su ancho.
- Virtualización de tablas o reflow responsive más allá del scroll horizontal ya
  existente.
- Cualquier edición dentro de `travelhub-app`.

## Riesgos

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Regresión en los 6 call sites que dependen de `max-w-lg` | Baja | La prop es opcional y el default `md` reproduce la clase actual; se cubre con la prueba del default y se verifica por inspección que las 6 llamadas no pasan `size`. |
| El modal `xl` (896 px) desborde pantallas pequeñas | Baja | El contenedor del overlay mantiene `p-4` y la tabla ya vive en `overflow-x-auto`; en móvil el modal se ajusta al 100% del ancho disponible y la tabla hace scroll. |
| `text-right` rompa la lectura de la tabla | Baja | Solo se alinea el texto de los inputs numéricos; los encabezados y demás columnas no cambian. |
| Nombres de prop distintos entre React y HTML | Baja | React usa `inputMode` (atributo DOM `inputmode`); se usa el nombre de React. |

## Rollback plan

- **Reversión por archivos, sin migraciones.** Revertir
  `src/components/admin/FormModal.tsx`, eliminar
  `src/components/admin/FormModal.test.tsx` y revertir los ajustes de
  `TreatmentPlanForm.tsx` restaura exactamente el comportamiento y los anchos
  anteriores. No hay datos persistentes ni esquema que revertir.
- **La prop es aditiva y opt-in.** Si se revierte solo `TreatmentPlanForm`, el
  `FormModal` con `size` sigue funcionando (el default `md` es idéntico al estado
  previo); si se revierte solo `FormModal`, ninguna otra llamada pasa `size`, así
  que no queda residuo roto.
- **Sin dependencias.** `package.json` no cambia; el rollback no requiere
  reinstalar nada.

## Criterios de éxito

- [ ] `FormModal` acepta `size` opcional con los seis valores y cada uno produce
      su ancho máximo esperado.
- [ ] Sin `size`, `FormModal` renderiza `max-w-lg` (los 6 call sites sin cambios
      preservan su layout actual).
- [ ] El modal de `TreatmentPlanForm` se renderiza con el ancho `xl`
      (`max-w-4xl`).
- [ ] Los inputs de cantidad y precio muestran al menos 5 y 8 dígitos
      respectivamente, con texto alineado a la derecha; el precio usa
      `inputMode="decimal"`.
- [ ] En móvil la tabla puede hacer scroll horizontal sin romper el layout del
      modal.
- [ ] `npx tsc --noEmit`, `npm run lint`, `npm test` y `npm run build` en verde.
- [ ] No se agregan dependencias, no hay migraciones y no se modifica
      `travelhub-app`.
