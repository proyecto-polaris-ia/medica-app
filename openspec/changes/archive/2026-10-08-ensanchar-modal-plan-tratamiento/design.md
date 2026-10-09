# Design: ensanchar-modal-plan-tratamiento

Issue [#183](https://github.com/proyecto-polaris-ia/medica-app/issues/183) ·
Precedentes de ancho en el panel: `PatientRecordModal.tsx:44` (`max-w-4xl`) y
`TreatmentPlanDetailModal.tsx:121` (`max-w-2xl`, solo lectura).

## 1. Prop `size` en `FormModal` (`src/components/admin/FormModal.tsx`)

### D1 — El ancho hoy está hardcodeado

El contenedor del modal es hoy:

```tsx
<div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-lg">
```

Referencia observada: `src/components/admin/FormModal.tsx:20`. (El exploration
original citó `:16`; al verificar este worktree la línea del contenedor es la
20 — el archivo no tiene cambios locales.) La función no recibe ninguna prop de
tamaño ni de `className`.

### D2 — Prop `size` opcional, string plano, con mapa interno

Se agrega a la firma:

```tsx
type FormModalSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';

// dentro de FormModal:
size = 'md',
```

con un mapa interno:

```tsx
const sizeClasses: Record<FormModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  '2xl': 'max-w-6xl',
  full: 'max-w-full',
};
```

y el contenedor pasa a:

```tsx
<div className={`w-full ${sizeClasses[size]} rounded-lg bg-white p-6 shadow-lg`}>
```

Decisiones asociadas:

- **String plano, no callbacks ni `ReactNode` de clase.** `size` es serializable
  y seguro para server components; se evita exponer una prop `className` libre
  que rompa la consistencia de los modales del panel.
- **Default `'md'` = `max-w-lg`.** Reproduce la clase actual; los 6 call sites
  que no pasan `size` no cambian (`ClinicalVisitForm.tsx:155`,
  `app/(admin)/patients/page.tsx:391`, `app/(admin)/appointments/page.tsx:1033`,
  `app/(admin)/providers/page.tsx:159`, `app/(admin)/business-hours/page.tsx:160`,
  `app/(admin)/services/page.tsx:136`).
- **No agregar `'use client'` ni directivas nuevas.** `FormModal` no usa hooks ni
  estado; se mantiene como componente presentacional y la prop `size` es un
  literal de cadena.

### D3 — El componente sigue siendo puro

El cambio no introduce estado, efectos ni accesibilidad nueva; solo selecciona
una clase de ancho máximo. No cambian `title`, los botones "Cancelar"/"Guardar"
ni el manejo de `isSubmitting`.

## 2. Aplicación en `TreatmentPlanForm` (`src/components/admin/patient-record/TreatmentPlanForm.tsx`)

### D4 — `size="xl"` en el `FormModal`

La llamada está en `TreatmentPlanForm.tsx:350`. Se agrega `size="xl"`:

```tsx
<FormModal
  title={title}
  size="xl"
  onClose={onClose}
  ...
```

El modal pasa de 512 px (`max-w-lg`) a 896 px (`max-w-4xl`), suficiente para la
tabla de 7 columnas (`overflow-x-auto` en `:459`).

### D5 — Anchos, alineación y teclado de los inputs numéricos

La tabla de ítems captura Diente, Cantidad y Precio. Cambios:

| Columna | Línea | Clase actual | Clase nueva | Otros |
|---|---|---|---|---|
| Diente (`tooth`) | 492 | `w-16` | `w-16` (sin cambio) | FDI de 2 dígitos, no lo necesita |
| Cantidad (`quantity`) | 503 | `w-16` | `w-24` | agregar `text-right` |
| Precio (`unitPrice`) | 515 | `w-24` | `w-40` | agregar `text-right` e `inputMode="decimal"` |

Detalles:

- Los tres inputs comparten `tableInputClass` (definido en `:347`); los anchos se
  pasan como sufijos en el `className` del input, por lo que el cambio es local a
  cada `<input>`.
- React expone el atributo como `inputMode` (el DOM lo materializa como
  `inputmode`); se usa el nombre de React `inputMode="decimal"`. El input de
  precio ya tiene `type="number"` y `step="0.01"`.
- Solo se alinea el texto de los controles numéricos; no se cambian encabezados
  ni el resto de columnas.

### D6 — El scroll horizontal en móvil se conserva

`TreatmentPlanForm.tsx:459` ya envuelve la tabla en `overflow-x-auto` y el
`min-w-full` de la tabla se mantiene. No se agrega ninguna clase de responsive
nueva: el ancho `xl` del modal es un máximo, así que en pantallas estrechas el
modal se ajusta al ancho disponible y la tabla conserva su scroll horizontal
existente.

## 3. Estrategia de pruebas (TDD, `strict_tdd: true`)

Runner unitario: `npm test` (Vitest, `vitest run --exclude 'tests/e2e/**'`).
Auxiliares: `npx tsc --noEmit`, `npm run lint`, `npm run build`.

| Fase | Archivo | Contenido |
|---|---|---|
| RED | `src/components/admin/FormModal.test.tsx` (nuevo) | Default renderiza `max-w-lg`; `size="xl"` renderiza `max-w-4xl` |
| GREEN | `src/components/admin/FormModal.tsx` | Prop `size` + mapa `sizeClasses` |
| TRIANGULATE | `src/components/admin/FormModal.test.tsx` | `size="full"`, `size="sm"` y ausencia de la prop; render de `children`, `title` y botones sin cambios |
| REFACTOR | `FormModal.tsx` | Mantener el mapa legible y tipado sin alterar el contrato |
| Verificación de captura | `src/components/admin/patient-record/TreatmentPlanForm.test.tsx` (existente) | La suite ya cubre captura de ítems; se extiende solo si hace falta para ancho/alineación (los atributos `text-right`/`inputMode` se validan con typecheck y la suite existente) |

### Detalle RED

Nuevo `FormModal.test.tsx` con el mismo setup que
`src/components/admin/patient-record/TreatmentPlanForm.test.tsx` (Vitest jsdom +
`@testing-library/react`, `render`/`screen`). Caso mínimo:

```tsx
render(
  <FormModal title="T" onClose={() => {}} onSubmit={() => {}} isSubmitting={false}>
    <span>contenido</span>
  </FormModal>
);

// default = md
expect(screen.getByText('T').closest('div')).toHaveClass('max-w-lg');
```

y un segundo caso con `size="xl"` que espera `max-w-4xl`. **Antes de implementar
D2, ambas aserciones deben fallar** (la default porque la clase base viene fija y
el caso `xl` porque no existe la prop). Capturar el fallo y luego implementar el
mínimo para GREEN.

## 4. Alternativas rechazadas

- **Solo ensanchar los inputs del plan sin tocar el modal.** No resuelve la causa:
  la tabla de 7 columnas sigue comprimida dentro de 512 px; los inputs más
  anchos empujarían el resto de columnas fuera de vista y no mejorarían la
  verificación del precio/cantidad.
- **Hardcodear `max-w-4xl` en `TreatmentPlanForm` o duplicar el modal.** Introduce
  inconsistencia y duplicación; la prop `size` centraliza el contrato en el
  componente compartido.
- **Usar `max-w-2xl` como en `TreatmentPlanDetailModal.tsx:121`.** Ese modal es de
  **solo lectura**; para captura se sigue el issue #183 y el precedente de mayor
  ancho `PatientRecordModal.tsx:44` (`max-w-4xl`).
- **Aceptar `className` libre.** Permitiría anchos arbitrarios por call site y
  rompería la consistencia visual de los modales; un enum de tamaños es un
  contrato acotado y testeable.

## Open questions

- Ninguna bloqueante. El ajuste de la columna Diente queda fuera (es FDI de
  longitud corta); si más adelante se capturan notas por ítem largas, se abriría
  otro change.
