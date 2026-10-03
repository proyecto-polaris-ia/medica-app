# Encendido de recordatorios de citas por WhatsApp (issue #86)

Runbook operativo para activar el envío real de recordatorios (cron
`/api/cron/appointment-reminders`). El sistema se despliega **apagado por
diseño**: sin configuración, el cron no hace nada (fail-closed).

## Estado por defecto (recién mergeado)

| Variable | Sin definir = | Efecto |
|---|---|---|
| `APPOINTMENT_REMINDERS_ENABLED` | apagado | El cron responde `{ skipped: true }` y no hace trabajo. |
| `APPOINTMENT_REMINDERS_DRY_RUN` | `true` | Aunque se encienda el flag, solo registra lo que enviaría, sin mandar WhatsApps. |

Ambos crons (`payment-reminders` y `appointment-reminders`) comparten el
secreto `CRON_SECRET` — ya debe estar definido en Vercel por el cron de pagos.

## Requisitos previos (checklist)

1. **Plantilla HSM aprobada en Meta Business**: `recordatorio_cita`
   (categoría Utility, idioma `es_MX`). Sin aprobación, no avanzar.
2. **Congelar el orden de `bodyParameters` contra la plantilla aprobada**.
   El orden implementado (NO reordenar sin re-aprobar la plantilla):
   1. nombre del paciente (primer nombre),
   2. nombre del consultorio,
   3. fecha ("lunes 5 de octubre"),
   4. hora ("10:00"),
   5. doctor.
   Comparar con `buildAppointmentReminderBodyParameters` en
   `src/lib/citas/send-appointment-reminder.ts` y con la guía de
   `docs/plantilla-hsm-recordatorio-cita.md`.
3. **Datos del consultorio** definidos en Vercel:
   - `APPOINTMENT_REMINDER_CLINIC_NAME` (nombre; si falta, cae a
     `WEB_CHAT_CLINIC_NAME` y luego a un placeholder).
   - `APPOINTMENT_REMINDER_CLINIC_ADDRESS` (dirección/indicaciones; hoy
     vacío — **no se envía** como parámetro de la plantilla, es para
     referencia operativa).
4. **Credenciales de WhatsApp Cloud API** presentes
   (`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`) — si faltan, el
   envío degrada a `skipped` y se registra como `failed`.

## Encendido en 3 pasos

### Paso 1 — Dry-run visible (validación sin riesgo)

En Vercel, definir solo:

```
APPOINTMENT_REMINDERS_ENABLED=true
```

Dejar `APPOINTMENT_REMINDERS_DRY_RUN` sin definir (queda `true`).

Ejecutar una corrida manual:

```bash
curl -s -X POST "https://<tu-dominio>/api/cron/appointment-reminders" \
  -H "Authorization: Bearer $CRON_SECRET"
```

Respuesta esperada:

```json
{ "sent": 0, "skipped": 0, "dryRun": true,
  "cadencias": { "h24": {...}, "sameDay": {...} } }
```

Verificar en Supabase (tabla `appointment_reminders`):
- filas con `status='scheduled'` y `dry_run=true`;
- `reminder_key` correctas: `cita:{id}:h24:{YYYY-Www}` y
  `cita:{id}:same_day:{YYYY-MM-DD}` (fecha de **México**, no UTC);
- NO deben existir `sent_at` ni `provider_message_id`.

### Paso 2 — Envío real

Definir:

```
APPOINTMENT_REMINDERS_DRY_RUN=false
```

El siguiente turno del cron (09:00 hora de México) envía los recordatorios
reales. Confirmar en la tabla:

- `status='sent'` con `provider_message_id` y `sent_at` (timestamptz);
- los fallos quedan en `status='failed'` con `error` — revisar causa
  (plantilla no aprobada, credenciales, teléfono inválido);
- **re-ejecutar el cron manualmente NO duplica envíos**: la
  `reminder_key` es `UNIQUE` a nivel DB.

### Paso 3 — Monitoreo continuo

- **Command Center → tab "Citas"** (`/whatsapp-command-center/appointments`):
  citas sin confirmar y su estado de recordatorio.
- **Panel de citas** (`/appointments`): columna "Recordatorio" por cita
  (H-24 / día mismo, fecha de envío, "Simulado (dry-run)", fallos).
- Los pacientes con opt-out (`whatsapp_contacts.opt_in_status =
  'opted_out'`) se excluyen automáticamente en cada corrida.

## Segunda corrida diaria (opcional)

El diseño recomienda dos corridas para cubrir mejor la ventana H-24
(24–36 h). La base (`0 15 * * *` UTC = 09:00 México) ya está en
`vercel.json`. Si tu plan de Vercel permite frecuencia sub-diaria, agregar:

```json
{ "path": "/api/cron/appointment-reminders", "schedule": "0 3 * * *" }
```

(`0 3 * * *` UTC = 21:00 hora de México.)

## Rollback

Apagar sin deploy: eliminar `APPOINTMENT_REMINDERS_ENABLED` en Vercel (o
ponerlo en `false`). El cron vuelve a `{ skipped: true }` en el siguiente
turno. La tabla `appointment_reminders` es aditiva; no requiere rollback de
migración.

## Referencias

- Cron: `app/api/cron/appointment-reminders/route.ts`
- Helper de dominio: `src/lib/citas/send-appointment-reminder.ts`
- Migración: `supabase/migrations/0018_appointment_reminders.sql`
- Change archivado: `openspec/changes/archive/2026-10-03-appointment-reminders/`
- Guía de la plantilla: `docs/plantilla-hsm-recordatorio-cita.md`
- Verificación: `verify-report.md` dentro del change archivado (PASS WITH WARNINGS)
