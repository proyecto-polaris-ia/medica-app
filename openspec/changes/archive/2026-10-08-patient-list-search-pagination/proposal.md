# Propuesta: Búsqueda con autocomplete y paginación en el listado de pacientes

Issue: [#167](https://github.com/proyecto-polaris-ia/medica-app/issues/167)

## Por qué

La vista administrativa `/patients` carga hoy **todos** los pacientes en una sola
llamada y los renderiza sin filtro ni paginación. `app/(admin)/patients/page.tsx:37-54`
ejecuta `fetch('/api/admin/patients')` en un `useEffect` sin parámetros (`:41`) y
`src/lib/admin/patients.ts:57` (`listPatients()`) hace un `select` sin `range`; cada
mutación (crear, editar, borrar) recarga la lista completa.

Con el crecimiento de la cartera de pacientes esto deja de escalar: la respuesta HTTP y
la tabla crecen sin límite, y encontrar a un paciente obliga a recorrer toda la lista.
Además, la única búsqueda existente (`searchPatients(q)`, `src/lib/admin/patients.ts:59`)
no está expuesta en la UI: el endpoint ya la lee
(`app/api/admin/patients/route.ts:9-20`), pero su único consumidor real es
`src/components/booking/PatientSearch.tsx:27-39`, que la usa para autocompletar durante el
booking interno y no en el listado administrativo.

Este cambio agrega búsqueda con autocomplete (debounce) y paginación del lado del
servidor en el listado administrativo, sin tocar el guard de autenticación ni el CRUD
existente.

## Alcance

### Incluido

- Endpoint de lectura con búsqueda y paginación combinables, en respuesta aditiva.
- Variante paginada en la capa de datos, reutilizando el patrón ya probado en WCC.
- Input de búsqueda con debounce (~300 ms), mínimo 2 caracteres, sugerencias por nombre y teléfono.
- Seleccionar una sugerencia filtra la tabla a ese paciente; limpiar restaura la lista completa.
- Controles de paginación (anterior/siguiente + página actual de total).
- Sincronización de URL con `?q=` y `?page=` (deep-link compartible/recargable).
- Estado vacío diferenciado cuando la búsqueda no arroja resultados.

### Fuera de alcance (qué no cambia)

- **Guard de autenticación**: `requireUser()` dentro de `handleAdminRequest`
  (`app/api/admin/patients/route.ts:9-11`) se conserva tal cual; sin cambios de sesión,
  cookies ni RLS.
- **CRUD existente**: POST/PATCH/DELETE de `/api/admin/patients` y el contrato del
  endpoint `[id]` no cambian; el CRUD sigue recargando la lista tras cada mutación.
- **`src/components/booking/PatientSearch.tsx`**: sigue consumiendo `{ patients }`; la
  respuesta del endpoint es aditiva, así que no se modifica.
- **`src/components/admin/DataTable.tsx`** genérico: no se le agregan props de paginación.
- Ordenamiento por columna, exportación, filtros por fecha/estado, búsqueda difusa
  (fuzzy) o índices full-text; tampoco cambios de esquema ni migraciones.
- **`travelhub-app`**: no se modifica ningún archivo de ese proyecto.

## Capacidades

### Capacidades nuevas

- `admin-patients-api`: contrato de lectura del listado administrativo de pacientes con
  búsqueda textual y paginación del lado del servidor, con respuesta aditiva compatible
  con los consumidores actuales.
- `admin-patients-ui`: comportamiento de la vista `/patients` — autocomplete con debounce,
  filtro por selección, controles de paginación, estado vacío y sincronización de URL.

### Capacidades modificadas

Ninguna. El requisito **"Patients CRUD"** de `openspec/specs/admin-panel/spec.md:89` sigue
vigente sin cambios: el CRUD conserva su semántica y este cambio solo agrega lectura
filtrada y paginada, en capacidades nuevas y separadas.

Mapa de capacidades a specs futuros (un archivo por capacidad):

| Capacidad | Tipo | Spec futuro |
|---|---|---|
| `admin-patients-api` | Nueva | `openspec/changes/patient-list-search-pagination/specs/admin-patients-api/spec.md` |
| `admin-patients-ui` | Nueva | `openspec/changes/patient-list-search-pagination/specs/admin-patients-ui/spec.md` |

Nota de decisión: se evaluó fusionar ambas en la capacidad existente `admin-panel`; se
descartó para mantener separados el contrato HTTP (verificable con pruebas de datos
contra Supabase local) y el comportamiento de UI (verificable con pruebas de componente
Vitest + RTL), conservando specs revisables de forma independiente.

## Cambios propuestos

### (a) Endpoint `GET /api/admin/patients` con `q`, `page` y `pageSize`

`app/api/admin/patients/route.ts` seguirá leyendo `q` y además `page` y `pageSize`,
respondiendo de forma **aditiva**:

```json
{ "patients": [], "page": 1, "pageSize": 20, "total": 0, "totalPages": 1 }
```

La clave `patients` se mantiene con el mismo tipo, de modo que
`src/components/booking/PatientSearch.tsx:38-39` (que solo lee `data.patients`) no se
rompe. El endpoint sigue autenticado y sigue resolviendo `q` vacío/null como "sin filtro".
Parsea `page`/`pageSize` de forma defensiva (enteros positivos; valores inválidos → default)
y aplica un tope superior de `pageSize`; `pageSize` sugerido por defecto: 20.

### (b) Capa de datos paginada en `src/lib/admin/patients.ts`

Nueva variante paginada (p. ej. `listPatientsPage({ q, page, pageSize })`) que reutiliza el
patrón ya probado en el repo:

- `src/lib/wcc-conversations.ts:19` → `.select(COLS, { count: 'exact' }).order(...).range(from, from + pageSize - 1)`.
- `src/lib/wcc-knowledge.ts:27` → mismo patrón con filtro opcional combinado con la paginación.

Detalles esperados: `from = (page - 1) * pageSize`, orden estable (`created_at` descendente,
igual que hoy en `listPatients()`), y retorno
`{ patients, page, pageSize, totalCount, totalPages }` (mismo vocabulario que WCC; el route
mapea `totalCount` → `total`). Cuando hay `q`, el filtro se aplica **antes** del `count` y del
`range`, de modo que `total`/`totalPages` reflejen los resultados filtrados y búsqueda +
paginación sean combinables. `listPatients()` y `searchPatients(q)` se conservan exportados
para no romper pruebas ni consumidores internos.

### (c) Búsqueda con autocomplete en `app/(admin)/patients/page.tsx`

Input de búsqueda con debounce de ~300 ms siguiendo el patrón de
`src/components/booking/PatientSearch.tsx:6,25-46` (`DEBOUNCE_MS = 300`, `setTimeout` con
limpieza en el `cleanup` del efecto y `encodeURIComponent`). Reglas: por debajo de 2
caracteres no se consulta y se muestra la lista completa (página 1); con 2 o más caracteres
se consulta `/api/admin/patients?q=...` y se muestran sugerencias con nombre y teléfono;
seleccionar una sugerencia filtra la tabla a ese paciente (y reinicia a página 1); limpiar
el input restaura la lista completa.

### (d) Controles de paginación livianos en la página

Se recomienda renderizar los controles (anterior / siguiente + "Página X de Y") directamente
en `app/(admin)/patients/page.tsx`, alrededor del `DataTable` existente.

*Tradeoff explícito*: mantener `DataTable` genérico evita refactorizar sus otros consumidores
y conserva el componente con una sola responsabilidad, pero los controles no quedan
reutilizables para otras vistas; extender `DataTable` con props opcionales de paginación
sería reutilizable, a costa de ampliar su API genérica y su superficie de pruebas. La
decisión queda documentada para `design.md`; en cualquier caso el contrato visible es el mismo.

### (e) Estado de búsqueda y paginación en la URL

`?q=` y `?page=` se sincronizan con `useSearchParams()` + `useRouter()`, siguiendo el
precedente de `app/(admin)/appointments/page.tsx:180-181,289`. Al montar, la URL inicial repuebla
el input y la página (deep-link); al interactuar, la URL se actualiza sin recargar la lista
desde cero. Cualquier detalle específico de esta versión de Next.js App Router (por ejemplo
requisitos de límites de `Suspense` o de client components) se verificará contra
`node_modules/next/dist/docs/` durante `design`/`apply`, ya que este repo puede diferir de
versiones anteriores.

### (f) Estado vacío

Se distingue "no hay pacientes registrados" (mensaje actual, `app/(admin)/patients/page.tsx:139`)
de "no hay resultados para esa búsqueda", con mensaje claro y la acción de limpiar la búsqueda.
El `ErrorState` (`:137`) y el `LoadingState` se conservan.

## Impacto y riesgos

### Áreas afectadas

| Área | Impacto | Descripción |
|---|---|---|
| `app/api/admin/patients/route.ts` | Modificado | GET acepta `q`, `page`, `pageSize`; respuesta aditiva con `total`/`totalPages`. |
| `src/lib/admin/patients.ts` | Modificado | Nueva lectura paginada con `count:'exact'` + `range`, combinable con búsqueda. |
| `app/(admin)/patients/page.tsx` | Modificado | Input con debounce, sugerencias, controles de paginación, URL sync y estado vacío. |
| `app/(admin)/patients/page.test.tsx` | Modificado | Pruebas de componente del nuevo flujo (debounce, selección, paginación, URL, vacío). |
| `app/api/admin/patients/route.test.ts` | Modificado | Pruebas del nuevo contrato y de la compatibilidad aditiva de `{ patients }`. |
| `src/lib/admin/__tests__/patients.test.ts` | Modificado | Pruebas de datos (Supabase local) para paginación combinada con búsqueda. |
| `src/components/admin/DataTable.tsx` | Conservado | Sigue genérico y sin props de paginación. |
| `src/components/booking/PatientSearch.tsx` | Conservado | Consume solo `{ patients }` a través del endpoint. |

### Riesgos

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| `searchPatients` interpola `q` sin escapar en el `.or(...)` de PostgREST (`src/lib/admin/patients.ts:59`): `%`, `_`, `,`, `(` o `)` pueden alterar el filtro o provocar error | Media | Definir en `design.md` el escape/sanitización de comodines y del separador de `.or()`, y cubrirlo con pruebas de datos. |
| `PatientSearch.tsx` recibe menos sugerencias si el default de `pageSize` aplica también a llamadas sin paginación explícita | Media | Mantener explícito el comportamiento de las llamadas sin parámetros (default alto o legacy) y verificarlo con la prueba existente de autocomplete. |
| Regresión en el CRUD o en el guard de autenticación | Baja | No se modifica `requireUser()` ni los handlers de escritura; pruebas de route existentes siguen verdes. |
| URL y estado del input se desincronizan (doble carga, `page` fuera de rango) | Media | `page` fuera de rango se normaliza contra `totalPages` con comportamiento probado; `q`/`page` son la única fuente de verdad al montar. |
| `DataTable` keya las filas por índice (`src/components/admin/DataTable.tsx:37`), lo que puede causar reconciliación confusa al cambiar de página | Baja | Aceptado por ahora; se documenta como limitación conocida y no se cambia el genérico en este alcance. |

## Plan de rollback

`git revert` del commit/PR en la rama (el cambio se entrega en commits acotados por unidad
de trabajo):

- **Sin migraciones ni cambios de datos**: no hay nada que revertir en Supabase; revertir el
  código no deja residuos.
- **Contrato aditivo**: la respuesta `{ patients, page, pageSize, total, totalPages }` conserva
  `patients`, por lo que revertir la UI y el endpoint deja a los consumidores actuales
  (`PatientSearch.tsx`) funcionando sin cambios.
- **Estado en URL**: revertir puede dejar `?q=`/`?page=` en enlaces ya compartidos; son
  parámetros ignorados por la versión anterior, sin efecto observable.
- Revertir en orden inverso (página → route → capa de datos) mantiene el árbol consistente
  en cada paso.

## Dependencias

- Patrón de paginación existente: `src/lib/wcc-conversations.ts:19`, `src/lib/wcc-knowledge.ts:27`.
- Patrón de debounce existente: `src/components/booking/PatientSearch.tsx:6,25-46`.
- Patrón de URL state existente: `app/(admin)/appointments/page.tsx:180-181,289`.
- Supabase local en marcha (`supabase start` + `supabase db reset`) para las suites de datos
  (`npm run test:local`), según `architecture.md` §9 y `openspec/changes/supabase-local-testing/`.
- Sin dependencias nuevas de npm y sin cambios en `supabase/migrations/`.

## Criterios de éxito

- [ ] `GET /api/admin/patients` acepta `q`, `page` y `pageSize` y responde
      `{ patients, page, pageSize, total, totalPages }` sin romper `{ patients }`.
- [ ] Búsqueda y paginación son combinables: `total`/`totalPages` corresponden a los
      resultados filtrados.
- [ ] La página filtra con debounce ~300 ms y mínimo 2 caracteres; seleccionar una
      sugerencia filtra la tabla a ese paciente y limpiar restaura la lista completa.
- [ ] Los controles anterior/siguiente muestran "Página X de Y" y respetan el total server-side.
- [ ] `?q=` y `?page=` restauran el estado al recargar o abrir un enlace compartido.
- [ ] Estado vacío claro cuando la búsqueda no tiene resultados, distinto del estado sin pacientes.
- [ ] El CRUD, el guard `requireUser()` y `PatientSearch.tsx` siguen funcionando sin cambios.
