# Change: Evitar plan de tratamiento huérfano cuando falla la validación de un ítem

## Summary

Cierra el issue #123: `createTreatmentPlan` inserta el plan en `treatment_plans`
**antes** de validar los ítems, y el `.map` de validación corre fuera del
`try/catch` del cleanup compensatorio. Un ítem inválido (diente FDI fuera de
rango, `unitPrice` negativo, descripción vacía) deja un plan draft con 0 ítems y
total 0 que la API reporta como no creado (422). El fix valida **todos** los
ítems antes del primer INSERT, de modo que cualquier dato inválido aborta sin
tocar la BD.

## Problem

En `src/lib/admin/treatment-plans.ts`, el flujo de `createTreatmentPlan` es:

1. Inserta el plan (`status: 'draft'`, `total_amount: 0`).
2. Si hay ítems, los mapea/valida (`parseNonEmptyString`, `parseFdiTooth`,
   `parseMoney`) **fuera** del `try` que hace el `delete` compensatorio.
3. Un `ValidationError` en el paso 2 no ejecuta el cleanup: queda un plan
   huérfano en draft, visible en listados y expediente, y puede ser presentado o
   aceptado después.

El camino de fallo de BD (`quantity: 0` viola `treatment_plan_items_quantity_check`)
sí ejecuta el cleanup y está cubierto por pruebas. El hueco es solo la validación
de ítems en memoria.

## Goals

- Invariante de atomicidad observable: si la creación de un plan falla por
  validación de ítems, **ninguna fila** persiste en `treatment_plans` ni en
  `treatment_plan_items`.
- Prueba contra BD local (`npm run test:local`) que afirme la ausencia de filas
  tras un fallo de validación de ítem.

## Non-goals

- RPC transaccional en Postgres (alternativa del issue): se evalúa aparte; este
  change mantiene el cleanup compensatorio para el camino de fallo de BD.
- Cambios en `updateTreatmentPlanItem`, `createTreatmentPlanItem` u otros
  puntos del módulo.

## Rollback Plan

Revertir el commit de la rama: el orden original (insert de plan → mapeo de
ítems) se restaura y el comportamiento vuelve al estado actual. El cambio es de
un solo bloque en `createTreatmentPlan` más pruebas; riesgo de reversión mínimo.

## Impact

- **Código**: `src/lib/admin/treatment-plans.ts` (solo `createTreatmentPlan`).
- **Pruebas**: `src/lib/admin/__tests__/treatment-plans.test.ts`.
- **Specs**: `treatment-plans` (requisito de CRUD, escenario nuevo).
