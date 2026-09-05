## Exploration: Contacto por correo electrónico del paciente

### Current State

- `patients.phone_e164` es `NOT NULL` y `UNIQUE`; no existe una columna de correo electrónico. El esquema, los tipos TypeScript, el CRUD administrativo y sus pruebas asumen que todo paciente tiene teléfono.
- Los flujos público e interno comparten `BookingWizard` y `ConfirmStep`, que hoy capturan `phone` y `fullName`. El flujo interno vive en `/appointments/new` y publica en `POST /api/admin/booking/book`; el público vive en `/booking`, publica en `POST /api/booking/book` y exige teléfono E.164 más Turnstile.
- `resolvePatient` identifica o crea pacientes exclusivamente por `phone_e164` y usa un `upsert` sobre esa única llave.
- La lista de pacientes muestra nombre, teléfono y notas; las rutas administrativas reciben y devuelven el mismo contrato.
- WhatsApp sigue siendo un canal inherentemente telefónico: `whatsapp_contacts.phone_e164` permanece obligatorio, el agente reserva con `event.fromPhone` y el trigger `resolve_whatsapp_contact_patient_id` vincula por teléfono. Permitir pacientes con solo correo no requiere cambiar la identidad de los contactos de WhatsApp.
- La separación público/interno ya existe. Este cambio se limita al flujo privado `/appointments/new`; no modifica el contrato telefónico, Turnstile, autenticación ni exposición de `/booking`.

### Affected Areas

- `supabase/migrations/` — nueva migración imperativa para agregar `patients.email`, hacer `phone_e164` nullable, exigir al menos un medio de contacto y definir unicidad de correo; se necesita una reversa consciente de los registros con solo correo.
- `src/lib/booking/patient-resolution.ts` — resolución determinista por teléfono o correo, manejo de coincidencias y carreras de unicidad.
- Validadores compartidos o administrativos — normalización del correo y regla “teléfono o correo” exclusiva del contrato interno.
- `app/api/admin/booking/book/route.ts` — aceptar ambos contactos y rechazar la ausencia de los dos cuando no se selecciona `patientId`.
- `src/components/booking/ConfirmStep.tsx` y `src/components/booking/BookingWizard.tsx` — capturar correo y permitirlo como contacto alternativo solo en modo `internal`; el modo `public` conserva teléfono obligatorio y CAPTCHA.
- `src/components/booking/wizard-state.ts` — representar teléfono y correo opcionales sin perder el nombre.
- `src/lib/admin/types.ts`, `src/lib/admin/patients.ts`, `app/api/admin/patients/*` y `app/(admin)/patients/page.tsx` — reflejar teléfono nullable, correo y la misma invariancia en CRUD/listado.
- Pruebas del booking interno, resolución de paciente, CRUD administrativo y componentes — cubrir solo teléfono, solo correo, ambos, ninguno, duplicados y conflicto entre identidades; las pruebas públicas deben demostrar que teléfono y CAPTCHA siguen siendo obligatorios.
- `openspec/specs/appointment-booking/spec.md` y `openspec/specs/admin-panel/spec.md` — hoy especifican resolución y CRUD con teléfono obligatorio; necesitarán deltas explícitos.
- `supabase/migrations/0006_whatsapp_inbound_command_center.sql` y `src/lib/whatsapp/*` — compatibilidad a verificar, no necesariamente a modificar: la resolución y vinculación por teléfono deben conservarse.

### Approaches

1. **Identificador de contacto alternativo con una sola entidad paciente** — agregar `email` nullable, volver nullable `phone_e164` y exigir `phone_e164 IS NOT NULL OR email IS NOT NULL`; resolver por cualquier identificador disponible.
   - Pros: satisface literalmente “correo o teléfono”, conserva una sola ficha por paciente y mantiene WhatsApp por teléfono.
   - Cons: exige definir normalización, unicidad, enriquecimiento y conflictos cuando ambos identificadores apuntan a fichas distintas; el `upsert` actual ya no puede resolver dos llaves alternativas por sí solo.
   - Effort: Medium

2. **Correo adicional sin relajar el teléfono obligatorio** — agregar y mostrar correo, pero seguir exigiendo teléfono para crear o reservar.
   - Pros: migración y compatibilidad simples; `resolvePatient` y WhatsApp casi no cambian.
   - Cons: no permite reservar con solo correo y, por tanto, no cumple el resultado solicitado.
   - Effort: Low

### Recommendation

Adoptar el enfoque 1 con estas reglas propuestas: se permite teléfono, correo o ambos; el correo se recorta y canonicaliza en minúsculas; su unicidad es case-insensitive mediante índice único parcial; el teléfono conserva su unicidad actual, ahora permitiendo `NULL`; y la base impide registros sin ningún contacto. La resolución debe consultar de forma determinista cada identificador y, ante una carrera de inserción, volver a leer después de `23505` en vez de depender de un `upsert` con una sola llave.

Para evitar fusiones peligrosas, si teléfono y correo existentes pertenecen a pacientes distintos, la reserva debe rechazarse como conflicto y requerir corrección humana. Si solo uno identifica una ficha, el sistema completa únicamente el dato de contacto faltante; nunca sobrescribe un teléfono o correo ya guardado.

WhatsApp debe permanecer phone-first: no se cambia `whatsapp_contacts.phone_e164`, el agente continúa invocando `resolvePatient` con el teléfono del evento y el enlace automático sigue siendo por teléfono. El correo solo se almacena y muestra; no se envían notificaciones por correo.

Decisiones de producto confirmadas para el proposal:

1. Se modifica únicamente el booking interno actual; `/booking` permanece público, telefónico y protegido por CAPTCHA.
2. La regla es “al menos uno”: teléfono o correo, permitiendo capturar ambos.
3. Cuando un identificador coincide, solo se completa el contacto faltante; no se sobrescribe información. Si teléfono y correo pertenecen a pacientes diferentes, se bloquea la operación.
4. El correo solo se almacena y muestra; este cambio no incluye notificaciones.

### Risks

- Una migración reversible no puede restaurar `phone_e164 NOT NULL` mientras existan pacientes con solo correo; la reversa requiere eliminar, completar o impedir esos registros antes del `ALTER`.
- Sin unicidad case-insensitive, `Paciente@Ejemplo.com` y `paciente@ejemplo.com` podrían crear duplicados.
- La resolución por dos llaves introduce carreras y conflictos de identidad que un `upsert(onConflict: 'phone_e164')` ya no cubre.
- Los componentes del wizard son compartidos; una condición de modo incorrecta podría exponer correo como alternativa en el flujo público y relajar involuntariamente teléfono o CAPTCHA.
- Los tipos y pantallas del Command Center presuponen teléfono en varios modelos; aunque un paciente vinculado automáticamente por WhatsApp siempre tendrá teléfono, deben evitarse casts globales que oculten `null` para pacientes creados solo con correo.

### Ready for Proposal

Sí. El alcance, la invariancia de contacto, la política de coincidencia y la exclusión de notificaciones ya están confirmados. El orchestrator puede ejecutar `sdd-propose` sin más exploración técnica.
