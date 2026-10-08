# Feature: add-treatment-plan-detail-view (Issue #178)

Vista de detalle para planes de tratamiento en el expediente del paciente.

## Context
- Issue: https://github.com/proyecto-polaris-ia/medica-app/issues/178 (status:approved)
- Worktree: `.worktrees/medica-app/agregar-vista-de-detalle-para-planes-de-tratamie`
- Branch: `eliumontoya/agregar-vista-de-detalle-para-planes-de-tratamie`
- Ciclo SDD: openspec/changes/add-treatment-plan-detail-view/

## Tasks
1. [x] Explorar código + docs (gentle-ai-explore, exploration.md)
2. [x] Propuesta OpenSpec (proposal.md)
3. [x] Specs + design (specs/treatment-plans/spec.md, design.md)
4. [x] Tasks (tasks.md con forecast)
5. [ ] Apply: TreatmentPlanDetailModal + cambios en TreatmentPlansTab (TDD)
6. [ ] Verify: npm run test + tsc + build
7. [ ] Archive + commit + push + PR

## Decisiones
- Desglose financiero: Subtotal (Σ quantity × unitPrice) + Total (`totalAmount` snapshot). Sin líneas de descuento/impuesto (no existen en el modelo; el issue las marca "si aplican").
- Acceso: card clicable + botón "Ver detalle" explícito (accesibilidad/teclado).
- Draft: modal de detalle ofrece acción "Editar" que abre el flujo existente.
- No-borrador: solo lectura.
- Cierre: X, click fuera y Escape (criterio de aceptación; FormModal no lo soporta, el modal nuevo sí).

## Commits
- (pending)
