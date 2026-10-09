# Feature: agregar-paginacion-en-la-lista-de-horarios (issue #171)

Issue: https://github.com/proyecto-polaris-ia/medica-app/issues/171
Rama: `eliumontoya/agregar-paginaci-n-en-la-lista-de-horarios`
Estado: en progreso

## Contexto

- `GET /api/admin/business-hours` (`app/api/admin/business-hours/route.ts`)
  carga todos los horarios sin paginación ni metadatos.
- `app/(admin)/business-hours/page.tsx` renderiza la lista sin controles de
  navegación.
- El componente compartido `Pagination` y el patrón server-side ya existen por
  #168 (`agregar-paginacion-citas`, archivado): mismo componente, mismas
  convenciones de URL (`?page=n`), mismo reset de página al cambiar filtro.
- Interacción con filtro por proveedor (issue #170): el `total` debe reflejar
  el filtro activo.

## Decisión de diseño

- **Alcance decidido con el usuario**: este change incluye (a) paginación
  server-side y (b) filtro server-side por `providerId` + select de filtro en
  la UI (cubre la lógica del issue abierto #170; sin filtros server-side, el
  `total` no podría reflejar el filtro activo y los criterios de #171 serían
  imposibles de cumplir).
- **Forma de respuesta**: anidada `{ businessHours, pagination: { total,
  page, pageSize, totalPages } }` — patrón más reciente (citas #168/#212).
- **Validación de params**: estricta, 400 `invalid_request` (patrón citas),
  defaults page=1, pageSize=20, máx 100.
- **Orden estable**: `created_at desc, id desc` (añadir desempate por `id`,
  requerido para paginación estable).
- **Fuera de rango (PGRST103)**: lista vacía con metadatos reales; el cliente
  normaliza a la última página (patrón pacientes).
- **UI**: reusar `src/components/admin/Pagination.tsx`; URL `?page=n&providerId=...`
  con página 1 fuera de la URL; reset a página 1 al cambiar filtro; panel de
  filtro con select + "Limpiar filtro" (patrón `/appointments`).

## Tareas

1. [x] Exploración: mapear patrón de paginación existente y estado actual del
   módulo business-hours. (subagente `gentle-ai-explore`)
2. [x] Change OpenSpec: `openspec/changes/agregar-paginacion-filtro-horarios/`
   (proposal, specs/admin-business-hours, design, tasks). Capability nueva
   `admin-business-hours`: 11 requirements / 31 escenarios. Forecast: ~565
   líneas / 2 unidades de trabajo. Decisiones del writer documentadas:
   `providerId` malformado → 400 (mejora vs citas, que devolvía 500);
   `totalPages=0` cuando `total=0` (convención citas).
3. [ ] Backend: `page`/`pageSize` en `GET /api/admin/business-hours` +
   metadatos `{ total, page, pageSize, totalPages }`; paginación después de
   filtros.
4. [ ] Pruebas de datos contra Supabase local (`npm run test:local`, suites del
   módulo).
5. [ ] Frontend: controles de paginación bajo la tabla, URL deep-linkeable,
   reset a página 1 al cambiar filtro de proveedor, estado vacío.
6. [ ] Verificación: pruebas + typecheck + lint + build (subagente
   `gentle-ai-verify`).
7. [ ] Commits de unidad de trabajo en la rama (evidencia abajo).
8. [ ] Archive del change OpenSpec + PR (Closes #171).

## Evidencia de commits

(por completar)

## Verificación

(por completar)
