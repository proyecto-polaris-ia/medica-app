# Feature: activate-playwright-e2e-booking (issue #129)

**Issue:** https://github.com/proyecto-polaris-ia/medica-app/issues/129
**Branch:** `eliumontoya/pruebas-e2e` (worktree `pruebas-e2e`)
**Creado:** 2026-10-04

## Alcance decidido con el usuario

- Cobertura e2e: **solo `/booking`** (flujo público del paciente).
- Backend de chat/LLM: **mockeado** (no determinismo de LLM en e2e).
- El widget y el admin quedan fuera de esta change.

## Tareas

1. [x] Explorar implementación de `/booking` y entorno de pruebas (APIs, Turnstile, seed, env).
2. [x] Crear change OpenSpec `2026-10-04-activate-playwright-e2e-booking` (proposal/specs/design/tasks).
3. [x] Instalar Playwright y configurar `npm run test:e2e` + `playwright.config.ts`. *(@playwright/test 1.63.0, chromium 1243; webServer dual con fallback de puertos).*
4. [x] Setup de datos e2e: `scripts/e2e-pretest.mjs` (supabase start tolerante + db reset con seed) + claves de prueba Turnstile en el config.
5. [x] Spec e2e: flujo feliz del wizard de `/booking` (`tests/e2e/booking-happy-path.spec.ts`).
6. [x] Spec e2e: casos negativos (`tests/e2e/booking-negative.spec.ts`: captcha ausente 400, doble reserva 409 + bloque de conflicto, degradación sin claves).
7. [x] Verificación: `test:e2e` 4 passed ×5 corridas (writer ×4 + orquestador ×1); `test` sin regresión (1145 passed, igual al baseline); `typecheck` limpio; `lint` 33 warnings preexistentes, 0 nuevos.
8. [ ] Cierre: resumen, checks pendientes, siguiente paso.

## Evidencia (commits)

- `c9d3271` — test(booking): activate Playwright e2e suite for public booking flow
  (13 archivos, +1080; incluye docs de feature y change OpenSpec).

## Hallazgos y seguimiento

- **Bug de producción documentado (no corregido, fuera de alcance):** `ResultStep` no
  renderiza el servicio ni el especialista en el bloque de confirmación. Fix propuesto
  como change/issue aparte; la spec delta ajustada para verificar vía BD.
- Desviación aceptada del design: puertos 3001/3002 con fallback automático (3001
  está ocupado por un contenedor ajeno en esta máquina).
- `package.json`: `test`/`test:local` ahora excluyen `tests/e2e/**` de Vitest.

## Notas

- `openspec/config.yaml` ya declara `e2e: npm run test:e2e` — la change lo activa de verdad.
- Spec vigente: `openspec/specs/public-booking/spec.md` (Turnstile obligatorio, degradación
  elegante sin claves). Para e2e usar claves de prueba de Cloudflare:
  site `1x00000000000000000000AA`, secret `1x0000000000000000000000000000000AA`.
- Datos de catálogo/agenda salen de Supabase local (`supabase/seed.sql`).
