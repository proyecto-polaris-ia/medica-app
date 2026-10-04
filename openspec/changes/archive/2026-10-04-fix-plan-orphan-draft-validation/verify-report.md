# Verify Report: fix-plan-orphan-draft-validation

## Resultado: PASS WITH WARNINGS

### Test-first (RED → GREEN)

- **RED**: con el código original, la prueba nueva
  `aborts creation without persisting rows when item validation fails`
  (`src/lib/admin/__tests__/treatment-plans.test.ts`) falla exactamente como
  describe el issue #123: el plan "Plan X" queda persistido en draft con
  `totalAmount: 0` y 0 ítems (`listTreatmentPlans` no está vacío).
- **GREEN**: tras mover el mapeo/validación de ítems antes del primer INSERT en
  `createTreatmentPlan`, la suite `treatment-plans` pasa completa:
  **38/38 tests** contra Supabase local (`supabase db reset` + `test:local`).

### Verificación completa

- `npx tsc --noEmit`: OK.
- `npm run lint`: 0 errores (33 warnings preexistentes).
- `npm run test:local` completo: 1351/1359 tests pasan. Los 8 fallos de
  `patient-files.test.ts` son **preexistentes** en la rama base (verificados
  ejecutando la suite con los cambios guardados en stash) y no guardan
  relación con este change (módulo de archivos de paciente / storage local).

### Commits

- Ver commits en la rama `eliumontoya/bug-plans-plan-de-tratamiento-hu-rfano-en-draft`.
