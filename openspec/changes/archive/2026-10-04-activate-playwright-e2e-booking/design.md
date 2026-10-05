# Diseño: Activar pruebas e2e de Playwright para /booking

## Decisiones

### 1. Configuración de Playwright

- `playwright.config.ts` en la raíz con `testDir: 'tests/e2e'`.
- `webServer`: `npm run dev` (puerto 3001, `reuseExistingServer: !process.env.CI`),
  con `env` explícito en el config — **sin escribir `.env.local` ni `.env.test`**:
  la política del harness bloquea crear esos archivos y la change previa
  `supabase-local-testing` ya resolvió lo mismo con defaults en código
  (`src/test-utils/local-db.ts`). El e2e sigue el mismo patrón: las variables de
  entorno de prueba viven en `playwright.config.ts`.
- Variables del webServer:
  - `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54331` y claves demo estándar de
    Supabase local (mismas de `LOCAL_DEFAULTS`).
  - `NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA` y
    `TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA` (claves de prueba
    always-pass de Cloudflare; el código hace siteverify contra el endpoint real,
    que el secret de prueba siempre aprueba).
- `timeout` de test 60s; `retries` 0 en local, 1 en CI.

### 2. Estado de base de datos

- Antes de la suite: `supabase start` + `supabase db reset` (aplica migraciones +
  `seed.sql`). Script `pretest:e2e` en `package.json` que encadena ambos, tolerante
  a Supabase ya iniciado (`db:start` es idempotente de facto: falla con error
  controlado; se envuelve para no abortar).
- Limpieza entre tests: NO se trunca por test (costo); el orden de las specs es
  autocontenido: cada spec usa horarios/fechas propios (días distintos) o verifica
  conteos relativos, y el `db reset` de la corrida garantiza repetibilidad
  (requirement de determinismo).

### 3. Selectores

- Basados en roles y `aria-label` existentes (sin tocar código de producción):
  `listbox[aria-label="Servicios"]`, `"Especialistas"`, `"Horarios disponibles"`,
  opciones por texto ("Limpieza 45min", "Dra. Ejemplo"), `input[type="tel"]`,
  `input[type="text"]`, botón "Confirmar reserva", `data-testid="turnstile-widget"`.
- El widget de Turnstile de prueba requiere red a `challenges.cloudflare.com`. El
  test de flujo feliz marca `test.skip` si un HEAD previo al host falla (nada de
  falsos verdes).

### 4. Casos y archivos

- `tests/e2e/booking-happy-path.spec.ts` — wizard completo + verificación en BD
  (lectura con `pg` a `postgresql://postgres:postgres@127.0.0.1:54332/postgres`,
  mismo acceso que `src/test-utils/local-db.ts`) de la cita creada.
- `tests/e2e/booking-negative.spec.ts` — POST directo sin captchaToken (rechazo +
  sin fila en BD), degradación sin claves (proyecto Playwright separado con env
  vacío de Turnstile contra la misma app) y conflicto de doble reserva por UI.
- Proyectos de Playwright: `booking` (claves de prueba presentes) y
  `booking-no-captcha` (sin claves) para cubrir ambas ramas de la spec vigente sin
  levantar dos servidores.

### 5. Fuera de diseño

- No se modifica `BookingWizard.tsx` ni las APIs: los selectores ya son suficientes.
- No se agrega mock del backend de chat: el flujo público de reserva no lo usa
  (el alcance con el usuario lo descartó).

## Archivos

- `package.json` — devDependency `@playwright/test`, scripts `test:e2e`,
  `pretest:e2e`.
- `playwright.config.ts` — nuevo.
- `tests/e2e/booking-happy-path.spec.ts`, `tests/e2e/booking-negative.spec.ts` — nuevos.
- `tests/e2e/helpers/db.ts` — helper `pg` para lecturas/conteos contra la BD local.
- `.gitignore` — ya ignora `playwright-report/` y `playwright/.cache/`; verificar
  `test-results/`.

## Verificación

- `npm run test:e2e` verde (2 proyectos, 4 escenarios).
- `npm run test`, `npm run typecheck`, `npm run lint` sin regresiones.
