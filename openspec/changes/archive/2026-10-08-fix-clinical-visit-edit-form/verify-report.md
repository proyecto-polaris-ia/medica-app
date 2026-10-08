# Verify Report: fix-clinical-visit-edit-form (issue #181)

Fecha: 2026-10-08

## Comandos ejecutados

| Check | Comando | Resultado |
|---|---|---|
| Tests | `npx vitest run src/components/admin/patient-record/ClinicalVisitForm.test.tsx` | RED inicial: 4 failed / 3 passed; tras el fix: **7 passed (7)** |
| Typecheck | `npx tsc --noEmit` | exit 0, sin errores |
| Lint | `npm run lint` | exit 0; 0 errors, 25 warnings preexistentes en archivos ajenos al change |

## Evidencia TDD

- **RED** (antes del fix): los 4 casos de re-render fallaron con los valores observados
  esperados — precarga de edición recibió `''` en Subjetivo (esperado
  "Dolor en molar inferior"); limpieza a nueva consulta conservó el texto editado;
  datos escritos persistieron tras cambiar a `visit={null}`; cambio a otra consulta
  conservó el texto de la consulta anterior.
- **GREEN** (tras agregar `useEffect(() => { setFormData(visitToInput(visit)); }, [visit])`
  en `ClinicalVisitForm.tsx`): 7 passed (7), incluidos los 3 casos preexistentes
  (guardado + adjuntos, cancelar, reutilización de id en PATCH).
- **Triangulación**: los casos de residuos (escribir → `visit={null}`) y de cambio entre
  consultas quedaron en verde con el mismo fix mínimo (1 statement).

## Verificación independiente (gentle-ai-verify)

- Causa raíz confirmada: `PatientVisitsTab.tsx:166-169` monta `<ClinicalVisitForm>` de
  forma persistente sin `key`; `useState(visitToInput(visit))` corre solo en el primer
  montaje (`ClinicalVisitForm.tsx:46`).
- Seguridad de la dependencia `[visit]`: las transiciones del padre (`handleEdit`,
  `handleNew`, `handleClose`/`handleSaved`) siempre nulifican `editingVisit`; el flujo de
  adjuntos post-guardado usa estado separado (`savedVisit`/`visitFiles`) y no se ve
  afectado.
- Cobertura de criterios de aceptación del issue #181: edición precarga S/O/A/P/
  Tratamiento/Notas (test `:243`); "Nueva consulta" vacía (`:268`); sin residuos entre
  aperturas (`:281`); cambio de consulta (`:297`); ruta PATCH de guardado cubierta por
  el test preexistente (`:193`).
- Convención OpenSpec: delta con `## ADDED Requirements` bajo la capacidad
  `clinical-record`, escenarios RFC 2119; promovido al baseline
  `openspec/specs/clinical-record/spec.md` en este archive.
- Limpieza: `git status` sin archivos fuera del alcance del change.

## Nota

La ejecución de RED corresponde al writer (tarea `mv04u1h5-1-hx79`); la verificación
independiente la confirmó estructuralmente (los 4 tests usan `rerender` sobre la misma
instancia, imposible que pasen sin el resync) sin replicarla para no mutar el worktree.
