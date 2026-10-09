# Verify Report: ensanchar-modal-plan-tratamiento

Fecha: 2026-10-08 · Branch: `eliumontoya/ux-modal-de-plan-de-tratamiento-es-demasiado-est`
Base: `fec6c11` · Issue: [#183](https://github.com/proyecto-polaris-ia/medica-app/issues/183)

## Resultados de verificación (verificador independiente, read-only)

| Check | Resultado |
| --- | --- |
| Superficie del diff | PASS: solo `FormModal.tsx` (+15/−1), `TreatmentPlanForm.tsx` (+6/−2) y archivos nuevos (`FormModal.test.tsx`, artefactos OpenSpec). Sin cambios no relacionados. |
| `npm test` (Vitest) | PASS: 173 archivos / 1789 tests (23 suites y 280 tests skipped, preexistentes). Focal: `FormModal.test.tsx` 5/5; `TreatmentPlanForm.test.tsx` 7/7. |
| `npm run build` (next build) | PASS: exit 0, compilación exitosa. |
| `npx tsc --noEmit` | PASS: exit 0. |
| `npm run lint` | PASS: exit 0; 25 warnings preexistentes fuera de los archivos tocados. |
| Compatibilidad backward | PASS: default `md` = `max-w-lg` (`FormModal.tsx:7,21`); 7 call sites vigentes, solo `TreatmentPlanForm.tsx:352` pasa `size="xl"`; los otros 6 no aparecen en el diff. |
| Criterios de aceptación del issue #183 | PASS (spot-checks): prop `size` con los 6 valores del mapa; default compatible; modal del plan en `xl` (`max-w-4xl`); cantidad `w-24` + `text-right`; precio `w-40` + `text-right` + `inputMode="decimal"`; Diente `w-16` intacto; `overflow-x-auto` de la tabla intacto (scroll horizontal en móvil). |

## TDD

- RED observado por el implementador: `npx vitest run src/components/admin/FormModal.test.tsx`
  → 3 fallos (`xl`/`sm`/`full` recibían `max-w-lg`) antes de tocar
  `FormModal.tsx`. El caso default ya pasaba por diseño (el `max-w-lg`
  existía hardcodeado).
- GREEN: 5/5 tras implementar la prop `size`; suite del plan 7/7 sin regresiones.
- Nota del verificador: el RED no es reproducible desde el árbol final (la
  implementación ya está aplicada); solo el GREEN fue observable de forma
  independiente.

## Cobertura de los criterios de aceptación del issue #183

- [x] `FormModal` acepta prop `size` con valores `'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full'`.
- [x] Default `md` conserva `max-w-lg` (backward compatible, 6 call sites sin cambios).
- [x] `TreatmentPlanForm` usa `size="xl"` (`max-w-4xl`, 896 px).
- [x] Cantidad permite ver ≥5 dígitos (`w-24`), precio ≥8 dígitos (`w-40`, ej. `15000.00`).
- [x] Tabla sin scroll horizontal requerido en ≥1024 px (modal de 896 px + paddings).
- [x] Modal responsive en móvil: tabla con `overflow-x-auto` conservado.
- [x] Los demás formularios con `FormModal` no cambian de tamaño.

## Pendiente / fuera de alcance

- El CLI `openspec` no está disponible en el entorno; la validación del delta se
  hizo por revisión semántica (RFC 2119 + escenarios Given/When/Then en los 5
  requirements).
- Los casos `lg` (`max-w-2xl`) y `2xl` (`max-w-6xl`) no tienen aserción de test
  (quedan cubiertos por el tipo y el mapa); agregarlos si se consumen por
  primera vez.
- Push y PR: pendientes de decisión del usuario.
