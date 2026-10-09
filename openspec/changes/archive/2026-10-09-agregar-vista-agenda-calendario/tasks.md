# Tasks: Sub-vista Grilla / Agenda en el calendario de `/appointments` con vista y modo en la URL

## Fase 1 — Especificación (este change)

- [x] 1.1 Revisar y aprobar `proposal.md`, el delta
  `specs/appointments-calendar-view/spec.md` y `design.md`; confirmar que el delta
  MODIFIED reemplaza completos los requirements "View toggle from appointments
  page" y "La agenda respeta los filtros y comparte los datos del calendario", y
  que los ADDED cubren el sub-toggle Grilla/Agenda y la persistencia
  `view`/`mode` con migración legacy.
  - Evidencia: docs aprobados (`design.md` §2–§4 y §7 cierran el contrato; ODD doc
    marca la creación del change como completada); el delta MODIFIED/ADDED coincide
    con lo implementado.
- [x] 1.2 Confirmar etiquetas de UI definitivas: principal **Lista | Calendario**,
  sub-toggle **Grilla | Agenda** (Grilla default), y que el botón de primer nivel
  **Agenda** desaparece.
  - Evidencia: implementado exactamente así en `page.tsx` (toggle principal de dos
    opciones con `rounded-r-md` en Calendario; sub-toggle Grilla | Agenda con Grilla
    default; sin botón superior Agenda).

## Fase 2 — Pruebas (RED)

- [x] 2.1 Actualizar los helpers de `app/(admin)/appointments/page.test.tsx`:
  `openAgenda` abre `Calendario → Agenda` vía sub-toggle; agregar un helper
  `openCalendarGrid` si hace falta.
  - Evidencia: `openAgenda` navega Calendario → sub-toggle Agenda; se agregó
    `openCalendarGrid`.
- [x] 2.2 Reescribir el caso `14.1` a dos vistas de primer nivel + sub-toggle
  (`Grilla` activo por defecto, `Agenda` inactivo, ausencia del botón superior
  `Agenda`).
  - Evidencia: `14.1` verifica Lista/Calendario, ausencia de Agenda de primer nivel y
    Grilla activa por defecto.
- [x] 2.3 Actualizar el caso `14.6` (petición de rango única) para alternar
  `Grilla ↔ Agenda` por sub-toggle y verificar con `rangeRequestCalls` que no hay
  consulta adicional.
  - Evidencia: `14.6` alterna Grilla ↔ Agenda por sub-toggle y `rangeRequestCalls`
    queda constante.
- [x] 2.4 RED de persistencia: casos para default Lista, `?view=calendar`
  (Grilla), `?view=calendar&mode=agenda`, legacy `?view=agenda` normalizado,
  `view`/`mode` inválidos, composición con `providerId`/`serviceId`, y
  `replaceMock` con la URL esperada.
  - Evidencia: casos `16.1`–`16.6` cubren default, `view=calendar`,
    `view=calendar&mode=agenda`, legacy, inválidos y composición con filtros/página
    (orden `page → view → mode → providerId → serviceId`).
  - Desviación (necesaria): los casos de `#174`/`#177` que abren el calendario y
    proyectan la URL de filtros (`2.3`, `12.1`, `3.2`, `3.3`, `3.4`, `3.5`, `13.1`)
    y el de paginación que alterna vista se actualizaron para incluir `view=calendar`
    (el cambio de vista ahora escribe la URL) y dejar de exigir "cero escrituras" en
    el toggle.
- [x] 2.5 RED de operabilidad: sub-toggle `role="group"`, `aria-pressed` y
  activación por teclado; sub-toggle ausente en la vista de Lista.
  - Evidencia: `16.1` y `16.7` (grupo `Modo de calendario`, `aria-pressed`, Tab+Enter;
    ausencia en Lista).
- [x] 2.6 Capturar el fallo observado de la suite (los casos deben fallar contra
  el UI actual de tres botones).
  - Evidencia RED: `npx vitest run app/(admin)/appointments/page.test.tsx` →
    **23 failed | 66 passed (89)** contra el UI de tres botones.

## Fase 3 — Implementación

- [x] 3.1 En `app/(admin)/appointments/page.tsx`, cambiar `ViewMode` a
  `'list' | 'calendar'` y agregar `type CalendarSubMode = 'grid' | 'agenda'`.
  - Evidencia: tipos actualizados.
- [x] 3.2 Agregar `parseViewState(params)` (incluye la migración
  `?view=agenda → calendar + agenda`) e inicializar `view`/`mode` una sola vez
  desde `searchParams` (sin `useEffect`).
  - Evidencia: `parseViewState` + dos `useState` perezosos; sin `useEffect`.
- [x] 3.3 Extender `appointmentsUrl` con `view`/`mode` (orden
  `page → view → mode → providerId → serviceId`, omitiendo defaults) y actualizar
  sus tres llamadores existentes (`applyCalendarFilters`, `clearFilters`,
  `handlePageChange`).
  - Evidencia: `appointmentsUrl(page, providerIds, serviceIds, view, mode)`;
    llamadores `applyCalendarFilters`, `handlePageChange` y `resetPageForFilterChange`
    (por el que pasa `clearFilters`).
- [x] 3.4 Agregar `handleViewChange` y `handleModeChange` con guard de
  reescritura redundante y `router.replace`; usarlos en el toggle principal.
  - Evidencia: ambos handlers con guard y `router.replace`; el toggle principal usa
    `handleViewChange` y el sub-toggle `handleModeChange`.
- [x] 3.5 Eliminar el botón de primer nivel **Agenda** y ajustar el radio del
  botón **Calendario** (`rounded-r-md`).
  - Evidencia: botón Agenda eliminado; Calendario con `rounded-r-md`.
- [x] 3.6 Montar el sub-toggle **Grilla | Agenda** en la fila de `CalendarNav`,
  visible solo con `view === 'calendar'`, con el estilo y `aria-pressed` del
  toggle principal.
  - Evidencia: sub-toggle `role="group" aria-label="Modo de calendario"` como primer
    hijo de la fila de `CalendarNav`, dentro del bloque `view === 'calendar'`.
- [x] 3.7 Renderizar `MonthCalendar` con `mode === 'grid'` y `AgendaView` con
  `mode === 'agenda'`; conservar `requestMode`, `blocksByDay`, `visibleMonth`,
  filtros y las props actuales de `AgendaView`.
  - Evidencia: render condicionado por `mode`; `requestMode` intacto
    (`view === 'list' ? 'list' : 'calendar'`) y props de `AgendaView` sin cambios.
- [x] 3.8 GREEN: suite de `page.test.tsx` de agenda y persistencia en verde.
  - Evidencia GREEN: `npx vitest run app/(admin)/appointments/page.test.tsx` →
    **89 passed (89)**; `npx tsc --noEmit` → exit 0; `npx eslint` sobre los dos
    archivos → 0 errores (2 warnings preexistentes: `Link`, `clinicTimeLabel`).

## Fase 4 — Verificación

- [ ] 4.1 Suite enfocada en verde: `npm test` sobre
  `app/(admin)/appointments/page.test.tsx` (o `npm test` completo si es
  asequible).
- [ ] 4.2 `npx tsc --noEmit` sin errores.
- [ ] 4.3 `npm run lint` sin errores nuevos.
- [ ] 4.4 `npm run build` sin errores.
- [ ] 4.5 Reporte de verificación con evidencia y comparación contra los
  escenarios del delta.

## Fase 5 — Cierre

- [ ] 5.1 Archivar el change: fusionar los deltas en
  `openspec/specs/appointments-calendar-view/spec.md` y mover la carpeta a
  `openspec/changes/archive/YYYY-MM-DD-agregar-vista-agenda-calendario/`.
- [ ] 5.2 Commit(s) por unidad de trabajo, push y PR (`Closes #176`).

## Workload Forecast

- **Archivos modificados (2):**
  - `app/(admin)/appointments/page.tsx` (~40–70 líneas).
  - `app/(admin)/appointments/page.test.tsx` (~100–180 líneas).
- **Archivos reutilizados sin cambios (1):**
  `src/components/admin/calendar/AgendaView.tsx` (0 líneas de cambio; solo cambia
  el punto de montaje).
- **Artefactos del change (4):** `proposal.md`,
  `specs/appointments-calendar-view/spec.md`, `design.md`, `tasks.md`.
- **Tamaño de diff estimado: ~140–250 líneas** de código + pruebas, sin contar
  los artefactos SDD.
- **Sin cambios:** `AgendaView.tsx`, `MonthCalendar.tsx`, `CalendarNav.tsx`,
  `ProviderLegend.tsx`, `ServiceFilter.tsx`, `DayCell.tsx`,
  `DayAppointmentsModal.tsx`, `src/lib/admin/timezone.ts`, `package.json`,
  migraciones, `openspec/specs/**` (el baseline se sincroniza al archivar) y
  `travelhub-app`.
- **Pruebas existentes y ejecutables:** sí, `npm test` (Vitest + RTL). No aplica
  `test:local` (sin capa de datos nueva). Sin runner nuevo.
- **Riesgo:** bajo. El riesgo principal es de layout del sub-toggle junto a
  `CalendarNav` en viewports estrechos, mitigado con el patrón responsivo
  existente (`flex-col sm:flex-row`).
- **Decision needed before apply: No.** Las etiquetas, el default `Grilla`, el
  contrato de URL y la migración legacy quedan cerrados en `design.md` §2–§4 y §7;
  el único punto marcado como preferencia acotada (conservar el `mode` local al
  alternar Lista ↔ Calendario) está resuelto y documentado.
