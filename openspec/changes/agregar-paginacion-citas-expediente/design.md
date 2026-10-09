# Design: agregar-paginacion-citas-expediente

Issue [#180](https://github.com/proyecto-polaris-ia/medica-app/issues/180) ·
Patrones heredados de #168 (`admin-appointments`) y #167 (`admin-patients-ui`).

## 1. Capa de datos (`src/lib/admin/patient-record.ts`)

### D1 — Dos funciones de lectura paginada, misma firma

```ts
type PatientAppointmentsPage = {
  appointments: PatientRecordAppointment[];
  total: number;
};

listPatientUpcomingAppointmentsPage(patientId: string, page: number, pageSize: number, now?: Date): Promise<PatientAppointmentsPage>
listPatientAttendedAppointmentsPage(patientId: string, page: number, pageSize: number): Promise<PatientAppointmentsPage>
```

Ambas: `parseUuid`, `count(...).eq('patient_id', id)` exacto + `range(from, to)`,
select con el `APPOINTMENT_SELECT` vigente y mapeo con `mapAppointment`. `total`
se cuenta después de aplicar TODOS los filtros de la sección (mismo criterio que
`listAppointmentsPaged` de #168).

### D2 — Filtros de cada sección, server-side

- `upcoming`: `.gte('start_at', nowIso)` + `.not('status', 'in',
  '(...INACTIVE_FUTURE_STATUSES)')`, orden `.order('start_at', { ascending: true })`.
  `now` es parámetro con default `new Date()` (hereda la semántica de
  `buildPatientRecord`, testeable).
- `attended`: `.eq('status', 'attended')`, orden `.order('start_at', { ascending: false })`.

Reutilizar la constante `INACTIVE_FUTURE_STATUSES` existente; no duplicar listas
de estados. Orden fijo, sin whitelist de columnas: la vista nunca ofreció orden
configurable (decisión del proposal).

### D3 — `getPatientRecord` deja de consultar citas

Elimina la consulta a `appointments` y `buildPatientRecord` deja de usarse en
producción. `PatientRecord` pierde `upcomingAppointments`/`attendedAppointments`
en `src/lib/admin/types.ts`. Se conservan los mapeos de paciente; se eliminan
solo los que quedan huérfanos (y sus pruebas), sin dejar dead code (knip).

## 2. Rutas (`app/api/admin/patients/[id]/appointments/…`)

### D4 — Dos route handlers simétricos

`upcoming/route.ts` y `attended/route.ts` sobre el patrón del record:

- `requireUser()` → `401` (manejado por `handleAdminRequest`).
- `context.params.id` → `parseUuid` → `404` si el paciente no existe (la capa de
  datos lanza `NotFoundError`; las funciones paginadas validan la existencia del
  paciente con la misma consulta `single()` que usa `getPatientRecord`).
- `page`/`pageSize`: mismos validadores estrictos que la ruta global
  (`/^\d+$/`, `Number.isSafeInteger`), con `DEFAULT_PAGE = 1`,
  `DEFAULT_PAGE_SIZE = 10`, `MAX_PAGE_SIZE = 50` → `ValidationError` → `400`.
- Respuesta: `{ appointments, pagination: { total, page, pageSize, totalPages } }`
  con `totalPages = Math.ceil(total / pageSize)`.

Duplicar los mini-parsers (uno por ruta) o extraerlos a `app/api/admin/_lib`:
decidir en implementación por longitud; si se extraen, en
`app/api/admin/_lib/pagination.ts` junto a `responses.ts`. No importar desde la
ruta de `/api/admin/appointments` para no acoplar contratos.

## 3. UI (`PatientRecordView` y consumidores)

### D5 — Props y fuente de datos

`PatientRecordView` pasa de `{ record }` a:

```ts
type PatientRecordViewProps = {
  patient: Patient;
  syncUrl?: boolean; // true solo en /patients/[id]
};
```

Cada sección es un subcomponente (`PatientAppointmentsSection`) con estado
propio: `page`, `rows`, `total`, `loading`, `error`. Fetch por
`(patientId, section, page)` con `useEffect` y cancelación/guardia de respuestas
obsoletas. `PatientAppointmentsTab` propaga `patient` + `syncUrl`;
`PatientRecordModal` propaga `patient` sin `syncUrl`. El encabezado del
expediente sigue alimentado por `record.patient`.

### D6 — Sincronía de URL (patrón #167, replicado dos veces)

Solo con `syncUrl`: `useSearchParams` para inicializar
(`initialPageFromParam`, default 1, valores inválidos → 1) y un `useEffect` con
guardia de `searchParams.toString()` que hace `router.replace` componiendo solo
los parámetros ≠ 1 (`upcomingPage`, `attendedPage`). El modal (`syncUrl` falso)
no toca `useSearchParams` ni `router`. Comparten el builder entre secciones para
no pisarse mutuamente los parámetros.

### D7 — Estados por sección

- **Loading**: skeleton de 3 filas con la misma estructura de tabla (Tailwind
  `animate-pulse`), solo en la sección que carga.
- **Vacío**: mensajes vigentes; con `total = 0` no se monta `Pagination`
  (el componente ya devuelve `null` con `total <= 0`).
- **Página fuera de rango**: respuesta vacía + metadatos → estado vacío +
  `Pagination` visible (el componente ya muestra controles cuando
  `page > totalPages`).
- **Error**: texto de error con reintento por sección, sin bloquear la otra.

### D8 — `PatientRecordTabs` y pruebas de página

`PatientAppointmentsTab` recibe `patient` (los tabs ya lo reciben). Las pruebas
de `app/(admin)/patients/[id]/page.test.tsx` y de modal/tab se actualizan al
nuevo contrato; se agregan mocks de los dos endpoints nuevos.

## 4. Pruebas (estrategia TDD, `strict_tdd: true`)

| Capa | Archivo | Runner |
|---|---|---|
| Datos | `src/lib/admin/__tests__/patient-record.test.ts` (extendido): filtros, orden, `total`, límites de página | `npm run test:local` (Supabase local) |
| Rutas | `app/api/admin/patients/[id]/appointments/{upcoming,attended}/route.test.ts` (mock de capa de datos): metadatos, 400/404/401 | `npm test` |
| Ruta record | `app/api/admin/patients/[id]/record/route.test.ts` (ajuste del contrato) | `npm test` |
| UI | `src/components/admin/__tests__/PatientRecordView.test.tsx` (nuevo) + ajustes en tests de tab/modal/page: independencia, skeleton, vacío, URL, modal sin URL | `npm test` |

## Open questions

- Ninguna bloqueante. El filtro por rango de fechas para historiales largos
  quedó explícitamente fuera de alcance (proposal §Fuera de alcance).
