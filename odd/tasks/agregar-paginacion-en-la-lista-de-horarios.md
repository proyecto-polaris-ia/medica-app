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
3. [x] Backend: `listBusinessHoursPage` en `src/lib/admin/business-hours.ts`
   (count exact, filtro providerId antes de range/count, orden
   `created_at desc, id desc`, PGRST103 → lista vacía + total real);
   `listBusinessHours()` retirada (0 referencias). Route con validación
   estricta (page 1, pageSize 20, máx 100, providerId UUID → 400 si
   malformado) y respuesta `{ businessHours, pagination }`. TDD RED→GREEN:
   23/23 route + 15/15 datos contra Supabase local; `tsc --noEmit` limpio. —
   commit `facf16d`.
4. [x] Frontend: `/business-hours` consume el endpoint paginado; panel de
   filtro por proveedor ("Todos" + "Limpiar filtro"); `Pagination` bajo la
   tabla; URL `?page=n&providerId=…` (page 1 omitida) con guardia de
   reescritura; reset a página 1 al cambiar filtro; normalización fuera de
   rango (incl. total=0 con page>1); estados vacíos diferenciados.
   TDD RED→GREEN: 11/11 de página + 13/13 Pagination; tsc y lint limpios. —
   commit `029f499`.
5. [x] Verificación completa (subagente `gentle-ai-verify`, @ `029f499`):
   **PASS WITH WARNINGS** — `db:start`+`db:reset` OK; `test:local` 196
   archivos / 2100 pruebas (exit 0, cero fallas; el flake histórico del
   advisory lock no se reprodujo, booking.test.ts 5/5 en aislamiento);
   suites del feature 23/23 + 15/15 + 24/24; `npm test` 1812 passed /
   288 skipped, 0 fallas; `tsc --noEmit` limpio; lint 0 errores (25 warnings
   preexistentes, ninguno en archivos tocados); `build` OK (11/11 páginas);
   knip sin hallazgos. Único warning: la edición concurrente del propio doc
   ODD durante la verificación (edición del orquestador, benigna). RED del
   TDD no re-observable post-commit (verificado por evidencia del apply).
6. [ ] Archive del change OpenSpec + PR (Closes #171). — archive hecho
   (`openspec/changes/archive/2026-10-08-agregar-paginacion-filtro-horarios/`,
   spec fusionada en `openspec/specs/admin-business-hours/spec.md`, 11
   requirements / 31 escenarios verificados sin drift). Pendiente: commit,
   revisión nativa del candidato final, push + PR (decisión del usuario).

## Revisión nativa (RDD)

- Candidato docs (`d6c9ab5`, target `sha256:a143a83d…`): **approved**
  (lineage `review-5167fc2288ae8f6f`), 4 hallazgos informativos
  (R3-validation-coverage-01 WARNING, 3 SUGGESTION) — seguimiento, no
  bloquean.
- Candidato docs+backend (`facf16d`, target `sha256:38b9da08…`, lineage
  `review-5ada60024201bdd8`): captura del revisor falla determinísticamente
  en admisión (payload escrito completo pero escaneado truncado a byte 4423;
  el reintento re-reproduce los mismos bytes). Decisión del usuario: candidato
  dejado **explícitamente sin revisar**; la revisión nativa correrá sobre el
  candidato final del feature.

## Verificación

(por completar)
