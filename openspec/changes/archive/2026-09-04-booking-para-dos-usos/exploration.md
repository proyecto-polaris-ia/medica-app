# Exploración: booking-para-dos-usos

> **Artifacts**: `openspec/changes/booking-para-dos-usos/exploration.md` y Engram `sdd/booking-para-dos-usos/explore`.
> **Next recommended**: `sdd-propose`.

## Current State

### Mapa de rutas de booking hoy

| Ruta | Ubicación física | ¿Protegida? | ¿Qué renderiza? |
|------|------------------|-------------|-----------------|
| `/` | `app/page.tsx` | Redirige a `/dashboard` | Redirect; `/dashboard` está dentro de `(admin)` y requiere login. |
| `/login` | `app/login/page.tsx` | Pública | Formulario de inicio de sesión (`LoginForm`). |
| `/dashboard`, `/appointments`, `/patients`, `/providers`, `/services`, `/business-hours` | `app/(admin)/*` | Sí | Layout `app/(admin)/layout.tsx` llama `requireUser()` y redirige a `/login`. |
| `/booking` | `app/(admin)/booking/page.tsx` | Sí | `BookingWizard` (mismo wizard) con bandera `NEXT_PUBLIC_BOOKING_UI_ENABLED`. |
| `/api/booking/*` | `app/api/booking/**` | Sí | Todos los handlers llaman `requireUser()` (p. ej. `book/route.ts` línea 31). |
| `/api/admin/patients` | `app/api/admin/patients/route.ts` | Sí | Lista de pacientes (`listPatients`) usada por el CRUD admin. |

### Hallazgos clave

1. **No existe un booking público.** La anterior `app/booking/page.tsx` fue movida a `app/(admin)/booking/page.tsx` por el cambio `admin-panel`. El issue asume que el booking actual está "afuera del login", pero la realidad actual es que **todo el booking está detrás de login** (tanto la página como la API).
2. **La API de booking requiere sesión.** `app/api/booking/book/route.ts` invoca `await requireUser()` antes de procesar la reserva. Los endpoints de catálogo (`services`, `providers`, `slots`) también tienen el mismo gate (revisados en sus respectivos archivos).
3. **No hay copia interna separada.** Dentro del admin solo hay una instancia del wizard (`BookingWizard`) con el flujo original de paciente libre.
4. **El flujo de paciente es por texto libre + teléfono.** `ConfirmStep.tsx` (líneas 30-31, 69-75) captura `fullName` y `phone`; el backend en `patient-resolution.ts` busca/crea por `phone_e164`.
5. **No hay CAPTCHA.** No existe ninguna integración de captcha en `package.json`, componentes, variables de entorno ni lógica de validación. El archivo `supabase/config.toml` solo menciona captcha en la sección de auth de Supabase (comentado), que no aplica directamente al formulario de booking.
6. **El middleware no protege rutas.** `middleware.ts` solo refresca la cookie de sesión (`updateSession`). La protección se hace en el layout del admin y en cada API route.

## Affected Areas

- `app/(admin)/layout.tsx` — Decide qué rutas son internas; aquí vive la protección de login.
- `app/(admin)/booking/page.tsx` — Actual única superficie de booking; debe convertirse en la **interna** (o dejarse como interna) y crear una nueva **pública**.
- `app/api/booking/book/route.ts` — Requiere sesión; necesita dos modos: público (con CAPTCHA) e interno (con `patient_id`).
- `app/api/booking/_lib/validate.ts` — Necesita validar `patientId` opcional y token de CAPTCHA.
- `src/components/booking/BookingWizard.tsx` — Necesita aceptar un modo/prop para distinguir público vs. interno.
- `src/components/booking/ConfirmStep.tsx` — En modo interno debe permitir seleccionar/buscar pacientes existentes en lugar de solo texto libre.
- `src/components/booking/wizard-state.ts` — Debe soportar un campo `patientId` además de `phone`/`fullName`.
- `src/lib/booking/patient-resolution.ts` — Debe poder resolver por `patient_id` cuando el flujo lo provea.
- `app/api/admin/patients/route.ts` y `src/lib/admin/patients.ts` — Superficie reutilizable para obtener pacientes; falta búsqueda por nombre/teléfono.
- `app/(admin)/appointments/page.tsx` — Ya consume `/api/admin/patients` y muestra un selector de pacientes; sirve como referencia para el componente de búsqueda.

## Approaches

### Opción A — Wizard reutilizable con modo/prop

- `BookingWizard` recibe una prop `mode: 'public' | 'internal'`.
- En modo `public`:
  - Muestra CAPTCHA antes de enviar (`ConfirmStep`).
  - Envía a `/api/booking/book` sin autenticar (se quita `requireUser` de la API pública).
  - El payload sigue siendo `{ phone, fullName, serviceId, providerId, startAt, endAt, captchaToken }`.
- En modo `internal`:
  - `ConfirmStep` permite elegir un paciente existente o capturar nombre + teléfono para crear uno nuevo.
  - Envía `{ patientId?, phone?, fullName?, serviceId, providerId, startAt, endAt }` a una ruta autenticada (`/api/admin/booking/book` o `/api/booking/book` con sesión).
- **Pros:** Mínima duplicación de lógica; un solo lugar para el flujo de pasos; fácil mantener.
- **Cons:** Requiere refactorizar `BookingWizard`, `ConfirmStep` y `wizard-state`; más cuidado con los tipos.
- **Esfuerzo:** Medio.

### Opción B — Dos wizards independientes (copiar y adaptar)

- Dejar `BookingWizard` como está para uso público (restaurar `app/booking/page.tsx`).
- Crear `InternalBookingWizard` (copia) dentro de `app/(admin)/booking/page.tsx` con el selector de pacientes.
- **Pros:** Rápido de entender; cambios internos no tocan el público.
- **Cons:** Duplicación de efectos, reducer y pasos; cualquier fix o mejora debe aplicarse dos veces.
- **Esfuerzo:** Medio-Alto a largo plazo.

### Opción C — Página interna que reutilice la API pública + selector de pacientes

- El booking interno usa la misma API pública (`/api/booking/book`) pero, antes de enviar, el componente interno ya resolvió un `patient_id` vía `/api/admin/patients`.
- La API pública acepta opcionalmente `patientId`; si viene, salta la resolución por teléfono.
- **Pros:** Una sola API para ambos flujos.
- **Cons:** La API pública dejaría de ser realmente "pública" si acepta `patientId` (riesgo de enumeración de pacientes); requiere autenticación condicional o separar endpoints.
- **Esfuerzo:** Medio, pero con riesgos de seguridad.

## Recommendation

**Recomendación: Opción A (wizard reutilizable con modo/prop).**

1. **Booking público:**
   - Restaurar/crear `app/booking/page.tsx` fuera del grupo `(admin)`.
   - Quitar `requireUser()` de `/api/booking/*` (página y catálogo deben ser públicos).
   - Agregar CAPTCHA en `ConfirmStep` (modo público) y verificar el token en `POST /api/booking/book`.
   - Sugerir **Cloudflare Turnstile**: no requiere paquete npm (se carga el script de CDN y se verifica con `fetch`), es privacidad-oriented y gratuito. Variables necesarias: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` y `TURNSTILE_SECRET_KEY`. Si las variables faltan, la UI debe degradarse con un mensaje claro (la regla de `openspec/config.yaml` exige degradación graceful).

2. **Booking interno:**
   - Mantener `app/(admin)/booking/page.tsx` como la copia interna, pero usar `<BookingWizard mode="internal" />`.
   - Reutilizar `src/lib/admin/patients.ts` / `/api/admin/patients` para listar pacientes. Agregar un parámetro de búsqueda opcional (`?q=`) para filtrar por `full_name` o `phone_e164` y mantener la UX ágil.
   - En `ConfirmStep` modo interno, ofrecer un campo de búsqueda + selección de paciente; si no se elige uno, permitir capturar nombre y teléfono (creación implícita, igual que hoy).
   - Crear `POST /api/admin/booking/book` (autenticado) que acepte `patientId` o `{ phone, fullName }`, resuelva/creé el paciente y llame a `bookAppointment`.

3. **Reutilización:**
   - `wizard-state.ts`, `BookingWizard.tsx`, `ServiceStep`, `ProviderStep`, `SlotStep` y `ResultStep` se reutilizan sin cambios importantes.
   - Solo `ConfirmStep` cambia significativamente según el modo.
   - La lógica de disponibilidad (`availability.ts`, `catalog.ts`) y reserva atómica (`booking.ts`) no se toca.

## Risks

- **Exposición pública de la API de booking:** al quitar `requireUser`, la API puede ser abusada. El CAPTCHA mitiga bots, pero también se recomienda rate-limiting (puede quedar fuera de este cambio o agregarse como tarea secundaria).
- **Divergencia de lógica interna vs. pública:** si se opta por copiar en lugar de reutilizar, futuros fixes de UX deben duplicarse.
- **Conflicto con tests existentes:** `app/api/booking/*/route.test.ts` y `BookingWizard.test.tsx` están construidos bajo la premisa de sesión requerida; habrá que actualizar mocks y agregar casos de CAPTCHA/401.
- **Decisión de proveedor CAPTCHA:** si Turnstile no es aceptable, reCAPTCHA requiere instalar `@types/react-google-recaptcha` o similar y cambia el componente de CAPTCHA.
- **Resolución de paciente en flujo interno:** si el administrador selecciona un paciente existente pero también cambia el teléfono, hay que definir si se actualiza el registro del paciente o se crea uno nuevo.

## Ready for Proposal

**Sí.** La exploración ya identificó la ruta, la API, los componentes reutilizables y la brecha de autenticación/CAPTCHA. Se puede pasar a `sdd-propose`.

## Preguntas de clarificación (mínimas)

1. El booking actual está **dentro del login**. ¿Se entiende que hay que crear una nueva ruta pública `/booking` y dejar `/booking` del admin como la copia interna, o prefieren conservar `/booking` pública y usar otra URL (`/admin/booking` o similar) para la interna?
2. ¿Están de acuerdo con usar **Cloudflare Turnstile** para el CAPTCHA, o tienen preferencia por reCAPTCHA/hCaptcha? Esto define las variables de entorno y si se instala una librería extra.
3. En el flujo interno, si se busca un paciente existente pero se edita el teléfono, ¿se debe **actualizar el paciente** o **crear uno nuevo**?
