# Delta spec: e2e-playwright-booking

## ADDED Requirements

### Requirement: Comando e2e reproducible
El repositorio MUST exponer `npm run test:e2e` que ejecute la suite de Playwright
levantando automáticamente sus dependencias (app en dev server y Supabase local con
migraciones y seed). La suite MUST poder correrse sin pasos manuales previos de
infraestructura más allá de tener Supabase CLI instalado.

#### Scenario: Suite corre desde cero
- GIVEN un checkout limpio con `node_modules` instalados y Supabase CLI disponible
- WHEN se ejecuta `npm run test:e2e`
- THEN la suite MUST levantar Supabase local (migraciones + seed), iniciar el dev
  server con el entorno de prueba y correr las specs de Playwright

#### Scenario: Flag de booking UI activa por defecto
- GIVEN el entorno de prueba no define `NEXT_PUBLIC_BOOKING_UI_ENABLED=false`
- WHEN un visitante abre `/booking`
- THEN el wizard MUST renderizar (la ruta no devuelve 404)

### Requirement: Flujo feliz de reserva verificado en navegador
La suite e2e MUST completar el wizard público en `/booking` de punta a punta contra
Supabase local: elegir servicio, especialista y horario de la agenda real sembrada,
introducir teléfono y nombre, y verificar el bloque "¡Reserva confirmada!".

#### Scenario: Reserva exitosa de punta a punta
- GIVEN Supabase local con seed (servicio "Limpieza", proveedor "Dra. Ejemplo", horario
  L–V 09:00–18:00) y claves de prueba de Turnstile configuradas
- WHEN el visitante completa los 4 pasos del wizard con un teléfono E.164 válido
- THEN la página MUST mostrar "¡Reserva confirmada!" con el nombre del paciente
- AND la cita MUST existir en la base local con estado activo, el servicio y el
  especialista elegidos y el horario reservado

> Nota: el bloque de confirmación de `ResultStep` hoy NO renderiza el servicio ni el
> especialista (solo paciente y horario). Corregir ese gap de UX es un fix de
> producción FUERA de esta change (ver `proposal.md` § Excluido); la verificación de
> servicio/especialista se hace contra la fila de la base local.

### Requirement: Caso negativo de captcha
La suite e2e MUST verificar que el envío público rechazado por captcha no reserva
nada: una petición directa al endpoint de reserva sin `captchaToken` recibe rechazo
y la base local queda sin la cita.

#### Scenario: Envío sin token rechazado
- GIVEN el entorno de prueba levantado con claves de Turnstile
- WHEN se envía un POST a `/api/booking/book` con payload válido pero sin `captchaToken`
- THEN la respuesta MUST ser rechazada (4xx)
- AND no MUST existir la cita en la base local

### Requirement: Degradación elegante sin claves Turnstile verificada en navegador
La suite e2e MUST verificar el comportamiento de degradación de la spec vigente de
public-booking: sin claves de Turnstile, la página muestra el mensaje
"La reserva en línea no está habilitada en este momento." y no ofrece envío.

#### Scenario: Sin claves la reserva está deshabilitada
- GIVEN el entorno de prueba levantado SIN `NEXT_PUBLIC_TURNSTILE_SITE_KEY` ni
  `TURNSTILE_SECRET_KEY`
- WHEN un visitante abre `/booking` y llega al paso de confirmación
- THEN la página MUST mostrar "La reserva en línea no está habilitada en este
  momento." y MUST NOT permitir completar una reserva

### Requirement: Manejo de conflicto de horario
La suite e2e SHOULD cubrir la respuesta de conflicto: al intentar reservar un horario
ya ocupado, el wizard MUST mostrar el bloque "El horario ya no está disponible" y no
MUST duplicar la cita.

#### Scenario: Doble reserva del mismo horario
- GIVEN una cita existente en la base local para el proveedor sembrado
- WHEN el wizard intenta reservar el mismo horario por la UI pública
- THEN la página MUST mostrar "El horario ya no está disponible"
- AND la base local MUST conservar exactamente una cita para ese proveedor y horario

### Requirement: Determinismo de la suite
La suite e2e MUST ser determinista: no MAY depender del LLM, de servicios de Cloudflare
distintos del widget de prueba, ni de datos fuera del seed. El estado de base de datos
MUST restablecerse (`supabase db reset` + seed) antes de la suite.

#### Scenario: Corridas repetidas producen el mismo resultado
- GIVEN la suite completó una corrida exitosa
- WHEN se ejecuta `npm run test:e2e` nuevamente
- THEN la suite MUST pasar de nuevo sin intervención manual, porque el reset de la
  base elimina las citas creadas por la corrida anterior
