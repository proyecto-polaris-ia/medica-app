# Tasks: buscar-paciente-autocomplete-citas

Búsqueda de paciente con autocompletado en el filtro de la lista de citas
(issue [#169](https://github.com/proyecto-polaris-ia/medica-app/issues/169)).

Convención de estado: `[ ]` pendiente · `[x]` completo. **Todas las tareas de este
plan están pendientes**: los artefactos SDD se redactan en este paso y la
implementación se ejecuta en el paso de apply. TDD activo
(`openspec/config.yaml` → `strict_tdd: true`): cada comportamiento escribe primero
la prueba que falla (**RED**), luego la implementación mínima (**GREEN**) y
después triangula bordes; el refactor queda en verde.

Runners: `npx vitest run` para suites focales y `npm test` (Vitest) para la suite
completa. Comandos auxiliares: `npx tsc --noEmit`, `npm run lint`,
`npm run build`. No se requiere `npm run test:local`: este change no toca la capa
de datos.

Cada tarea cita los requirements/escenarios del delta
`specs/admin-appointments/spec.md` y las decisiones numeradas (`D#`) de
`design.md` §3 que implementa o verifica.

---

## Fase 0 — Artefactos SDD

- [x] 0.1 `proposal.md` — alcance, impacto, decisiones (D1-D11), riesgos
  (desincronía texto/filtro, selectores por índice, mock con `?q=`, acentos,
  respuestas obsoletas), criterios de éxito y rollback plan del issue #169.
- [x] 0.2 `specs/admin-appointments/spec.md` — delta `ADDED` de la capability
  (no existe baseline en `openspec/specs/`): autocompletado, búsqueda progresiva,
  panel de sugerencias, teclado/accesibilidad, limpieza, integración con filtros
  existentes y componente reutilizable.
- [x] 0.3 `design.md` — componente nuevo vs. booking (§1.1), contrato controlado
  (§1.2), debounce/umbral/descarte (§1.3), panel y resaltado (§1.4),
  accesibilidad y teclado (§1.5), limpieza y consistencia (§1.6), integración con
  paginación (§1.7), catálogo del formulario (§1.8), con 20 decisiones numeradas
  y cinco open questions.
- [x] 0.4 `tasks.md` — este plan.
  - Verificación: `find openspec/changes/buscar-paciente-autocomplete-citas -type f | sort` → los cuatro artefactos presentes.

---

## Fase 1 — Pruebas del componente (RED)

Suite: `src/components/admin/__tests__/PatientSearchInput.test.tsx` (proyecto
`jsdom`; patrón de `src/components/booking/__tests__/PatientSearch.test.tsx`:
`vi.useFakeTimers({ shouldAdvanceTime: true })`, `global.fetch = vi.fn()`,
`userEvent`).

- [x] 1.1 RED: render base — label "Paciente" asociada al input, campo vacío con
  `value={null}` y ausencia de `listbox` sin foco (D5, D10).
  - Cubre: "Filtro de paciente por autocompletado en la lista".
  - Verificación: `npx vitest run src/components/admin/__tests__/PatientSearchInput.test.tsx`
    → falla (módulo inexistente).
- [x] 1.2 RED: mínimo de caracteres — con 1 carácter no se llama `fetch`; con 2
  caracteres, tras avanzar el debounce, se llama
  `/api/admin/patients?q=ma` (D2, D3).
  - Cubre: "Búsqueda progresiva…" → escenarios "Texto por debajo del mínimo no
    consulta" y "Menos de dos caracteres cierra el panel".
  - Verificación: `npx vitest run src/components/admin/__tests__/PatientSearchInput.test.tsx`
    → falla.
- [x] 1.3 RED: debounce — teclear "mar" sin pausas produce un único `fetch` con
  `q=mar` (D3).
  - Cubre: "Búsqueda progresiva…" → escenario "Tecleo rápido produce una sola
    consulta".
  - Verificación: `npx vitest run src/components/admin/__tests__/PatientSearchInput.test.tsx`
    → falla.
- [x] 1.4 RED: descarte de respuestas obsoletas — la consulta de "ma" resuelve
  después de la de "mar" y el panel MUST mostrar las de "mar" (D4).
  - Cubre: "Búsqueda progresiva…" → escenario "Una respuesta obsoleta no pisa a la
    vigente".
  - Verificación: `npx vitest run src/components/admin/__tests__/PatientSearchInput.test.tsx`
    → falla.
- [x] 1.5 RED: selección — clic en una sugerencia emite `onChange({ id, name })` una
  sola vez, muestra el nombre completo y cierra el panel (D5, D8).
  - Cubre: "Filtro de paciente por autocompletado en la lista" → escenario
    "Seleccionar una sugerencia aplica el filtro por identificador" y "Panel de
    sugerencias…" → escenario "Seleccionar cierra el panel".
  - Verificación: `npx vitest run src/components/admin/__tests__/PatientSearchInput.test.tsx`
    → falla.
- [x] 1.6 RED: visibilidad y cierre — sin coincidencias no hay `listbox`; `blur`
  cierra el panel; `Escape` cierra sin cambiar la selección (D7, D9).
  - Cubre: "Panel de sugerencias…" → escenarios "Sin coincidencias no hay panel",
    "Perder el foco cierra el panel"; "Navegación por teclado…" → escenario
    "Escape cierra sin seleccionar".
  - Verificación: `npx vitest run src/components/admin/__tests__/PatientSearchInput.test.tsx`
    → falla.
- [x] 1.7 RED: teclado y ARIA — `↓` activa la primera opción anunciada con
  `aria-activedescendant`, `↑` navega, `Enter` selecciona la activa, y el campo
  expone `combobox`/`aria-expanded`/`aria-controls` (D9, D10).
  - Cubre: "Navegación por teclado y accesibilidad del autocompletado" →
  escenarios "Navegar y seleccionar con teclado", "Enter sin opción activa no
  selecciona" y "Roles y atributos anunciados".
  - Verificación: `npx vitest run src/components/admin/__tests__/PatientSearchInput.test.tsx`
    → falla.
- [x] 1.8 RED: limpieza — `✕` y borrar el texto emiten `null`; editar tras una
  selección emite `null` y busca el texto nuevo (D13).
  - Cubre: "Limpieza del filtro de paciente" → escenarios "La acción de limpieza
    devuelve a 'Todos'" y "Vaciar el texto limpia el filtro".
  - Verificación: `npx vitest run src/components/admin/__tests__/PatientSearchInput.test.tsx`
    → falla.
- [x] 1.9 RED: resaltado — el fragmento coincidente se resalta, el nombre
  accesible completo sigue disponible y una coincidencia por teléfono (sin
  coincidencia literal en el nombre) se muestra en texto plano sin error (D11).
  - Cubre: "Panel de sugerencias…" → escenarios "Resaltado del fragmento
    coincidente" y "Coincidencia fuera del nombre".
  - Verificación: `npx vitest run src/components/admin/__tests__/PatientSearchInput.test.tsx`
    → falla.
- [x] 1.10 RED: sincronización externa y error — cambiar `value` a `null` desde el
  padre vacía el campo; una respuesta `401` muestra el mensaje de sesión y no abre
  el panel (D17).
  - Cubre: "Panel de sugerencias…" → escenario "Error de consulta".
  - Verificación: `npx vitest run src/components/admin/__tests__/PatientSearchInput.test.tsx`
    → falla.
- [x] 1.11 Redactar el escenario del componente reutilizable: montar el componente
  aislado y verificar que notifica la selección por su interfaz pública sin tocar
  URL ni página (D5).
  - Cubre: "Componente reutilizable de búsqueda de pacientes" → escenario "El
    componente funciona fuera de la lista de citas".
  - Verificación: `npx vitest run src/components/admin/__tests__/PatientSearchInput.test.tsx`
    → falla.
- [x] 1.12 Registrar la evidencia RED de la suite del componente (conteo de fallos
  y mensaje representativo) antes de implementar.

---

## Fase 2 — Componente (GREEN → TRIANGULATE → REFACTOR)

Archivo nuevo: `src/components/admin/PatientSearchInput.tsx`.

- [x] 2.1 GREEN: crear el componente controlado con
  `value: PatientOption | null` + `onChange`, label asociado, input `combobox` y
  contenedor del panel (D5, D10).
  - Verificación: `npx vitest run src/components/admin/__tests__/PatientSearchInput.test.tsx`
    → tareas 1.1 y 1.7 en verde; `npx tsc --noEmit` sin errores.
- [x] 2.2 GREEN: implementar el efecto de búsqueda con umbral `>= 2` tras `trim`,
  debounce de 300 ms, `AbortController` y cancelación en unmount (D2, D3, D4).
  - Verificación: `npx vitest run src/components/admin/__tests__/PatientSearchInput.test.tsx`
    → tareas 1.2, 1.3 y 1.4 en verde.
- [x] 2.3 GREEN: renderizar el panel (solo foco + sugerencias + texto suficiente),
  cerrar al seleccionar, en blur y con `Escape`, con
  `onMouseDown` + `preventDefault` en las opciones (D7, D8, D9).
  - Verificación: `npx vitest run src/components/admin/__tests__/PatientSearchInput.test.tsx`
    → tareas 1.5, 1.6 y 1.7 en verde.
- [x] 2.4 GREEN: navegación `↑`/`↓`/`Enter`/`Escape` con `aria-activedescendant` y
  `aria-selected`, sin ciclado en los extremos (D9, D10).
  - Verificación: `npx vitest run src/components/admin/__tests__/PatientSearchInput.test.tsx`
    → tarea 1.7 en verde.
- [x] 2.5 GREEN: limpieza con `✕`, al vaciar el texto y al editar tras una
  selección; guardia `lastEmittedIdRef` para la sincronización externa (D13, D17).
  - Verificación: `npx vitest run src/components/admin/__tests__/PatientSearchInput.test.tsx`
    → tareas 1.8 y 1.10 en verde.
- [x] 2.6 GREEN: helper `highlightSegments` y render segmentado preservando el
  nombre accesible, con degradación a texto plano (D11).
  - Verificación: `npx vitest run src/components/admin/__tests__/PatientSearchInput.test.tsx`
    → tarea 1.9 en verde.
- [x] 2.7 GREEN: estados de carga y error con `role="status"`/`aria-live`, y sin
  panel cuando la consulta falla (D7).
  - Verificación: `npx vitest run src/components/admin/__tests__/PatientSearchInput.test.tsx`
    → tarea 1.10 en verde.
- [x] 2.8 TRIANGULATE: bordes — texto de solo espacios; exactamente 2 caracteres;
  borrar de 2 caracteres a 1 con el panel abierto; `Escape` con el panel cerrado
  (no altera el valor); `Enter` sin opción activa; nombre sin coincidencia literal
  (teléfono/correo); ráfaga de tecleo que termina en el mismo término.
- [x] 2.9 REFACTOR: extraer helpers con nombre (consulta con debounce,
  `highlightSegments`, opciones activas) sin cambiar el contrato observable.
  - Verificación: `npx vitest run src/components/admin/__tests__/PatientSearchInput.test.tsx`
    sigue en verde.

---

## Fase 3 — Integración en la lista (RED → GREEN → TRIANGULATE → REFACTOR)

Suite: `app/(admin)/appointments/page.test.tsx`.

- [x] 3.1 RED: seleccionar una sugerencia del filtro envía `patientId` en el
  request del listado y solicita `page=1` (D6, D16).
  - Cubre: "Filtro de paciente por autocompletado en la lista" y "Integración del
    filtro de paciente…" → escenario "Combinación con los filtros existentes".
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` → falla.
- [x] 3.2 RED: `✕` y "Limpiar filtros" quitan `patientId` del request y dejan el
  campo vacío (D13, D16).
  - Cubre: "Limpieza del filtro de paciente" e "Integración del filtro de
    paciente…" → escenario "'Limpiar filtros' limpia también el paciente".
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` → falla.
- [x] 3.3 RED: el formulario de cita conserva su selector con el catálogo completo
  después del cambio (D15).
  - Cubre: "Integración del filtro de paciente…" → escenario "El formulario
    conserva el catálogo completo".
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` → falla.
- [x] 3.4 GREEN: cambiar `patientFilter` a `PatientOption | null` (`:298`),
  ajustar `handlePatientFilterChange` (`:630-633`), `clearFilters` (`:660-667`),
  `hasActiveFilters` (`:669`) y `listAppointmentsRequestUrl` (`:246-270`) para
  seguir enviando `patientId` (D6, D14, D16).
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` → tarea
    3.2 en verde; `npx tsc --noEmit` sin errores.
- [x] 3.5 GREEN: reemplazar el bloque `<label>`/`<select>` de Paciente
  (`:750-765`) por `<PatientSearchInput>` dentro de la celda del grid, **sin**
  tocar la carga del catálogo (`:453`) ni el `<select>` del formulario
  (`:1006-1019`) (D1, D5, D15).
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` → tareas
    3.1 y 3.3 en verde.
- [x] 3.6 GREEN: actualizar el mock de `/api/admin/patients` (`page.test.tsx:76`)
  para responder también a las URLs con `?q=`, y migrar los selectores por índice
  `getAllByRole('combobox')[n]` (`:904`, `:1534`, `:1795-1802`, `:1848`, `:1988`)
  a consultas por nombre accesible (D19).
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` → suite
    en verde sin depender de índices de combobox.
- [x] 3.7 TRIANGULATE: bordes de integración — filtro de paciente combinado con
  servicio + proveedor + rango de fechas; limpiar el paciente no altera los demás
  filtros; el rango de fechas sigue emitiendo `start`/`end` solo con ambos
  extremos; cambiar de vista Lista ↔ Calendario no rompe el filtro ni la página.
- [x] 3.8 REFACTOR: estabilizar dependencias de `loadData` y handlers si el objeto
  `PatientOption` provoca recreaciones innecesarias, sin cambiar el comportamiento
  observable.
  - Verificación: `npx vitest run "app/(admin)/appointments/page.test.tsx"` sigue
    en verde.

---

## Fase 4 — Verificación

- [x] 4.1 Suite focal:
  `npx vitest run src/components/admin/__tests__/PatientSearchInput.test.tsx "app/(admin)/appointments/page.test.tsx"`
  → verde.
- [x] 4.2 Suite completa: `npm test` → verde (registrar cualquier fallo
  preexistente ajeno al change).
- [x] 4.3 Typecheck: `npx tsc --noEmit` → sin errores.
- [x] 4.4 Lint: `npm run lint` → sin errores nuevos.
- [x] 4.5 Build: `npm run build` → sin errores.
- [x] 4.6 Trazabilidad: mapear los 7 requirements de
  `specs/admin-appointments/spec.md` (y sus escenarios) a pruebas que pasan.
- [x] 4.7 Trazabilidad de decisiones: confirmar las 20 decisiones de `design.md`
  §3 implementadas y verificadas (D1-D4 componente/búsqueda, D5-D6 contrato y
  estado, D7-D11 panel/a11y/resaltado, D12-D13 techo y limpieza, D14-D17
  endpoints/catálogo/paginación/sincronización, D18-D20 dependencias y runner).
- [x] 4.8 Invariantes por diff: `src/components/booking/PatientSearch.tsx` y su
  prueba sin cambios; `app/api/admin/patients/route.ts`,
  `src/lib/admin/patients.ts`, `app/api/admin/appointments/route.ts` y
  `src/lib/admin/appointments.ts` sin cambios; `package.json` sin cambios;
  `travelhub-app` intacto.
  - Verificación: `git diff --stat` y `git status --porcelain` acotados a los
    archivos del change.

---

## Fase 5 — Soporte de validación y archive de OpenSpec

- [x] 5.1 Verificar el conjunto de artefactos del change:
  `find openspec/changes/buscar-paciente-autocomplete-citas -type f | sort` →
  `proposal.md`, `design.md`, `tasks.md`,
  `specs/admin-appointments/spec.md`.
- [x] 5.2 Validación estructural del delta (el repo no tiene el CLI de OpenSpec
  instalado; `.opencode/skill/_shared/openspec-convention.md` describe el formato):
  encabezado `# Delta for Admin Appointments` + `**Baseline**`, sección
  `## ADDED Requirements`, cada requirement con al menos un escenario
  `GIVEN/WHEN/THEN` y uso de RFC 2119 (`MUST`/`SHOULD`/`MAY`).
  - Verificación: `grep -c "^### Requirement" openspec/changes/buscar-paciente-autocomplete-citas/specs/admin-appointments/spec.md`
    → `7`; `grep -n "^## " openspec/changes/buscar-paciente-autocomplete-citas/specs/admin-appointments/spec.md`
    → `## ADDED Requirements`.
- [x] 5.3 Confirmar la ausencia de baseline: `ls openspec/specs/admin-appointments`
  → no existe (delta ADDED).
- [x] 5.4 Preparar el archive (ejecutado por el orquestador/padre, no en apply):
  mover el change a
  `openspec/changes/archive/YYYY-MM-DD-buscar-paciente-autocomplete-citas/` y
  mergear el delta en `openspec/specs/admin-appointments/spec.md` preservando sin
  duplicar los requirements que también declare `agregar-paginacion-citas`
  (`design.md` §7 OQ5).
  - Verificación: revisión manual del spec mergeado (todos los requirements del
    delta presentes una sola vez).

---

## Workload forecast

- **Tareas:** 45 checkboxes en grupos: Fase 0 (4 artefactos SDD), Fase 1 (12 RED
  del componente y evidencia), Fase 2 (9 componente), Fase 3 (8 integración),
  Fase 4 (8 verificación e invariantes), Fase 5 (4 OpenSpec).
- **Archivos estimados: 4** (2 nuevos, 2 modificados), contando cada archivo una
  sola vez:
  - **Nuevos (2):** `src/components/admin/PatientSearchInput.tsx` (~160-220
    líneas), `src/components/admin/__tests__/PatientSearchInput.test.tsx`
    (~180-240 líneas).
  - **Modificados (2):** `app/(admin)/appointments/page.tsx` (~30-60 líneas: estado,
    handler, `clearFilters`, `hasActiveFilters`, builder de URL y el bloque de
    filtro) y `app/(admin)/appointments/page.test.tsx` (~80-140 líneas: casos
    nuevos y migración de selectores).
  - **Sin cambios:** `src/components/booking/PatientSearch.tsx` y su prueba,
    `app/api/admin/patients/route.ts`, `src/lib/admin/patients.ts`,
    `app/api/admin/appointments/route.ts`, `src/lib/admin/appointments.ts`,
    `src/components/admin/DataTable.tsx`, `package.json`, migraciones y
    `travelhub-app`.
- **Tamaño de diff aproximado: ~350-500 líneas** (código + pruebas, excluyendo los
  artefactos SDD): componente ~160-220; prueba del componente ~180-240 (parte del
  total); página ~30-60; prueba de página ~80-140.
- **Tests existentes y ejecutables:** sí. `npm test` (Vitest, proyectos `node` y
  `jsdom`) y `npx vitest run` focal. Sin runner nuevo y sin Supabase local.
- **Riesgo de runner:** bajo; no hay suite de datos involucrada. El único riesgo
  de ejecución es la migración de selectores de la suite de página, que debe
  quedar en verde antes de cerrar la Fase 3.
- **Punto abierto antes de apply:** copy visible (placeholder, aviso de "sin
  coincidencias") y la decisión de mostrar o no un mensaje auxiliar cuando no hay
  resultados (`design.md` §7 OQ1). No bloquea el contrato ni las pruebas.

---

## Evidencia de apply (ODD)

- **RED Fase 1:** `npx vitest run src/components/admin/__tests__/PatientSearchInput.test.tsx`
  → `Failed to resolve import "../PatientSearchInput"`; 1 suite fallida, 0 tests.
- **GREEN Fase 1/2:** suite del componente → `23 passed`. TRIANGULATE 2.8 añade 5
  bordes (solo espacios, exactamente 2, borrar a 1, Escape cerrado, ráfaga);
  REFACTOR 2.9 extrae `patientsSearchUrl`/`nextActiveIndex`/`highlightSegments`.
- **RED Fase 3:** `npx vitest run "app/(admin)/appointments/page.test.tsx"`
  → `8 failed | 61 passed` (selectores accesibles y casos 3.1/3.2 nuevos).
- **GREEN Fase 3:** misma suite → `69 passed`; TRIANGULATE 3.7 añade 3 casos
  (combinación con servicio+proveedor+rango, limpiar paciente conserva filtros,
  cambio de vista conserva el filtro) → `72 passed`.
- **4.1 focal:** `npx vitest run src/components/admin/__tests__/PatientSearchInput.test.tsx "app/(admin)/appointments/page.test.tsx"`
  → `Test Files 2 passed`, `Tests 95 passed`.
- **4.2 completa:** `npm test` → `Test Files 161 passed | 22 skipped (183)`,
  `Tests 1669 passed | 271 skipped (1940)`, 0 fallos.
- **4.3 typecheck:** `npx tsc --noEmit` → sin errores (exit 0).
- **4.4 lint:** `npm run lint` → `0 errors`, 25 warnings preexistentes (exit 0).
- **4.5 build:** `npm run build` → compilación Next.js OK; tabla de rutas emitida
  sin errores.
- **4.8 invariantes:** `git diff --stat` acotado a booking, endpoints de pacientes y
  citas, capa de datos y `package.json` → vacío (sin cambios).
- **Copy fijado (OQ1):** placeholder `Buscar paciente…`; aviso `Sin coincidencias`
  cuando hay consulta con ≥2 caracteres y 0 resultados; techo de 20 sugerencias
  (primera página del endpoint).
- **Desviaciones:** ninguna respecto a `design.md` D1–D20. Se añadieron `htmlFor`/`id`
  a las etiquetas Servicio y Proveedor para migrar los selectores de prueba a
  nombres accesibles (D19); no cambia el comportamiento ni el contrato.
