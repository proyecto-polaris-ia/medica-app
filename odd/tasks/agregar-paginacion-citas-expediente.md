# Feature: agregar-paginacion-citas-expediente

Issue [#180](https://github.com/proyecto-polaris-ia/medica-app/issues/180) —
paginación server-side en las secciones de citas futuras y citas asistidas del
expediente del paciente.

Estado: OpenSpec change `openspec/changes/agregar-paginacion-citas-expediente/`.

## Tareas

- [ ] 1. Artefactos OpenSpec (proposal, spec delta, design, tasks)
- [ ] 2. RED capa de datos: pruebas contra Supabase local de consultas paginadas
- [ ] 3. RED rutas: pruebas de `/appointments/upcoming` y `/appointments/attended`
- [ ] 4. RED UI: PatientRecordView con secciones independientes, URL y modal
- [ ] 5. GREEN: capa de datos + endpoints + UI
- [ ] 6. Verificación: unit, test:local, tsc, lint, build
- [ ] 7. Cierre: openspec archive, PR

## Decisiones clave

- Dos endpoints nuevos: `GET /api/admin/patients/[id]/appointments/upcoming|attended`.
- `pageSize` default 10, máximo 50 (issue #180; distinto del listado global 20/100).
- Respuesta `{ appointments, pagination: { total, page, pageSize, totalPages } }`
  (mismo contrato que #168).
- Se retiran `upcomingAppointments`/`attendedAppointments` del record: la carga
  del expediente deja de traer todas las citas.
- `PatientRecordView` consume los endpoints paginados; URL sync solo en
  `/patients/[id]` (`?upcomingPage=&attendedPage=`); el modal usa estado local.
- Se reutiliza `src/components/admin/Pagination.tsx` sin selector de pageSize.

## Evidencia

- `8fb4aca` feat(admin): paginated appointment endpoints for patient record
- `e32df20` feat(admin): paginated appointment sections in patient record view
- `a00adbb` test(vitest): raise hook timeout for local db suite lock

## Verificación (2026-10-08)

- `npm test`: 162 archivos, 1668 tests en verde.
- `npm run test:local` (supabase start + db reset): 185 archivos, 1948 tests
  en verde, dos corridas consecutivas.
- `npx tsc --noEmit`: 0 errores. `npm run lint`: 0 errores (25 warnings
  preexistentes). `npm run build`: verde.
- Infra: se subió `hookTimeout` a 60s en `vitest.config.ts` — el advisory lock
  de las suites de datos locales desbordaba los 10s default con ~25 suites en
  paralelo (debilidad preexistente que el change hacía más frecuente).
