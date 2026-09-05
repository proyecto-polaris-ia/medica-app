# Propuesta: Contacto por correo electrónico del paciente

## Intención

Permitir que recepción registre y reserve en `/appointments/new` con teléfono, correo o ambos. Hoy el flujo interno excluye pacientes que solo proporcionan correo.

## Alcance

### Incluido

- Aceptar al menos un contacto: teléfono E.164 o correo normalizado.
- Guardar y mostrar el correo en pacientes, CRUD administrativo y booking interno.
- Resolver por ambos identificadores; completar solo el contacto faltante y bloquear coincidencias entre pacientes distintos.

### Fuera de alcance

- Cambiar el contrato telefónico, CAPTCHA o exposición de `/booking`.
- Enviar correos o agregar notificaciones por correo.
- Fusionar automáticamente fichas de pacientes.
- Modificar `travelhub-app`.

## Capacidades

### Capacidades nuevas

Ninguna.

### Capacidades modificadas

- `appointment-booking`: resolver pacientes con teléfono, correo o ambos, sin sobrescribir contactos.
- `admin-panel`: administrar pacientes con teléfono nullable, correo y al menos un contacto.

## Enfoque

Agregar `patients.email`, permitir `phone_e164` nullable y proteger en Postgres la presencia de contacto y la unicidad case-insensitive del correo. Resolver ambas llaves determinísticamente, con relectura ante carreras. Extender solo el contrato administrativo y mostrar correo en componentes compartidos cuando `mode="internal"`; el flujo público permanece telefónico y protegido por Turnstile.

## Áreas afectadas

| Área | Impacto | Descripción |
|---|---|---|
| `supabase/migrations/` | Modificado | Invariantes y unicidad de contacto. |
| `src/lib/booking/patient-resolution.ts` | Modificado | Resolución segura por dos identificadores. |
| `app/(admin)/appointments/new/page.tsx` | Conservado | Entrada privada. |
| `app/api/admin/booking/book/route.ts` | Modificado | Contrato interno de reserva. |
| `src/components/booking/ConfirmStep.tsx` y `BookingWizard.tsx` | Modificado | Correo alternativo solo en modo interno. |
| `src/lib/admin/`, `app/api/admin/patients/`, `app/(admin)/patients/` | Modificado | CRUD, tipos y presentación. |
| `app/booking/page.tsx`, `app/api/booking/book/route.ts` | Conservado | Teléfono y CAPTCHA siguen obligatorios. |

## Riesgos

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Duplicados por mayúsculas o carreras | Media | Canonicalización, índice único parcial y relectura tras `23505`. |
| Dos contactos apuntan a fichas distintas | Media | Bloquear sin fusionar ni sobrescribir. |
| Regresión pública o WhatsApp | Media | Pruebas por modo; conservar teléfono y CAPTCHA públicos y vinculación telefónica de WhatsApp. |

## Plan de reversión

Revertir API, UI y resolución. Antes de restaurar `phone_e164 NOT NULL`, completar o retirar de forma explícita los pacientes con solo correo; nunca ejecutar una reversa destructiva automática.

## Dependencias

- Migraciones imperativas de Supabase/Postgres existentes.

## Criterios de éxito

- [ ] El booking interno y el CRUD aceptan teléfono, correo o ambos, y rechazan ninguno.
- [ ] El correo se normaliza, almacena y muestra sin generar notificaciones.
- [ ] No se sobrescriben contactos y los conflictos cruzados se bloquean.
- [ ] `/booking` conserva teléfono y CAPTCHA obligatorios; WhatsApp sigue basado en teléfono.
