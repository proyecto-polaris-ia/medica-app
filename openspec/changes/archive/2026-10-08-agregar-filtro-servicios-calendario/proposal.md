# Change: Filtro multi-selección de servicios en la vista de calendario de citas

## Why

La vista de calendario de `/appointments` ya permite acotar los bloques por
**proveedor** desde el merge de
[#174](https://github.com/proyecto-polaris-ia/medica-app/issues/174), pero
sigue mostrando **todas** las citas del mes en cuanto a **servicio**. Cuando la
agenda mezcla tratamientos largos (por ejemplo ortodoncia) con visitas cortas
(limpieza, revisión), la secretaria no puede aislar visualmente un tipo de
servicio para revisar la carga real del consultorio.

Hoy el único filtro de servicio vive en la **vista de lista** (`<select>` de un solo valor, `serviceFilter` en `app/(admin)/appointments/page.tsx:186`)
y **no afecta al calendario**: `blocksByDay` se calcula a partir de las citas
completas del mes. Un admin que trabaja en calendario no tiene forma de acotar
lo que ve por servicio, aunque la lista sí.

Este change agrega un **filtro de servicios multi-selección** a la vista de
calendario, simétrico al filtro de proveedores recién incorporado, de modo que
el admin pueda mostrar u ocultar servicios con un clic, combinarlo con el
filtro de proveedores, verlo reflejado en los bloques del mes, compartirlo por
URL y sin romper el filtro de la lista. Cubre el issue
[#177](https://github.com/proyecto-polaris-ia/medica-app/issues/177).

## What Changes

- **Nuevo control de alternancia de servicios en la fila del calendario.** Se
  agrega un control de filtrado por servicio junto a `CalendarNav` y la
  `ProviderLegend`, con **un botón de alternancia (pill) por servicio
  visible** y `aria-pressed` que refleja su estado.
- **Sin swatch de color (decisión de producto).** Las entradas del filtro de
  servicios muestran **solo el nombre**; no hay cuadro de color, porque el tipo
  `Service` no tiene `color` y agregarlo está fuera de alcance. La distinción
  visual de una entrada inactiva no depende del color: se resuelve con
  tratamiento de etiqueta (por ejemplo `text-gray-500`, como el estado inactivo
  de `ProviderLegend`); las clases exactas se fijan en `design.md`.
- **Nuevo estado de calendario separado.** Se agrega
  `calendarServiceFilter: string[]`. El estado existente `serviceFilter`
  (`string`, `<select>` de la vista de lista) **no se toca**, para no romper el
  comportamiento de la lista.
- **Selección vacía o `['all']` significan "todos".** Sin selección activa, el
  calendario se comporta como hoy (muestra todos los servicios).
- **Filtrado previo a `blocksByDay`.** La selección de servicios se aplica a las
  citas **antes** de calcular `blocksByDay`, y **compuesta con AND** respecto del
  filtro de proveedores, de modo que los bloques del mes reflejen exactamente la
  intersección de ambos filtros activos.
- **El control de servicios conserva su universo del mes.** El origen del control
  se deriva de las citas del mes **sin filtrar** (los ids de servicio presentes),
  para que un servicio deseleccionado siga visible como botón y pueda volver a
  activarse.
- **Sincronización con la URL con `router.replace`.** La selección se refleja
  como `?serviceId=a,b` (ids unidos por coma), siguiendo el precedente de
  `providerId`/`MetricsRangeSelector`; el helper de URL debe **componer ambos
  parámetros** y omitir el que no tenga selección. El enlace es compartible, es
  deep-linkable y la selección se conserva al alternar Lista ↔ Calendario. El
  parseo tolera el valor `all` al leer la URL.
- **"Limpiar filtros" reinicia AMBOS filtros del calendario.** El botón
  reinicia `calendarProviderFilter` y `calendarServiceFilter` a "todos" y
  **se renderiza cuando cualquiera de los dos está activo**. Esto **modifica**
  el comportamiento introducido por #174, donde el botón solo reiniciaba
  proveedores y solo aparecía con ese filtro activo.
- **Cobertura de pruebas** de la nueva interacción (alternar servicios, limpiar
  ambos filtros, composición AND, URL compartida y filtrado de bloques) con
  Vitest + Testing Library, sin cambiar el runner.

### Alcance

- Vista de calendario de `/appointments` y su fila de filtros; sin cambios de
  datos, migraciones ni API.
- El filtro de la vista de lista (`serviceFilter`, `<select>`) sigue intacto y
  sigue funcionando como hoy.
- Sin dependencias nuevas y sin tocar `travelhub-app` (regla crítica del repo).

## Capabilities

### New Capabilities

- Ninguna. El comportamiento nuevo (filtro multi-selección de servicios y su
  sincronización con la URL) se agrega a una capability existente; no se crea
  una capability nueva.

### Modified Capability: `appointments-calendar-view`

`openspec/specs/appointments-calendar-view/spec.md` se modifica. Los deltas que
se confirmarán en la fase spec son:

- **Nuevo requirement: filtrado multi-selección de servicios en el calendario
  (ADDED).** El calendario debe poder restringir los bloques mostrados a un
  subconjunto de servicios; la selección vacía o "todos" equivale a mostrar
  todos; el filtrado ocurre antes del agrupamiento por día y se compone con AND
  respecto del filtro de proveedores; la selección se refleja en la URL como
  `?serviceId=a,b`, es deep-linkable y sobrevive el cambio de vista Lista ↔
  Calendario; el control de servicios es operable por teclado y expone
  `aria-pressed`; los ids desconocidos se tratan como sin coincidencia. Los
  botones son de solo nombre (sin swatch de color).
- **`Filtrado multi-selección de proveedores en el calendario` (MODIFIED).** El
  requirement existente se extiende para que la acción "Limpiar filtros" del
  calendario reinicie **también** el filtro de servicios y para que el botón se
  renderice cuando **cualquiera** de los dos filtros esté activo (hoy el
  escenario de reinicio habla únicamente de proveedores). Alternativamente, el
  delta puede expresarse como un escenario nuevo de "limpiar ambos filtros"
  dentro del requirement de servicios; la fase spec decidirá la forma, pero el
  comportamiento debe quedar especificado una sola vez y sin ambigüedad.

Invariantes que **NO** se modifican: toggle Lista/Calendario, navegación de mes y
año, carga por rango visible, bloques coloreados por proveedor, color neutral de
respaldo, zona horaria de la clínica, apertura del flujo de edición desde el
bloque, acceso al expediente del paciente, y la semántica del filtro de
proveedor de un solo valor de la vista de Lista.

## Impacto

Archivos esperados (sin modificar `travelhub-app`):

| Área | Impacto | Descripción |
|---|---|---|
| `src/components/admin/calendar/` (nuevo control o `ProviderLegend` generalizado) | New / Modified | Control de alternancia de servicios, solo nombre, con `aria-pressed` y estado inactivo distinguido sin color. La forma (componente nuevo espejo vs. leyenda generalizada) la decide `design.md`. |
| `app/(admin)/appointments/page.tsx` | Modified | Nuevo estado `calendarServiceFilter`, helper de parseo (`parseServiceIds`), filtrado en el `useMemo` del calendario compuesto con AND, composición de la URL con ambos parámetros, y "Limpiar filtros" que reinicia ambos. |
| `src/components/admin/calendar/__tests__/` | New / Modified | Pruebas del control de servicios (alternar, `aria-pressed`, estado inactivo sin color). |
| `app/(admin)/appointments/page.test.tsx` | Modified | Pruebas del filtrado de servicios, composición con proveedores, URL `?serviceId=a,b` y limpieza de ambos filtros. |
| `openspec/specs/appointments-calendar-view/spec.md` | Modified (delta) | ADDED del requirement de servicios + MODIFIED del requirement de proveedores/limpieza. |
| `openspec/changes/agregar-filtro-servicios-calendario/specs/` | New (fase spec) | Delta spec de la capability modificada. |
| `serviceFilter` (vista de lista) | Sin cambios | El `<select>` de un solo servicio de la lista queda intacto. |
| Dependencias / migraciones / API | Sin cambios | No se agregan librerías, no hay migración ni endpoint nuevo. |

Anclas de referencia verificadas en `app/(admin)/appointments/page.tsx`:
`type Reference` `{ id, name }` (:27), `parseProviderIds` (:139),
`nextCalendarSelection` (:148), `calendarFilterUrl` (:158),
`serviceFilter` de la lista (:186), `providerFilter` de la lista (:188),
`calendarProviderFilter` (:189-191),
`calendarAppointments` useMemo — guard de `length === 0` + filtro por
`a.providerId` (:203-208), `blocksByDay` (:210-223, enriquece `serviceName` vía
`refName(services, a.serviceId)`), `visibleProviders` (:224-227),
`applyCalendarFilter` (:232-241), `toggleCalendarProvider` (:243-252),
`refName` local (:385), filtrado de la lista por servicio (:414-416), deps del
`useMemo` de lista (:458), `hasActiveFilters` (:460), `<select>` de servicio de
la lista (:520-534), `<ProviderLegend>` (:601-605) y el botón condicional
"Limpiar filtros" del calendario (:606-614). Ancla del control actual:
`src/components/admin/calendar/ProviderLegend.tsx` (leyenda-botones con
`ACTIVE_ENTRY_CLASSES` / `INACTIVE_ENTRY_CLASSES`, `aria-pressed`, `showAll`).

## Decisions

| Decisión | Valor | Razón |
|---|---|---|
| Enfoque de UI | Control de alternancia simétrico al de proveedores | Reutiliza el patrón ya validado en #174, es accesible y no requiere dependencias ni rediseño. La forma exacta (componente nuevo espejo de `ProviderLegend` vs. leyenda generalizada y reutilizable) se fija en `design.md`; el cambio **prefiere la simetría y la reutilización** sin imponer la forma. |
| Apariencia de las entradas | Botones **solo nombre**, sin swatch de color | `Service` no tiene `color` y agregarlo está fuera de alcance; el control no puede depender del color. |
| Distinción de estado | `aria-pressed` + tratamiento de etiqueta para el estado inactivo (p. ej. `text-gray-500`) | Mantiene la accesibilidad y la legibilidad sin depender del color; las clases exactas se fijan en `design.md`. |
| Estado | `calendarServiceFilter: string[]` separado del `serviceFilter` de la lista | Evita romper el `<select>` de un solo valor de la vista de lista. |
| Sin selección / `['all']` | Mostrar todos los servicios | Conserva el comportamiento actual por defecto. |
| Punto de filtrado | Antes de `blocksByDay`, compuesto con AND con el filtro de proveedores | Los bloques del mes reflejan exactamente la intersección de los filtros activos. |
| Fuente del control | Citas del mes **sin filtrar** | Permite volver a activar un servicio deseleccionado. |
| Sincronización | `router.replace` con `?serviceId=a,b` compuesto con `?providerId=...` | Deep-link y preservación entre Lista y Calendario, siguiendo `MetricsRangeSelector` y el patrón de #174. |
| Limpiar | "Limpiar filtros" reinicia **ambos** filtros y aparece si cualquiera está activo | Un solo botón coherente para toda la fila del calendario; **modifica** el comportamiento de #174 (que solo limpiaba proveedores). |
| Dependencias | Ninguna | No hay UI kit (shadcn/radix) en el repo; solo Tailwind y HTML nativo. |

### Alternativas consideradas y rechazadas

- **Campo `color` en `Service` (backend).** Rechazada: requiere cambio de
  esquema, migración, API y UI de administración de servicios; es un cambio de
  datos desproporcionado para un filtro de calendario y está fuera del alcance
  del issue #177.
- **Colores generados en el frontend (hash del id/nombre).** Rechazada: inventa
  una semántica de color que el usuario no puede configurar ni correlacionar con
  ninguna otra pantalla; además induce a confundir el color del servicio con el
  color del proveedor, que ya codifica información en los bloques.
- **Reutilizar el `<select>` de servicio de la lista en el calendario.**
  Rechazada: es de un solo valor y no ofrece la selección múltiple que pide el
  issue.
- **Un `<select multiple>` nuevo en la fila del calendario.** Rechazada:
  peor usabilidad y accesibilidad que botones de alternancia visibles, y además
  rompe la simetría con el filtro de proveedores ya entregado.

## Fuera de alcance

- Agregar `color` (o cualquier campo nuevo) a `Service`, al esquema, a las
  migraciones o a la API.
- Cambios al filtro de la vista de lista o al `<select>` de servicio existente.
- Filtros multi-selección para paciente, estatus o rango de fechas en el
  calendario.
- Persistencia del filtro por usuario, preferencias guardadas o sincronización
  entre dispositivos.
- Cambios de dependencias.
- Cualquier edición dentro de `travelhub-app`.

## Riesgos

- **Cambio de comportamiento de "Limpiar filtros" (#174).** El botón pasará de
  limpiar solo proveedores a limpiar ambos, y de renderizarse con un solo filtro
  activo a renderizarse con cualquiera. Mitigación: dejarlo explícito en el
  delta de spec y **actualizar las pruebas de #174** que asertan el
  comportamiento anterior (el test de reinicio de proveedores sigue siendo
  válido si se lee como "limpia ambos").
- **Composición de la URL con dos parámetros.** `calendarFilterUrl` hoy solo
  produce `providerId`; agregar `serviceId` puede perder uno de los dos
  parámetros al alternar. Mitigación: un único helper que construya la URL desde
  ambos arreglos y omita los parámetros vacíos, cubierto con pruebas de URL.
- **Colisión de parámetros.** `serviceId` en la URL no colisiona con la lista
  (la lista no lee `serviceId` de la URL; solo inicializa su `providerFilter`
  desde `providerId`), pero conviene confirmarlo en `design.md` y verificar que
  `providerId` múltiple sigue sin romper el `<select>` de la lista. Mitigación:
  mantener el guard existente de `parseProviderIds` en la lista (`a,b` ignorado).
- **Control vacío o sin nombres.** Si un servicio referenciado por una cita no
  existe en el catálogo cargado, la etiqueta podría quedar vacía. Mitigación:
  derivar las etiquetas con el fallback ya existente `refName(services, id)` y
  filtrar el control por los ids presentes en el mes sin filtrar.
- **Ids obsoletos en la URL.** Un enlace compartido puede referenciar un servicio
  sin citas en el mes visible. Mitigación: tratar los ids desconocidos como
  ignorados/sin coincidencia sin romper el render.
- **Ancho y responsividad de la fila.** Sumar un segundo control a la fila del
  calendario puede desbordar en pantallas estrechas. Mitigación: mantener
  `flex-wrap` en el contenedor de filtros y la convención
  `flex-col gap-4 sm:flex-row` de la fila, verificada en las pruebas/ejecución
  local.
- **Accesibilidad de los botones.** Un control de alternancia mal implementado no
  es operable por teclado. Mitigación: usar `<button>` nativo con `aria-pressed`
  y cubrirlo con pruebas de Testing Library.
- **Discrepancia de nombre del worktree.** El directorio de este worktree se
  llama `agregar-filtro-de-servicios-selecci-n-m-ltiple-e`, mientras que este
  change y su rama usan `agregar-filtro-servicios-calendario`. Se documenta para
  evitar confusión con el change hermano de **proveedores**
  (`agregar-filtro-proveedores-calendario`).

## Rollback plan

- **Reversión por commit.** El cambio es de UI, sin migraciones ni escrituras en
  base de datos: revertir el commit de la vista de calendario devuelve el
  control de filtros al estado de #174 (solo proveedores) y el calendario vuelve
  al comportamiento anterior.
- **Sin migración ni datos que revertir.** No se agregan tablas, columnas ni
  endpoints; no hay estado persistido que limpiar.
- **El parámetro de URL es inerte si se revierte.** Un `?serviceId=a,b` que
  quede en un enlace no rompe nada: la lectura de la URL es read-only y el
  calendario sin filtro de servicios simplemente muestra todo.
- **Aislamiento de la lista.** Al no modificar `serviceFilter` ni el filtrado de
  la vista de lista, la lista sigue funcionando igual aunque se revierta el
  filtro de servicios del calendario.
- **Sin dependencias.** Al no agregar librerías, no hay que desinstalar nada ni
  revertir `package.json`.

## Criterios de éxito

- [ ] El calendario permite seleccionar uno, varios o ningún servicio, y los
      bloques del mes reflejan la selección.
- [ ] La selección vacía o `['all']` muestra todos los servicios
      (comportamiento actual).
- [ ] El filtro de servicios se compone con **AND** con el de proveedores y el
      filtrado ocurre antes de `blocksByDay`.
- [ ] El control de servicios conserva el universo de servicios del mes sin
      filtrar y permite reactivar un servicio deseleccionado.
- [ ] La selección se sincroniza con la URL (`?serviceId=a,b`), es compartible y
      se conserva al alternar Lista ↔ Calendario, sin perder `providerId`.
- [ ] El botón "Limpiar filtros" reinicia **ambos** filtros y se muestra cuando
      cualquiera de los dos está activo.
- [ ] Los botones de servicio son **solo nombre** (sin swatch), tienen
      `aria-pressed` y estado inactivo distinguido sin depender del color, y son
      operables por teclado.
- [ ] El filtro de la vista de lista (`serviceFilter`, `<select>`) queda intacto.
- [ ] No se agregan dependencias y no se modifica `travelhub-app`.
- [ ] `npm run test`, `npx tsc --noEmit` y `npm run build` en verde.
