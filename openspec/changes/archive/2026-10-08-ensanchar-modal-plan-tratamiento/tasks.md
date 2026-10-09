# Tasks: ensanchar-modal-plan-tratamiento

Ensanchar el modal de captura del plan de tratamiento mediante una prop `size`
opt-in en `FormModal` y ajustar la legibilidad de los inputs numéricos de su
tabla (issue
[#183](https://github.com/proyecto-polaris-ia/medica-app/issues/183)).

Convención de estado: `[ ]` pendiente · `[x]` completo. TDD activo
(`openspec/config.yaml` → `strict_tdd: true`): primero la prueba que falla
(**RED**), luego la implementación mínima (**GREEN**), después triangular bordes
y refactorizar en verde.

Runners: `npm test` (Vitest, unitarias y de componente). Auxiliares:
`npx tsc --noEmit`, `npm run lint`, `npm run build`.

Cada tarea cita los requirements del delta
`specs/admin-ui-modals/spec.md` y las decisiones (`D#`) de `design.md`.

---

## Fase 0 — Artefactos SDD (completado)

- [x] 0.1 `proposal.md` — alcance, decisiones (prop `size` opt-in, default `md`,
  `xl` para el plan, anchos de inputs), riesgos, rollback y criterios de éxito.
- [x] 0.2 `specs/admin-ui-modals/spec.md` — capability nueva (ADDED): prop
  `size`, mapa de anchos, default compatible, modal `xl` del plan e inputs
  numéricos legibles con scroll horizontal en móvil.
- [x] 0.3 `design.md` — decisiones D1–D6, estrategia TDD y alternativas
  rechazadas.
- [x] 0.4 `tasks.md` — este plan.

---

## Fase 1 — RED: prueba del tamaño de `FormModal`

Evidencia: `npx vitest run src/components/admin/FormModal.test.tsx` → 3 fallos
(`xl`/`sm`/`full` reciben `max-w-lg`) y 2 pasan; RED observado antes de tocar
`FormModal.tsx`.

- [x] 1.1 Crear `src/components/admin/FormModal.test.tsx` (Vitest jsdom +
  Testing Library, mismo setup que `TreatmentPlanForm.test.tsx`) con un helper de
  render que pase `title`, `children`, `onClose`, `onSubmit` e `isSubmitting`
  (D6-§3).
- [x] 1.2 RED (D2): sin `size`, el contenedor del modal renderiza `max-w-lg`.
  Cubre: "Tamaño por defecto compatible" / "Tamaño no especificado".
- [x] 1.3 RED (D2): con `size="xl"`, el contenedor renderiza `max-w-4xl`.
  Cubre: "Tamaño configurable del modal de formulario" / "Cada tamaño aplica su
  ancho máximo".
- [x] 1.4 Correr la suite nueva y **confirmar que falla** (RED observado) antes
  de tocar `FormModal.tsx`: `npm test -- src/components/admin/FormModal.test.tsx`.

---

## Fase 2 — GREEN: prop `size` en `FormModal`

Evidencia: `npx vitest run src/components/admin/FormModal.test.tsx` → 5 pasan
(default `md`, `xl`, `sm`, `full`, render de title/children/botones).

- [x] 2.1 GREEN (D1, D2): agregar el tipo `FormModalSize`, el mapa
  `sizeClasses` (`sm`=`max-w-md`, `md`=`max-w-lg`, `lg`=`max-w-2xl`,
  `xl`=`max-w-4xl`, `2xl`=`max-w-6xl`, `full`=`max-w-full`) y el default `md`
  en `src/components/admin/FormModal.tsx:20`. Cubre: "Tamaño configurable del
  modal de formulario".
- [x] 2.2 GREEN (D2): mover `max-w-lg` de la clase fija a la selección por
  `sizeClasses[size]`; no agregar `'use client'`, hooks ni estado (D3).
- [x] 2.3 Correr `npm test -- src/components/admin/FormModal.test.tsx` y
  confirmar GREEN.
- [x] 2.4 TRIANGULATE (D2): agregar casos para `size="sm"` (`max-w-md`) y
  `size="full"` (`max-w-full`), y confirmar que `title`, `children` y los
  botones "Cancelar"/"Guardar" siguen renderizando igual. Cubre: "Tamaño
  configurable del modal de formulario".
- [x] 2.5 REFACTOR en verde: mantener el mapa tipado y legible; re-correr la
  prueba.

---

## Fase 3 — Aplicar al plan de tratamiento

Evidencia: `npx vitest run src/components/admin/patient-record/TreatmentPlanForm.test.tsx`
→ 7 pasan, sin regresiones.

- [x] 3.1 GREEN (D4): pasar `size="xl"` al `FormModal` de
  `src/components/admin/patient-record/TreatmentPlanForm.tsx:350`. Cubre:
  "Modal amplio para la captura del plan de tratamiento".
- [x] 3.2 GREEN (D5): en la tabla de ítems, cantidad (`quantity`) de `w-16` a
  `w-24` y precio (`unitPrice`) de `w-24` a `w-40`; agregar `text-right` a
  ambos. Cubre: "Inputs numéricos de la tabla del plan visibles y alineados".
- [x] 3.3 GREEN (D5): agregar `inputMode="decimal"` al input de precio
  (`TreatmentPlanForm.tsx:515`), conservando `type="number"` y `step="0.01"`.
  Cubre: "Inputs numéricos de la tabla del plan visibles y alineados".
- [x] 3.4 GREEN (D4, D6): conservar Diente en `w-16`
  (`TreatmentPlanForm.tsx:492`) y el contenedor `overflow-x-auto` de la tabla
  (`:459`). Cubre: "El ancho de Diente no cambia" y "Desbordamiento horizontal
  de la tabla en móvil".
- [x] 3.5 Correr `npm test -- src/components/admin/patient-record/TreatmentPlanForm.test.tsx`
  y confirmar que la captura de ítems sigue en verde (ajustar la suite solo si
  alguna aserción depende del ancho).

---

## Fase 4 — Verificación

Evidencia (verificador independiente read-only, task mv0ckbx0-4-m23x):
`npm test` → 173 archivos / 1789 tests PASS (23 suites y 280 tests skipped,
preexistentes); `npm run build` → exit 0; `npx tsc --noEmit` → exit 0;
`npm run lint` → exit 0 (25 warnings preexistentes, ninguno en los archivos
tocados). Detalle completo en `verify-report.md`.

- [x] 4.1 `npx tsc --noEmit` en verde (valida la unión `FormModalSize` y el
  atributo React `inputMode`).
- [x] 4.2 `npm run lint` en verde.
- [x] 4.3 `npm test` en verde (incluye `FormModal.test.tsx` y la suite del plan).
- [x] 4.4 `npm run build` en verde.
- [x] 4.5 Confirmado por grep: default `md` = `max-w-lg` en `FormModal.tsx:7`;
  solo `TreatmentPlanForm.tsx:352` pasa `size="xl"`; los otros 6 call sites no
  cambian y no aparecen en el diff. Cubre: "Los call sites existentes no cambian".
- [x] 4.6 Criterios de éxito del `proposal.md` revisados uno a uno en
  `verify-report.md`. Nota: el CLI `openspec` no está disponible en el repo ni
  globalmente; la validación del change se hizo por revisión semántica del
  delta (RFC 2119 + escenarios).
