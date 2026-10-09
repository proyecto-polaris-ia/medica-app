# Change: Sub-vista de agenda (Grilla / Agenda) dentro del calendario de `/appointments`, con vista y modo en la URL

## Why

El issue [#176](https://github.com/proyecto-polaris-ia/medica-app/issues/176)
detecta un problema de jerarquía de navegación: la página `/appointments` expone
**tres botones de primer nivel** (`Lista | Calendario | Agenda`) que mezclan el
nivel de página con el de presentación del calendario. "Agenda" no es una vista
alterna del listado: es una **forma de ver el mismo calendario** (la lista por día
del mes visible, ya implementada por #175), y debe vivir dentro de Calendario.

Además, la selección de vista/modo es solo estado local (`useState`, sin URL). Un
administrador no puede compartir ni recuperar un enlace que abra directamente la
agenda de un mes, y al recargar vuelve a la lista. Los filtros de proveedor y
servicio ya son deep-linkables (`providerId`/`serviceId`, #174/#177); la vista y el
modo deben seguir el mismo patrón.

Lista de trabajo: reestructurar la navegación (Opción A del issue) y persistir
**vista** y **modo** del calendario en la URL.

## What Changes

- **El toggle principal pasa a dos opciones: `Lista | Calendario`.** En
  `app/(admin)/appointments/page.tsx`, `ViewMode` pasa de
  `'list' | 'calendar' | 'agenda'` a `'list' | 'calendar'`. Se elimina el botón
  superior **Agenda**; el botón **Calendario** y la etiqueta **Lista** se
  conservan.
- **Nuevo sub-toggle dentro de la vista Calendario: `Grilla | Agenda`.**
  - Vive en la **misma fila** que `CalendarNav` (la fila que hoy se renderiza
    cuando `view === 'calendar'`, `flex-col sm:flex-row`, con `CalendarNav` a la
    izquierda y los filtros a la derecha).
  - Se renderiza **solo** cuando `view === 'calendar'`.
  - `Grilla` es el modo por defecto y renderiza `MonthCalendar`; `Agenda`
    renderiza `AgendaView` (ya existente y sin cambios de contrato).
  - El estilo es consistente con el toggle principal: `role="group"` interno,
    botones con `aria-pressed`, `rounded-md`, activo
    `border-blue-600 bg-blue-600 text-white`, inactivo
    `border-gray-300 bg-white text-gray-700 hover:bg-gray-50`.
- **Nuevo estado `CalendarSubMode = 'grid' | 'agenda'`** en `page.tsx`,
  independiente del menú principal.
- **Persistencia de vista y modo en la URL** (`?view=...&mode=...`), siguiendo el
  patrón ya existente de `providerId`/`serviceId`: inicialización **una sola vez**
  desde `useSearchParams` y `router.replace` al cambiar, **sin `useEffect`**.
  - `view` válido: `list` | `calendar`. Ausente o inválido → `list`.
  - `mode` válido: `grid` | `agenda`. Ausente o inválido → `grid`. `mode` solo se
    honra cuando la vista resuelta es `calendar`.
  - **Migración de enlaces legacy**: `?view=agenda` (deep link de #175) se
    interpreta como `view=calendar&mode=agenda` y se normaliza a
    `?view=calendar&mode=agenda` en la primera escritura.
  - La serialización compone `page`, `view`, `mode`, `providerId` y `serviceId`
    en orden determinista y omite los valores por defecto.
- **Alternar `Grilla ↔ Agenda` no recarga datos.** Ambas sub-vistas comparten
  `visibleMonth`, los filtros (`calendarProviderFilter`/`calendarServiceFilter`) y
  los mismos `blocksByDay`. El modo del request sigue siendo
  `requestMode = view === 'list' ? 'list' : 'calendar'`, de modo que el cambio de
  modo no altera la petición de rango del mes ni dispara una consulta adicional.
- **Sin cambios de comportamiento en `AgendaView`.** Clic en cita → formulario de
  edición (`onSelectBlock`), clic en paciente → expediente (`onSelectPatient`),
  filtros de proveedor/servicio respetados (#174/#177), agrupación por día,
  "Sin citas", botón "Hoy", scroll vertical y responsividad intactos.
- **Actualización de pruebas existentes** en
  `app/(admin)/appointments/page.test.tsx`: la suite de agenda (#175) pasa a abrir
  la agenda vía `Calendario → Agenda`; el caso "toggle ofrece tres vistas" se
  reescribe a dos vistas de primer nivel + sub-toggle.

### Alcance

- `app/(admin)/appointments/page.tsx`: `ViewMode`, nuevo `CalendarSubMode`,
  parseo/serialización de URL, sub-toggle, render condicional de `MonthCalendar`
  y `AgendaView`.
- `app/(admin)/appointments/page.test.tsx`: actualización y casos nuevos.
- `src/components/admin/calendar/AgendaView.tsx`: se reutiliza sin cambios de
  contrato (solo cambia desde dónde se monta).
- Delta de la capability `appointments-calendar-view`.

### No-alcance

- No se agrega ruta ni página nueva.
- No se cambia la cuadrícula mensual, el modal del día ni la vista de Lista.
- No se agrega endpoint, caché ni prefetch.
- No se cambia el esquema, migraciones ni la API.
- No se toca `travelhub-app` (regla crítica del repo).
- No se altera el contrato de `AgendaView` ni el de `groupAppointmentsByDay`.

## Capabilities

- `appointments-calendar-view` — delta en
  `specs/appointments-calendar-view/spec.md` sobre el baseline
  `openspec/specs/appointments-calendar-view/spec.md`. El delta **MODIFICA** el
  requirement del toggle y el de filtros/ausencia de peticiones extra, y
  **AGREGA** el requirement del sub-toggle y el de persistencia en URL. Los
  requirements de agrupación por día, campos completos, "Sin citas", edición,
  expediente, navegación/"Hoy" y presentación permanecen en el baseline sin
  cambios.

## Decisions

- **Opción A del issue (sub-vista), no un cuarto modo.** Reduce la superficie de
  cambio, mantiene `requestMode` y el rango del mes como única consulta, y alinea
  la jerarquía con el hecho de que la agenda es una presentación del calendario.
- **`mode` solo válido con `view=calendar`.** Evita un modo "agenda" huérfano en
  la vista de Lista y hace determinista el fallback.
- **Persistencia con `router.replace` sin `useEffect`.** Reutiliza el patrón ya
  probado de `providerId`/`serviceId` (el estado local es la fuente de verdad y
  la URL se escribe en el handler), y evita reescrituras redundantes con guard.
- **Legacy `?view=agenda` se traduce al leer, no se mantiene.** Un solo camino de
  lectura (`view`/`mode`) y una normalización en la primera escritura.
- **El modo local persiste al alternar Lista ↔ Calendario.** Al volver a
  Calendario se recupera la última sub-vista elegida; la URL solo codifica `mode`
  cuando `view=calendar`.

## Rollback Plan

Cambio de bajo riesgo: es **solo cliente**, de navegación/estado de UI, sin
esquema, sin migraciones y sin escrituras de datos.

- `git revert` del commit (o de los commits por unidad de trabajo) restaura
  `ViewMode` de tres opciones, elimina el sub-toggle y devuelve la navegación a
  solo estado local.
- No hay estado persistido ni contrato de API que limpiar. Los parámetros de URL
  `providerId`/`serviceId` no se alteran; `view`/`mode` simplemente dejan de
  leerse y escribirse.
- El peor caso residual es un enlace compartido `?view=calendar&mode=agenda`: tras
  el revert, los parámetros desconocidos son ignorados por la página y esta
  renderiza la vista por defecto, sin errores.
- `AgendaView` no cambia de contrato, así que no requiere rollback propio.

## Impact

- **Código:** `app/(admin)/appointments/page.tsx` (`ViewMode`, `CalendarSubMode`,
  parseo/serialización de URL, sub-toggle, render condicional). Sin dependencias
  nuevas.
- **Pruebas:** `app/(admin)/appointments/page.test.tsx`.
- **Riesgo:** bajo. El riesgo principal es de UX de la fila
  `CalendarNav` + sub-toggle en viewports estrechos, mitigado con el patrón
  responsivo ya usado (`flex-col sm:flex-row`).

## Open Questions

- Ninguna bloqueante para aplicar. La persistencia del modo local al alternar
  Lista ↔ Calendario queda cerrada como **conservar** (ver `design.md`); si se
  prefiere reiniciar a `Grilla`, es un cambio de una línea y un caso de prueba
  acotado.
