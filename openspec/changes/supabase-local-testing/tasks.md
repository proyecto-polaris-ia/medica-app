# Tareas: Pruebas de datos contra Supabase local

> Un PR por fase. No mezclar migración de tests con cambios de producción.

> **Estado**: fases 1–3 completas. 21 suites de datos migradas a Supabase local; suite completa verde en ambas modalidades (regular: 1138 passed / 213 skipped; local: 1230 passed / 121 skipped, ~33s). 7 bugs reales corregidos (todos ocultos por el mock). Report-only pendientes de decisión: plan draft huérfano (`treatment-plans.ts:267`, el más grave); `updated_at` sin trigger en varias tablas; `searchPatients` sensible a acentos; `uploaded_by` sin validar; reschedule `.single()` race; booking reintenta errores permanentes; catálogos públicos sin orden. Lint: 13 errores preexistentes en archivos no tocados (`agent/agent.ts`, `patient-resolution.test.ts`, `tests/agent/`) — deuda previa, fuera de alcance.

## Fase 1 — Infraestructura de base local

- [x] 1.1 Verificar Supabase CLI instalado y `supabase start` funcional con las migraciones existentes; documentar versión de CLI en `architecture.md`. *(CLI 2.119.0; puertos locales desplazados a API 54331 / DB 54332 por colisión con otro stack Supabase local en la misma máquina.)*
- [x] 1.2 Crear `supabase/seed.sql` con datos mínimos deterministas (servicios, proveedores, business hours, knowledge entries) y validar que `supabase db reset` lo aplica sin errores. *(knowledge entries diferido a la fase 2; seed valida 3 servicios + 1 proveedor + 5 horarios.)*
- [x] 1.3 Reemplazar `.env.test` con variables reales de test. *(La escritura de `.env.test` está bloqueada por la política de seguridad del harness; los defaults locales viven en `src/test-utils/local-db.ts` con override opcional vía `.env.test` manual.)*
- [x] 1.4 Agregar scripts npm: `db:start`, `db:reset`, `test:local`.
- [x] 1.5 Crear helper de aislamiento (`src/test-utils/local-db.ts`): truncado de todas las tablas de `public` vía `pg` + guard `localDbEnabled`.
- [x] 1.6 Migrar módulo piloto `src/lib/admin/__tests__/services.test.ts` a BD local y medir. **Piloto exitoso: 7/7 en ~1s.** Hallazgo real: `updateService` con `.single()` devolvía error PGRST116 (HTTP 500) en vez de `NotFoundError` (404) al actualizar un servicio inexistente — bug oculto por el mock, corregido con `.maybeSingle()`. Commit: `test/supabase-local-testing` (work unit de fase 1).*

## Fase 2 — Migración de tests de dominio (un PR por dominio)

> Ejecutada en 6 lotes secuenciales en la misma rama (commits `c947f4f`, `71185a7`,
> `d780220`, `91219c8`, `7ee418c`, `349f26d`).

- [x] 2.1 `src/lib/admin/__tests__/` (providers, services, business-hours, clinic-time*). *clinic-time es lógica pura: se conserva sin BD.*
- [x] 2.2 `src/lib/admin/__tests__/` (appointments, patients, payments, clinical-visits, medical-history, treatment-plans, patient-files, patient-record*, accounts-receivable, onboarding-status*). *patient-record y onboarding-status no mockean Supabase: se conservan.*
- [x] 2.3 `src/lib/booking/__tests__/` (booking, catalog, reschedule) — solapamiento y conflictos verificados con el constraint EXCLUDE real. *Nota: `availability`/`next-available`/`patient-resolution` no tienen suite que mockee Supabase; cobertura pendiente de evaluar en otro change.*
- [x] 2.4 `src/lib/wcc-*.test.ts` (appointments, contacts, payments). *dashboard/conversations/drafts no mockean el cliente: se conservan.*
- [x] 2.5 Tests de RLS (`src/lib/admin/__tests__/rls.test.ts`): tablas `*_admin_all` (TO authenticated) accesibles para usuario autenticado local y negadas a anon; tablas con RLS sin políticas solo accesibles vía service_role.

## Fase 3 — CI y documentación

- [x] 3.1 Job `test-local-db` en `.github/workflows/ci.yml`: Supabase CLI + `db reset` + `npm run test:local`.
- [x] 3.2 `architecture.md` §9 (estrategia de pruebas) y `AGENTS.md` (instrucción para agentes).
- [x] 3.3 `README.md` con instrucciones de setup local. *(La escritura de `.env.test`/`.env.local.example` está bloqueada por la política de seguridad del harness; los defaults viven en código — `src/test-utils/local-db.ts` — y el README documenta el flujo.)*

## Criterio de cierre

- Ningún test de dominio mockea el query builder de supabase-js (`vi.mock('@/lib/supabase/server')` eliminado de los módulos migrados).
- `npm run typecheck`, `npm run lint`, `npm run test:local` en verde, local y CI.
- `architecture.md` describe la nueva estrategia; seed versionado junto a migraciones.
- Los tests de rutas API y de lógica pura conservan sus mocks (contrato HTTP / lógica pura).
