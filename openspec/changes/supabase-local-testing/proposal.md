# Propuesta: Pruebas de datos contra Supabase local

## Intención

Que las pruebas que hoy **emulan Postgres a mano** (cadenas falsas del query builder de
supabase-js) corran contra **Supabase local vía CLI**, para que los tests vuelvan a
predecir producción: constraints, tipos, funciones SQL y RLS dejan de simularse con
`mockResolvedValue` y pasan a ejercitarse de verdad.

> Origen: análisis del issue `refactor(data): eliminar el modo mock y unificar la capa
> de datos sobre Supabase` (#372, travelhub-app), adaptado a este repo. La esencia que
> transfiere no es eliminar un modo dual (aquí no existe), sino eliminar el *mock hecho
> a mano de Postgres* en la capa de tests.

## Contexto

- Este repo **no tiene** modo dual mock/Supabase: no existe `mock-data.ts` ni
  `isSupabaseConfigured()`. La capa de datos habla directo con Supabase
  (`getSupabaseAdmin()`, `createServerClient`). Las fases 4–6 del issue original no aplican.
- El costo equivalente vive en los tests: los módulos de dominio
  (`src/lib/admin/__tests__/`, `src/lib/booking/__tests__/`, `src/lib/wcc-*.test.ts`)
  hacen `vi.mock('@/lib/supabase/server')` y construyen un query builder falso
  (~12 `vi.fn()` encadenados por archivo) que emula Postgres a mano.
- Consecuencia: conflictos de unicidad, `ON CONFLICT`, órdenes, tipos enum, triggers y
  funciones SQL se simulan; cuando entra un comportamiento real, el mock sigue verde y
  producción se rompe.
- Cada tabla nueva exige escribir y mantener un builder falso: mismo impuesto por
  feature que motivó el issue original.
- Infraestructura ya disponible: `supabase/config.toml` (`project_id = "medica-app"`),
  22+ migraciones con carpeta `down`. Falta `supabase/seed.sql`, scripts de orquestación
  y variables de entorno de test (`.env.test` actual no es configuración de test).
- Matiz de este dominio: la app usa `service_role` (bypass de RLS) para admin y `anon`
  para booking público. Solo una base local permite probar RLS real sin tocar producción.

## Alcance

### Incluido

1. **Base de pruebas local**: scripts npm (`db:start`, `db:reset`, `test:local`) que
   levantan Supabase CLI, aplican migraciones, cargan seed y corren los tests contra
   `http://127.0.0.1:54321`.
2. **`supabase/seed.sql`**: datos mínimos deterministas (servicios, proveedores,
   horarios, conocimiento) reutilizados por los tests.
3. **Migración de tests de dominio**: los tests que mockean `getSupabaseAdmin` /
   `wcc-client` con builders falsos pasan a ejecutarse contra la base local.
4. **Aislamiento entre tests**: helper de limpieza (truncado o transacciones por test)
   para que cada caso arranque del seed sin contaminación cruzada.
5. **CI**: job que levanta Supabase local sin credenciales de producción y corre la
   suite completa.
6. **Documentación**: `architecture.md` y `AGENTS.md` actualizados con la nueva
   estrategia de pruebas.

### Fuera de alcance

- Eliminar modo dual o `mock-data.ts`: no existen en este repo.
- Cambiar código de producción de la capa de datos (solo cambian tests e infra de test).
- Tests de rutas API (`app/api/**/*.test.ts`) y de lógica pura (`validate`, `timezone`,
  flujos del agente): se quedan con mocks de servicios, que es legítimo (prueban
  contrato HTTP y lógica, no BD).
- E2E con Playwright: este repo no tiene infra e2e dual; se evaluará en otro change.
- Modificar `travelhub-app`.

## Capacidades

### Capacidades nuevas

- `testing-database`: estrategia de pruebas de datos contra Supabase local
  (seed, aislamiento, scripts, CI).

### Capacidades modificadas

Ninguna. Las capacidades de dominio existentes no cambian de comportamiento.

## Enfoque

- **Fuente de verdad del esquema**: las migraciones en `supabase/migrations/`. Los
  tests nunca crean ni alteran esquema; `supabase db reset` reconstruye desde migraciones
  y aplica `seed.sql`.
- **Clientes de test**: `getSupabaseAdmin()` y los clientes SSR leen las variables de
  entorno; el runner de test las apunta a la instancia local. No se introduce código
  condicional nuevo en producción.
- **Aislamiento**: truncado de tablas entre pruebas (respeta FKs con `TRUNCATE ...
  CASCADE` controlado) o reinicio por suite; se decide en `design.md` midiendo tiempo
  de suite.
- **RLS**: los tests de políticas usan clientes `anon`/`authenticated` locales; los
  tests con `service_role` quedan documentados como bypass intencional.
- **Migración incremental por módulo**: un PR por dominio (admin, booking, wcc), nunca
  mezclado con cambios de producción.

## Áreas afectadas

| Área | Impacto | Descripción |
|---|---|---|
| `package.json` | Modificado | Scripts `db:start`, `db:reset`, `test:local`. |
| `supabase/seed.sql` | Nuevo | Seed determinista mínimo para tests. |
| `.env.test` | Reemplazado | Variables reales apuntando a la instancia local. |
| `src/lib/**/__tests__/`, `src/lib/wcc-*.test.ts` | Modificado | Builders falsos reemplazados por BD local. |
| `vitest.config.ts` / helper de test | Modificado | Setup y limpieza de base por suite. |
| CI (workflow) | Modificado | Job con servicio Supabase local. |
| `architecture.md`, `AGENTS.md` | Modificado | Supabase local como requisito de desarrollo y pruebas. |

## Riesgos

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Suite más lenta contra BD real | Media | Medir; paralelizar por archivo; truncado selectivo en vez de `db reset` por test. |
| Tests con orden dependiente (contaminación) | Alta | Helper de limpieza obligatorio; CI corre dos veces la suite como detector. |
| Datos de seed insuficientes para casos nuevos | Media | Seed versionado junto a migraciones; cada módulo agrega lo suyo en fixtures locales del test. |
| Divergencia dev (Postgres local) vs prod (Supabase cloud) | Baja | Versiones de Postgres alineadas vía CLI; migraciones como única fuente de esquema. |
| Migración enorme en un solo PR | Alta | Un PR por dominio; criterio de cierre por módulo. |

## Plan de reversión

Por módulo: revertir el PR que reexpresa ese dominio y restaurar sus mocks. La
infraestructura compartida (scripts, seed, helper) es aditiva y no afecta producción;
puede quedarse sin riesgo mientras la migración avanza.
