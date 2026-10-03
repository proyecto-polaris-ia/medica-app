# Verify Report — appointment-reminders

Fecha: 2026-10-03 · Verificador: gentle-ai-verify · Rama: eliumontoya/feat-citas-recordatorios-autom-ticos-de-citas-po

## Veredicto: PASS WITH WARNINGS

## Comandos

| Verificación | Resultado |
|---|---|
| `npm run test` | PASS — 106 archivos / 846 tests |
| `npx tsc --noEmit` | PASS — exit 0 |
| `npm run build` | PASS — compila `/api/cron/appointment-reminders` |
| `npm run lint` | N/A — script inexistente (decisión del usuario: omitir; follow-up aparte) |
| Tamaño del cambio | 18 archivos, +2693/−7 (bfa81d3..HEAD) |

## Estructura

- Migración `0018_appointment_reminders.sql`: enum idempotente, `UNIQUE(reminder_key)`, CHECK de cadence, RLS ENABLE+FORCE, REVOKE/GRANT correctos, índices parcial y de join, trigger `set_updated_at`. Down migration revierte en orden inverso.
- `vercel.json`: JSON válido, dos crons (`0 15 * * *` ambos).
- Contratos: route ↔ helper, admin data layer ↔ tipos, tab WCC ↔ data layer — coherentes.

## Criterios de aceptación (#86)

- **Dry-run no envía pero registra**: `send-appointment-reminder.test.ts` "dry-run inserta scheduled/dry_run=true y nunca llama al proveedor"; `route.test.ts` "defaults to dryRun=true…".
- **Idempotencia (dos corridas no duplican)**: llave estable ("la misma cita en dos corridas de la misma ventana produce la misma llave"), skip por existencia y `23505` tratado como skip; conteo de dedup como `skipped` en el route.
- **Timezone America/Mexico_City**: tests que cruzan medianoche UTC (fecha clínica, semana ISO, formateo) en helper y WCC.
- **Selección y deduplicación**: ventanas h24 (24–36h) y same_day, exclusión de estados y filas sin paciente/teléfono.

## Hallazgos

- **CRITICAL/MAJOR**: ninguno.
- **MINOR** (resueltos o aceptados):
  1. `dry_run DEFAULT false` divergía del patrón 0017 → **corregido a `DEFAULT true`** (fail-closed también a nivel columna).
  2. Enum sin valor `skipped` (0017 sí lo tiene) → aceptado: los inserts reales solo usan scheduled/sent/failed; skip no se persiste.
- **NOTE**:
  1. Idempotencia cubierta a nivel helper (llave + skip + 23505), sin test E2E de doble POST del cron.
  2. `APPOINTMENT_REMINDER_CLINIC_ADDRESS` vacío y omitido de `bodyParameters` hasta configurar dirección; orden de variables se congela contra la plantilla aprobada en Meta antes de encender envíos reales.
  3. `createAppointment`/`updateAppointment` no adjuntan recordatorios (correcto por diseño).

## Despliegue seguro

Al merge: `APPOINTMENT_REMINDERS_ENABLED` sin definir (flag off) y `APPOINTMENT_REMINDERS_DRY_RUN` sin definir (dry-run fail-closed). Encender solo cuando `recordatorio_cita` esté `Approved` en Meta Business.
