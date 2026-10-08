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

1. [ ] Change OpenSpec: `openspec/changes/agregar-paginacion-citas/`
   (proposal.md, design.md, specs delta, tasks.md).
2. [ ] Backend: `listAppointmentsPaged` en `src/lib/admin/appointments.ts`
   (filtros + orden + count + paginación, reusando `withReminders`);
   `route.ts` con `page` (default 1), `pageSize` (default 20, max 100) y
   metadatos `{ total, page, pageSize, totalPages }`; prueba unitaria mockeada
   actualizada.
3. [ ] Pruebas de datos contra Supabase local
   (`src/lib/admin/__tests__/`): filtros, total filtrado, orden, límites de
   `page`/`pageSize`.
4. [ ] Frontend: `Pagination` reutilizable en `src/components/admin/`;
   integración en `/appointments` (filtros al API, URL `?page=n`, reset a
   página 1 al cambiar filtros, empty state, preservar página lista↔calendario
   si no cambian filtros).
5. [ ] Verificación: `db:start` + `db:reset` + `npm run test:local`,
   `lint`, `typecheck`, `build`.
6. [ ] Commits de unidad de trabajo (Conventional Commits) con evidencia.

## Evidencia de commits

(por completar)
