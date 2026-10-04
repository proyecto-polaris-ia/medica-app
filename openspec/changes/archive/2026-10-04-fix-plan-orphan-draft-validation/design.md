# Design: fix-plan-orphan-draft-validation

## Contexto

`createTreatmentPlan` en `src/lib/admin/treatment-plans.ts` hoy ejecuta:

1. `planPayload` + INSERT en `treatment_plans` (con `select().single()`).
2. Si `input.items` es no vacío: `.map` que valida cada ítem
   (`parseNonEmptyString`, `normalizeServiceId`, `parseFdiTooth`,
   `parseMoney`) → el primer dato inválido lanza `ValidationError`.
3. El `.insert(itemsPayload)` está dentro de un `try/catch` que hace el
   `delete` compensatorio del plan; el `.map` del paso 2 está **fuera** de ese
   `try`.

El issue #123 documenta que el paso 2 deja el plan huérfano cuando lanza.

## Decisión

Opción mínima del issue: **mover el mapeo/validación de ítems antes del primer
INSERT**. El bloque queda:

1. Construir `planPayload` (valida campos del plan, no toca la BD).
2. Si `input.items` es no vacío, construir `itemsPayload` con el `.map`
   (valida todo; cualquier `ValidationError` aborta antes de tocar la BD).
3. INSERT del plan.
4. INSERT de ítems dentro del `try/catch` existente (el cleanup compensatorio
   se conserva para el camino de fallo de BD, p. ej. violación de CHECK).

No se introduce el RPC transaccional (non-goal): mantiene el diff mínimo y el
cleanup existente sigue cubriendo los fallos de BD. Queda anotado para
evaluarse si aparece una segunda carrera de este tipo.

## Riesgos

- Bajo: solo reordena validación previa a escritura; no cambia contratos de
  tipos ni respuestas de error. Los errores de validación siguen siendo 422.
- La prueba nueva corre solo en `npm run test:local` (BD local), igual que el
  resto de la suite de `treatment-plans.test.ts`.

## Verificación

- Test-first: la prueba nueva (ítem con `tooth: '99'` → `ValidationError` y
  `listTreatmentPlans(patient.id)` vacío + `treatment_plan_items` vacío) debe
  fallar (RED) contra el código actual, y pasar (GREEN) con el fix.
- `npx tsc --noEmit` y `npm run test:local` (suite treatment-plans) en verde.
