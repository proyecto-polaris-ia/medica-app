# Verify Report — add-treatment-plan-detail-view (#178)

Verificado el 2026-10-08 en el worktree `agregar-vista-de-detalle-para-planes-de-tratamie` @ `7e5893f` (feat) + `7e7f3dc` (docs) + `3ee2326` (fix de review). Árbol de trabajo limpio antes y después de las verificaciones.

| # | Check | Resultado | Evidencia |
| --- | --- | --- | --- |
| 1 | `npm run test -- --run` | PASS | `Test Files 148 passed \| 22 skipped (170)`; `Tests 1428 passed \| 244 skipped (1672)`; exit 0. |
| 2 | `npx tsc --noEmit` | PASS | Sin salida; exit 0. |
| 3 | `npm run build` | PASS | `next build` completo, exit 0; tabla de rutas emitida. |
| 4 | Delta preserva los 4 escenarios existentes | PASS | Extracción programática: los 4 escenarios del requirement "Treatment plan tab in patient record" son byte-idénticos entre el spec principal y el delta. |
| 5 | Total = snapshot guardado, nunca recalculado | PASS | `TreatmentPlanDetailModal.tsx:233` renderiza `formatCurrency(plan.totalAmount)`; test afirma `$1,500.00` guardado ≠ suma de ítems `$1,400.00`. |
| 6 | Subtotal = Σ cantidad × unitPrice | PASS | `sumLineTotals` con acumulación en centavos enteros (`TreatmentPlanDetailModal.tsx:37-40`, render `:228`). |
| 7 | "Editar" solo con estado draft FETCHEADO | PASS | `canEdit = plan?.status === 'draft' && onEdit !== undefined` (`:106`); `plan` proviene del fetch (`:63-66`). |
| 8 | Cierre ✕ / overlay / Escape con cleanup | PASS | Overlay solo si `event.target === event.currentTarget` (`:112`); listener de Escape registrado/removido (`:92-99`). Tests `:190-217`. |
| 9 | `role=dialog` + `aria-modal`, foco al abrir | PASS | `:118-120`; test de `aria-modal`, `aria-labelledby` y foco inicial (`DetailModal.test.tsx:241-257`). |
| 10 | `stopPropagation` en botones dentro de la card | PASS | Ver detalle `:184`, Editar `:196`, Eliminar `:206`. |
| 11 | `handleEditFromDetail` cierra el detalle antes de editar | PASS | `setDetailPlanId(null)` precede a `setIsFormOpen(true)` (`TreatmentPlansTab.tsx:82-88`); test `TreatmentPlansTab.test.tsx:329-351`. |

## Review nativo (RDD)

- Lineage `review-1081883280660238`: lente `review-reliability` + refuter → hallazgo CRÍTICO R3-001 (el `onKeyDown` de la card no verificaba `event.target` y `preventDefault` cancelaba la activación nativa de los botones anidados con teclado).
- Corrección acotada aplicada (`fix(patients): guard plan card keydown to its own target (#178)`, guard `event.target !== event.currentTarget`), validada por targeted validator.
- Estado final: **approved**, autoridad quemada (`gentle-ai.review-acknowledged/v1`).

## Hallazgos (no bloqueantes)

- **W1 — Low (accesibilidad):** `role="button"` en un `<article>` que contiene botones reales anidados (ARIA nesting inválido). Fuera de los escenarios requeridos por el spec; también anotado por el review nativo como R3-002 (WARNING informativo). Follow-up sugerido.
- **W2 — Low (docs):** El escenario preservado "Editor is read-only for non-draft plans" dice "abre el detalle del plan", ambiguo frente al nuevo escenario de detalle. Texto preservado verbatim por la convención del delta; riesgo solo de claridad.
- **W3 — Info (cobertura):** Sin test que afirme que Editar/Eliminar con clic no abre también el detalle (comportamiento confirmado estructuralmente, no por aserción observada).

## Veredicto

**PASS WITH WARNINGS** — sin fallos funcionales ni de conformidad con el spec.
