# Tareas: Pruebas de datos contra Supabase local

> Un PR por fase. No mezclar migración de tests con cambios de producción.

> **Estado**: fase 1 completa (commit `5b3d04e` en rama `test/supabase-local-testing`). Piloto exitoso: 7/7 tests contra BD local, bug real corregido (`updateService` → `.maybeSingle()`).

## Fase 1 — Infraestructura de base local

- [x] 1.1 Verificar Supabase CLI instalado y `supabase start` funcional con las migraciones existentes; documentar versión de CLI en `architecture.md`. *(CLI 2.119.0; puertos locales desplazados a API 54331 / DB 54332 por colisión con otro stack Supabase local en la misma máquina.)*
- [x] 1.2 Crear `supabase/seed.sql` con datos mínimos deterministas (servicios, proveedores, business hours, knowledge entries) y validar que `supabase db reset` lo aplica sin errores. *(knowledge entries diferido a la fase 2; seed valida 3 servicios + 1 proveedor + 5 horarios.)*
- [x] 1.3 Reemplazar `.env.test` con variables reales de test. *(La escritura de `.env.test` está bloqueada por la política de seguridad del harness; los defaults locales viven en `src/test-utils/local-db.ts` con override opcional vía `.env.test` manual.)*
- [x] 1.4 Agregar scripts npm: `db:start`, `db:reset`, `test:local`.
- [x] 1.5 Crear helper de aislamiento (`src/test-utils/local-db.ts`): truncado de todas las tablas de `public` vía `pg` + guard `localDbEnabled`.
- [x] 1.6 Migrar módulo piloto `src/lib/admin/__tests__/services.test.ts` a BD local y medir. **Piloto exitoso: 7/7 en ~1s.** Hallazgo real: `updateService` con `.single()` devolvía error PGRST116 (HTTP 500) en vez de `NotFoundError` (404) al actualizar un servicio inexistente — bug oculto por el mock, corregido con `.maybeSingle()`. Commit: `test/supabase-local-testing` (work unit de fase 1).*

## Fase 2 — Migración de tests de dominio (un PR por dominio)

- [ ] 2.1 `src/lib/admin/__tests__/` (providers, services, business-hours, clinic-time).
- [ ] 2.2 `src/lib/admin/__tests__/` (appointments, patients, payments, clinical-visits, medical-history, treatment-plans, patient-files, patient-record, accounts-receivable, onboarding-status).
- [ ] 2.3 `src/lib/booking/__tests__/` (availability, catalog, booking, patient-resolution, next-available) — incluir verificación de disponibilidad real desde BD.
- [ ] 2.4 `src/lib/wcc-*.test.ts` (appointments, contacts, payments, follow-up drafts, dashboard, conversaciones).
- [ ] 2.5 Tests de RLS: políticas críticas (pacientes aislados, booking público con `anon`) con clientes `anon`/`authenticated` locales.

## Fase 3 — CI y documentación

- [ ] 3.1 Job de CI: levantar Supabase local (sin credenciales de producción), `db reset` + seed, correr `npm run test:local`.
- [ ] 3.2 Actualizar `architecture.md` (estrategia de pruebas: BD local, qué se mockea y qué no) y `AGENTS.md` (instrucción: tests de datos corren contra Supabase local).
- [ ] 3.3 Actualizar `.env.local.example` y README con instrucciones de setup para desarrollo.

## Criterio de cierre

- Ningún test de dominio mockea el query builder de supabase-js (`vi.mock('@/lib/supabase/server')` eliminado de los módulos migrados).
- `npm run typecheck`, `npm run lint`, `npm run test:local` en verde, local y CI.
- `architecture.md` describe la nueva estrategia; seed versionado junto a migraciones.
- Los tests de rutas API y de lógica pura conservan sus mocks (contrato HTTP / lógica pura).
