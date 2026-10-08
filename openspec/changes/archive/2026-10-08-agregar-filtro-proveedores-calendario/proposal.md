# Change: Filtro multi-selección de proveedores en la vista de calendario de citas

## Why

La vista de calendario de `/appointments` muestra hoy **todas** las citas del mes
sin importar el proveedor. Cuando la agenda tiene varios odontólogos, la
secretaria no puede aislar la agenda de uno o de unos pocos para revisarla,
compararla o detectar huecos: el bloque de color y la leyenda
(`ProviderLegend`) son **solo lectura**, no permiten interactuar con ellos.

El filtro existente de proveedor vive únicamente en la **vista de lista**
(`<select>` de un solo valor) y **no afecta al calendario**: `blocksByDay` se
calcula a partir del arreglo completo de citas. El resultado es que un admin que
trabaja en calendario no tiene forma de acotar lo que ve, aunque la lista sí.

Este cambio agrega un **filtro de proveedores multi-selección** a la vista de
calendario, construido sobre la leyenda que ya existe, de modo que el admin pueda
mostrar u ocultar proveedores con un clic, con el resultado reflejado en los
bloques del mes, sincronizado con la URL y sin romper el filtro de la lista.
Cubre el issue [#174](https://github.com/proyecto-polaris-ia/medica-app/issues/174).

## What Changes

- **`ProviderLegend` pasa de leyenda pasiva a control interactivo.** Cada
  entrada se convierte en un botón de alternancia (`swatch` + nombre) con
  `aria-pressed`; el proveedor inactivo se muestra **atenuado**. Cero
  dependencias nuevas: Tailwind y HTML nativos, como el resto de la pantalla.
- **Nuevo estado de calendario separado.** Se agrega
  `calendarProviderFilter: string[]`. El estado existente `providerFilter`
  (`string`, `<select>` de la vista de lista) **no se toca**, para no romper el
  comportamiento de la lista.
- **Selección vacía o `['all']` significan "todos".** Sin selección activa, el
  calendario se comporta como hoy (muestra todos los proveedores).
- **Filtrado previo a `blocksByDay`.** La selección se aplica a las citas
  **antes** de calcular `blocksByDay`, así que los bloques del mes reflejan
  exactamente los proveedores activos.
- **La leyenda conserva su universo de proveedores.** El origen de la leyenda se
  deriva del conjunto del mes **sin filtrar**, para que un proveedor deseleccionado
  siga visible como botón y pueda volver a activarse.
- **Sincronización con la URL con `router.replace`.** La selección se refleja
  como `?providerId=a,b` (ids unidos por coma), siguiendo el precedente de
  `MetricsRangeSelector`. El enlace es compartible y la selección se conserva al
  alternar Lista ↔ Calendario.
- **Botón "Limpiar filtros".** Reinicia la selección de proveedores del
  calendario a "todos".
- **Ajuste responsivo.** La fila de navegación + leyenda pasa a un layout
  `flex-col gap-4 sm:flex-row sm:items-center sm:justify-between`, consistente
  con el resto de la página; la leyenda ya usa `flex-wrap`.
- **Cobertura de pruebas** de la nueva interacción (alternar, limpiar, URL,
  filtrado de bloques) con Vitest + Testing Library, sin cambiar el runner.

### Alcance

- Vista de calendario de `/appointments` y su leyenda; sin cambios de datos,
  migraciones ni API.
- El filtro de la vista de lista sigue intacto y sigue funcionando como hoy.
- Sin dependencias nuevas y sin tocar `travelhub-app` (regla crítica del repo).

## Capabilities

### New Capabilities

- Ninguna. El comportamiento nuevo (filtro multi-selección y su sincronización
  con la URL) se agrega a una capability existente; no se crea una capability
  nueva.

### Modified Capability: `appointments-calendar-view`

`openspec/specs/appointments-calendar-view/spec.md` se modifica. Los deltas que
se confirmarán en la fase spec son:

- **`Provider color legend` (MODIFIED).** Hoy la leyenda es de solo lectura y
  únicamente muestra nombre + color. Debe reescribirse para que cada entrada sea
  un **control de alternancia accesible** (botón con `aria-pressed`, estado
  inactivo visualmente atenuado) y para que la leyenda siga listando el universo
  de proveedores del mes aunque estén deseleccionados.
- **Nuevo requirement: filtrado multi-selección de proveedores en el calendario
  (ADDED).** El calendario debe poder restringir los bloques mostrados a un
  subconjunto de proveedores; la selección vacía o "todos" equivale a mostrar
  todos; el filtrado ocurre antes del agrupamiento por día; la selección se
  refleja en la URL y sobrevive el cambio de vista Lista ↔ Calendario.

Invariantes que **NO** se modifican: toggle Lista/Calendario, navegación de mes y
año, carga por rango visible, bloques coloreados por proveedor, color neutral de
respaldo, zona horaria de la clínica, apertura del flujo de edición desde el
bloque y acceso al expediente del paciente.

## Impacto

Archivos esperados (sin modificar `travelhub-app`):

| Área | Impacto | Descripción |
|---|---|---|
| `src/components/admin/calendar/ProviderLegend.tsx` | Modified | Pasa de leyenda pasiva a botones de alternancia con `aria-pressed` y estado atenuado. |
| `app/(admin)/appointments/page.tsx` | Modified | Nuevo estado `calendarProviderFilter`, filtrado previo a `blocksByDay`, sincronización de URL, botón de limpiar y layout responsivo. |
| `src/components/admin/calendar/__tests__/` | New | Pruebas de la leyenda interactiva (alternar, `aria-pressed`, estado atenuado). |
| `app/(admin)/appointments/page.test.tsx` | Modified | Pruebas del filtrado multi-selección, URL y limpieza en la vista de calendario. |
| `openspec/specs/appointments-calendar-view/spec.md` | Modified (delta) | MODIFIED de `Provider color legend` + requirement nuevo de filtrado. |
| `openspec/changes/agregar-filtro-proveedores-calendario/specs/` | New (fase spec) | Delta spec de la capability modificada. |
| `providerFilter` (vista de lista) | Sin cambios | El `<select>` de un solo proveedor de la lista queda intacto. |
| Dependencias / migraciones / API | Sin cambios | No se agregan librerías, no hay migración ni endpoint nuevo. |

Anclas de referencia en `app/(admin)/appointments/page.tsx`: `urlProviderFilter`
(:138), `providerFilter` (:156), `blocksByDay` (:168), `visibleProviders` (:182),
`clearFilters` (:336), filtrado de lista (:344, `:353`), toggle de vista
(`role="group"`, :400), fila `CalendarNav` + `ProviderLegend` (:528-533) y
`MonthCalendar` (:675).

## Decisions

| Decisión | Valor | Razón |
|---|---|---|
| Enfoque de UI | Opción C: extender `ProviderLegend` a botones de alternancia | Reutiliza lo que ya existe, es accesible y no requiere dependencias ni rediseño. |
| Estado | `calendarProviderFilter: string[]` separado del `providerFilter` de la lista | Evita romper el `<select>` de un solo valor de la vista de lista. |
| Sin selección / `['all']` | Mostrar todos los proveedores | Conserva el comportamiento actual por defecto. |
| Punto de filtrado | Antes de `blocksByDay` | Los bloques del mes reflejan exactamente la selección activa. |
| Fuente de la leyenda | Citas del mes **sin filtrar** | Permite volver a activar un proveedor deseleccionado. |
| Sincronización | `router.replace(\`?providerId=a,b\`)` | Deep-link y preservación entre Lista y Calendario, siguiendo `MetricsRangeSelector`. |
| Limpiar | Botón "Limpiar filtros" del calendario | Reinicia la selección a "todos" de forma explícita. |
| Responsive | `flex-col gap-4 sm:flex-row sm:items-center sm:justify-between` | Consistente con la convención de la página. |
| Dependencias | Ninguna | No hay UI kit (shadcn/radix) en el repo; solo Tailwind y HTML nativo. |

## Fuera de alcance

- Cambios al filtro de la vista de lista o al `<select>` de proveedor existente.
- Filtros multi-selección para servicio, paciente, estatus o rango de fechas en el
  calendario.
- Persistencia del filtro por usuario, preferencias guardadas o sincronización entre
  dispositivos.
- Cambios de esquema, migraciones, API o dependencias.
- Cualquier edición dentro de `travelhub-app`.

## Riesgos

- **Colisión del parámetro `providerId`.** La lista hoy lee `providerId` como un
  único id (`:138`, `:156`); el calendario lo escribirá como ids unidos por coma.
  Si se cambia de Calendario a Lista, la lista podría recibir `a,b` y no
  coincidir con nada. Mitigación: resolver la precedencia de parseo (por ejemplo,
  que la lista ignore valores múltiples) en `design.md` antes de implementar.
- **Ids obsoletos en la URL.** Un enlace compartido puede referenciar un proveedor
  que no tiene citas en el mes visible. Mitigación: tratar los ids desconocidos
  como ignorados/sin coincidencia sin romper el render y documentarlo en la spec.
- **Leyenda vacía al filtrar.** Si la leyenda se derivara de las citas ya
  filtradas, deseleccionar todos los proveedores la vaciaría y no habría forma de
  reactivar. Mitigación: derivar la leyenda del conjunto del mes sin filtrar
  (decisión registrada arriba).
- **Accesibilidad de los botones.** Un control de alternancia mal implementado no
  es operable por teclado. Mitigación: usar `<button>` nativo con `aria-pressed`
  y cubrirlo con pruebas de Testing Library.
- **Regresión responsiva.** Mover la fila podría romper el layout en móvil.
  Mitigación: usar la convención `flex-col sm:flex-row` ya establecida en la
  página y verificarla en las pruebas/ejecución local.
- **Discrepancia de nombre del worktree.** El directorio de este worktree se llama
  `agregar-filtro-de-servicios-selecci-n-m-ltiple-e`, mientras que este change se
  enfoca en **proveedores** (change-id `agregar-filtro-proveedores-calendario`,
  rama `feat/agregar-filtro-proveedores-calendario`). Se documenta para evitar
  confusión con el change hermano de **servicios**, que vive en otro worktree.

## Rollback plan

- **Reversión por commit.** El cambio es de UI, sin migraciones ni escrituras en
  base de datos: revertir el commit de la vista de calendario restaura
  `ProviderLegend` como leyenda pasiva y el calendario vuelve al comportamiento
  actual.
- **Sin migración ni datos que revertir.** No se agregan tablas, columnas ni
  endpoints; no hay estado persistido que limpiar.
- **El parámetro de URL es inerte si se revierte.** Un `?providerId=a,b` que
  quede en un enlace no rompe nada: la lectura actual de `providerId` es
  read-only y el calendario sin filtro simplemente muestra todo.
- **Aislamiento de la lista.** Al no modificar `providerFilter` ni el filtrado de
  la vista de lista, la lista sigue funcionando igual aunque se revierta el
  filtro del calendario.
- **Sin dependencias.** Al no agregar librerías, no hay que desinstalar nada ni
  revertir `package.json`.

## Criterios de éxito

- [ ] El calendario permite seleccionar uno, varios o ningún proveedor, y los
      bloques del mes reflejan la selección.
- [ ] La selección vacía o `['all']` muestra todos los proveedores (comportamiento
      actual).
- [ ] El filtrado se aplica antes de `blocksByDay` y la leyenda conserva el
      universo de proveedores del mes sin filtrar.
- [ ] La selección se sincroniza con la URL (`?providerId=a,b`), es compartible y
      se conserva al alternar Lista ↔ Calendario.
- [ ] El botón "Limpiar filtros" reinicia la selección del calendario a "todos".
- [ ] Los botones de la leyenda tienen `aria-pressed` y estado inactivo atenuado,
      y son operables por teclado.
- [ ] El filtro de la vista de lista (`providerFilter`, `<select>`) queda intacto.
- [ ] No se agregan dependencias y no se modifica `travelhub-app`.
- [ ] `npm run test`, `npx tsc --noEmit` y `npm run build` en verde.
