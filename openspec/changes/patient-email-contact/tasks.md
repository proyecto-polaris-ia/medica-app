# Tareas: Contacto por correo electrónico del paciente

**TDD:** RED → GREEN → REFACTOR. No modificar `travelhub-app`, contrato telefónico/CAPTCHA público ni agregar notificaciones.

## Review Workload Forecast

| Campo | Valor |
|---|---|
| Líneas modificadas estimadas | 800–1,050 (producción, migración y pruebas; specs no se reescriben) |
| Riesgo de presupuesto de 400 líneas | High |
| PRs encadenados recomendados | Yes (size:exception aprobada; un solo PR) |
| Estrategia de entrega | single-pr; size:exception approved |
| Estrategia de cadena | N/A |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

### Estado de evidencia

Todas las tareas están completas. La corrección de evidencia agregó pruebas y un harness SQL reproducible; queda pendiente únicamente la verificación independiente.

### Suggested Work Units

| Unidad | Objetivo / PR | Prueba enfocada | Runtime harness | Rollback boundary |
|---|---|---|---|---|
| 1 | Resolver/migración / único PR | `npm run test -- src/lib/booking/__tests__/patient-resolution.test.ts` | `supabase db reset` y checks; sin runtime, estado UNAVAILABLE y decisión bloqueada | `0007_*`, `patient-resolution.ts` |
| 2 | Booking interno / único PR | `npm run test -- app/api/admin/booking/book/route.test.ts src/components/booking/__tests__/ConfirmStep.test.tsx src/components/booking/BookingWizard.test.tsx` | N/A: auth/Supabase se mockean | ruta y componentes booking |
| 3 | CRUD admin / único PR | `npm run test -- src/lib/admin/__tests__/patients.test.ts app/api/admin/patients/route.test.ts 'app/api/admin/patients/[id]/route.test.ts'` | N/A: integración autenticada requiere Supabase | tipos, validación, API y página pacientes |
| 4 | WhatsApp/regresión / único PR | `npm run test` | N/A: no hay notificaciones; validar contratos con pruebas | `wcc-contacts.ts`, fixtures, regresiones |

## Phase 1: Esquema y resolución

- [x] 1.1 **RED:** ampliar `src/lib/booking/__tests__/patient-resolution.test.ts` para normalización, email-only, ambos contactos, `patientId`, ninguno, conflicto cruzado, enriquecimiento de `NULL` y carrera concurrente con relectura `23505/0 filas`.
- [x] 1.2 **GREEN:** crear `supabase/migrations/0011_patient_email_contact.sql` y `supabase/migrations/down/0011_patient_email_contact.down.sql`; actualizar `src/types.ts` y `src/lib/booking/patient-resolution.ts` con checks, índice, tipos nullable, UPDATE condicional y conflicto tipado.
- [x] 1.3 **REFACTOR:** centralizar canonicalización de correo/contactos y conservar llamadas phone-only de WhatsApp.

## Phase 2: Booking interno

- [x] 2.1 **RED:** cubrir en `app/api/admin/booking/book/route.test.ts` email-only, ambos, `patientId`, ausencia de contacto y HTTP 409; añadir pruebas de `ConfirmStep`, `BookingWizard` y `wizard-state` para correo interno y teléfono/CAPTCHA público intactos.
- [x] 2.2 **GREEN:** modificar la ruta admin y `src/components/booking/{ConfirmStep.tsx,BookingWizard.tsx,wizard-state.ts,PatientSearch.tsx}` para capturar, enviar y mostrar contactos según `mode="internal"`.
- [x] 2.3 **REFACTOR:** eliminar casts de nullable y mantener el payload público exclusivamente telefónico.

## Phase 3: CRUD administrativo

- [x] 3.1 **RED:** añadir pruebas de `src/lib/admin/__tests__/patients.test.ts`, rutas admin y página para email-only, ambos, normalización, búsqueda, duplicados y rechazo sin contacto.
- [x] 3.2 **GREEN:** actualizar `src/lib/admin/{types.ts,validate.ts,patients.ts}`, `app/api/admin/patients/**` y `app/(admin)/patients/page.tsx` con email nullable, unicidad y presentación.
- [x] 3.3 **REFACTOR:** unificar mapeo/errores de validación sin alterar delete ni autenticación existentes.

## Phase 4: Regresión y entrega

- [x] 4.1 **RED:** crear `src/lib/wcc-contacts.test.ts` y probar teléfono nullable solo en paciente vinculado; conservar teléfono obligatorio del contacto WhatsApp y contrato público.
- [x] 4.2 **GREEN/REFACTOR:** adaptar `src/lib/wcc-contacts.ts` y fixtures; ejecutar `npm run test`, `npx tsc --noEmit` y `npm run build`.
- [x] 4.3 Refetch/integrar main vigente (incluido `e3d41ca`), resolver conflictos y verificar localmente `git diff --check`/merge; GitHub se comprueba después del archive.
