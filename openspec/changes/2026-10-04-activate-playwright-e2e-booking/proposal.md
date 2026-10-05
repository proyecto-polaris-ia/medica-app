# Propuesta: Activar pruebas e2e de Playwright para /booking

## Intención

Activar la infraestructura de pruebas e2e declarada pero ausente —`openspec/config.yaml`
ya lista `e2e: npm run test:e2e`— y cubrir el flujo público de reserva `/booking`
(caso de uso núcleo del paciente) con Playwright contra Supabase local.

> Origen: issue #129 — "Activa y realiza pruebas e2e con playwright de los casos de
> uso principales".

## Contexto

- La app tiene suites de unit (Vitest) e integración de datos (Supabase local), pero
  ninguna prueba de navegador: el wizard real de `/booking` (reducer, 5 pasos, fetches
  a 3 endpoints + POST de reserva) solo se ejercita por piezas en jsdom.
- `@playwright/test` aparece en `package-lock.json` solo como peer transitivo; no hay
  config ni scripts.
- El flujo público depende de Cloudflare Turnstile. La spec vigente
  (`openspec/specs/public-booking/spec.md`) exige token y degradación elegante; Cloudflare
  provee claves de prueba always-pass aptas para e2e.
- Alcance decidido con el usuario: **solo `/booking`**; el widget de chat (LLM) y el
  admin quedan fuera de esta change. El backend de chat/LLM no participa en el flujo
  público de reserva.

## Alcance

### Incluido

1. Dependencia `@playwright/test` + `playwright.config.ts` + script `test:e2e` que
   levanta el dev server y Supabase local automáticamente.
2. Spec e2e del flujo feliz: wizard completo (servicio → especialista → horario →
   confirmación) hasta "¡Reserva confirmada!" contra datos reales de `supabase/seed.sql`.
3. Spec e2e de casos negativos: reserva sin token de captcha rechazada, degradación
   elegante sin claves Turnstile, y manejo de conflicto de horario (409).

### Excluido

- Widget de chat web, admin, WhatsApp.
- Cambios a código de producción del wizard o sus APIs (si un test expone un bug, se
  documenta y se abre fix aparte).

## Riesgos y rollback

- Riesgo: `next dev` + Turnstile real introduce flakiness de red. Mitigación: claves de
  prueba de Cloudflare y `reuseExistingServer`; si la red a `challenges.cloudflare.com`
  falla, el test del widget se marca `test.skip` explícito (nunca falso-verde).
- Rollback: revertir el commit — agrega solo devDependencies, config y specs de test;
  no toca runtime de producción.

## Impacto en specs

- Nueva capability `e2e-playwright-booking`: define qué comportamiento del flujo público
  de reserva se verifica en navegador y cómo debe comportarse el entorno de pruebas.
