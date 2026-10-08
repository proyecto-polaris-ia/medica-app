# Tareas: Búsqueda con autocomplete y paginación en el listado de pacientes

Change: `patient-list-search-pagination` (issue #167)
Capacidades: `admin-patients-api`, `admin-patients-ui`
Recordatorio: `openspec/config.yaml` define `strict_tdd: true`. Cada tarea de
comportamiento escribe primero la prueba (RED), implementa lo mínimo (GREEN) y
cierra con casos negativos/alternos (TRIANGULATE) antes de refactorizar
(REFACTOR). Las suites de datos corren contra Supabase local (`npm run
test:local`); el resto corre con `npm run test`.

## Fase 0 — Preparación de entorno (prerrequisito de apply)

- [x] 0.1 **Instalar dependencias del worktree.** Ejecutar `npm install` en la raíz del worktree (hoy `node_modules/` no existe). Archivos afectados: ninguno del repo (`package-lock.json` no debe cambiar; si cambia, detenerse y reportar). **Estrictamente requerido para apply: sí** (sin dependencias no corren `vitest`, `tsc` ni `next`).
  - Check: `test -d node_modules && npx vitest --version`
- [x] 0.2 **Leer la guía de Next.js de esta versión antes de codificar.** Leer en `node_modules/next/dist/docs/` la guía de `useSearchParams` / App Router (client components y límites de `Suspense`) y la de `useRouter` (`replace`). Es la regla de `AGENTS.md` ("This is NOT the Next.js you know") y el prerrequisito declarado en `design.md` (Decisión 5). Archivos afectados: ninguno; es lectura previa a `app/(admin)/patients/page.tsx`. **Estrictamente requerido para apply: sí** (bloquea la Fase 3).
  - Check: `ls node_modules/next/dist/docs/ | head` y anotar en el reporte de apply la ruta exacta del archivo leído.
- [x] 0.3 **Levantar Supabase local y resetear el esquema.** `supabase start` y luego `supabase db reset` (ver `architecture.md` §9 y `openspec/changes/supabase-local-testing/`). Archivos afectados: ninguno (no hay migraciones nuevas). **Estrictamente requerido para apply: solo antes de las tareas 1.3 y 5.3**; las suites puras, de route y de componente (1.1, 2.x, 3.x, 5.4) no lo necesitan.
  - Check: `supabase status` y `npm run test:local -- src/lib/admin/__tests__/patients.test.ts`

## Fase 1 — Capa de datos (`src/lib/admin/patients.ts`)

- [x] 1.1 **RED (puro, sin BD).** Añadir en `src/lib/admin/__tests__/patients.test.ts` los `describe` de nivel superior (fuera del bloque `d`, para que corran también sin `SUPABASE_LOCAL=1`): `escapePostgrestIlikeTerm` con `%`, `_`, `,`, `(`, `)`, `"` y `\`, y `normalizePatientsPagination` con `null`, `''`, `'abc'`, `0`, `-1`, `1.5`, `'101'`. Los casos deben fallar por símbolo inexistente (prueba roja), no por error de tipos. Archivos: `src/lib/admin/__tests__/patients.test.ts`.
  - Check: `npm run test -- src/lib/admin/__tests__/patients.test.ts` (falla por import/símbolo no definido).
- [x] 1.2 **GREEN (helper puro).** Implementar en `src/lib/admin/patients.ts` `escapePostgrestIlikeTerm`, `normalizePatientsPagination`, `PATIENTS_DEFAULT_PAGE`, `PATIENTS_DEFAULT_PAGE_SIZE` (20) y `PATIENTS_MAX_PAGE_SIZE` (100), según `design.md` Decisión 2 y Decisión 1. Archivos: `src/lib/admin/patients.ts`.
  - Check: `npm run test -- src/lib/admin/__tests__/patients.test.ts` (casos puros en verde).
- [x] 1.3 **RED (datos contra Supabase local).** Añadir al bloque `d('patients service')` los casos de `listPatientsPage`: default 1/20; aritmética de páginas (3 filas, `pageSize 2` → `total 3`, `totalPages 2`, 2 + 1 filas); orden estable y sin repetidos entre páginas consecutivas; búsqueda + paginación combinadas (`total` filtrado, filtro antes del `range`); búsqueda sin coincidencias (`total 0`, `totalPages 1`, `patients []`); página fuera de rango (`patients []` con `total`/`totalPages` reales); `q` con `%` y `_` que deben coincidir como literales (`Ana 100%` vs `Ana 100X`); `q` con `,` o `(`, `)` o `"` que resuelve sin lanzar. Requiere 0.3. Archivos: `src/lib/admin/__tests__/patients.test.ts`.
  - Check: `npm run test:local -- src/lib/admin/__tests__/patients.test.ts` (falla porque `listPatientsPage` no existe).
- [x] 1.4 **GREEN (lectura paginada).** Implementar `listPatientsPage({ q, page, pageSize })` y el tipo `PatientsPage` en `src/lib/admin/patients.ts`: reutilizar `SELECT_COLUMNS`, aplicar el `.or(...)` escapado **antes** de `count:'exact'` y `range(from, from + pageSize - 1)`, orden `created_at` desc con desempate `id` desc, y derivar `totalCount`/`totalPages` (`Math.max(1, ...)`). `searchPatients` pasa a usar el mismo escape; `listPatients()` y `searchPatients()` se conservan exportadas. Sin tocar el CRUD (`createPatient`, `updatePatient`, `updatePatientEmail`, `deletePatient`). Archivos: `src/lib/admin/patients.ts`.
  - Check: `npm run test:local -- src/lib/admin/__tests__/patients.test.ts` y `npm run test -- src/lib/admin/__tests__/patients.test.ts`.
- [x] 1.5 **TRIANGULATE / REFACTOR.** Cubrir el borde crítico de escape (`a,b`, `(`, `x"y`, `50%`, `a_b`). [EVIDENCIA apply unidad 1] El fallback "neutralizar `"`" quedó obsoleto: la sonda contra el PostgREST local mostró que des-escapa un nivel el valor citado, así que la corrección aplicada es duplicar cada barra invertida (`\\` → `\\\\`) y enviar la comilla como `\\"`. Documentado como enmienda en `design.md` Decisión 2. Archivos: `src/lib/admin/patients.ts`, `src/lib/admin/__tests__/patients.test.ts`.
  - Check: `npm run test:local -- src/lib/admin/__tests__/patients.test.ts`

## Fase 2 — Contrato del endpoint (`GET /api/admin/patients`)

- [x] 2.1 **RED (contrato).** Actualizar `app/api/admin/patients/route.test.ts`: el mock pasa de `listPatients`/`searchPatients` a `listPatientsPage`; agregar casos de forma aditiva `{ patients, page, pageSize, total, totalPages }`, `q` con trim y `q` vacío, `page`/`pageSize` inválidos → `1`/`20`, `pageSize > 100` → `100`, y conservar `401 { error: "unauthorized" }` sin consultar datos más el `POST` intacto. Archivos: `app/api/admin/patients/route.test.ts`.
  - Check: `npm run test -- app/api/admin/patients/route.test.ts` (rojo por la forma de respuesta y por el mock nuevo).
- [x] 2.2 **GREEN (route delgado).** Modificar `app/api/admin/patients/route.ts`: `GET` lee `q`, normaliza `page`/`pageSize` con `normalizePatientsPagination`, llama `listPatientsPage` y responde la forma aditiva mapeando `totalCount` → `total`. `handleAdminRequest`, `requireUser`, `POST` y `parseJsonBody` quedan sin cambios. Archivos: `app/api/admin/patients/route.ts`.
  - Check: `npm run test -- app/api/admin/patients/route.test.ts`
- [x] 2.3 **TRIANGULATE (compatibilidad aditiva).** Verificar que el consumidor legacy sigue funcionando con el nuevo contrato: `src/components/booking/PatientSearch.tsx` no se modifica y su suite debe seguir verde. Archivos: ninguno (verificación; `PatientSearch.tsx` queda intacto).
  - Check: `npm run test -- src/components/booking/__tests__/PatientSearch.test.tsx`

## Fase 3 — Vista `/patients` (UI)

- [x] 3.1 **RED (componente).** Reescribir/ampliar `app/(admin)/patients/page.test.tsx` con `vi.useFakeTimers({ shouldAdvanceTime: true })` (patrón `src/components/booking/__tests__/PatientSearch.test.tsx`) y mock de `next/navigation` (patrón `app/(admin)/appointments/page.test.tsx`). El mock de `fetch` actual compara la URL exacta `'/api/admin/patients'` y debe aceptar query string. Casos: 1 carácter no consulta filtro ni muestra sugerencias; ≥ 2 caracteres consultan una sola vez tras 300 ms y muestran nombre + teléfono; sin coincidencias no hay sugerencias; seleccionar deja solo ese paciente y vuelve a página 1; limpiar restaura la lista y borra `q`; `Página X de Y` con anterior/siguiente deshabilitados en extremos; siguiente solicita `page=2` y conserva la búsqueda; URL inicial `?q=&page=` repuebla input y filas; `page` fuera de rango se normaliza a la última página sin error; vacío por búsqueda vs. vacío sin pacientes; carga en vuelo no muestra vacío; error + reintento repite la misma búsqueda y página; no se consulta el endpoint sin `q` válido. Requiere 0.2. Archivos: `app/(admin)/patients/page.test.tsx`.
  - Check: `npm run test -- "app/(admin)/patients/page.test.tsx"` (rojo: la vista aún no tiene input de búsqueda ni controles).
- [x] 3.2 **GREEN (composición inline).** Implementar en `app/(admin)/patients/page.tsx` el input antes de la tabla, el debounce de 300 ms con `clearTimeout` en cleanup, las sugerencias derivadas de la misma respuesta (`suggestions = activeQ ? patients : []`), la selección (`rows = selectedPatient ? [selectedPatient] : patients`), el limpiar inmediato, los controles `Anterior`/`Siguiente` + `Página X de Y` alrededor de `DataTable`, el estado vacío diferenciado ("Sin coincidencias para esta búsqueda" + acción de limpiar vs. "No hay pacientes registrados."), el `LoadingState`/`ErrorState` con reintento por `reloadToken`, y la sincronización de URL con `useSearchParams()` + `router.replace` con guard de redundancia (`q` solo si ≥ 2 caracteres, `page` solo si > 1). Sin tocar `DataTable.tsx` ni `PatientSearch.tsx`. Archivos: `app/(admin)/patients/page.tsx`.
  - Check: `npm run test -- "app/(admin)/patients/page.test.tsx"`
- [x] 3.3 **TRIANGULATE / REFACTOR.** Casos alternos: cambio de búsqueda reinicia a página 1, respuestas viejas descartadas por bandera `cancelled`, deep-link con `page=99` normalizado contra `totalPages`, y URL vacía → `'/patients'`. Refactor de claridad con la suite enfocada en verde. Archivos: `app/(admin)/patients/page.tsx`, `app/(admin)/patients/page.test.tsx`.
  - Check: `npm run test -- "app/(admin)/patients/page.test.tsx"`

## Fase 4 — No regresión de superficies intocables

- [x] 4.1 **Confirmar que el genérico y el consumidor legacy no se modificaron.** Archivos: `src/components/admin/DataTable.tsx`, `src/components/booking/PatientSearch.tsx` (ambos deben quedar sin diff).
  - Check: `git diff --stat -- src/components/admin/DataTable.tsx src/components/booking/PatientSearch.tsx` (salida vacía).
- [x] 4.2 **Confirmar que no hay migraciones ni cambios de esquema.** Archivos: `supabase/migrations/` (debe quedar sin diff).
  - Check: `git status --porcelain -- supabase/` (salida vacía).
- [x] 4.3 **Regresión de UI existente de la vista.** Las pruebas vigentes de la página (correo del paciente, enlace al expediente, alta con teléfono nulo) deben seguir verdes dentro de la suite actualizada de 3.1–3.3. Archivos: `app/(admin)/patients/page.test.tsx`.
  - Check: `npm run test -- "app/(admin)/patients/page.test.tsx"`

## Fase 5 — Verificación y entrega

- [x] 5.1 **Lint.** `npm run lint` sin errores nuevos. Archivos afectados: los cuatro archivos modificados.
  - Check: `npm run lint`
- [x] 5.2 **Typecheck y build.** `npx tsc --noEmit` y `npm run build` limpios (el build es `verify.build_command` del config).
  - Check: `npx tsc --noEmit` y `npm run build`
- [x] 5.3 **Suite de datos local.** Con 0.3 aplicado (`supabase start` + `supabase db reset`), correr la suite completa contra Supabase local.
  - Check: `npm run test:local`
- [x] 5.4 **Suite unit completa.** `npm run test` (`apply.test_command` y `verify.test_command` del config) en verde.
  - Check: `npm run test`
- [x] 5.5 **Recorrido de escenarios de spec.** Marcar cada escenario de `specs/admin-patients-api/spec.md` y `specs/admin-patients-ui/spec.md` con su evidencia observada (comando + resultado) en el reporte de verify.

## No objetivos (explícitos, fuera de alcance)

- `src/components/admin/DataTable.tsx`: no se le agregan props de paginación ni `rowKey`; sigue genérico (limitación aceptada en `design.md`, Decisión 4b).
- `src/components/booking/PatientSearch.tsx`: no se modifica; solo lee `data.patients` de la respuesta aditiva.
- `supabase/migrations/**`: sin migraciones, sin cambios de esquema, sin RLS, sin índices full-text.
- `travelhub-app`: no se modifica ningún archivo de ese proyecto.
- Guard de autenticación (`requireUser()`), CRUD (`POST`/`PATCH`/`DELETE`) y el contrato de `/api/admin/patients/[id]`: sin cambios.
- Ordenamiento por columna, exportación, filtros por fecha/estado y búsqueda difusa: no se implementan.

## Forecast

### Tamaño de diff estimado

| Archivo | Acción | Líneas agregadas | Líneas eliminadas |
|---|---|---|---|
| `src/lib/admin/patients.ts` | Modificar | ~55 | ~3 |
| `app/api/admin/patients/route.ts` | Modificar | ~14 | ~8 |
| `app/(admin)/patients/page.tsx` | Modificar | ~110 | ~18 |
| `src/lib/admin/__tests__/patients.test.ts` | Modificar | ~130 | ~4 |
| `app/api/admin/patients/route.test.ts` | Modificar | ~80 | ~35 |
| `app/(admin)/patients/page.test.tsx` | Reescribir/ampliar | ~200 | ~30 |
| `src/components/admin/DataTable.tsx` | Conservado | 0 | 0 |
| `src/components/booking/PatientSearch.tsx` | Conservado | 0 | 0 |
| **Total** | | **~589** | **~98** |

- Producción: ~179 agregadas / ~29 eliminadas (~208 líneas modificadas).
- Pruebas: ~410 agregadas / ~69 eliminadas (~479 líneas modificadas).

### Número de casos de prueba estimado

| Suite | Casos nuevos/ajustados |
|---|---|
| `src/lib/admin/__tests__/patients.test.ts` (puro) | ~10 |
| `src/lib/admin/__tests__/patients.test.ts` (Supabase local) | ~8 |
| `app/api/admin/patients/route.test.ts` | ~8 |
| `app/(admin)/patients/page.test.tsx` | ~14 |
| **Total** | **~40** |

### Unidades de trabajo / commits sugeridos

| Unidad | Objetivo | Contenido | Commits (Conventional) |
|---|---|---|---|
| 1 | Lectura paginada y escape en la capa de datos | `src/lib/admin/patients.ts` + `src/lib/admin/__tests__/patients.test.ts` | `feat(admin): add paginated patient listing with escaped ilike search` |
| 2 | Contrato aditivo del endpoint | `app/api/admin/patients/route.ts` + `app/api/admin/patients/route.test.ts` | `feat(api): expose additive pagination metadata on admin patients list` |
| 3 | Vista `/patients` con autocomplete, paginación y URL | `app/(admin)/patients/page.tsx` + `app/(admin)/patients/page.test.tsx` | `feat(admin): add debounced search, suggestions and pagination to patients page` |
| 4 | Verificación y no regresión | sin código; evidencia de lint/tsc/build/`npm run test`/`npm run test:local` | `chore(admin): verify patients search and pagination change` |

### Evaluación de carga de revisión

- **Por PR completo (un solo PR):** Large (~690 líneas modificadas; casi 70 % son pruebas).
- **Por unidad de trabajo:** Small/Medium (unidad 1 ~192, unidad 2 ~137, unidad 3 ~358 líneas modificadas). La unidad 3 es la más pesada y la única que se acerca al presupuesto de 400 líneas.
- Riesgo principal de revisión: la concentración de lógica de estado (debounce + URL + normalización de página + dos estados vacíos) en un único componente de página, y la actualización de los mocks existentes de `page.test.tsx` y `route.test.ts`.

Decision needed before apply: Yes

### Decisión del humano
- Estrategia elegida: **3 PRs encadenados apilados por capa** (datos → endpoint → UI), con el contrato aditivo permitiendo desplegar cada eslabón sin ventana de incompatibilidad.
Chained PRs recommended: Yes
Chain strategy: stacked-by-layer (3 PRs: datos → endpoint → UI; el contrato aditivo permite desplegar cada eslabón sin ventana de incompatibilidad)
400-line budget risk: High

Motivo: el total estimado (~690 líneas modificadas) excede el presupuesto de ~400 líneas, y la unidad 3 por sí sola (~358) queda cerca del límite; el change es cohesivo pero no cabe en un solo PR revisable sin `size:exception`. La decisión pendiente es si se entrega como PR único con `size:exception` (precedente del repo en `patient-email-contact`) o como 3 PRs encadenados por capa.
