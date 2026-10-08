# Diseño: Búsqueda con autocomplete y paginación en el listado de pacientes

Change: `patient-list-search-pagination` (issue #167)
Capacidades: `admin-patients-api`, `admin-patients-ui`

## Enfoque técnico

Paginación y búsqueda del **lado del servidor** en la capa de datos, reutilizando el
patrón ya probado en el repo (`src/lib/wcc-conversations.ts:19`,
`src/lib/wcc-knowledge.ts:27`: `count:'exact'` + `range(from, to)`), expuestas por el
endpoint existente con una **respuesta aditiva** (`{ patients, page, pageSize, total,
totalPages }`) que conserva `patients` para no romper a los consumidores actuales.
La vista `app/(admin)/patients/page.tsx` compone el input con debounce, el dropdown
de sugerencias, los controles de paginación y el estado vacío diferenciado; `DataTable`
y `PatientSearch.tsx` **no se modifican**. El backend sigue siendo el que valida y
ejecuta (OpenSpec `rules.design`): el cliente solo propone `q`, `page` y `pageSize`.

## Decisiones de arquitectura

| # | Decisión | Elección | Alternativas y razón |
|---|---|---|---|
| 1 | Lectura paginada | Nueva función `listPatientsPage({ q, page, pageSize })` en `src/lib/admin/patients.ts`, que reutiliza `SELECT_COLUMNS` (`:15`) y el patrón WCC. Devuelve `{ patients, page, pageSize, totalCount, totalPages }`; el route mapea `totalCount` → `total`. | El `select` sin `range` de `listPatients()` (`:68`) no escala; duplicar la consulta en el route mezclaría capas. |
| 1b | Funciones existentes | Se **conservan** `listPatients()` (`:68`) y `searchPatients()` (`:70`). El route deja de invocarlas. | Eliminarlas obligaría a borrar cobertura de datos existente y ampliaría el diff sin beneficio. `knip` no las marca como muertas porque los archivos de prueba de Vitest son entry points (`knip.json` con `project: src/**`). |
| 2 | Escape de `.or()` | Helper puro exportado `escapePostgrestIlikeTerm(term)` en `src/lib/admin/patients.ts`, usado por `listPatientsPage` y `searchPatients`. Cita el valor con `"` y escapa `\`, `"`, `%` y `_`. | Hoy `:70` interpola `q` crudo en `.or(...)`: `,`, `(`, `)`, `"` alteran la expresión y `%`/`_` amplían la coincidencia. Rechazar caracteres rompería búsquedas legítimas; escapar preserva la semántica "substring literal" y cumple "ninguna `q` produce 500". |
| 3 | Contrato del route | `app/api/admin/patients/route.ts` parsea defensivamente y responde aditivo. `handleAdminRequest`/`requireUser` intactos. | Mantener el guard igual conserva `401 { error: "unauthorized" }` y el contrato de escritura. |
| 4 | Composición de UI | Input + dropdown + controles de paginación **inline** en `app/(admin)/patients/page.tsx`; `DataTable` permanece genérico. | Extraer un hook compartido agrega superficie sin un segundo consumidor; extender `DataTable` con props de paginación contradice la propuesta. Reuse value nulo hoy. |
| 4b | Keying de `DataTable` | Se **deja** `key={rowIndex}` (`src/components/admin/DataTable.tsx:37`). | El componente es genérico (`T` sin `id`) y no guarda estado por fila; cambiar la key exigiría un prop `rowKey` y tocar su API. Limitación aceptada y documentada en la propuesta. |
| 5 | Sync de URL | Leer `useSearchParams()` como fuente inicial (deep-link) y escribir con `router.replace` desde un efecto con guard de redundancia. `page` vuelve a 1 al cambiar la búsqueda efectiva. | `push` ensuciaría el historial en cada tecla; el precedente `app/(admin)/appointments/page.tsx:180,289` usa `useSearchParams` + `replace`. |
| 6 | Modelo de estado | Un solo fetch de lista por `(búsqueda efectiva, page)`; las sugerencias se derivan de esa misma respuesta. | Evita un segundo request de sugerencias y mantiene una única fuente de verdad; el tope de sugerencias queda acotado por `pageSize` (20). |
| 7 | Pruebas | Datos en `src/lib/admin/__tests__/patients.test.ts` (Supabase local) + helper puro sin BD; contrato en `app/api/admin/patients/route.test.ts`; UI en `app/(admin)/patients/page.test.tsx`. | El patrón de handler delgado ya existe (`route.test.ts` llama `GET(Request)` y mockea la capa de datos); no se inventa infraestructura. |
| 8 | Rollback | Revert único; contrato aditivo y sin migraciones. | No hay residuo en Supabase; `?q=`/`?page=` son ignorados por la versión anterior. |

### Decisión 2 — estrategia exacta de escape (crítica)

`searchPatients` (`src/lib/admin/patients.ts:70`) construye hoy:

```ts
.or(`full_name.ilike.%${trimmed}%,phone_e164.ilike.%${trimmed}%,email.ilike.%${trimmed}%`)
```

Un `q` con `,`, `(`, `)` corta o reordena la lista de condiciones; `%` y `_` se
interpretan como comodines `LIKE`. Estrategia elegida:

```ts
// src/lib/admin/patients.ts — helper puro, exportado para prueba unitaria.
// Devuelve el valor citado y con patrón literal: `"%término%"`
// [ENMIENDA por evidencia local, apply unidad 1]: el borrador original usaba una
// sola barra invertida; el PostgREST local demostró que des-escapa un nivel
// dentro del valor citado (q='100%' con `\%` seguía devolviendo coincidencias
// comodín). La estrategia vigente aplica DOS niveles: payload LIKE (`\%`, `\_`,
// `\\`) y duplicación de barras para el valor citado (`\\` → `\\\\`, comilla como
// `\\"`). Ver `escapePostgrestIlikeTerm` implementado y sus pruebas.
export function escapePostgrestIlikeTerm(value: string): string {
  const literalLike = value
    .replace(/\\/g, '\\\\') // barra invertida literal (nivel LIKE)
    .replace(/%/g, '\\%')   // comodín LIKE → literal
    .replace(/_/g, '\\_');  // comodín LIKE → literal
  const forQuotedValue = literalLike
    .replace(/\\/g, '\\\\') // PostgREST des-escapa un nivel dentro de comillas
    .replace(/"/g, '\\"');  // comilla doble: cierre del valor citado de PostgREST
  return `"%${forQuotedValue}%"`;  // `"` protege `,`, `(`, `)` del separador de `.or()`
}
}
```

Filtro resultante (idéntico en `listPatientsPage` y `searchPatients`):

```ts
.or(
  `full_name.ilike.${escapePostgrestIlikeTerm(term)},` +
  `phone_e164.ilike.${escapePostgrestIlikeTerm(term)},` +
  `email.ilike.${escapePostgrestIlikeTerm(term)}`
)
```

- Si `term` es vacío tras `trim()`, **no se aplica `.or()`** (consulta sin filtro).
- Comportamiento unitario verificable: `escapePostgrestIlikeTerm('50%')` → `"%50\%%"`;
  `escapePostgrestIlikeTerm('a,b')` → `"%a,b%"` (la coma queda citada);
  `escapePostgrestIlikeTerm('x"y')` → `"%x\"y%"`.
- Si la evidencia local de `apply` mostrara que PostgREST no acepta `\"`, el fallback
  acotado es **neutralizar** `"` (sustituirla por espacio) antes de citar: sigue
  devolviendo `200` sin 500. No se rechaza la petición.

### Decisión 1 — contrato de la capa de datos

```ts
// src/lib/admin/patients.ts
export const PATIENTS_DEFAULT_PAGE = 1;
export const PATIENTS_DEFAULT_PAGE_SIZE = 20;
export const PATIENTS_MAX_PAGE_SIZE = 100;

export type PatientsPage = {
  patients: Patient[];
  page: number;
  pageSize: number;
  totalCount: number; // el route lo expone como `total`
  totalPages: number; // mínimo 1
};

export function normalizePatientsPagination(page: unknown, pageSize: unknown) {
  // entero > 0 o default; pageSize saturado a PATIENTS_MAX_PAGE_SIZE
}

export async function listPatientsPage(
  input: { q?: string; page?: number; pageSize?: number } = {}
): Promise<PatientsPage>;
```

Implementación (esquema): normaliza `page`/`pageSize`, calcula
`from = (page - 1) * pageSize`, aplica el `.or()` de la Decisión 2 **antes** de
`count` y `range`, y ordena `.order('created_at', { ascending: false })` con
`.order('id', { ascending: false })` como desempate para que la paginación sea
estable entre páginas. `totalCount = count ?? 0` y
`totalPages = Math.max(1, Math.ceil(totalCount / pageSize))`. Una `page` fuera de
rango devuelve `patients: []` con `total`/`totalPages` reales (lo exige el spec de
API); la normalización de la UI ocurre en el cliente (Decisión 5/6).

> **Enmienda por evidencia (apply unidad 1):** PostgREST responde `416` con
> `code: "PGRST103"` y `count: null` cuando el `range()` excede el total de filas.
> `listPatientsPage` detecta ese código y hace un segundo query con
> `select(SELECT_COLUMNS, { count: 'exact', head: true }).range(0, 0)` para
> obtener el total real sin filas, devolviendo `patients: []` con metadatos
> correctos (respuesta `200`).

### Decisión 3 — parsing defensivo y respuesta del route

En `app/api/admin/patients/route.ts` (se conservan `handleAdminRequest`,
`requireUser`, `POST` y `parseJsonBody`):

```ts
const q = (searchParams.get('q') ?? '').trim();
const { page, pageSize } = normalizePatientsPagination(
  searchParams.get('page'),
  searchParams.get('pageSize')
);
const result = await listPatientsPage({ q, page, pageSize });
return Response.json({
  patients: result.patients,
  page: result.page,
  pageSize: result.pageSize,
  total: result.totalCount,
  totalPages: result.totalPages,
});
```

`normalizePatientsPagination` usa `Number(value)` + `Number.isInteger(n) && n > 0`;
`null`, `''`, `'abc'`, `0`, `-3`, `1.5` caen a los defaults; `pageSize > 100` se
satura a 100. `q` de solo espacios colapsa a `''`.

### Decisión 5 — URL y normalización de página

- Al montar: `useState` inicial desde `searchParams.get('q')` y
  `searchParams.get('page')` normalizado por `normalizePatientsPagination`.
- Efecto de sync: reconstruye `URLSearchParams`; pone `q` solo si hay búsqueda
  efectiva (≥ 2 caracteres) y `page` solo si `page > 1`; si el string difiere del
  actual, `router.replace('/patients?' + next)` (o `'/patients'` si queda vacío). El
  guard de comparación evita bucles con `searchParams`.
- Normalización de página fuera de rango: cuando la respuesta trae
  `page > totalPages`, el efecto de fetch hace `setPage(totalPages)`, que provoca un
  único refetch y termina.
- **Prerrequisito de `apply`**: el worktree no tiene `node_modules`; tras
  `npm install`, `apply` MUST leer la guía de `node_modules/next/dist/docs/`
  correspondiente a `useSearchParams`/límite SSR antes de codificar (regla
  `AGENTS.md`). El precedente compilable es
  `app/(admin)/appointments/page.tsx:5,180` (misma versión Next 15.5.24,
  `useSearchParams` en página cliente sin `Suspense`).

### Decisión 6 — modelo de estado y efectos (esquema)

En `app/(admin)/patients/page.tsx`:

```ts
const pageSize = PATIENTS_DEFAULT_PAGE_SIZE; // 20
const [query, setQuery] = useState(initialQuery);              // texto del input
const [debouncedQuery, setDebouncedQuery] = useState(initialQuery.trim());
const [page, setPage] = useState(initialPage);
const [patients, setPatients] = useState<Patient[]>([]);       // página actual
const [suggestions, setSuggestions] = useState<Patient[]>([]); // derivadas
const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
const [total, setTotal] = useState(0);
const [totalPages, setTotalPages] = useState(1);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);
const [reloadToken, setReloadToken] = useState(0);             // reintento
```

- **Efecto debounce** (`[query]`): a los 300 ms (`DEBOUNCE_MS = 300`, patrón
  `src/components/booking/PatientSearch.tsx:6,25-48`) fija `debouncedQuery` y
  reinicia `page` a 1 si el texto efectivo cambió. `clearTimeout` en el cleanup.
- **Efecto fetch** (`[debouncedQuery, page, reloadToken]`): calcula
  `activeQ = debouncedQuery.length >= 2 ? debouncedQuery : ''` (por debajo del
  mínimo **no** se filtra ni se piden sugerencias; la tabla muestra la lista
  completa en página 1), arma
  `/api/admin/patients?q=...&page=...&pageSize=...`, y setea `patients`, `total`,
  `totalPages`, `suggestions = activeQ ? patients : []`; normaliza página fuera de
  rango. Bandera `cancelled` para descartar respuestas viejas.
- Filas: `const rows = selectedPatient ? [selectedPatient] : patients;`.
- **Selección**: fija `selectedPatient`, `query`/`debouncedQuery` con el nombre,
  limpia sugerencias y vuelve a `page = 1`.
- **Limpiar** (inmediato, sin debounce): `query = ''`, `debouncedQuery = ''`,
  `selectedPatient = null`, `suggestions = []`, `page = 1`; el efecto de URL borra
  `q` y `page`.
- **Paginación**: controles `Anterior`/`Siguiente` + `Página {page} de {totalPages}`
  renderizados en la página alrededor de `DataTable`; deshabilitados en los extremos
  (`page <= 1`, `page >= totalPages`) y ocultos mientras hay `selectedPatient` (la
  selección es de un solo resultado).
- **Vacío**: `rows.length === 0 && activeQ` → `EmptyState` "Sin coincidencias para
  esta búsqueda" + acción de limpiar; `rows.length === 0 && !activeQ` → `EmptyState`
  vigente "No hay pacientes registrados." (`app/(admin)/patients/page.tsx:139`).
- **Carga/error**: `loading` → `LoadingState` antes del vacío; `error` → `ErrorState`
  con `onRetry={() => setReloadToken((t) => t + 1)}`, que repite la misma
  `activeQ`/`page`.

## Flujo de datos

```text
/patients?q=ana&page=2
  -> page.tsx lee useSearchParams (deep-link, una vez)
  -> debounce 300 ms -> debouncedQuery
  -> fetch /api/admin/patients?q=ana&page=2&pageSize=20
       -> route.ts: trim(q) + normalizePatientsPagination
          -> listPatientsPage: .or(ilike escapado) + count:'exact' + range
             -> { patients, page, pageSize, totalCount, totalPages }
       -> Response.json aditivo { patients, page, pageSize, total, totalPages }
  -> page.tsx: tabla + sugerencias + controles + URL replace (guard)
```

## Cambios de archivos

| Archivo | Acción | Descripción |
|---|---|---|
| `src/lib/admin/patients.ts` | Modificar | `listPatientsPage`, `normalizePatientsPagination`, `escapePostgrestIlikeTerm`, constantes de paginación; `searchPatients` reusa el escape. `listPatients`/`searchPatients` se conservan. |
| `app/api/admin/patients/route.ts` | Modificar | `GET` parsea `q`/`page`/`pageSize` y responde la forma aditiva. Guard y `POST` intactos. |
| `app/(admin)/patients/page.tsx` | Modificar | Input + debounce, dropdown de sugerencias, controles de paginación, URL sync, vacío diferenciado, carga/error. Composición inline. |
| `app/api/admin/patients/route.test.ts` | Modificar | Mock pasa a `listPatientsPage`; se prueban defaults, límites, trim de `q` y forma aditiva. |
| `src/lib/admin/__tests__/patients.test.ts` | Modificar | `describe` puro (sin BD) para escape/normalización + casos de paginación y búsqueda contra Supabase local. |
| `app/(admin)/patients/page.test.tsx` | Modificar | Mocks `next/navigation` + fetch; debounce, selección, limpiar, paginación, URL, vacíos, error/reintento. El mock actual compara la URL exacta `'/api/admin/patients'` y deberá aceptar query string. |
| `src/components/admin/DataTable.tsx` | Conservado | Sigue genérico y sin props de paginación. |
| `src/components/booking/PatientSearch.tsx` | Conservado | Solo lee `data.patients`; la respuesta es aditiva. |

Sin archivos nuevos ni migraciones.

## Estrategia de pruebas

Orden TDD `apply` (RED → GREEN → TRIANGULATE → REFACTOR). `npm run test` (Vitest)
corre la suite por defecto y **omite** las suites de Supabase local; por eso la
cobertura de CI combina helper puro + route + componente, y la de datos corre con
`npm run test:local` previo `supabase start` + `supabase db reset` (`AGENTS.md`).

| Capa / archivo | Cobertura RED |
|---|---|
| `src/lib/admin/__tests__/patients.test.ts` (top-level, sin BD) | `escapePostgrestIlikeTerm` con `%`, `_`, `,`, `(`, `)`, `"`, `\`; `normalizePatientsPagination` con `null`, `''`, `'abc'`, `0`, `-1`, `1.5`, `'101'` → defaults/saturación. |
| `src/lib/admin/__tests__/patients.test.ts` (`describe` local) | `listPatientsPage` default (1/20); aritmética de páginas (3 filas, `pageSize 2` → 2/1); orden estable y sin repetidos; búsqueda+paginación combinadas (`total` filtrado); búsqueda sin coincidencias (`total 0`, `totalPages 1`); página fuera de rango (`patients []`, metadatos reales); `q` con caracteres reservados no lanza y no hace match accidental (`%`/`_` literales). |
| `app/api/admin/patients/route.test.ts` | `q` con trim y vacío; `page`/`pageSize` inválidos → 1/20; `pageSize > 100` → 100; forma `{ patients, page, pageSize, total, totalPages }`; `401` sin sesión sigue igual y no consulta datos; `POST` sin cambios. |
| `app/(admin)/patients/page.test.tsx` | Con `vi.useFakeTimers({ shouldAdvanceTime: true })` (patrón `src/components/booking/__tests__/PatientSearch.test.tsx:12-15`) y mock de `next/navigation` (patrón `app/(admin)/appointments/page.test.tsx:6-15`): 1 carácter no consulta filtro ni muestra sugerencias; ≥ 2 consulta una vez tras 300 ms y muestra nombre+teléfono; seleccionar deja solo ese paciente y vuelve a página 1; limpiar restaura la lista y borra `q`; `Página X de Y` y deshabilitados en extremos; siguiente solicita `page=2`; URL inicial `?q=&page=` repuebla input y filas; `page` fuera de rango se normaliza sin error; vacío por búsqueda vs. sin pacientes; error + reintento repite la consulta. |

Escenario RED de datos (borde crítico):

- GIVEN un paciente llamado `Ana 100%` y otro `Ana 100X`
- WHEN se busca `q=100%` en `listPatientsPage`
- THEN MUST devolver solo al primero (el `%` es literal, no comodín)
- AND `q='a,b'`, `q='('` o `q='x"y'` MUST resolver `200` sin error interno

## Migración, despliegue y reversión

Sin migraciones ni cambios de datos. Desplegar en un solo cambio desplegable; el
contrato aditivo permite desplegar route y UI juntos sin ventana de incompatibilidad
(`PatientSearch.tsx` sigue leyendo `patients`). Reversión: `git revert` por unidad de
trabajo en orden inverso (página → route → capa de datos); los enlaces que conserven
`?q=`/`?page=` son ignorados por la versión anterior, sin efecto observable.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| El citado con `"` y el escape `\"` de PostgREST no se comporten como se documenta. | Prueba de datos local con `,`, `(`, `"` y `%` en `apply`; fallback acotado: neutralizar `"` antes de citar (siempre `200`). |
| `listPatients`/`searchPatients` queden sin consumidor de producción y `knip` (CI) los marque. | Se conservan con cobertura de pruebas; Vitest es entry point de `knip`. Verificar con `npm run knip` en `apply` si está autorizado. |
| `PatientSearch.tsx` recibe como máximo 20 sugerencias por el default del route. | Aceptado y verificado con su prueba existente; no se rompe su contrato `{ patients }`. |
| `DataTable` keya por índice (`:37`) y puede reconciliar filas al cambiar de página. | Sin estado por fila; limitación aceptada y documentada. No se modifica el genérico. |
| `useSearchParams` cambie requisitos de boundary en Next 15.5.24. | Prerrequisito de `apply`: leer `node_modules/next/dist/docs/` tras `npm install`; precedente compilable en `app/(admin)/appointments/page.tsx`. |
| `page.test.tsx` y `route.test.ts` fallan por mocks desactualizados. | Se actualizan en `apply` como parte del work unit (mismo cambio que código). |

## Preguntas abiertas

Ninguna. El único pendiente es un prerrequisito de verificación de `apply` (leer la
documentación de Next.js en `node_modules`), no una decisión de diseño abierta.
