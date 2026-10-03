# Verify Report — clara-daily-contact-list

Fecha: 2026-10-03 · Verificador: gentle-ai-verify · Rama: eliumontoya/feat-clara-3-borradores-mensaje
Issue: [#89](https://github.com/proyecto-polaris-ia/medica-app/issues/89)

## Veredicto: PASS WITH WARNINGS

## Comandos

| Verificación | Resultado |
|---|---|
| `npm run test` | PASS — 127 archivos / 1101 tests |
| `npx tsc --noEmit` | PASS — exit 0 |
| `npm run build` | PASS — compila `/follow-up` y `/whatsapp-command-center/follow-up-drafts` |
| `npm run lint` | N/A — script inexistente en `package.json` (limitación registrada, no se inventa runner) |
| Revisión de migraciones | PASS — `0019` y `0020` siguen el patrón de `0018`; ups idempotentes; downs invierten el orden |
| Guardrail sin cron | PASS — `vercel.json` sin cambios en la rama; no existe ruta cron de follow-up |

## Estructura

- Migración `0019_follow_up_contacts.sql`: enum `follow_up_contact_status` con guarda `pg_type`, tabla `follow_up_contacts` con `UNIQUE (patient_id, round_date)`, índice `idx_follow_up_contacts_round`, trigger `set_updated_at` con guarda, y RLS patrón `0018` (`ENABLE` + `FORCE ROW LEVEL SECURITY`, `REVOKE ALL` de `anon`/`authenticated`, `GRANT SELECT, INSERT, UPDATE, DELETE` a `authenticated`, policy `follow_up_contacts_admin_all`). Down en orden índices → tabla → enum con `IF EXISTS`.
- Migración `0020_follow_up_message_drafts.sql`: enum `follow_up_draft_status` (`draft`, `approved`, `rejected`, `sending`, `sent`, `sent_failed`) con guarda `pg_type`, tabla `follow_up_message_drafts` con `dedup_key UNIQUE`, índices por estado y por paciente, trigger `set_updated_at`, y RLS patrón `0018` con policy `follow_up_message_drafts_admin_all`. Down en orden inverso con `IF EXISTS`.
- Rutas admin protegidas con `requireUser()` + `handleAdminRequest()`: `GET /api/admin/follow-up`, `POST /api/admin/follow-up/contacts`, `GET|POST /api/admin/follow-up/drafts`, `PATCH /api/admin/follow-up/drafts/[id]`, `POST /api/admin/follow-up/drafts/[id]/send`.
- UI: página `app/(admin)/follow-up/` (lista agrupada por motivo con acciones contactar / agendar / descartar) y superficie `app/(admin)/whatsapp-command-center/follow-up-drafts/` (aprobar / rechazar / enviar).

## Criterios de aceptación (#89)

- **Segmentación determinista con umbrales configurables**: reglas puras sin I/O ni reloj implícito, cubiertas por `rules.test.ts` (límites exactos de 90 / 45 / 180 / 21 días).
- **Deduplicación por paciente con motivo principal**: una sola entrada por paciente con prioridad `no-show > tratamiento inconcluso > presupuesto > inactivo`.
- **Exclusión por ronda**: un paciente contactado o descartado en la ronda (`America/Mexico_City`) no reaparece; el estado de otra ronda no excluye.
- **Solo tras aprobación humana**: el ciclo `draft → approved/rejected → sent/sent_failed` exige aprobación explícita; el claim atómico `approved → sending` (corrección `007d806`) cierra la carrera de doble envío concurrente.
- **Envío por el transporte existente**: mensaje `outbound` en `whatsapp_messages` con idempotencia por clave (`follow-up-draft:<draftId>`); borrador no aprobado no se envía.
- **Guardrails de texto**: `draft.test.ts` cubre tono es-MX y rechazo de precios, diagnósticos/prescripciones y presión comercial.
- **RLS patrón 0018**: `anon` sin acceso a las tablas nuevas.

## Hallazgos

- **CRITICAL/MAJOR**: ninguno. El hallazgo CRITICAL `R3-race-double-send` fue corregido en `007d806` y validado por el validador dirigido del proveedor.
- **MINOR/NOTE (no bloqueantes)**:
  1. `CREATE POLICY` sin `DROP POLICY IF EXISTS` previo en `0019` y `0020` — mismo patrón que `0018` (precedente aceptado).
  2. `FollowUpDraftStatus` en `src/lib/admin/follow-up/types.ts` no incluye `'sending'`; el valor del enum se cubre con un casteo en `mapFollowUpDraftRow`.
  3. El comentario de cabecera de la migración `0020` describe el ciclo como `draft -> approved/rejected -> sent/sent_failed` sin mencionar `sending`.
  4. Limitación de `GET /api/admin/follow-up/drafts?status=sending`: `FOLLOW_UP_DRAFT_STATUSES` no incluye `sending`, por lo que el filtro cae a "sin filtro" y devuelve toda la cola.
  5. `npm run lint` no existe en `package.json` (limitación de verificación preexistente del repo).
  6. Prerrequisito operativo: la plantilla HSM `seguimiento_paciente` debe estar registrada y aprobada en Meta antes del release de la Fase 3; sin ella el envío degrada a `sent_failed` con `error_message` visible.
  7. Verificación de migraciones en Supabase live pendiente de deploy (la revisión fue estática sobre los archivos SQL).

## Prerrequisitos de despliegue

Al merge: aplicar `0019` y `0020` en el entorno Supabase del proyecto. Mantener el envío de borradores deshabilitado operativamente hasta confirmar que la plantilla HSM `seguimiento_paciente` está `Approved` en Meta Business.
