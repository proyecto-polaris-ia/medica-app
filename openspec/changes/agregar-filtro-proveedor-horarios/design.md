# Diseño: Filtro por proveedor en la lista de horarios

## Contexto y objetivos

Este diseño implementa los requirements **ADDED** del delta
`openspec/changes/agregar-filtro-proveedor-horarios/specs/admin-panel/spec.md` y
resuelve el issue
[#170](https://github.com/proyecto-polaris-ia/medica-app/issues/170).

Estado actual (anclas verificadas en este worktree):

- `app/(admin)/business-hours/page.tsx` mantiene el estado de la vista en
  `:27-34` (`hours`, `providers`, `loading`, `error`, `isModalOpen`, `editing`,
  `form`, `submitting`).
- `loadData()` (`:36-55`) pide `/api/admin/business-hours` y `/api/admin/providers`
  en paralelo y guarda `hours` y `providers`; `handleSubmit` (`:84-109`) y
  `handleDelete` (`:111-122`) vuelven a llamar `loadData()` tras cada operación.
- El render (`:128+`) usa `LoadingState` (`:140`), `ErrorState` (`:141`), un
  `EmptyState` con "No hay horarios registrados." (`:142-144`) y un `DataTable`
  (`:146-156`) que traduce el proveedor con `providerName(id)` (`:124-126`).
- El `FormModal` (`:159-183`) tiene su propio `<select>` de proveedores, distinto
  del filtro.
- Hoy **no** hay panel de filtros ni lectura de la URL en esta página.
- Patrón a reutilizar: el panel de filtros de citas
  (`app/(admin)/appointments/page.tsx:813-877`), su botón "Limpiar filtros"
  (`:817-826`), su `<select>` de proveedor con "Todos" (`:854-877`), su lectura
  única de la URL en el `useState` (`:305-306`, `:342`) y su helper determinista
  de URL con `router.replace` (`:220-236`).

Objetivos técnicos:

- **Filtrar en cliente** el arreglo `hours` sin tocar el contrato de
  `GET /api/admin/business-hours`.
- **Mantener el filtro** a través de las recargas que ya disparan la edición y la
  eliminación.
- **Sincronizar con la URL** (`?providerId=`) de forma determinista y sin
  recargar.
- **Cero dependencias nuevas**, sin migraciones y sin tocar `travelhub-app`.

---

## 1. Decisiones clave

### 1.1 D1 — Filtrado client-side, no server-side

El universo a filtrar es pequeño (7 días × N proveedores) y el catálogo completo
ya se carga en `loadData()` (`app/(admin)/business-hours/page.tsx:36-55`). El
filtro se resuelve con una derivación en memoria:

```tsx
const filteredHours = providerFilter
  ? hours.filter((h) => h.providerId === providerFilter)
  : hours;
```

El `DataTable` (`:146-156`) recibe `filteredHours` en lugar de `hours`.

**Endpoints intactos.** No se agregan parámetros a
`app/api/admin/business-hours/route.ts` ni a `src/lib/admin/business-hours.ts`.

**Alternativas rechazadas:**

- **Filtrar server-side con `?providerId=` en el endpoint.** Amplía el contrato y
  la capa de datos por un filtro de UI sobre un conjunto diminuto; además forzaría
  un refetch por cada cambio de selección.
- **Reutilizar el patrón server-side de citas.** La lista de citas sí pagina
  server-side, pero su volumen es varios órdenes de magnitud mayor; aquí no
  aplica.

### 1.2 D2 — `<select>` nativo, no autocompletado

El filtro es un `<select>` poblado con `providers` (ya cargado) más una opción
`<option value="">Todos</option>`. El número de proveedores es pequeño y estable,
así que un control nativo cubre el caso sin código de teclado, sin debounce y sin
consultas adicionales.

**Alternativa rechazada:** reutilizar el autocompletado de pacientes
(`src/components/admin/PatientSearchInput.tsx`). Resuelve un catálogo grande y
variable; aquí sería complejidad sin beneficio.

### 1.3 D3 — Lectura única de la URL y reescritura con `router.replace`

`?providerId=` se lee **una sola vez** al inicializar el estado, sin `useEffect` de
sincronía:

```tsx
const searchParams = useSearchParams();
const router = useRouter();
const [providerFilter, setProviderFilter] = useState(
  () => searchParams?.get('providerId') ?? ''
);
// El catálogo llega async: un id que no exista en `providers` cae en "Todos".
const activeProviderFilter = providers.some((p) => p.id === providerFilter)
  ? providerFilter
  : '';
```

El `<select>` usa `value={activeProviderFilter}` y el filtrado usa el mismo valor,
así que un `providerId` de un enlace viejo (proveedor dado de baja) queda visible
como "Todos" y no filtra. El handler de selección reescribe la URL con un
helper determinista:

```tsx
function businessHoursUrl(providerId: string): string {
  return providerId
    ? `/business-hours?providerId=${encodeURIComponent(providerId)}`
    : '/business-hours';
}
```

y llama `router.replace(businessHoursUrl(next))` (`router.replace` no recarga ni
apila historial, igual que `app/(admin)/appointments/page.tsx:220-236`).

**Alternativas rechazadas:** `router.push` (ensucia el historial con cada
selección) y un `useEffect` que refleje el estado a la URL (propenso a bucles y a
pisar el estado desde el que se lee).

### 1.4 D4 — El estado del filtro es independiente de los datos

`providerFilter` vive en su propio `useState`, separado del arreglo `hours`. Como
`handleSubmit` (`:84-109`) y `handleDelete` (`:111-122`) solo reemplazan `hours` vía
`loadData()`, el filtro sobrevive sin lógica adicional. Si el filtro se derivara
de los datos (por ejemplo, "el proveedor de la primera fila"), cada recarga lo
perdería.

### 1.5 D5 — Copy y distinción del estado vacío

La tabla se renderiza solo cuando `filteredHours.length > 0`. El mensaje depende
de si hay filtro:

- con proveedor seleccionado y cero filas:
  "No hay horarios registrados para este proveedor.";
- sin filtro y cero filas en total: "No hay horarios registrados." (`:143`).

Se reutiliza `src/components/admin/EmptyState.tsx` tal cual (su prop
`message?: string`), sin modificar el componente.

### 1.6 D6 — Pruebas

Se crea `app/(admin)/business-hours/page.test.tsx` (no existe hoy), colocalizado y
en el proyecto `jsdom` de `vitest.config.ts`, con Testing Library + `userEvent` y
el patrón de `app/(admin)/appointments/page.test.tsx` para mockear
`next/navigation` (`useSearchParams`/`useRouter`) y las dos peticiones de
`loadData()` (`/api/admin/business-hours` y `/api/admin/providers`). TDD
RED→GREEN + triangulación de bordes (ver §4).

**Alternativa rechazada:** no escribir suite por tratarse de "solo UI". El
`strict_tdd: true` de `openspec/config.yaml` y el contrato observable (filtro,
limpieza, URL, persistencia) exigen pruebas.

---

## 2. Enfoque técnico

Archivo único de producción: `app/(admin)/business-hours/page.tsx`.

1. **Imports y helper de URL.** Se agrega `useRouter`/`useSearchParams` de
   `next/navigation` y el helper puro `businessHoursUrl(providerId)`.
2. **Estado del filtro.** `const [providerFilter, setProviderFilter] = useState('')`,
   inicializado de forma diferida desde `searchParams?.get('providerId')`, más la
   derivación `activeProviderFilter` (§1.3) que valida contra `providers`.
3. **Handler.** `handleProviderFilterChange(value: string)` fija el estado y
   escribe la URL con `router.replace(businessHoursUrl(value))`.
4. **Derivación.** `filteredHours` como en §1.1, usando `activeProviderFilter`.
5. **Panel de filtros.** Bloque nuevo arriba del `DataTable`, con las clases del
   panel de citas:

```tsx
<div className="mb-4 rounded-lg border bg-white p-4 shadow-sm">
  <div className="mb-3 flex items-center justify-between">
    <h2 className="text-sm font-semibold text-gray-700">Filtros</h2>
    {activeProviderFilter && (
      <button
        onClick={() => handleProviderFilterChange('')}
        className="text-sm text-blue-600 hover:text-blue-800"
      >
        Limpiar filtro
      </button>
    )}
  </div>
  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
    <div>
      <label
        htmlFor="filter-provider"
        className="block text-xs font-medium text-gray-600"
      >
        Proveedor
      </label>
      <select
        id="filter-provider"
        value={activeProviderFilter}
        onChange={(e) => handleProviderFilterChange(e.target.value)}
        className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
      >
        <option value="">Todos</option>
        {providers.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
    </div>
  </div>
</div>
```

6. **Estados.** `LoadingState`/`ErrorState` sin cambios; `EmptyState` con el
   mensaje condicional (§1.5); `DataTable rows={filteredHours}`.
7. **Sin cambios colaterales.** `loadData()` (`:36-55`), `handleSubmit`
   (`:84-109`), `handleDelete` (`:111-122`), `providerName` (`:124-126`) y el
   `FormModal` (`:159-183`) quedan iguales.

---

## 3. Decisiones (numeradas)

| # | Decisión | Valor | Alternativas / razón |
|---|---|---|---|
| D1 | Alcance del filtrado | Client-side sobre `hours`; endpoints y capa de datos intactos | Conjunto pequeño; evita ampliar el contrato y refetch por selección. |
| D2 | Control de UI | `<select>` nativo con opción "Todos" de valor vacío | Pocos proveedores; accesible y sin código extra. Autocompletado descartado. |
| D3 | URL | Lectura única en el `useState` + `router.replace` con helper determinista | Enlazable sin recargar ni ensuciar historial; menos frágil que un `useEffect` de sincronía. |
| D4 | Persistencia | `providerFilter` en estado propio, separado de `hours` | Sobrevive a `loadData()` tras editar/eliminar sin lógica adicional. |
| D5 | Estado vacío | `EmptyState` con mensaje propio del proveedor cuando hay filtro y cero filas; mensaje general solo sin filtro | Distingue "proveedor sin horarios" de "sin horarios capturados"; reutiliza `EmptyState`. |
| D6 | Pruebas | Nueva suite `app/(admin)/business-hours/page.test.tsx`, Vitest `jsdom` + RTL + `userEvent`, TDD | No existe suite de la página; `strict_tdd: true`; contrato observable. |

---

## 4. Estrategia de pruebas

### 4.1 Suite — `app/(admin)/business-hours/page.test.tsx`

- Render base: panel de filtros con "Filtros", selector de proveedores con valor
  "Todos" y tabla con todos los horarios.
- Filtrado: seleccionar un proveedor muestra solo sus filas; "Todos" restaura la
  lista completa; el cambio de selección no dispara un nuevo fetch.
- Limpieza: "Limpiar filtro" no existe sin filtro, aparece con filtro y devuelve a
  "Todos" sin alterar los datos.
- URL: seleccionar escribe `?providerId=` con `router.replace`; el deep link
  inicializa el filtro; sin parámetro se muestran todos; `providerId` desconocido
  cae en "Todos".
- Persistencia: editar y eliminar recargan datos y conservan el filtro.
- Estado vacío: proveedor sin horarios muestra el mensaje propio; lista sin
  horarios muestra el mensaje general.

### 4.2 Invariantes

- `app/api/admin/business-hours/route.ts` y `src/lib/admin/business-hours.ts` sin
  cambios (`git diff --stat` vacío).
- `src/components/admin/EmptyState.tsx`, `DataTable.tsx`, `FormModal.tsx`,
  `LoadingState.tsx`, `ErrorState.tsx` y `Pagination.tsx` sin cambios.
- `package.json` sin cambios.

### 4.3 Comandos de validación

```bash
npx vitest run "app/(admin)/business-hours/page.test.tsx"
npm test                 # suite unitaria completa
npx tsc --noEmit         # typecheck
npm run build            # build de Next.js
```

No se requiere `npm run test:local` (no hay cambios en la capa de datos).

---

## 5. Rollback

Sin migraciones, sin escrituras y sin dependencias, el rollback es el del
`proposal.md`: revertir el commit de `app/(admin)/business-hours/page.tsx`
restaura la tabla completa sin filtro ni URL; eliminar
`app/(admin)/business-hours/page.test.tsx` no deja consumidores huérfanos. Los
endpoints y `package.json` no cambiaron.
