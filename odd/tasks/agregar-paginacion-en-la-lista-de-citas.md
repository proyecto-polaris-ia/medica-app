# Feature: agregar-paginacion-en-la-lista-de-citas (issue #168)

Issue: https://github.com/proyecto-polaris-ia/medica-app/issues/168
Rama: `eliumontoya/agregar-paginacion-en-la-lista-de-citas`
Estado: en progreso

## Contexto

- `GET /api/admin/appointments` devuelve todo sin paginar (`listAppointments()`,
  `app/api/admin/appointments/route.ts`).
- Filtros (servicio, paciente, proveedor) y ordenamiento viven **client-side**
  en `app/(admin)/appointments/page.tsx` (`filteredAndSortedAppointments`).
- No existe componente `Pagination`; la paginación de pacientes (#167) tampoco
  está implementada — este change crea el componente compartido.
- Patrón de sincronía URL a seguir: estado local como fuente de verdad,
  inicialización única desde `useSearchParams`, escritura con `router.replace`
  y guardia anti-reescritura (patrón de `applyCalendarFilters`).

## Decisión de diseño

Los criterios de aceptación del issue (`total` respeta filtros activos,
paginación sobre resultados filtrados) exigen **filtros server-side**. El API
acepta `page`, `pageSize`, y filtros (`serviceId`, `patientId`, `providerId`,
`start`/`end` rango) + orden; la página envía los filtros al servidor y la UI
muestra resultados de la página actual. Orden server-side con whitelist de
columnas (`start_at` por defecto `desc`, `created_at`).

## Tareas

1. [x] Change OpenSpec: `openspec/changes/agregar-paginacion-citas/`
   (proposal.md, design.md, specs delta, tasks.md). — commit `4888930`.
2. [x] Backend: `listAppointmentsPaged` en `src/lib/admin/appointments.ts`
   (filtros + orden + count + paginación, reusando `withReminders`);
   `route.ts` con `page` (default 1), `pageSize` (default 20, max 100) y
   metadatos `{ total, page, pageSize, totalPages }`; prueba unitaria mockeada
   actualizada (30/30 GREEN). Whitelist de orden: 7 llaves (empírico, embed
   PostgREST; `patients(full_name)`); fallback 416/PGRST103; desempate por `id`;
   alias `sortBy` aceptado.
3. [x] Pruebas de datos contra Supabase local
   (`src/lib/admin/__tests__/appointments-pagination.test.ts`): 13/13 GREEN
   tras `db:start` + `db:reset`. Pendiente externo: `npm run test:local` completo
   tiene ~14 fallas preexistentes por timeouts del advisory lock en suites
   ajenas (probadas no relacionadas en aislamiento; rama hermana
   `test-local-falla-deterministicamente-8-tests-pat` ya la trackea).
4. [x] Frontend: `Pagination` reutilizable en `src/components/admin/` (props
   `{ page, pageSize, total, onPageChange, ariaLabel? }`, aria completo,
   reutilizable para #167); integración en `/appointments` (filtros y orden
   server-side, URL `?page=n` con init única y no-reescritura, reset a página 1
   al cambiar filtro u orden, preservación de página lista↔calendario, tres
   estados vacíos). 74/74 pruebas de los archivos tocados en GREEN
   (13 del componente + 61 de la página); `npm test` completo 1462/0;
   typecheck/lint limpios.
5. [x] Verificación (verificador `gentle-ai-verify`, @ `e230ef7`): `db:start`
   + `db:reset` OK (24 migraciones); `test:local` 1718 passed con UNA sola falla
   = timeout del advisory lock en `booking.test.ts` (preexistente, pasada en
   aislamiento 5/5; suites del feature 26/26 enfocadas); `npm test` 1462/0;
   typecheck limpio; lint 0 errores (2 warnings de `page.tsx` preexisten en el
   merge-base); `build` OK (11/11 páginas); knip sin hallazgos nuevos.
6. [x] Commits de unidad de trabajo (ver abajo).

## Hallazgos advisories de la revisión nativa (no bloqueantes, trabajo posterior)

- `R3-sort-whitelist-spec-mismatch` (WARNING) — `openspec/changes/agregar-paginacion-citas/specs/admin-appointments/spec.md:90-96`: el delta aún dice whitelist `{start_at, created_at}`; la implementación dejó 7 llaves (design §1.4 ya lo documenta). Actualizar el delta al archivar.
- `R3-stale-response-race` (WARNING) — `app/(admin)/appointments/page.tsx:443-456`: respuesta tardía de un request anterior podría pisar el estado de una página/filtro más nuevo (falta guard de obsolescencia en `loadData`).
- `R3-empty-state-filtered-oor` (SUGGESTION) — `page.tsx:655-661`: refinamiento posible del mensaje cuando la página activa está fuera de rango con filtros activos.
- `R3-parse-page-untested` (SUGGESTION) — `page.tsx:210-214`: `parsePage` sin prueba unitaria dedicada.

## Evidencia de commits

- `4888930` docs(openspec): propose agregar-paginacion-citas change for issue #168 — artefactos OpenSpec + rastreo de feature (tarea 1).
- Revisión nativa del candidato documental cerrada: lineage `review-f71be7c46b849ea4`, riesgo bajo, autoridad quemada.
- Backend (tareas 2–3): commit `8442588`; RED route 23 fail → 30/30 GREEN; RED data 11 fail → 13/13 GREEN; typecheck limpio; lint 0 errores (25 warnings preexistentes). Revisión nativa del candidato backend: consentimiento declinado para este candidato (sin lineage).
- Frontend (tarea 4): commit `e230ef7`; RED Pagination (import inexistente) → 13/13 GREEN; RED page 12 fail → 74/74 GREEN; `npm test` 1462 passed / 0 failed; typecheck limpio; lint 0 errores sin warnings nuevos.
- Revisión nativa del candidato frontend: APROBADA (lineage `review-24ba7fada041e48c`, lente review-reliability, 4 hallazgos advisories no bloqueantes registrados arriba, autoridad quemada).
- Revisión nativa del registro de hallazgos: APROBADA (lineage `review-351a1b009e0f41dd`, riesgo bajo, autoridad quemada).
- Cierre del candidato completo: `docs(openspec)` (commit de cierre con este documento).

## Siguientes pasos (decisiones del usuario)

- Push de la rama y PR (issue #168); archivado del change OpenSpec al merge
  (actualizando el delta del whitelist a 7 llaves — hallazgo
  `R3-sort-whitelist-spec-mismatch`).
- Limpieza futura: `listAppointments` quedó production-dead (solo tests la
  importan; knip no la marca por eso).
- Hallazgos advisories de la revisión (guard de respuesta tardía, prueba de
  `parsePage`, refinamiento de empty state) como trabajo posterior.
