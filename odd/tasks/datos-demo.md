# Feature: datos-demo — set de prueba registrable, repetible y extensible

## Objetivo
Set de datos de prueba (2 doctores, 3 pacientes con historial, citas, planes,
pagos, intents, recordatorios, seguimientos) que:
- No toca datos reales (ni los proveedores/pacientes existentes).
- Es borrable de forma aislada en producción (sin borrar datos de producción).
- Es repetible e idempotente (seed → wipe → seed).
- Es extensible a nuevos días (re-ejecutar el seed extiende el horizonte).

## Decisión de diseño
- Tabla de registro `demo_data_registry` (migración): toda fila demo se anota
  ahí; el borrado elimina por registro, no por patrón.
- `demo_data_meta`: guarda `anchor_date` y `generated_through` para extender
  días sin duplicar historial.
- Generador en `scripts/demo/seed-demo-data.sql` (SQL idempotente, fechas
  relativas a hoy en America/Mexico_City, UUIDs deterministas md5).
- Borrado en `scripts/demo/remove-demo-data.sql` (orden FK-safe).
- Scripts npm `demo:seed` / `demo:wipe` + docs `docs/datos-demo.md`.

## Tareas
- [x] Rastreo ODD + cambio OpenSpec `openspec/changes/demo-data-set/`
- [x] Migración `demo_data_registry` + `demo_data_meta`
- [x] Generador `scripts/demo/seed-demo-data.sql`
- [x] Borrado `scripts/demo/remove-demo-data.sql`
- [x] Scripts npm + `docs/datos-demo.md`
- [x] Aplicar en local y verificar ciclo seed→wipe→seed

## Commits
- b57f1a1 feat(demo): registered, repeatable and extensible demo data set (rama feat/datos-demo-set)

## Verificación (2026-10-05, Supabase local)
- Seed inicial: 78 citas (27 attended, 9 cancelled, 9 no_show, 21 confirmed, 11 requested, 1 pending), 27 visitas SOAP, 3 pacientes con historial, 3 planes, 5 pagos (1 voidado), 2 intents, 2 recordatorios de pago, 21 recordatorios de cita, 3 follow-ups, 1 draft, 3 contactos WhatsApp.
- Canceladas con rango vacío (start_at = end_at) según architecture.md §7.
- Re-seed inmediato: idempotente (nada nuevo).
- Extensión simulada (seed "hace 6 días" + re-run): agregó los días nuevos del horizonte sin duplicar.
- Wipe: eliminó solo filas registradas (179); `Dra. Ejemplo` y el paciente real intactos.
- Correcciones durante la verificación: migración idempotente (create or replace trigger / drop policy if exists), funciones helper en pg_temp con llamada calificada, casts ::time en business_hours, módulo normalizado para días pasados.
