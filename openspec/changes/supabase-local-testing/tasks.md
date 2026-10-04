# Tareas: Pruebas de datos contra Supabase local

> Un PR por fase. No mezclar migración de tests con cambios de producción.

## Fase 1 — Infraestructura de base local

- [ ] 1.1 Verificar Supabase CLI instalado y `supabase start` funcional con las migraciones existentes; documentar versión de CLI en `architecture.md`.
- [ ] 1.2 Crear `supabase/seed.sql` con datos mínimos deterministas (servicios, proveedores, business hours, knowledge entries) y validar que `supabase db reset` lo aplica sin errores.
- [ ] 1.3 Reemplazar `.env.test` con variables reales de test (`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, claves local/anon/service del CLI).
- [ ] 1.4 Agregar scripts npm: `db:start`, `db:reset`, `test:local` (orquesta levantar, resetear y correr vitest con env de test).
- [ ] 1.5 Crear helper de aislamiento (`src/test-utils/db.ts` o equivalente): limpieza entre suites (truncado controlado) y clientes `admin`/`anon` apuntando a local.
- [ ] 1.6 Migrar un módulo piloto pequeño (candidato: `src/lib/admin/__tests__/services.test.ts` o `business-hours.test.ts`) a BD local y medir tiempo de suite. **Criterio de cierre del piloto antes de continuar.**

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
