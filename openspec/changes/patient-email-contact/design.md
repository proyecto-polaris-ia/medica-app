# Diseño: Contacto por correo electrónico del paciente

## Enfoque técnico

Extender `patients` con correo normalizado y teléfono nullable, con invariantes en Postgres y resolución determinista. Solo el wizard `internal` enviará correo; el modo `public`, Turnstile y WhatsApp conservarán su contrato telefónico.

## Decisiones de arquitectura

| Decisión | Elección | Alternativas y razón |
|---|---|---|
| Identidad de contacto | `phone_e164` y `email` son llaves nullable; un `CHECK` exige una. La unicidad actual protege teléfono; un índice único parcial sobre `lower(email)` protege correo y otro `CHECK` exige `email = lower(btrim(email))`. | Una tabla de contactos amplía el alcance; validar solo en TypeScript deja otras escrituras sin protección. |
| Resolución concurrente | Consultar ambas llaves; si apuntan a filas distintas, devolver `patient_identity_conflict`. Enriquecer con `UPDATE patients SET email = :email WHERE id = :id AND email IS NULL RETURNING ...` (equivalente para teléfono), nunca después con escritura incondicional. Cero filas o `23505` exige releer una vez ficha y propietario: mismo valor es éxito idempotente; otro valor u otra ficha produce `409 patient_identity_conflict`, sin modificar ni reservar. Sin coincidencia, insertar y aplicar la misma relectura ante `23505`. | `upsert` solo admite una llave. Índices únicos y `WHERE ... IS NULL` evitan “última escritura gana”. |
| Contratos por canal | Ampliar `resolvePatient({ phone?, email?, fullName? })`, pero el API público y `inbound-service` seguirán invocándolo solo con teléfono. `patientId` evita creación y enriquecimiento. | No crear un resolver separado: duplicaría reglas; no aceptar correo públicamente porque relajaría el alcance y protección actuales. |
| Tipos y UI compartida | `Patient.phoneE164` será `string | null` y `email` será `string | null`. `ConfirmStep` mostrará correo y aplicará “teléfono o correo” solo con `mode="internal"`; un paciente seleccionado podrá tener cualquiera de los dos. | No ocultar `null` mediante casts: rompería búsqueda, administración y vistas de WhatsApp. |

## Flujo de datos

```text
/appointments/new -> BookingWizard(internal) -> /api/admin/booking/book
                                              -> resolvePatient
                                                 |- same row -> conditional UPDATE ... IS NULL
                                                 |               `- 0 rows/23505 -> reread + typed outcome
                                                 |- different rows -> 409 patient_identity_conflict
                                                 `- none -> insert; 23505 -> reread once
                                              -> bookAppointment

/booking -> phone + CAPTCHA -> flujo público existente
WhatsApp -> event.fromPhone -> resolvePatient(phone) -> vínculo telefónico existente
```

## Cambios de archivos

| Archivo | Acción | Descripción |
|---|---|---|
| `supabase/migrations/0011_patient_email_contact.sql` | Crear | Columna, checks e índice único parcial. |
| `supabase/migrations/down/0011_patient_email_contact.down.sql` | Crear | Reversa que aborta ante pacientes sin teléfono. |
| `src/lib/booking/patient-resolution.ts` | Modificar | Algoritmo dual, enriquecimiento condicional y relectura tras `23505`. |
| `app/api/admin/booking/book/route.ts` | Modificar | Validar identidad/contactos y devolver conflicto tipado. |
| `src/components/booking/{ConfirmStep.tsx,BookingWizard.tsx,wizard-state.ts,PatientSearch.tsx}` | Modificar | Captura interna, payload, estado y búsqueda/presentación nullable. |
| `src/lib/admin/{types.ts,validate.ts,patients.ts}`, `src/types.ts` | Modificar | `parseOptionalEmail`, invariancia de contacto, búsqueda por correo y mapeo nullable. |
| `src/lib/wcc-contacts.ts` | Modificar | Propagar teléfono nullable solo en la ficha enlazada; el contacto de WhatsApp conserva teléfono obligatorio. |
| `app/api/admin/patients/**`, `app/(admin)/patients/page.tsx` | Modificar | CRUD y tabla/formulario con correo. |
| Pruebas junto a los módulos | Modificar | Cobertura RED/GREEN y regresión. |

## Interfaces / contratos

```ts
type PatientContactInput = {
  phone?: string;
  email?: string;
  fullName?: string;
};

type Patient = {
  phoneE164: string | null;
  email: string | null;
};
```

Una creación por contacto requiere `fullName` y al menos un contacto; todo contacto presente debe ser válido. El correo se transforma con `trim().toLowerCase()`. El correo solo se almacena, busca y muestra: no dispara mensajes ni notificaciones.

## Estrategia de pruebas

| Capa | Cobertura |
|---|---|
| Unidad | Normalización; teléfono/correo/ambos/ninguno; misma ficha; enriquecimiento solo de `NULL`; conflicto cruzado; relectura `23505`; tipos nullable. |
| API/componentes | Booking interno por correo y `patientId`; CRUD y búsqueda; error 409 tipado; campo correo ausente en modo público. |
| Regresión | Público rechaza falta de teléfono o CAPTCHA; WhatsApp reserva y vincula por teléfono; migración local acepta contactos válidos y rechaza duplicados/ninguno. |

### Escenario RED de concurrencia

- GIVEN una ficha identificada por teléfono y sin correo
- WHEN dos resoluciones concurrentes intentan completar correos disponibles distintos
- THEN exactamente una actualización condicional MUST persistir
- AND la perdedora MUST releer, devolver `patient_identity_conflict` y MUST NOT sobrescribir el correo ni crear una cita

## Matriz de amenazas

N/A — no se crean ni cambian rutas, redirecciones, shell, subprocesos, VCS, clasificación ejecutable ni integración de procesos; solo cambia el contrato de una ruta existente.

## Migración, despliegue y reversión

Generar y probar la migración solo en Supabase local; `apply` no mutará producción. Desplegar esquema antes que backend/UI. La reversa se ejecuta después de retirar el código y solo si no hay `phone_e164 IS NULL`; de lo contrario aborta para resolución manual, sin transformar registros. `whatsapp_contacts.phone_e164` y su trigger no cambian.

## Preguntas abiertas

Ninguna.
