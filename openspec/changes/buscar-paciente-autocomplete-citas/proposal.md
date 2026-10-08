# Change: Búsqueda de paciente con autocompletado en el filtro de la lista de citas

## Why

El filtro de paciente del panel de citas es un `<select>` nativo que se llena con
el catálogo **completo** de pacientes:
`app/(admin)/appointments/page.tsx:750-765` renderiza
`patients.map((p) => <option …>)` sobre el arreglo `Reference[]` que `loadData`
carga sin búsqueda desde `GET /api/admin/patients`
(`app/(admin)/appointments/page.tsx:453`, mapeado en `:476-480`). A medida que
crece el padrón de pacientes, la secretaria tiene que desplazarse por una lista
larga y sin criterio de búsqueda para encontrar a una persona **por nombre**,
justo cuando el nombre es el dato que conoce.

La búsqueda textual por paciente ya existe y está especificada en el servidor:
`GET /api/admin/patients?q=…` (`app/api/admin/patients/route.ts:11-31`) delega en
`listPatientsPage` (`src/lib/admin/patients.ts:158-185`), que busca por nombre,
teléfono y correo con `ilike` OR escapado
(`src/lib/admin/patients.ts:104-128`). El panel de citas simplemente no usa esa
capacidad: pide el listado sin `q` y el usuario filtra a ojo.

El agente de booking ya tiene una búsqueda progresiva
(`src/components/booking/PatientSearch.tsx`), pero no es reutilizable tal cual en
el panel: su contrato es "buscar y emitir" (`onSelect(patient)`) sin valor
controlado ni limpieza de la selección, y vive en el dominio de booking. El
filtro de la lista, en cambio, necesita un valor seleccionado que pueda
**limpiarse** para volver a "Todos".

Este change cubre el issue
[#169](https://github.com/proyecto-polaris-ia/medica-app/issues/169) y reemplaza
el `<select>` por un campo de texto con autocompletado progresivo que aplica el
**mismo** filtro `patientId` que ya viaja al endpoint de citas
(`listAppointmentsRequestUrl`, `app/(admin)/appointments/page.tsx:246-270`,
`patientId` en `:260`), con lo que no se toca ningún contrato de API.

## What Changes

- **Nuevo componente reutilizable `PatientSearchInput`.** Se crea
  `src/components/admin/PatientSearchInput.tsx`: campo de texto controlado con
  lista de sugerencias, selección y limpieza. **No** se mueve ni refactoriza
  `src/components/booking/PatientSearch.tsx`; la eventual unificación queda como
  follow-up (ver *Fuera de alcance*).
- **Búsqueda progresiva contra el endpoint vigente.** Desde **2 caracteres** (tras
  `trim`) el componente consulta `GET /api/admin/patients?q=…` con **debounce de
  300 ms** y **descarta respuestas obsoletas** (resultado de una consulta previa
  que llega después no debe pisar al de la consulta vigente).
- **Selección = filtro de hoy.** Al elegir una sugerencia, el campo muestra el
  **nombre completo** del paciente y el filtro se aplica por `patientId`
  exactamente como hoy (`handlePatientFilterChange`,
  `app/(admin)/appointments/page.tsx:630-633`), incluyendo el regreso a la página
  `1` (`resetPageForFilterChange`, `:604-610`).
- **Panel de sugerencias acotado.** La lista de sugerencias se muestra **solo**
  cuando el campo tiene foco **y** hay coincidencias; se cierra al seleccionar, al
  perder el foco y con `Escape`. Sin coincidencias no se renderiza panel.
- **Navegación por teclado y accesibilidad.** Patrón `combobox`/`listbox`/`option`
  con `aria-expanded`, `aria-controls`, `aria-activedescendant` y `aria-selected`;
  `↑`/`↓` mueven la opción activa, `Enter` selecciona y `Escape` cierra sin
  seleccionar. La etiqueta visible `Paciente` se conserva.
- **Resaltado del fragmento coincidente.** El texto que coincide con la consulta
  se resalta dentro del nombre mostrado, sin perder el **nombre accesible**
  completo de la opción y sin romperse cuando el término no aparece en el nombre
  (por ejemplo, coincidencia por teléfono o correo).
- **Limpieza explícita.** Un botón `✕` dentro del campo (visible cuando hay
  selección) y vaciar el texto devuelven el filtro a "" (Todos). El botón
  "Limpiar filtros" (`:660-667`) sigue limpiando los cinco filtros, incluido el de
  paciente.
- **Integración con los filtros existentes.** El filtro de paciente convive con
  servicio, proveedor y rango de fechas sin cambiar el contrato del endpoint de
  citas ni la paginación.
- **Se conserva el catálogo `patients`.** La carga de `patients: Reference[]`
  (`app/(admin)/appointments/page.tsx:282`, `:453`) **se mantiene** porque la usan
  el `<select>` del formulario de cita (`:1006-1019`) y `refName()` (`:592`); solo
  se reemplaza el control del panel de filtros (D5).
- **Pruebas.** Componente nuevo con suite propia y actualización de la suite de la
  página: los selectores por índice (`screen.getAllByRole('combobox')[1]`,
  `app/(admin)/appointments/page.test.tsx:1795-1802`, `:904`, `:1534`, `:1848`,
  `:1988`) cambian de significado y pasan a consultas por nombre accesible;
  el mock de `/api/admin/patients` (`url === '/api/admin/patients'`, `:76`) debe
  cubrir también las consultas con `?q=`.

### Alcance

- Componente nuevo `src/components/admin/PatientSearchInput.tsx` y su prueba
  `src/components/admin/__tests__/PatientSearchInput.test.tsx`.
- Vista de lista de `app/(admin)/appointments/page.tsx` (estado del filtro,
  panel de filtros, handler y `clearFilters`) y su suite
  `app/(admin)/appointments/page.test.tsx`.
- Sin migraciones, sin escrituras en base de datos y sin cambios en
  `GET /api/admin/patients`, `GET /api/admin/appointments` ni en su capa de datos.
- Sin dependencias nuevas y sin tocar `travelhub-app` (regla crítica del repo).

## Capabilities

### New Capability: `admin-appointments` (delta ADDED)

`openspec/specs/admin-appointments/spec.md` **no existe** en el baseline de este
worktree (`openspec/specs/` no contiene esa carpeta), por lo que el delta se
expresa íntegramente como **ADDED Requirements**: el contrato observable del
filtro de paciente de la lista, la búsqueda progresiva, el panel de sugerencias,
el teclado/accesibilidad, la limpieza, la integración con los filtros existentes
y la reutilización del componente.

> Nota de orden de archive: el change `agregar-paginacion-citas` (issue #168)
> también declara `admin-appointments` como capability nueva y aún **no** está
> archivado. Al archivar cualquiera de los dos, el merge MUST preservar ambos
> deltas sin duplicar requirements.

### Modified Capabilities

- Ninguna. `admin-patients-api` (contrato de lectura de pacientes),
  `admin-panel` (CRUD de citas, notas y modal), `appointments-calendar-view` y
  `booking-patient-selection` **no se modifican**.

## Impacto

Archivos esperados (sin modificar `travelhub-app`):

| Área | Impacto | Descripción |
|---|---|---|
| `src/components/admin/PatientSearchInput.tsx` | New | Campo de texto controlado con autocompletado: debounce, umbral de 2 caracteres, descarte de respuestas obsoletas, sugerencias, teclado, resaltado y limpieza (D1-D4, D9-D13). |
| `src/components/admin/__tests__/PatientSearchInput.test.tsx` | New | Suite del componente: debounce, mínimo de caracteres, respuesta obsoleta, selección, visibilidad del panel, teclado, limpieza y resaltado (D6). |
| `app/(admin)/appointments/page.tsx` | Modified | El estado `patientFilter: string` (`:298`) pasa a una selección `{ id, name } \| null`; el `<select>` de Paciente (`:750-765`) se reemplaza por `<PatientSearchInput>`; `handlePatientFilterChange` (`:630-633`), `clearFilters` (`:660-667`) y `hasActiveFilters` (`:669`) se ajustan; `listAppointmentsRequestUrl` (`:246-270`) sigue enviando `patientId`. **Se conserva** la carga del catálogo (`:453`) por el formulario de cita (D5). |
| `app/(admin)/appointments/page.test.tsx` | Modified | Nuevas pruebas de selección/limpieza del filtro de paciente; migración de selectores por índice de `combobox` a nombres accesibles; mock de `/api/admin/patients` con y sin `?q=` (D6). |
| `app/api/admin/patients/route.ts` | Sin cambios | El contrato de `GET ?q=&page=&pageSize=` (`:11-31`) ya cubre la búsqueda; no se agregan parámetros ni mínimos server-side (D7). |
| `src/lib/admin/patients.ts` | Sin cambios | `listPatientsPage` (`:158-185`) y el `or` con `ilike` escapado (`:104-128`) se consumen tal cual (D7). |
| `app/api/admin/appointments/route.ts` y `src/lib/admin/appointments.ts` | Sin cambios | `patientId` ya es un filtro soportado en modo lista; este change no lo toca (D8). |
| `src/components/booking/PatientSearch.tsx` | Sin cambios | Se deja intacto (otro dominio y otro contrato); la unificación es follow-up (D1). |
| `openspec/specs/admin-patients-api/spec.md`, `admin-panel`, `appointments-calendar-view` | Sin cambios | Ningún baseline se modifica. |
| Dependencias / migraciones | Sin cambios | No se agregan librerías, no hay migración ni tabla nueva. |

## Decisions

| # | Decisión | Valor | Razón |
|---|---|---|---|
| D1 | Componente nuevo vs. adaptar el de booking | **Nuevo** `src/components/admin/PatientSearchInput.tsx`; `src/components/booking/PatientSearch.tsx` queda intacto | El contrato del booking (`onSelect(patient)`, sin valor controlado ni limpieza) no cubre el filtro de la lista; adaptarlo tocaría otro dominio. Unificación futura como follow-up. |
| D2 | Debounce, umbral y descarte | 300 ms con timer; consulta solo con ≥2 caracteres tras `trim`; `AbortController` para descartar respuestas obsoletas | Evita una tormenta de requests por tecleo y evita que una respuesta vieja pise a la vigente (`booking/PatientSearch.tsx` solo usa timer). |
| D3 | Accesibilidad y teclado | Patrón `combobox` + `listbox`/`option`, `aria-expanded`/`aria-controls`/`aria-activedescendant`/`aria-selected`; `↑`/`↓`, `Enter`, `Escape` | El `<select>` nativo era operable por teclado; el reemplazo no debe perder esa garantía. |
| D4 | Limpieza | `✕` dentro del campo y vaciar el texto emiten `null` → "" (Todos), reusando `handlePatientFilterChange`; editar el texto tras una selección limpia el filtro aplicado | El estado aplicado y el texto visible nunca deben quedar desincronizados. |
| D5 | Catálogo `patients` | Se conserva la carga completa (`:453`) para el formulario de cita y `refName()` | Solo se reemplaza el control del panel de filtros; el formulario necesita el catálogo completo. |
| D6 | Pruebas | Suite propia del componente + actualización de la suite de la página; TDD RED→GREEN | `openspec/config.yaml` → `strict_tdd: true`; los selectores por índice de `combobox` cambian de significado. |
| D7 | Endpoint de pacientes | **Sin cambios** de contrato: `q` combinado con `page`/`pageSize` y `ilike` escapado | La búsqueda y el mínimo de 2 caracteres son política de UI; no se inventan parámetros ni validaciones server-side. |
| D8 | Endpoint de citas | **Sin cambios**: el filtro sigue viajando como `patientId` | Ya está soportado en modo lista; el reset a página 1 reutiliza `resetPageForFilterChange`. |
| D9 | Resaltado | Segmentar el nombre y resaltar el fragmento coincidente, preservando el nombre accesible completo y degradando a texto plano si no hay coincidencia | Coincidencias por teléfono/correo no aparecen literalmente en el nombre. |
| D10 | Visibilidad del panel | Solo con foco y con sugerencias no vacías; cierre al seleccionar, `Escape`, perder foco y sin coincidencias | Requisito explícito del issue #169. |
| D11 | Dependencias | Ninguna (`package.json` intacto) | Tailwind + HTML nativo; no hay UI kit en el repo. |

## Fuera de alcance

- Unificar `PatientSearchInput` con `src/components/booking/PatientSearch.tsx` (se
  anota como follow-up; relación con la búsqueda de pacientes ya implementada en
  #167).
- Cambios en `GET /api/admin/patients`, en `listPatientsPage` o en su búsqueda
  `ilike` (acentos, ranking, límites de longitud).
- Búsqueda de pacientes en otras superficies (calendario, pagos, reportes).
- Cambios en el `<select>` de paciente del formulario de cita.
- Persistir el filtro de paciente en la URL: hoy no se serializa y este change no
  lo cambia.
- Cambios de esquema, migraciones, índices o dependencias.
- Cualquier edición dentro de `travelhub-app`.

## Riesgos

- **Texto visible vs. filtro aplicado.** Si el usuario edita el texto después de
  seleccionar y el filtro anterior siguiera aplicado, la lista mostraría resultados
  de un paciente que ya no se ve. Mitigación: editar el texto limpia el filtro
  aplicado (D4) y se cubre con pruebas.
- **Selectores por índice en la suite de la página.** `getAllByRole('combobox')`
  se usa con índices fijos (`:904`, `:1534`, `:1795-1802`, `:1848`, `:1988`); el
  nuevo control puede aparecer como `combobox` y desplazar los índices.
  Mitigación: migrar esas pruebas a consultas por nombre accesible ("Servicio",
  "Paciente", "Proveedor") dentro de este change.
- **Mock de `/api/admin/patients` por igualdad exacta.** El mock compara
  `url === '/api/admin/patients'` (`page.test.tsx:76`); la búsqueda agrega `?q=`.
  Mitigación: el mock debe responder también a las URLs con query.
- **Acentos.** `ilike` es case-insensitive pero no accent-insensitive: "maria" no
  encuentra "María" (ni al revés). Se documenta como limitación conocida; no se
  resuelve aquí y no se altera el endpoint.
- **Resaltado sin coincidencia literal.** Búsquedas por teléfono o correo no
  aparecen en el nombre. Mitigación: degradar a texto plano sin error (D9).
- **Carrera de respuestas.** Sin descarte, la respuesta de "ma" puede llegar
  después de "mar". Mitigación: `AbortController`/guardia de obsolescencia y
  prueba dedicada (D2).
- **Clic vs. blur.** El cierre por `blur` puede cancelar el clic de una opción.
  Mitigación: `onMouseDown` con `preventDefault` en las opciones y prueba de
  selección con `userEvent`.
- **Página y paginación.** Limpiar o cambiar el filtro debe seguir reiniciando la
  página a `1`; si se olvida, el usuario puede quedar en una página fuera de rango.
  Mitigación: reusar `resetPageForFilterChange` (`:604-610`) y cubrirlo en las
  pruebas de la página.
- **Doble fuente de pacientes.** El catálogo completo sigue cargándose para el
  formulario mientras el buscador consulta aparte; se acepta (D5) porque el
  formulario requiere la lista completa. No genera requests duplicados en el
  panel de filtros.

## Rollback plan

- **Reversión por commit.** El change no tiene migraciones ni escrituras:
  revertir los commits de la página devuelve el `<select>` del catálogo completo y
  el estado `patientFilter: string`; revertir el componente nuevo lo elimina junto
  con su prueba.
- **Sin datos que revertir.** No se agregan tablas, columnas ni índices; el filtro
  de paciente nunca se persistió (ni en URL ni en base de datos).
- **API intacta.** Como `GET /api/admin/patients` y `GET /api/admin/appointments`
  no cambian, revertir no requiere ninguna acción del servidor.
- **Sin dependencias.** `package.json` no cambia; no hay nada que desinstalar.
- **Selectores de prueba.** Al revertir, restaurar los selectores por índice
  originales de `page.test.tsx` deja la suite como estaba.

## Criterios de éxito

- [ ] El filtro de paciente de la lista es un campo de texto con autocompletado y
      ya no un `<select>` con el catálogo completo.
- [ ] Desde 2 caracteres (tras `trim`) se consulta
      `GET /api/admin/patients?q=…` con debounce de 300 ms y se descartan las
      respuestas obsoletas.
- [ ] Seleccionar una sugerencia muestra el nombre completo y la siguiente
      petición de citas incluye `patientId`, volviendo a la página 1.
- [ ] El panel de sugerencias solo aparece con foco y con coincidencias, y se
      cierra al seleccionar, al perder el foco y con `Escape`.
- [ ] `↑`/`↓`/`Enter`/`Escape` operan el autocompletado y la opción activa se
      anuncia con atributos ARIA.
- [ ] El fragmento coincidente se resalta sin romper el nombre accesible y sin
      fallar cuando la coincidencia no está en el nombre.
- [ ] El `✕` y vaciar el texto devuelven el filtro a "Todos"; "Limpiar filtros"
      también limpia el filtro de paciente.
- [ ] El filtro de paciente convive con servicio, proveedor y rango de fechas, y
      no rompe la paginación de la lista.
- [ ] El formulario de cita conserva su selector de pacientes con el catálogo
      completo.
- [ ] Sin cambios en los endpoints de pacientes ni de citas; sin dependencias
      nuevas; `travelhub-app` intacto.
- [ ] Prueba focal del componente, `npm test`, `npx tsc --noEmit` y
      `npm run build` en verde.
