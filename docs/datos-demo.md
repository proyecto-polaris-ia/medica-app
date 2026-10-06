# Datos demo (set de prueba registrable)

Set de datos de prueba para demostrar los features del asistente (agenda,
historial clínico, pagos, recordatorios, seguimientos) y sus crons, sin tocar
jamás los datos reales del consultorio.

## Qué incluye

| Entidad | Contenido |
|---|---|
| Doctores | **Dra. Elena Ramírez (demo)** y **Dr. Marco Antonio Silva (demo)** (L–V 09:00–18:00; Marco también sábado 09:00–13:00). No sustituye ni modifica proveedores existentes. |
| Pacientes | 3 pacientes con perfil completo (contacto, emergencia, ocupación, origen) e historial médico (alergias, condiciones, medicamentos, hábitos). |
| Citas | Días hábiles desde 21 días antes del ancla hasta 14 días después: pasadas (atendidas / no-show / canceladas), hoy (confirmada, solicitada, pendiente) y futuras (confirmadas y solicitadas). 3 slots por día (09:00, 11:00, 16:00) rotando paciente, doctor y servicio. |
| Historial clínico | Visita SOAP por cada cita pasada atendida. |
| Planes de tratamiento | 3 planes (aceptado, en progreso, presentado) con partidas, piezas y montos. |
| Pagos | Pagos parciales en efectivo/tarjeta/transferencia + **1 pago anulado** para demostrar la anulación. |
| Intents de pago | 1 pendiente (whatsapp, con compromiso) y 1 fulfilled (manual). |
| Recordatorios | De cita (h24, programados) para citas futuras confirmadas y de pago (1 scheduled, 1 sent). |
| Seguimientos | 2 rondas contactadas, 1 descartada y 1 draft de mensaje. |
| WhatsApp | 3 contactos ligados a los pacientes (opt-in), para features que envían mensajes. |

Los teléfonos usan el rango ficticio `+52155000000XX` y los correos
`demo.*@example.com`. Si algún teléfono ya existe en un paciente no demo, el
seed falla con error explícito (no lo sobreescribe).

## Cómo funciona

- **Registro**: toda fila demo se anota en `demo_data_registry` (creada por la
  migración `*_demo_data_registry.sql`) con su tabla, id y clave determinista.
  Ese registro es la única fuente de verdad del borrado.
- **Ancla temporal**: `demo_data_meta` guarda `anchor_date` (fecha del primer
  seed) y `generated_through` (último día generado). El historial pasado queda
  anclado; las citas futuras se extienden a `hoy + 14 días` en cada ejecución.
- **Idempotencia**: claves deterministas (UUID derivado de `md5(clave)`);
  re-ejecutar el seed no duplica nada.
- **Canceladas**: siguen la práctica del repo (architecture.md §7): quedan con
  `start_at = end_at` (rango vacío) y liberan el slot.

## Comandos (Supabase local)

```sh
npm run db:start        # si la base no está arriba
npm run demo:seed       # aplica / extiende el set
npm run demo:wipe       # borra SOLO las filas registradas como demo
```

Ambos comandos pasan el SQL por `psql` dentro del contenedor de la base local
(`supabase_db_medica-app`).

## Uso en producción (cuando aplique)

1. Aplicar la migración `demo_data_registry` con `supabase db push` (estructura
   únicamente; no inserta datos).
2. Ejecutar `scripts/demo/seed-demo-data.sql` desde el SQL editor de Supabase
   (o `psql` contra la cadena de conexión de producción).
3. Para retirar el set: ejecutar `scripts/demo/remove-demo-data.sql`. Elimina
   exclusivamente lo anotado en `demo_data_registry`; ningún dato real se
   modifica. Tras el borrado, el siguiente seed re-ancla el historial a la
   fecha de ejecución.
4. Si algún paciente real usara por coincidencia un teléfono `+52155000000XX`,
   el seed aborta sin insertar nada de ese paciente.

## Extensiones futuras

- Conversaciones/mensajes de WhatsApp de ejemplo por canal.
- Más pacientes o más slots por día: agregar claves nuevas (prefijo
  `appointment:`/`patient:`) siguiendo el patrón existente; el registro y el
  borrado las cubren automáticamente.
- Ojo: las citas generadas como futuras en un seed quedan congeladas con su
  estatus; si pasan a ser pasadas en una extensión posterior, no se les genera
  visita SOAP retroactiva (el seed no duplica ni reescribe filas).
