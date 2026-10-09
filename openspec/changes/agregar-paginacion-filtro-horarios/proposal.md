# Change: Paginación server-side y filtro por proveedor en la lista de horarios

## Why

La vista administrativa de horarios (`/business-hours`) carga el catálogo
completo en una sola petición: `GET /api/admin/business-hours`
(`app/api/admin/business-hours/route.ts`) no acepta parámetros y responde
`{ businessHours }` con **todas** las filas de `business_hours`, y
`app/(admin)/business-hours/page.tsx` las renderiza íntegras en el `DataTable`.
El catálogo crece con cada proveedor (día × rango horario), así que:

- el payload y el DOM crecen sin límite y el administrador no tiene forma de
  navegar por páginas,
- no existe manera de acotar la lista a un proveedor, y
- `listBusinessHours()` (`src/lib/admin/business-hours.ts`) ordena solo por
  `created_at desc`, sin desempate por `id`, lo que hace inestable cualquier
  paginación por `range`.

Este change cubre el issue
[#171](https://github.com/proyecto-polaris-ia/medica-app/issues/171) e incorpora
además el filtro server-side por proveedor que exige la lógica del issue abierto
[#170](https://github.com/proyecto-polaris-ia/medica-app/issues/170): el
criterio de éxito de #171 ("el total refleja el conjunto filtrado") no se puede
cumplir sin un filtro del lado del servidor, porque un filtro aplicado en el
cliente haría que `total` y `totalPages` describieran un conjunto distinto al
que el usuario ve. El filtro en la UI que pide #170 entra en el mismo alcance
para no dejar la lista en un estado intermedio inútil.

Se reutilizan patrones ya validados: la paginación server-side de la lista de
citas ([#168](https://github.com/proyecto-polaris-ia/medica-app/issues/168),
archivada en
`openspec/changes/archive/2026-10-09-agregar-paginacion-citas-expediente/`) y la
búsqueda/paginación de la lista de pacientes
([#167](https://github.com/proyecto-polaris-ia/medica-app/issues/167),
`openspec/changes/archive/2026-10-08-patient-list-search-pagination/`).

## What Changes

- **`GET /api/admin/business-hours` pasa a ser paginado.** Acepta `page`
  (entero ≥ 1, default `1`) y `pageSize` (entero entre `1` y `100`, default
  `20`), aplica `range((page - 1) * pageSize, …)` y responde de forma aditiva
  `{ businessHours, pagination: { total, page, pageSize, totalPages } }` con
  `total` contado exacto sobre el conjunto ya filtrado.
- **Filtro server-side por proveedor.** El endpoint acepta `providerId`; cuando
  viene informado, MUST ser un UUID válido y el resultado MUST contener
  únicamente los horarios de ese proveedor. El filtro MUST aplicarse **antes**
  de calcular `total` y antes de recortar la página. Un `providerId` vacío o
  ausente equivale a "sin filtro".
- **Validación estricta de parámetros.** `page` o `pageSize` no entero, negativo
  o fuera de rango MUST responder `400` (`{ error: 'invalid_request', field }`)
  sin exponer datos; un `providerId` malformado MUST responder `400`; una
  petición sin sesión administrativa MUST seguir respondiendo `401`.
- **Orden estable.** `listBusinessHoursPage` ordena `created_at desc, id desc`
  (se agrega el desempate por `id`) para que dos páginas consecutivas no
  repitan ni salten filas.
- **Página fuera de rango tolerada.** Cuando PostgREST rechaza el `range` por
  exceder el total (`PGRST103`), el endpoint MUST responder `businessHours`
  vacío conservando los metadatos reales (`total`, `page`, `pageSize`,
  `totalPages`) sin recortar el valor de `page`.
- **`listBusinessHoursPage(params)` en la capa de datos.**
  `src/lib/admin/business-hours.ts` gana la lectura paginada con
  `count: 'exact'`, filtro opcional por proveedor y desempate por `id`.
  `listBusinessHours()` se conserva sin cambios de contrato para el resto de
  consumidores internos (si los hubiera) o se retira en favor de la paginada si
  queda huérfana; la decisión se toma en implementación con `knip` como
  evidencia.
- **La vista `/business-hours` deja de traer todo.** Consume la respuesta
  paginada, monta `src/components/admin/Pagination.tsx` (sin cambios en el
  componente) debajo de la tabla y muestra "Página X de Y (N resultados)" con
  los metadatos del servidor.
- **Panel de filtro por proveedor.** Se agrega un `select` de proveedores antes
  de la tabla con la opción vacía "Todos" y un botón "Limpiar filtro" visible
  solo cuando hay un filtro activo, con el mismo patrón visual del panel de
  filtros de `/appointments`.
- **Sincronía con la URL.** La vista refleja `?page=n&providerId=…` con
  `router.replace` y guardia contra reescrituras redundantes: `page` se omite
  cuando vale `1` y `providerId` se escribe solo cuando hay filtro. La URL es
  deep-linkeable y sobrevive recargas.
- **Cambiar el filtro reinicia la página.** Cualquier cambio de proveedor
  (seleccionar o limpiar) MUST volver a la página `1` antes de solicitar los
  nuevos resultados, y la URL MUST dejar de arrastrar el `page` anterior.
- **Página fuera de rango en el cliente se normaliza.** Si la URL o un borrado
  dejan la página activa por encima de `totalPages`, la vista MUST resolver a la
  última página existente usando los metadatos devueltos, sin mostrar error.
- **Estados vacíos diferenciados.** "No hay horarios registrados." cuando el
  catálogo está vacío, frente a un mensaje propio cuando el filtro activo no
  tiene coincidencias (con acción de limpiar el filtro); el control de
  paginación MUST permanecer visible cuando hay resultados pero la página activa
  quedó sin filas.
- **Escrituras intactas.** `POST /api/admin/business-hours` y
  `PATCH`/`DELETE /api/admin/business-hours/[id]` conservan su contrato vigente;
  la vista sigue recargando la página activa después de crear, editar o
  eliminar.

### Alcance

- `app/api/admin/business-hours/route.ts` (GET paginado + filtro) y
  `src/lib/admin/business-hours.ts` (lectura paginada).
- `app/(admin)/business-hours/page.tsx` (paginación, panel de filtro, URL,
  estados vacíos y normalización de página).
- Reutilización sin cambios de `src/components/admin/Pagination.tsx`,
  `DataTable.tsx`, `FormModal.tsx`, `EmptyState.tsx`, `ErrorState.tsx` y
  `LoadingState.tsx`.
- Pruebas: ruta con servicio mockeado, suite de datos contra Supabase local y
  pruebas de UI de la página.
- Sin dependencias nuevas, sin migraciones de esquema y sin tocar
  `travelhub-app` (regla crítica del repo).
- Las escrituras de `business_hours` siguen especificadas por la capability
  `admin-panel` ("Business hours CRUD"); este change no las modifica.

## Capabilities

### New Capability: `admin-business-hours`

Se crea la capability **`admin-business-hours`** en
`openspec/specs/admin-business-hours/spec.md` (delta `ADDED` en
`openspec/changes/agregar-paginacion-filtro-horarios/specs/admin-business-hours/spec.md`).
Captura el contrato de lectura paginada del catálogo de horarios (parámetros,
metadatos anidados, filtro por proveedor, orden estable, `PGRST103`, validación
estricta) y el comportamiento de la vista (control de paginación, panel de
filtro, URL, reset de página, estados vacíos y normalización de página fuera de
rango).

Se elige una capability nueva —y no un delta sobre `admin-panel`— porque el
requirement "Business hours CRUD" de `openspec/specs/admin-panel/spec.md` sigue
siendo verdadero sin cambios (no exige una lectura sin paginar) y porque
`admin-appointments` (`openspec/changes/agregar-paginacion-citas/`, #168) y
`admin-patients-api`/`admin-patients-ui` (#167) resolvieron la paginación de un
listado creando una capability propia del listado en lugar de reescribir el
requirement genérico del panel.

### Modified Capabilities

Ninguna. `admin-panel` conserva intacto su requirement "Business hours CRUD"
(alcance de escritura) y la lectura paginada vive en la capability nueva.

## Impacto

| Área | Impacto | Descripción |
|---|---|---|
| `app/api/admin/business-hours/route.ts` | Modified | `GET` con `page`/`pageSize`/`providerId`, validación estricta y respuesta `{ businessHours, pagination }`. `POST` sin cambios. |
| `src/lib/admin/business-hours.ts` | Modified | Nueva `listBusinessHoursPage({ providerId, page, pageSize })` con `count: 'exact'`, filtro por proveedor, `range` y orden `created_at desc, id desc`; manejo de `PGRST103`. |
| `app/(admin)/business-hours/page.tsx` | Modified | Consumo paginado, `Pagination`, panel de filtro por proveedor, sincronía de URL, reset de página al filtrar, normalización de página fuera de rango y estados vacíos diferenciados. |
| `src/components/admin/Pagination.tsx` | Sin cambios | Se reutiliza tal cual (`{ page, pageSize, total, onPageChange, ariaLabel }`). |
| `app/api/admin/business-hours/route.test.ts` | Modified | Casos de paginación, metadatos, filtro y `400`. |
| `src/lib/admin/__tests__/business-hours.test.ts` | Modified | Casos de datos contra Supabase local: `range`, `total` filtrado, orden estable, `PGRST103`. |
| `app/(admin)/business-hours/page.test.tsx` | New | Pruebas de UI: paginación, filtro, URL, reset, estados vacíos. |
| `openspec/changes/agregar-paginacion-filtro-horarios/` | New | Este change (proposal, spec delta, design, tasks). |
| Dependencias / migraciones | Sin cambios | No se agregan librerías ni se toca el esquema. |

## Decisions

| Decisión | Valor | Razón |
|---|---|---|
| Incluir el filtro `providerId` en este change | Sí, server-side + `select` en la UI | Decisión acordada con el usuario: sin filtro server-side, `total` y `totalPages` no pueden reflejar el conjunto que ve el usuario y el criterio de éxito de #171 es inalcanzable; además cubre la lógica de #170. |
| Forma de la respuesta | Anidada `{ businessHours, pagination: { total, page, pageSize, totalPages } }` | Es el patrón más reciente y ya en producción (citas #168/#212). La variante plana de `admin-patients-api` (#167) no se repite para no tener dos formas de metadatos en el panel. |
| Validación de parámetros | Estricta: `400 invalid_request` con `field`, defaults `1`/`20`, máximo `100` | Consistencia con `app/api/admin/appointments/route.ts` (mismos defaults de listado global) y con el manejo central de `ValidationError` en `handleAdminRequest`. |
| Ubicación de los parsers | Locales a la ruta (`parsePageParam`/`parsePageSizeParam` en `route.ts`) | `app/api/admin/_lib/pagination.ts` está documentado como específico de las rutas del expediente (`10`/`50`); igual que la ruta de citas, el listado de horarios mantiene sus propias cifras sin cambiar el comportamiento de las rutas existentes. |
| `providerId` malformado | `400` | `business-hours.ts` ya expone `parseUuid`/`ValidationError`; responder `400` es preferible a un `500` por el cast `uuid` de Postgres o a ignorar el filtro en silencio. Es una mejora deliberada sobre el precedente de citas, que pasa el valor sin validar. |
| Orden | `created_at desc, id desc` | Conserva el orden visible actual y agrega el desempate que la paginación estable requiere. |
| Página fuera de rango | Respuesta vacía con metadatos reales (`PGRST103`) y normalización a la última página en el cliente | Patrón de pacientes/citas: nunca rompe la respuesta y el usuario siempre puede volver a una página con filas. |
| Selector de `pageSize` y orden configurable | Fuera de alcance | Ninguno de los dos issues lo pide; agregarlos suma UI y superficie de validación sin necesidad demostrada. |
| Navegación | `router.replace` con guardia de reescritura | Evita entradas inútiles en el historial y cargas duplicadas cuando la página destino es la activa (patrón #168/#167). |

## Fuera de alcance

- Selector de `pageSize` en la UI, ordenamiento configurable por columna y scroll
  infinito.
- Paginación del endpoint `GET /api/admin/providers` (la vista necesita la lista
  completa de proveedores para el filtro y el formulario; se sigue cargando una
  vez).
- Filtros adicionales (día de la semana, rango horario).
- Persistencia de la página por usuario o entre dispositivos (solo URL).
- Cambios en las escrituras de `business_hours` o en la capability `admin-panel`.
- Cualquier edición dentro de `travelhub-app`.

## Riesgos

- **Consumidores del `GET` sin paginación.** Hoy el único consumidor es
  `app/(admin)/business-hours/page.tsx` (verificado en el código). Mitigación:
  la ruta y la vista se actualizan en el mismo change y el `total` se prueba con
  la suite de datos local.
- **Filtro sin validación de UUID en el precedente de citas.** Mitigación: este
  change valida `providerId` con `parseUuid` y prueba el `400`.
- **Desfase de `total` por escrituras concurrentes.** Se acepta para un panel
  administrativo, igual que en #168; no se agrega transacción.
- **Borrar la última fila de la última página.** La vista queda en una página sin
  filas. Mitigación: normalización a la última página existente usando los
  metadatos devueltos, cubierta por prueba de UI.
- **`PGRST103` con `count: null`.** PostgREST no expone el total cuando el
  `range` excede las filas; la capa de datos repite la consulta sin `range` solo
  para obtener el `count` exacto (mismo recurso que `patients.ts` y
  `appointments.ts`).

## Rollback plan

- **Reversión por commit.** Sin migraciones ni datos persistentes: revertir los
  commits restaura el `GET` no paginado y la vista sin controles ni filtro.
- **La respuesta paginada es aditiva.** La clave `businessHours` conserva forma y
  campos; cualquier consumidor que solo lea esa clave sigue funcionando aunque el
  rollback sea parcial.
- **`?page=` y `?providerId=` son inertes tras revertir.** La página simplemente
  los ignora.
- **Reversión del filtro.** Quitar el panel y el `providerId` de la ruta no
  afecta a las escrituras ni a `admin-panel`.
- **Sin dependencias.** `package.json` no cambia.

## Criterios de éxito

- [ ] `GET /api/admin/business-hours` responde como máximo `pageSize` horarios y
      los metadatos `{ total, page, pageSize, totalPages }` sobre el conjunto
      filtrado.
- [ ] `page=0`, `pageSize=101`, `pageSize=abc` y `providerId` no UUID responden
      `400`; sin sesión, `401`; página fuera de rango, `200` con lista vacía y
      metadatos reales.
- [ ] `providerId` filtra en el servidor, `total` refleja el filtro y el orden
      `created_at desc, id desc` es estable entre páginas.
- [ ] La lista monta `Pagination` debajo de la tabla con 20 filas por página y
      muestra "Página X de Y (N resultados)".
- [ ] `?page=n&providerId=…` es deep-linkeable, la página 1 no se escribe, el
      filtro reinicia a página 1 y una página fuera de rango se normaliza a la
      última existente.
- [ ] Estado vacío diferenciado entre catálogo vacío y filtro sin coincidencias,
      con acción de limpiar el filtro.
- [ ] `npm test` (unitarias y UI), `npm run test:local` (datos), `npx tsc
      --noEmit`, `npm run lint` y `npm run build` en verde.
- [ ] No se agregan dependencias, no se modifican las escrituras de
      `business_hours` y no se toca `travelhub-app`.
