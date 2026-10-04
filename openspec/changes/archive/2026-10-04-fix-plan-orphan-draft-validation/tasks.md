# Tasks: fix-plan-orphan-draft-validation

## 1. Datos (test-first, BD local)

- [x] 1.1 Agregar a `createTreatmentPlan` en
      `src/lib/admin/__tests__/treatment-plans.test.ts` una prueba
      "aborts creation without persisting any rows when an item fails validation":
      plan con ítem `tooth: '99'` → `rejects.toThrow(ValidationError)` y
      `listTreatmentPlans(patient.id)` vacío + `treatment_plan_items` vacío.
- [x] 1.2 Confirmar RED: correr la suite treatment-plans con `npm run test:local`
      y observar el fallo de la prueba nueva contra el código actual.

## 2. Implementación

- [x] 2.1 En `src/lib/admin/treatment-plans.ts`, mover el mapeo/validación de
      ítems (`itemsPayload`) antes del INSERT de `treatment_plans`, dentro de
      `createTreatmentPlan`.
- [x] 2.2 Confirmar GREEN: la prueba nueva y la suite treatment-plans completa
      pasan en `npm run test:local`.

## 3. Verificación y cierre

- [x] 3.1 `npx tsc --noEmit` y `npm run lint` en verde.
- [x] 3.2 `openspec validate` (si está disponible) sobre el change.
- [x] 3.3 Work-unit commit(s) convencionales en la rama con fix + test + change.
