# Change: Filtro por proveedor en la lista de horarios

## Why

La lista de horarios (`/business-hours`) muestra **todos** los registros de
`business_hours` de todos los proveedores en una sola tabla plana, sin ningún
criterio de filtrado: `app/(admin)/business-hours/page.tsx` carga horarios y
proveedores en paralelo (`:36-55`), guarda todo en los estados `hours` /
`providers` (`:27-28`) y renderiza el `DataTable` sobre el arreglo completo
(`:146-156`) traduciendo el proveedor de cada fila con `providerName(id)`
(`:124-126`).

Con varios proveedores, cada uno con hasta siete días de horario, la tabla se
alarga y la secretaria no puede concentrarse en la agenda de una sola persona.
Hoy no hay panel de filtros, ni estado de filtro, ni parámetros en la URL en esa
página.

El panel de citas ya resolvió exactamente este patrón: un panel de filtros arriba
de la tabla (`app/(admin)/appointments/page.tsx:813-877`) con encabezado
"Filtros", botón "Limpiar filtros" visible solo con un filtro activo (`:817-826`)
y un `<select>` nativo de proveedores con la opción "Todos" de valor vacío
(`:854-877`). Ese mismo patrón visual (`grid grid-cols-1 gap-3 sm:grid-cols-2
lg:grid-cols-5`, label `block text-xs font-medium text-gray-600`, select
`mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm`) es el
que se reutiliza aquí.

El catálogo de proveedores ya está cargado en memoria en la página
(`providers`, `:28`), y el universo a filtrar es pequeño (7 días × N
proveedores), por lo que el filtrado es **client-side**: no se toca el contrato
de `GET /api/admin/business-hours` ni la capa de datos.

Este change cubre el issue
[#170](https://github.com/proyecto-polaris-ia/medica-app/issues/170).

## What Changes

- **Panel de filtros arriba de la tabla.** Se agrega un panel con el mismo patrón
  visual del panel de citas (`app/(admin)/appointments/page.tsx:813-877`): título
  "Filtros" y una celda de proveedor.
- **Selector nativo de proveedores.** Un `<select>` poblado con el catálogo
  `providers` que la página ya carga en `loadData()` (`:36-55`), con una opción
  `Todos` de valor vacío seleccionada por defecto. No se usa autocompletado: el
  número de proveedores es pequeño.
- **Filtrado client-side de `hours`.** La tabla recibe el subconjunto
  `hours.filter((h) => h.providerId === providerFilter)` derivado en memoria; la
  petición al endpoint no cambia.
- **"Limpiar filtro".** Botón visible únicamente cuando hay un proveedor
  seleccionado; al activarlo devuelve el selector a "Todos" y la tabla a la lista
  completa.
- **Estado del filtro independiente de `hours`.** `providerFilter` vive en su
  propio estado, separado del arreglo de datos, para que la selección sobreviva a
  `loadData()` después de crear, editar o eliminar un horario (ambos handlers ya
  recargan con `loadData()`: `:84-109` y `:111-122`).
- **Sincronización con la URL.** La selección se refleja como `?providerId=<id>`
  para que la vista sea enlazable y compartible. La URL se lee una sola vez al
  inicializar el estado y se reescribe con `router.replace` (sin recargar y sin
  agregar entradas al historial), siguiendo el patrón de
  `app/(admin)/appointments/page.tsx` (`useSearchParams`/`useRouter` `:305-306`,
  lectura única en el `useState` `:342`, helper determinista `:220-236`).
- **Estado vacío propio.** Cuando el proveedor seleccionado no tiene horarios, se
  muestra `EmptyState` con un mensaje claro ("No hay horarios registrados para
  este proveedor."), distinto del mensaje general "No hay horarios registrados."
  (`:143`).
- **Pruebas.** Al no existir hoy una suite de la página, se crea
  `app/(admin)/business-hours/page.test.tsx` (Vitest + Testing Library +
  `userEvent`, proyecto `jsdom`) cubriendo filtrado, limpieza, URL, persistencia
  y estado vacío.

### Alcance

- Vista de horarios `app/(admin)/business-hours/page.tsx` (estado del filtro,
  panel de filtros, selector, derivación de filas, sincronización de URL y
  mensajes de estado vacío).
- Nueva suite `app/(admin)/business-hours/page.test.tsx`.
- Se reutilizan sin cambios `src/components/admin/EmptyState.tsx` (prop
  `message`), `src/components/admin/DataTable.tsx`, `FormModal`, `LoadingState` y
  `ErrorState`.
- Sin migraciones, sin escrituras en base de datos y sin cambios en
  `GET /api/admin/business-hours` ni en `src/lib/admin/business-hours.ts`.
- Sin dependencias nuevas y sin tocar `travelhub-app` (regla crítica del repo).

## Capabilities

### Capability: `admin-panel` (delta ADDED)

`openspec/specs/admin-panel/spec.md` **existe** en el baseline e incluye el
requirement "Business hours CRUD" (`:133-139`). Este change **no** modifica ese
requirement: agrega uno nuevo, por lo que el delta se expresa como **ADDED
Requirements** bajo la capability `admin-panel`, describiendo el contrato
observable del filtro por proveedor de la lista de horarios (selección y
filtrado, limpieza, sincronización con la URL y persistencia con estado vacío).

> Nota: no existe una capability `admin-business-hours` en `openspec/specs/`; no
> se crea ninguna.

### Modified Capabilities

- Ninguna. El requirement "Business hours CRUD" (`admin-panel`, `:133-139`), la
  API de horarios y la capa de datos **no se modifican**.

## Impacto

Archivos esperados (sin modificar `travelhub-app`):

| Área | Impacto | Descripción |
|---|---|---|
| `app/(admin)/business-hours/page.tsx` | Modified | Estado `providerFilter`, lectura única de `?providerId=`, helper de URL con `router.replace`, panel de filtros con `<select>` nativo + "Todos", botón "Limpiar filtro", derivación de filas filtradas y `EmptyState` propio del proveedor sin horarios. `loadData()` (`:36-55`), `handleSubmit` (`:84-109`) y `handleDelete` (`:111-122`) conservan el filtro (D1-D5). |
| `app/(admin)/business-hours/page.test.tsx` | New (no existe hoy) | Suite de la página: filtrado, "Todos", limpieza, URL (`?providerId=`), persistencia tras editar/eliminar y estado vacío del proveedor (D6). |
| `src/components/admin/EmptyState.tsx` | Sin cambios | Se reutiliza tal cual vía su prop `message` (`{ message?: string }`); el mensaje del proveedor sin horarios es copy de la página. |
| `app/api/admin/business-hours/route.ts` y `src/lib/admin/business-hours.ts` | Sin cambios | El filtrado es client-side; el endpoint sigue devolviendo el conjunto completo (D1). |
| `app/api/admin/providers/route.ts` | Sin cambios | El catálogo de proveedores ya se carga y se consume tal cual. |
| `src/components/admin/DataTable.tsx`, `FormModal`, `LoadingState`, `ErrorState` | Sin cambios | Se consumen tal cual; la tabla solo recibe el subconjunto derivado. |
| `src/components/admin/Pagination.tsx` | Sin cambios (nota futura) | Componente presentacional ya existente; si en el futuro se pagina la lista de horarios, es el candidato natural para adoptarlo. Fuera de alcance de este change. |
| `package.json` / migraciones | Sin cambios | No se agregan librerías ni hay migración ni tabla nueva. |

## Decisions

| # | Decisión | Valor | Razón |
|---|---|---|---|
| D1 | Filtrado client-side vs. server-side | **Client-side** sobre el arreglo `hours` en memoria; **sin** cambios en `GET /api/admin/business-hours` | El universo es pequeño (7 días × N proveedores) y el catálogo ya viaja completo en `loadData()` (`:36-55`). Evita ampliar el contrato del endpoint y su capa de datos por un filtro de UI. |
| D2 | Selector nativo vs. autocompletado | **`<select>` nativo** con opción "Todos" de valor vacío | El número de proveedores es pequeño y un select nativo es accesible por teclado sin código extra. Se descarta el autocompletado usado para pacientes en citas (catálogo grande y variable). |
| D3 | Sincronización con la URL | Lectura **única** de `?providerId=` al inicializar el `useState` (sin `useEffect`) y reescritura con `router.replace` mediante un helper determinista (patrón `app/(admin)/appointments/page.tsx:305-306`, `:342`, `:220-236`) | Hace la vista enlazable y compartible sin recargar ni ensuciar el historial. Un `useEffect` de sincronía bidireccional sería más frágil y propenso a pisar el estado. |
| D4 | Persistencia del filtro | `providerFilter` en estado propio, independiente del arreglo `hours`; `loadData()` (`:36-55`) solo reemplaza los datos | `handleSubmit` (`:84-109`) y `handleDelete` (`:111-122`) recargan con `loadData()`; si el filtro viviera derivado de los datos se perdería. Al ser estado aparte, sobrevive sin lógica adicional. |
| D5 | Copy del estado vacío | `EmptyState` con "No hay horarios registrados para este proveedor." cuando hay proveedor seleccionado y cero filas filtradas; el mensaje general "No hay horarios registrados." (`:143`) se conserva para la lista sin filtro | El usuario debe distinguir "este proveedor no tiene horarios" de "no hay horarios capturados". Se reutiliza `EmptyState` sin modificarlo. |
| D6 | Pruebas | Nueva suite `app/(admin)/business-hours/page.test.tsx` colocalizada, Vitest `jsdom` + Testing Library + `userEvent`, TDD RED→GREEN; se mockean las dos llamadas de `loadData()` (`/api/admin/business-hours` y `/api/admin/providers`) y `next/navigation` para la URL | `openspec/config.yaml` → `strict_tdd: true`; hoy no existe suite de esta página y el contrato a proteger (filtro, URL, persistencia) es enteramente observable desde la página. |

## Fuera de alcance

- Paginación de la lista de horarios: si se agrega más adelante, el candidato es
  el componente existente `src/components/admin/Pagination.tsx` (nota de
  reutilización futura, D-table / Impacto).
- Cualquier cambio en `GET /api/admin/business-hours`, en
  `src/lib/admin/business-hours.ts` o en su suite de datos.
- Filtro por día de la semana, rango de horas u otros criterios; este change solo
  filtra por proveedor.
- Cambios en el `<select>` de proveedor del `FormModal` (`:167-183`) o en la
  captura de horarios.
- Filtrado multi-selección (varios proveedores a la vez): el parámetro es un
  `providerId` único.
- Cambios de esquema, migraciones, índices o dependencias.
- Cualquier edición dentro de `travelhub-app`.

## Riesgos

- **Filtro perdido al recargar datos.** `handleSubmit` (`:84-109`) y
  `handleDelete` (`:111-122`) llaman `loadData()`; si el filtro se derivara de los
  datos, se perdería tras editar o eliminar. Mitigación: estado propio e
  independiente (D4) y pruebas de persistencia (D6).
- **URL desincronizada o bucle de render.** Escribir la URL en cada render o con
  un `useEffect` sin guardias puede provocar reescrituras y parpadeo. Mitigación:
  lectura única al inicializar y un helper determinista con `router.replace`
  (D3), siguiendo el patrón ya probado en citas.
- **`?providerId=` que no corresponde a ningún proveedor.** Un enlace viejo (por
  ejemplo, un proveedor ya dado de baja) dejaría el `<select>` sin opción
  coincidente. Mitigación: honrar el parámetro solo cuando exista en el catálogo
  cargado y, en caso contrario, caer en "Todos" y no filtrar (se cubre en las
  pruebas de borde de la Fase 2).
- **Dos mensajes de estado vacío.** Confundir "no hay horarios registrados" con
  "este proveedor no tiene horarios" degrada la experiencia. Mitigación: el
  mensaje depende de `providerFilter` (D5) y se prueba cada caso.
- **Proveedores aún no cargados.** Si `providers` llega vacío (o falla su
  petición), el selector quedaría sin opciones. Mitigación: el estado de error ya
  lo cubre `ErrorState` (`:141`); con catálogo vacío la opción "Todos" sigue
  funcionando y el filtro no aplica.
- **Suite nueva sin referencia previa de esta página.** No existe
  `page.test.tsx` de horarios; el mock de `next/navigation` y de las dos
  peticiones paralelas debe hacerse con cuidado. Mitigación: seguir el patrón de
  `app/(admin)/appointments/page.test.tsx` (MockedNextNavigation / `useSearchParams`
  + `useRouter` mockeados).

## Rollback plan

- **Reversión por commit.** El change no tiene migraciones ni escrituras:
  revertir el commit de `app/(admin)/business-hours/page.tsx` devuelve la página
  a la tabla completa sin panel de filtros, sin estado `providerFilter` y sin
  lectura de URL.
- **Sin datos que revertir.** No se agregan tablas, columnas ni índices; el filtro
  nunca se persiste en base de datos.
- **API intacta.** Como `GET /api/admin/business-hours` y `GET /api/admin/providers`
  no cambian, revertir no requiere ninguna acción del servidor.
- **Sin dependencias.** `package.json` no cambia; no hay nada que desinstalar.
- **Suite nueva.** Al revertir, eliminar `app/(admin)/business-hours/page.test.tsx`
  no deja consumidores ni configuración huérfana.

## Criterios de éxito

- [ ] La lista de horarios muestra un panel de filtros arriba de la tabla con un
      `<select>` de proveedores y la opción "Todos" seleccionada por defecto.
- [ ] Al seleccionar un proveedor, la tabla muestra únicamente sus horarios.
- [ ] Al seleccionar "Todos", la tabla vuelve a mostrar todos los horarios.
- [ ] El botón "Limpiar filtro" aparece solo cuando hay un proveedor seleccionado
      y devuelve el filtro a "Todos".
- [ ] El filtro seleccionado sobrevive a `loadData()` después de editar o
      eliminar un horario.
- [ ] Cuando el proveedor seleccionado no tiene horarios, se muestra el estado
      vacío con el mensaje propio del proveedor.
- [ ] El `providerId` seleccionado queda reflejado en la URL y un deep link con
      `?providerId=` abre la vista filtrada; sin el parámetro se ven todos los
      horarios.
- [ ] Sin cambios en `GET /api/admin/business-hours` ni en la capa de datos; sin
      dependencias nuevas; `travelhub-app` intacto.
- [ ] `npm test`, `npx tsc --noEmit` y `npm run build` en verde.
