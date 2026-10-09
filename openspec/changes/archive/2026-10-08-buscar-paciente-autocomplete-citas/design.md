# Diseño: Búsqueda de paciente con autocompletado en el filtro de la lista de citas

## Contexto y objetivos

Este diseño implementa los requirements **ADDED** del delta
`openspec/changes/buscar-paciente-autocomplete-citas/specs/admin-appointments/spec.md`
y resuelve el issue
[#169](https://github.com/proyecto-polaris-ia/medica-app/issues/169).

Estado actual (anclas verificadas en este worktree):

- El filtro de paciente de la lista es un `<select>` nativo poblado con el
  catálogo completo: `app/(admin)/appointments/page.tsx:750-765` itera
  `patients.map((p) => <option …>)`. El estado es
  `const [patientFilter, setPatientFilter] = useState('')`
  (`app/(admin)/appointments/page.tsx:298`) y el handler
  `handlePatientFilterChange(value: string)` (`:630-633`) aplica el valor y llama
  `resetPageForFilterChange()` (`:604-610`), que devuelve la lista a la página 1.
- `listAppointmentsRequestUrl` (`app/(admin)/appointments/page.tsx:246-270`) ya
  traduce el filtro a `patientId` (`:260`); el endpoint de citas en modo lista ya
  acepta ese filtro.
- El catálogo se carga completo con `fetch('/api/admin/patients')` dentro de
  `loadData` (`app/(admin)/appointments/page.tsx:453`), se mapea a
  `Reference { id, name: fullName }` (`:476-480`) y se guarda en `patients`
  (`:282`). Ese mismo arreglo alimenta el `<select>` del formulario de cita
  (`:1006-1019`) y `refName()` (`:592`).
- "Limpiar filtros" (`clearFilters`, `:660-667`) resetea los cinco filtros y
  `hasActiveFilters` (`:669`) decide el estado vacío de la lista.
- El endpoint de pacientes `GET /api/admin/patients` (`app/api/admin/patients/route.ts:11-31`)
  exige sesión (`requireUser()`), toma `q` con `trim` y responde
  `{ patients: Patient[], page, pageSize, total, totalPages }` llamando a
  `listPatientsPage` (`src/lib/admin/patients.ts:158-185`), que busca por
  `full_name`/`phone_e164`/`email` con `ilike` OR y escapado de comodines
  (`src/lib/admin/patients.ts:104-128`). El tipo `Patient` está en
  `src/lib/admin/types.ts:3-20` (`id`, `fullName`, …).
- Patrón existente a adaptar (no a mover): `src/components/booking/PatientSearch.tsx`
  con su prueba `src/components/booking/__tests__/PatientSearch.test.tsx`
  (Vitest + Testing Library + `userEvent`, `vi.useFakeTimers({ shouldAdvanceTime: true })`
  para el debounce y `global.fetch = vi.fn()`).
- Suite de la página a actualizar: `app/(admin)/appointments/page.test.tsx`
  (2046 líneas) usa índices fijos de combobox —`:904`, `:1534`, `:1795-1802`,
  `:1848`, `:1988`— y mockea `/api/admin/patients` por igualdad exacta de URL
  (`:76`).
- Estilo del panel de filtros: input
  `mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm` y
  label `block text-xs font-medium text-gray-600`; las celdas viven en un grid
  `grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5`
  (`app/(admin)/appointments/page.tsx:732`).

Objetivos técnicos:

- **Reemplazar solo el control del filtro de paciente**, sin cambiar el contrato
  del endpoint de citas (`patientId`) ni el del endpoint de pacientes (`q`).
- **Encapsular la búsqueda en un componente reutilizable y controlado**, operable
  por teclado y accesible.
- **Mantener el comportamiento de filtrado y de paginación** ya especificado:
  aplicar el filtro y volver a la página 1.
- **Preservar el catálogo de pacientes del formulario** y no tocar el dominio de
  booking.
- **Cero dependencias nuevas** y sin tocar `travelhub-app`.

---

## 1. Decisiones clave

### 1.1 Componente nuevo, no una refactorización del de booking

`src/components/booking/PatientSearch.tsx` resuelve "buscar y emitir"
(`onSelect(patient)`), sin valor controlado, sin limpieza de selección, sin
navegación por teclado y con estado propio de resultados. El filtro de la lista
necesita además: valor seleccionado **controlado** (para que "Limpiar filtros"
pueda vaciarlo), limpieza explícita, teclado y resaltado.

Se crea por lo tanto `src/components/admin/PatientSearchInput.tsx`. El componente
de booking **queda intacto**: vive en otro dominio, tiene consumidores propios y su
prueba no se toca. La unificación de ambos (un solo buscador con contrato común)
se anota como follow-up, en línea con el trabajo previo de búsqueda de pacientes
(#167) — ver §7.

**Alternativas rechazadas:**

- **Mover/renombrar `PatientSearch.tsx` a `src/components/admin/`.** Toca el flujo
  de booking y sus pruebas; el riesgo supera el beneficio con un solo consumidor
  nuevo.
- **Envolver el componente de booking y añadir el ✕ y el teclado por fuera.**
  Ocultaría el patrón `combobox` y repartiría la accesibilidad entre dos archivos.
- **Seguir con un `<select>`.** Es el problema del issue: lista completa sin
  búsqueda.

### 1.2 Contrato del componente y estado en la página

El componente es **controlado** y su contrato es mínimo:

```tsx
export type PatientOption = { id: string; name: string };

type PatientSearchInputProps = {
  value: PatientOption | null;
  onChange: (selection: PatientOption | null) => void;
  label?: string;        // default 'Paciente'
  className?: string;    // para encajar en la celda del grid del panel
  minChars?: number;     // default 2
  debounceMs?: number;   // default 300
};
```

- El componente renderiza su propio `<label>` asociado al input (garantiza la
  asociación accesible) y la lista de sugerencias bajo el campo.
- La página guarda una sola pieza de estado:
  `const [patientFilter, setPatientFilter] = useState<PatientOption | null>(null)`.
  De ahí se derivan el `patientId` del request y la bandera de filtro activo; no
  se duplica el nombre en otro estado.
- `handlePatientFilterChange(selection: PatientOption | null)` reemplaza al
  handler de string y conserva la llamada a `resetPageForFilterChange()`
  (`:604-610`).
- `listAppointmentsRequestUrl` recibe `patientFilter: PatientOption | null` y
  emite `if (params.patientFilter) search.set('patientId', params.patientFilter.id)`
  (equivalente al `:260` actual).
- `hasActiveFilters` (`:669`) pasa a `Boolean(...)` explícito para no depender del
  `truthy` de un objeto.

**Sincronización externa ↔ interna.** El componente mantiene un `query` interno
(texto visible) y lo sincroniza con `value` con dos reglas:

1. Cuando el usuario selecciona, el componente **emite** la selección y actualiza
   su `query` en el mismo paso (`lastEmittedIdRef` = id emitido).
2. Efecto de sincronización: si el `value` que llega tiene el mismo `id` que el
   último emitido, no se toca el `query`; si difiere (por ejemplo, el padre limpió
   el filtro desde "Limpiar filtros"), se adopta el nuevo valor (`query = value?.name ?? ''`)
   y se cierra el panel.

Sin esta guardia, el efecto de sincronización competiría con el tecleo del usuario
o provocaría un ciclo padre↔hijo.

### 1.3 Búsqueda progresiva: umbral, debounce y descarte de respuestas obsoletas

- **Umbral:** `query.trim().length >= 2`. Por debajo: sin consulta, panel cerrado
  y sugerencias limpias.
- **Debounce:** `setTimeout(…, 300)`. Cada cambio de texto cancela el timer previo
  (`clearTimeout` en el cleanup del efecto), de modo que teclear seguido produce
  una sola petición con el texto final. Mismo valor que
  `src/components/booking/PatientSearch.tsx` (`DEBOUNCE_MS = 300`).
- **Descarte de respuestas obsoletas:** cada consulta crea un `AbortController`
  que se aborta en el cleanup; además se ignora cualquier respuesta cuyo
  `signal.aborted` sea verdadero. Esto va **más allá** del componente de booking,
  que solo cancela el timer y por lo tanto puede aplicar una respuesta vieja si
  llega tarde.
- **Al desmontar:** el cleanup aborta la petición en vuelo y cancela el timer; no
  se actualiza estado tras el desmontaje.
- **URL:** se conserva el formato vigente `GET /api/admin/patients?q=<termino>`
  con `encodeURIComponent`. No se agregan parámetros: la primera página del
  endpoint (default 20) es suficiente para un autocompletado (D12).

**Alternativas rechazadas:**

- **Consultar desde 1 carácter.** Dispara consultas demasiado amplias y contradictorias
  con el requisito del issue ("desde 2 caracteres").
- **Sin debounce (una consulta por tecla).** Tormenta de requests y parpadeo del
  panel.
- **Solo cancelar el timer.** No evita el caso de la respuesta que ya salió y
  regresa fuera de orden.

### 1.4 Panel de sugerencias: visibilidad, cierre, clic vs. blur y resaltado

- **Visibilidad:** el panel se renderiza **solo** si el campo tiene foco **y**
  `options.length > 0` **y** el texto alcanza el mínimo. Sin coincidencias no hay
  panel (el estado vacío de la lista sigue viviendo en la lista, no aquí).
- **Cierre:** al seleccionar (el componente limpia `options` y cierra), con
  `Escape`, y al perder el foco (`onBlur` cierra el panel).
- **Clic vs. blur:** las opciones usan
  `onMouseDown={(e) => e.preventDefault()}` para que el input no pierda el foco
  antes de que termine el clic; así `onBlur` no cancela la selección.
- **Resaltado:** helper puro
  `highlightSegments(name, term): Array<{ text: string; match: boolean }>` que
  compara en minúsculas con `indexOf`. Si el término no aparece literalmente en el
  nombre (coincidencia por teléfono o correo), devuelve un solo segmento sin
  resaltar. El nombre accesible de la opción se preserva segmentando el texto
  dentro del propio botón de la sugerencia (sin `title` ni `aria-hidden` en el
  nombre).
- **Carga y error:** `loading` y `error` se renderizan como texto auxiliar; el
  mensaje de error usa `role="status"`/`aria-live="polite"` y el error **no**
  deja el panel abierto con datos incompletos.
- **Techo de sugerencias:** las que devuelva la primera página del endpoint.

**Alternativas rechazadas:**

- **Mostrar siempre el panel al enfocar (con historial o todos los pacientes).**
  Repetiría el problema del `<select>`.
- **Resaltar con HTML (`dangerouslySetInnerHTML`).** Innecesario e inseguro;
  segmentar en elementos es seguro y testeable.
- **Cerrar con `onMouseLeave` en el panel.** Poco confiable con teclado.

### 1.5 Accesibilidad y navegación por teclado

Patrón `combobox` (WAI-ARIA 1.2) sobre HTML nativo:

- `input` con `role="combobox"`, `aria-expanded`, `aria-controls` apuntando al id
  de la lista, `aria-autocomplete="list"`, `aria-activedescendant` apuntando a la
  opción activa y `aria-labelledby` del label propio.
- Lista con `role="listbox"`; cada sugerencia es un `<button type="button">`
  dentro de un `<li role="option">` con `id` determinista
  (`option-${inputId}-${index}`) y `aria-selected`.
- Teclado (`onKeyDown`):
  - `ArrowDown`: si el panel está cerrado y hay opciones, lo abre con la primera
    activa; si está abierto, avanza `min(activeIndex + 1, options.length - 1)`.
  - `ArrowUp`: si no hay activa, activa la última; si no,
    `max(activeIndex - 1, 0)`.
  - `Enter`: si el panel está abierto y hay opción activa, selecciona; si no hay
    activa, no hace nada (no se llama `preventDefault` en ese caso).
  - `Escape`: cierra el panel sin cambiar la selección.
- **Sin ciclado** en los extremos (`↑`/`↓` no envuelven): el comportamiento es
  determinista y fácil de anunciar.

**Alternativas rechazadas:** navegación con ciclado; `tabIndex` manual en las
opciones (el `role="option"` + `aria-activedescendant` mantiene el foco en el
input y es el patrón estándar).

### 1.6 Limpieza y consistencia entre texto visible y filtro aplicado

- **✕ dentro del campo:** visible solo cuando `query` no está vacío; al activarlo
  limpia `query`, cierra el panel y emite `onChange(null)`.
- **Vaciar el texto:** cuando el usuario borra todo, `onChange(null)`.
- **Editar el texto después de una selección:** si `value` existe y el texto deja
  de ser igual a `value.name`, el componente emite `onChange(null)` antes de
  buscar. Así el filtro aplicado nunca corresponde a un paciente que ya no se ve
  en el campo.
- Todos los caminos de limpieza desembocan en `handlePatientFilterChange(null)`,
  que en la página equivale a `setPatientFilter(null)` + `resetPageForFilterChange()`
  (`:604-610`): el request deja de enviar `patientId` y la lista vuelve a la página 1.
- "Limpiar filtros" (`clearFilters`, `:660-667`) pasa a `setPatientFilter(null)` y
  el efecto de sincronización externa vacía el campo visible.

### 1.7 Integración con la página, la paginación y los filtros existentes

- El `<select>` de Paciente (`:750-765`) se reemplaza por
  `<PatientSearchInput value={patientFilter} onChange={handlePatientFilterChange} className="…" />`
  dentro de la misma celda del grid `lg:grid-cols-5` (`:732`), con las clases de
  input ya usadas en el panel.
- El resto del panel de filtros (servicio, proveedor, fecha desde/hasta) y
  "Limpiar filtros" no cambian de comportamiento.
- `loadData` (`:426-497`) y sus dependencias no cambian de forma: sigue
  reconstruyendo la URL con `listAppointmentsRequestUrl` y sigue guardando
  `appointments` + `pagination`.
- `resetPageForFilterChange` sigue siendo el único punto que reinicia la página, así
  que la relación con la paginación server-side (change
  `agregar-paginacion-citas`) se conserva sin tocar `page.tsx` más allá del filtro.
- El endpoint `GET /api/admin/appointments` **no cambia**: `patientId` ya es un
  filtro de modo lista.

### 1.8 Preservación del catálogo `patients` y del formulario

La carga completa del catálogo (`fetch('/api/admin/patients')`, `:453`) **se
mantiene**. Sus dos consumidores siguen siendo válidos:

- el `<select>` de paciente del formulario de alta/edición (`:1006-1019`), que
  necesita la lista completa;
- `refName(patients, appointment.patientId)` (`:592`), que resuelve el nombre en
  la tabla y en el calendario.

El buscador consulta por su cuenta y no reutiliza ese arreglo. Esto es
deliberado: filtrar en memoria sobre un catálogo parcial (la página de 20) daría
resultados incompletos.

**Consecuencia:** hay dos fuentes de datos de paciente en la misma pantalla (el
catálogo para el formulario y la búsqueda para el filtro). No se consideran
duplicadas porque sirven a propósitos distintos y no compiten en la misma
superficie.

---

## 2. Enfoque técnico

### 2.1 Componente `src/components/admin/PatientSearchInput.tsx`

```tsx
'use client';

export type PatientOption = { id: string; name: string };

type PatientSearchInputProps = {
  value: PatientOption | null;
  onChange: (selection: PatientOption | null) => void;
  label?: string;
  className?: string;
  minChars?: number;
  debounceMs?: number;
};
```

Estado interno: `query`, `options`, `open`, `activeIndex`, `loading`, `error`, más
`lastEmittedIdRef` y los refs de timer/abort. Flujo:

1. `onChange` del input → `setQuery`, `setActiveIndex(null)` y, si había una
   selección cuyo nombre ya no coincide con el texto, `onChange(null)`.
2. Efecto de búsqueda con deps `[query, minChars, debounceMs]`:
   - `term.length < minChars` → limpiar `options`, `open`, `error`, `loading` y
     salir.
   - si no, `setLoading(true)`, crear `AbortController` y programar el `fetch` a
     los `debounceMs`; el cleanup cancela el timer y aborta el controller.
   - respuesta exitosa → `setOptions(data.patients.map(({ id, fullName }) => ({ id, name: fullName })))`;
     `!res.ok` → mensaje de error (401 → "Tu sesión expiró…", como el componente
     de booking); `catch` con `signal.aborted` verdadero → ignorar.
3. Render: label + contenedor relativo con input, botón `✕` (si `query !== ''`) y
   lista `role="listbox"` (si `open`), con las clases Tailwind del panel.

### 2.2 Helper de resaltado

Función pura `highlightSegments(name: string, term: string)` en el mismo archivo
(co-locada; no se promueve a `src/lib` mientras tenga un solo consumidor):

- normaliza con `toLowerCase()` y busca con `indexOf`;
- sin coincidencia → `[{ text: name, match: false }]`;
- con coincidencia → tres segmentos (antes, coincidencia, después);
- la opción renderiza los segmentos con `font-semibold text-blue-700` en el
  coincidente, dentro del botón, preservando el nombre accesible completo.

### 2.3 Integración en `app/(admin)/appointments/page.tsx`

- Import del componente y del tipo `PatientOption`.
- `patientFilter` cambia de `string` a `PatientOption | null` (`:298`).
- `handlePatientFilterChange` (`:630-633`) recibe `PatientOption | null`.
- `listAppointmentsRequestUrl` (`:246-270`) recibe el objeto y usa `.id` para
  `patientId` (`:260`).
- `hasActiveFilters` (`:669`) se envuelve en `Boolean(...)`.
- `clearFilters` (`:660-667`) usa `setPatientFilter(null)`.
- El bloque `<select>`/`<label>` de Paciente (`:750-765`) se sustituye por el
  componente; el resto del bloque de filtros no se toca.
- No se modifica el `<select>` del formulario (`:1006-1019`) ni la carga de
  `patients` (`:453`).

### 2.4 Estrategia de pruebas

Runner unitario: `npm test` (Vitest + Testing Library; proyectos `node` y `jsdom`,
`openspec/config.yaml` → `unit: npm run test`). Política test-first
(RED → GREEN → TRIANGULATE → REFACTOR), `strict_tdd: true`.

- **Componente** (`src/components/admin/__tests__/PatientSearchInput.test.tsx`):
  jsdom con `vi.useFakeTimers({ shouldAdvanceTime: true })`, `global.fetch = vi.fn()`
  y `userEvent` (mismo patrón que la prueba de booking). El mock debe inspeccionar
  la URL para cubrir el debounce y el descarte de respuestas obsoletas
  (`mockImplementation` que devuelve promesas resolubles a mano).
- **Página** (`app/(admin)/appointments/page.test.tsx`): extender el mock de
  `/api/admin/patients` para responder también a `?q=`; migrar las consultas por
  índice de `combobox` a consultas por nombre accesible; agregar casos de
  selección (`patientId` en el request + página 1) y de limpieza por `✕` y por
  "Limpiar filtros".
- **Sin suite de datos:** no hay cambios en `src/lib/admin/**`, así que
  `npm run test:local` no es requerido por este change.

---

## 3. Decisiones (numeradas)

| # | Decisión | Valor | Alternativas / razón |
|---|---|---|---|
| D1 | Ubicación y forma | Nuevo `src/components/admin/PatientSearchInput.tsx`; `src/components/booking/PatientSearch.tsx` intacto | El contrato de booking no cubre el filtro controlado; moverlo tocaría otro dominio. Unificación como follow-up. |
| D2 | Umbral mínimo | Consultar solo con ≥2 caracteres tras `trim` | Evita consultas demasiado amplias; requisito del issue. |
| D3 | Debounce | 300 ms con `setTimeout` + `clearTimeout` en cleanup | Una sola petición por ráfaga de tecleo; valor ya usado en booking. |
| D4 | Descarte de respuestas obsoletas | `AbortController` + guardia de `signal.aborted` | Evita que una respuesta vieja pise a la vigente; supera al componente de booking. |
| D5 | Contrato del componente | Controlado: `value: PatientOption \| null` + `onChange`; `label`/`className`/`minChars`/`debounceMs` opcionales | Permite que "Limpiar filtros" vacíe el campo y que el componente sea reutilizable. |
| D6 | Estado en la página | Un solo `patientFilter: PatientOption \| null`; `hasActiveFilters` con `Boolean(...)` | Deriva el `patientId` del request sin duplicar el nombre; simple y testeable. |
| D7 | Visibilidad del panel | Solo con foco + sugerencias + texto suficiente; sin panel con 0 coincidencias | Requisito del issue #169. |
| D8 | Cierre del panel | Seleccionar, `Escape` y blur; `onMouseDown` con `preventDefault` en las opciones | El blur no debe cancelar el clic de la opción. |
| D9 | Teclado | `↑`/`↓` sin ciclado, `Enter` selecciona la activa, `Escape` cierra sin seleccionar | Comportamiento determinista y anunciable. |
| D10 | Accesibilidad | `combobox` + `listbox` + `option`, `aria-expanded`/`aria-controls`/`aria-activedescendant`/`aria-selected`; label propio asociado | Conserva la operabilidad por teclado del `<select>` reemplazado. |
| D11 | Resaltado | Segmentar el nombre con `highlightSegments` y resaltar el fragmento; degradar a texto plano si no hay coincidencia literal | Coincidencias por teléfono/correo no aparecen en el nombre. |
| D12 | Techo de sugerencias | Primera página del endpoint de pacientes (default 20); sin scroll infinito ni `pageSize` en el componente | Suficiente para autocompletar; evita ampliar el contrato del endpoint. |
| D13 | Limpieza | `✕` y vaciar el texto emiten `null`; editar tras una selección limpia el filtro aplicado | El texto visible y el filtro aplicado nunca quedan desincronizados. |
| D14 | Endpoints | `GET /api/admin/patients` y `GET /api/admin/appointments` sin cambios; el filtro sigue viajando como `patientId` | Ya soportan búsqueda y filtro; no se inventan parámetros ni validaciones. |
| D15 | Catálogo del formulario | Se conserva `fetch('/api/admin/patients')` (`:453`) y el `<select>` del formulario (`:1006-1019`) | El formulario necesita la lista completa; solo se reemplaza el control del filtro. |
| D16 | Paginación | La limpieza y el cambio de selección siguen llamando `resetPageForFilterChange()` | Mantiene la invariante "filtro cambia → página 1" del change de paginación. |
| D17 | Sincronización externa | `lastEmittedIdRef` distingue emisiones propias de resets externos | Evita el ciclo padre↔hijo y que el efecto pise el tecleo. |
| D18 | Dependencias | Ninguna (`package.json` intacto) | Tailwind + HTML nativo; no hay UI kit. |
| D19 | Pruebas | Suite propia del componente + actualización de la suite de la página (selectores por nombre accesible, mock con `?q=`) | Los índices de `combobox` cambian de significado; las pruebas deben describir intención. |
| D20 | Runner | `npx vitest run` focal y `npm test`; `npx tsc --noEmit`, `npm run lint`, `npm run build` | `openspec/config.yaml` → `strict_tdd: true`, `unit: npm run test`. |

---

## 4. Trade-offs

- **Dos fuentes de pacientes en la misma pantalla.** El catálogo completo sigue
  cargándose para el formulario y `refName`, mientras el filtro consulta aparte.
  Se paga un request adicional al abrir el buscador a cambio de no romper el
  formulario (§1.8).
- **Mínimo de 2 caracteres y techo de 20 sugerencias.** Búsquedas de una letra o
  con más de 20 coincidencias exigen refinar el texto. Es el comportamiento
  esperado de un autocompletado y evita ampliar el contrato del endpoint (D2, D12).
- **Complejidad de la sincronización controlado/interno.** La guardia
  `lastEmittedIdRef` (D17) es la parte más delicada del componente; se cubre con
  pruebas de selección, limpieza externa y tecleo posterior a una selección.
- **Nuevo formato de estado en la página.** `patientFilter` deja de ser `string`;
  cualquier consumidor que asumiera string debe revisarse. En este change solo lo
  usan `listAppointmentsRequestUrl`, `hasActiveFilters` y `clearFilters`.
- **Acentos.** `ilike` es case-insensitive pero no accent-insensitive: "maria" no
  encuentra "María". Se acepta como limitación conocida del endpoint (§7).
- **Selectores de prueba migrados.** Cambiar de índice a nombre accesible es más
  verboso, pero hace las pruebas más robustas ante reordenamientos del panel.

---

## 5. Rollback

Sin migraciones, sin escrituras y sin dependencias, el rollback es el del
`proposal.md`. En términos de este diseño:

- Revertir `app/(admin)/appointments/page.tsx` restaura el `<select>` del catálogo
  completo y `patientFilter: string`.
- Revertir `app/(admin)/appointments/page.test.tsx` restaura los selectores por
  índice y el mock de `/api/admin/patients` sin `?q=`.
- Eliminar `src/components/admin/PatientSearchInput.tsx` y su prueba no deja
  consumidores huérfanos (el único era la lista).
- Los endpoints no cambiaron, así que no hay rollback de API ni de capa de datos.
- El filtro de paciente nunca se persistió (ni en URL ni en base de datos), así
  que no hay estado que limpiar.
- `package.json` no cambia.

---

## 6. Estrategia de pruebas

### 6.1 Componente — `src/components/admin/__tests__/PatientSearchInput.test.tsx`

- Render base: label "Paciente" asociado al input y campo vacío con
  `value={null}`.
- Mínimo de caracteres: con 1 carácter no se llama `fetch`; con 2 (después del
  debounce) sí.
- Debounce: teclear "mar" produce un único `fetch` a
  `/api/admin/patients?q=mar` (D3).
- Respuesta obsoleta: la consulta de "ma" resuelve después de la de "mar" y el
  panel muestra las de "mar" (D4).
- Selección: clic en una sugerencia llama `onChange({ id, name })` una sola vez y
  cierra el panel (D5, D8).
- Visibilidad: sin coincidencias no hay `listbox`; con `blur` el panel se cierra;
  con `Escape` se cierra sin cambiar la selección (D7, D9).
- Teclado: `↓` activa la primera opción (anunciada con `aria-activedescendant`),
  `↑` navega, `Enter` selecciona la activa (D9, D10).
- Limpieza: `✕` y borrar el texto emiten `null` (D13).
- Editar después de seleccionar limpia el filtro (`onChange(null)`) y busca el
  texto nuevo (D13).
- Resaltado: el fragmento coincidente se resalta y el nombre accesible completo
  sigue disponible; con coincidencia por teléfono el nombre se muestra plano
  (D11).
- Sincronización externa: cambiar `value` a `null` desde el padre vacía el campo
  (D17).
- Error: una respuesta `401` muestra el mensaje de sesión y no abre el panel.

### 6.2 Página — `app/(admin)/appointments/page.test.tsx`

- El mock de `/api/admin/patients` responde también a URLs con `?q=`.
- Seleccionar una sugerencia envía `patientId` en el request del listado y
  solicita `page=1` (D6, D16).
- `✕` y "Limpiar filtros" quitan `patientId` del request y el campo queda vacío
  (D13).
- La combinación con servicio, proveedor y rango de fechas sigue enviando los
  tres filtros a la vez (requirement de integración).
- El formulario de cita conserva su selector con el catálogo completo (D15).
- Las pruebas existentes que usaban `getAllByRole('combobox')[n]` quedan migradas
  a consultas por nombre accesible y siguen en verde (D19).

### 6.3 Invariantes

- `src/components/booking/PatientSearch.tsx` y su prueba no cambian
  (`git diff --stat` sin cambios).
- `app/api/admin/patients/route.ts` y `src/lib/admin/patients.ts` no cambian.
- `app/api/admin/appointments/route.ts` y `src/lib/admin/appointments.ts` no
  cambian.
- `package.json` no cambia.

### 6.4 Comandos de validación

```bash
npx vitest run src/components/admin/__tests__/PatientSearchInput.test.tsx
npx vitest run "app/(admin)/appointments/page.test.tsx"
npx vitest run            # suite unitaria completa (equivalente a npm test)
npx tsc --noEmit          # typecheck
npm run lint              # lint
npm run build             # build de Next.js
```

No se requiere `npm run test:local` (no hay cambios en la capa de datos).

---

## 7. Open Questions

1. **Copy visible.** El placeholder, el texto de ayuda y el aviso de "sin
   coincidencias" no forman parte del contrato; se fijan en apply con español de
   México. El placeholder propuesto es
   "Buscar paciente por nombre, teléfono o correo" (coherente con el componente de
   booking). Mostrar un aviso no interactivo de "Sin coincidencias" es **MAY**:
   el requirement prohíbe el panel con opciones cuando no hay resultados, no un
   mensaje auxiliar.
2. **Techo de sugerencias.** Se asume la primera página del endpoint (default 20).
   Exponer `pageSize` o añadir scroll infinito queda fuera de alcance (D12).
3. **Unificación con `src/components/booking/PatientSearch.tsx`.** Follow-up; este
   change no lo toca (D1). Relacionado con el trabajo de búsqueda de pacientes ya
   entregado en #167.
4. **Búsqueda sin acentos.** `ilike` no ignora acentos ("maria" ≠ "María").
   Resolverlo requeriría `unaccent`/índice o normalizar en el endpoint; queda como
   follow-up fuera de alcance, documentado como limitación en `proposal.md`.
5. **Orden del archive.** `admin-appointments` no existe todavía en
   `openspec/specs/`; el change `agregar-paginacion-citas` también la declara como
   ADDED y aún no se archiva. Al archivar, el merge MUST preservar ambos deltas sin
   duplicar requirements.
