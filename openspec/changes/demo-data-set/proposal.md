# Proposal — demo-data-set

## Por qué
Necesitamos datos de prueba realistas para demostrar los features del
asistente (agenda, historial clínico, pagos, recordatorios, seguimientos) y
sus crons, primero en Supabase local y después en producción, **sin tocar
nunca los datos reales** (proveedores y pacientes existentes).

## Qué cambia
1. Migración con dos tablas de soporte:
   - `demo_data_registry`: registro de cada fila insertada por el set demo
     (`entity_table`, `record_id`, `entity_key` determinista).
   - `demo_data_meta`: metadatos del set (`anchor_date`, `generated_through`).
2. Generador idempotente `scripts/demo/seed-demo-data.sql`: 2 doctores demo,
   3 pacientes con perfil + historial médico, citas pasadas (atendidas,
   no-show, canceladas), citas de hoy y futuras, visitas clínicas SOAP,
   planes de tratamiento con partidas, pagos (incluido uno voidado),
   intent de pago, recordatorios de pago y de cita, seguimientos y un draft.
3. Borrado `scripts/demo/remove-demo-data.sql`: elimina **solo** lo registrado
   en `demo_data_registry`, en orden FK-safe.
4. Scripts npm `demo:seed` / `demo:wipe` y documentación `docs/datos-demo.md`.

## Requisitos (RFC 2119)
- El set DEMO de ser identificable y borrable sin afectar datos reales.
- El generador DEBE ser idempotente (re-ejecutar no duplica).
- Re-ejecutar el generador DEBE extender el horizonte de días futuros.
- Las fechas DEBEN calcularse relativas a hoy en `America/Mexico_City`.
- Los registros demo DEBEN usar UUIDs deterministas y teléfonos ficticios
  (`+52155000000XX`) que no colisionen con datos reales.
- El borrado DEBE eliminar todo lo registrado y dejar el esquema intacto.

## Fuera de alcance
- Conversaciones/mensajes de WhatsApp de ejemplo (extensión futura).
- Modificar `supabase/seed.sql` ni los datos existentes.
