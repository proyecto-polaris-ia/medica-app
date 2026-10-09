# Change: Paginación server-side en las citas del expediente del paciente

## Why

El expediente del paciente (`/patients/[id]`, pestaña `Citas`) muestra dos
secciones — **citas futuras** y **citas asistidas** — renderizadas por
`PatientRecordView` (`src/components/admin/PatientRecordView.tsx`) a partir de
`GET /api/admin/patients/[id]/record`. Ese endpoint trae **todas** las citas del
paciente en una sola consulta sin `range`/`count`
(`getPatientRecord` en `src/lib/admin/patient-record.ts`) y las filtra en memoria
(`buildPatientRecord`). Un paciente recurrente acumula decenas o cientos de
citas asistidas a lo largo de meses/años, así que cada carga del expediente:

- devuelve y renderiza un volumen sin acotar (DOM y payload crecen con el
  historial),
- obliga al administrador a hacer scroll infinito para encontrar una cita,
- y escala mal para pacientes de tratamiento largo.

Este change cubre el issue
[#180](https://github.com/proyecto-polaris-ia/medica-app/issues/180) y reutiliza
el patrón ya validado de la lista de citas del panel
([#168](https://github.com/proyecto-polaris-ia/medica-app/issues/168), componente
`Pagination`) y de la lista de pacientes
([#167](https://github.com/proyecto-polaris-ia/medica-app/issues/167),
sincronía de `?page=` con la URL).

## What Changes

- **Dos endpoints paginados nuevos.**
  `GET /api/admin/patients/[id]/appointments/upcoming` y
  `GET /api/admin/patients/[id]/appointments/attended` aceptan `page` (default
  `1`) y `pageSize` (default `10`, máximo `50`, según el issue #180) y responden
  `{ appointments, pagination: { total, page, pageSize, totalPages } }`.
  Parámetros inválidos responden `400`. El paciente inexistente responde `404`.
- **Orden fijo por sección.** Citas futuras: `start_at` ascendente (la más
  próxima primero), estados activos futuros (excluye `attended`, `cancelled`,
  `rescheduled`, `no_show`) con `start_at >= now`. Citas asistidas:
  `start_at` descendente (la más reciente primero), estado `attended`. El orden
  no es configurable: es el que la vista ya tenía, solo que ahora se resuelve en
  el servidor.
- **El record deja de traer citas.** `GET /api/admin/patients/[id]/record`
  responde `{ record: { patient } }` sin `upcomingAppointments` ni
  `attendedAppointments`; las secciones de citas se alimentan exclusivamente de
  los endpoints paginados. Así la carga del expediente queda acotada de verdad
  (si el record siguiera trayendo todas las citas, el problema de fondo
  persistiría aunque la UI paginara).
- **`PatientRecordView` consume los endpoints paginados.** Cada sección gestiona
  su página de forma **independiente** (futuras y asistidas no se afectan entre
  sí), monta el componente reutilizable `Pagination`, muestra el total
  ("Página X de Y (N resultados)"), estado vacío (mensajes existentes) y estado
  de carga (skeleton de filas) por sección.
- **Sincronía con la URL solo en `/patients/[id]`.** La página del expediente
  refleja `?upcomingPage=n&attendedPage=m` (omitidos cuando son `1`), con estado
  local como fuente de verdad, `router.replace` y guardia de reescritura
  redundante — el patrón de #167. La pestaña `Citas` preserva la página al
  alternar de pestaña y volver; los parámetros sobreviven a recargas.
- **El modal usa estado local.** `PatientRecordModal` (usado desde la lista de
  citas, `/appointments`) reutiliza la misma vista sin sincronía de URL para no
  contaminar los parámetros de esa página; su paginación vive en estado local.
- **Se reutiliza `src/components/admin/Pagination.tsx` sin cambios.** Sin
  selector de `pageSize` ni scroll infinito ni filtro por rango de fechas.

### Alcance

- Endpoints `GET /api/admin/patients/[id]/appointments/upcoming|attended` y su
  capa de datos en `src/lib/admin/patient-record.ts`; ajuste del payload de
  `GET /api/admin/patients/[id]/record`.
- `src/components/admin/PatientRecordView.tsx`,
  `src/components/admin/patient-record/PatientAppointmentsTab.tsx` y
  `src/components/admin/PatientRecordModal.tsx`; sincronía de URL en
  `app/(admin)/patients/[id]/page.tsx`.
- Pruebas: rutas mockeadas, suite de datos contra Supabase local y pruebas de UI.
- Sin dependencias nuevas, sin migraciones y sin tocar `travelhub-app` (regla
  crítica del repo).

## Capabilities

### New Capability: `patient-record-appointments`

Se crea la capability **`patient-record-appointments`** en
`openspec/specs/patient-record-appointments/spec.md`. Captura el contrato de
lectura paginada de las citas del expediente (endpoints upcoming/attended,
metadatos, validación, orden fijo) y el comportamiento de la UI de ambas
secciones (independencia, estado vacío, carga, URL, modal).

### Modified Capabilities

- `patient-record-summary`: el record ya no devuelve listas de citas y las
  secciones de citas se renderizan paginadas (delta con `MODIFIED Requirements`).

## Impacto

| Área | Impacto | Descripción |
|---|---|---|
| `src/lib/admin/patient-record.ts` | Modified | Nuevas `listPatientUpcomingAppointmentsPage` / `listPatientAttendedAppointmentsPage` con `count` exacto + `range`, reutilizando `APPOINTMENT_SELECT`/`mapAppointment`. `getPatientRecord` deja de consultar citas. |
| `app/api/admin/patients/[id]/appointments/upcoming/route.ts` | New | Endpoint paginado de citas futuras. |
| `app/api/admin/patients/[id]/appointments/attended/route.ts` | New | Endpoint paginado de citas asistidas. |
| `app/api/admin/patients/[id]/record/route.ts` | Modified | Respuesta sin listas de citas (contrato reducido). |
| `src/lib/admin/types.ts` | Modified | `PatientRecord` sin `upcomingAppointments`/`attendedAppointments`; nuevos tipos de respuesta paginada. |
| `src/components/admin/PatientRecordView.tsx` | Modified | Secciones con carga paginada, `Pagination`, skeleton y estados vacíos; props por `patient`/`patientId` + modo de sincronía de URL. |
| `src/components/admin/patient-record/PatientAppointmentsTab.tsx` | Modified | Propaga `patient` (y el modo URL) en lugar del `record` completo. |
| `src/components/admin/PatientRecordModal.tsx` | Modified | Mismo cambio de props, modo estado local. |
| `app/(admin)/patients/[id]/page.tsx` | Modified | Pasa `patient` a la pestaña `Citas`; sin cambios de carga. |
| Pruebas (rutas, datos, UI) | Modified/New | `record/route.test.ts`, `patient-record.test.ts`, pruebas de los endpoints nuevos, `PatientRecordView`/tabs/modal/page. |
| Dependencias / migraciones | Sin cambios | No se agregan librerías ni esquema. |

## Decisions

| Decisión | Valor | Razón |
|---|---|---|
| Endpoints dedicados vs. paginar el record | Endpoints dedicados `upcoming` / `attended` | Lo pide el issue #180; aísla el contrato de cada sección y permite evolucionarlas por separado. |
| `pageSize` default/máximo | `10` / `50` | Cifras explícitas del issue #180 (distintas del listado global 20/100 a propósito: son listas por paciente). |
| Retirar citas del record | Sí | Si el record siguiera trayendo todas las citas, el problema de escalabilidad persistiría en el backend aunque la UI paginara. |
| Orden | Fijo por sección (asc/desc), sin whitelist de columnas | Reproduce exactamente el orden actual de `buildPatientRecord`; la vista nunca ofreció orden configurable. |
| Componente de paginación | `Pagination.tsx` existente, sin selector de `pageSize` | Consistencia con #168/#167; el selector es opcional en el issue y agrega UI sin necesidad demostrada. |
| URL | `?upcomingPage=n&attendedPage=m` solo en `/patients/[id]`; modal local | El modal vive sobre `/appointments`, cuya `?page=` pertenece a la lista global; mezclar parámetros rompería ambos contratos. |
| `now` para "futuras" | Hora del servidor en la capa de datos | Mantiene el comportamiento actual de `buildPatientRecord(now)`. |

## Fuera de alcance

- Selector de `pageSize` en la UI y scroll infinito.
- Filtro por rango de fechas en citas asistidas (sugerido en el issue para
  historiales de 100+; se evaluará si la paginación resulta insuficiente).
- Paginación de otras pestañas del expediente (consultas, planes, pagos, archivos).
- Persistencia de página por usuario o entre dispositivos (solo URL).
- Cualquier edición dentro de `travelhub-app`.

## Riesgos

- **Consumidores del record que lean las listas.** El contrato del record se
  reduce; solo `PatientRecordView` (vía tab y modal) consume las listas hoy
  (verificado en el código). Mitigación: actualización de rutas y pruebas en el
  mismo change; la pestaña `Citas` queda equivalente para el usuario.
- **Dos fetches nuevos por apertura del expediente.** La pestaña `Citas` ahora
  hace dos peticiones paginadas en lugar de una carga masiva. Mitigación: solo
  se cargan al entrar a la pestaña; cada una trae ≤ `pageSize` filas.
- **Desfase de `total` por escrituras concurrentes.** Igual que en #168: se
  acepta para un panel administrativo; no se agrega transacción.
- **Página fuera de rango en la URL.** `?attendedPage=99` con pocas filas
  responde con página vacía + metadatos; el estado vacío permite regresar.

## Rollback plan

- **Reversión por commit.** Sin migraciones ni datos persistentes: revertir los
  commits restaura el record con todas las citas y la vista sin paginación.
- **Los endpoints nuevos son aditivos.** Si la UI se revierte pero los endpoints
  quedan, no rompen nada (nadie los consume); quedan disponibles para reintentar.
- **`?upcomingPage=` es inerte tras revertir.** La página simplemente lo ignora.
- **Sin dependencias.** `package.json` no cambia.

## Criterios de éxito

- [ ] Los endpoints `upcoming`/`attended` devuelven como máximo `pageSize` filas
      y los metadatos `{ total, page, pageSize, totalPages }` sobre el conjunto
      de su sección.
- [ ] Parámetros inválidos (`page=0`, `pageSize=51`, `pageSize=abc`, uuid
      inválido) responden `400`; paciente inexistente, `404`; sin sesión, `401`.
- [ ] El record ya no incluye listas de citas y el resto de su contrato sigue
      funcionando (datos, historia, consultas, planes, pagos, archivos).
- [ ] Cada sección pagina de forma independiente y muestra el total correcto.
- [ ] `?upcomingPage=n&attendedPage=m` es deep-linkeable, sobrevive recargas y
      se preserva al alternar pestañas; el modal no escribe URL.
- [ ] Estado vacío y estado de carga por sección; el DOM queda acotado a
      `pageSize` filas por sección.
- [ ] `npm run test` (unitarias), `npm run test:local` (datos), `npx tsc --noEmit`,
      `npm run lint` y `npm run build` en verde.
- [ ] No se agregan dependencias y no se modifica `travelhub-app`.
