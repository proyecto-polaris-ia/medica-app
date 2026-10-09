# Tasks: agregar-paginacion-citas-expediente

Paginación server-side en las secciones de citas futuras y asistidas del
expediente del paciente (issue
[#180](https://github.com/proyecto-polaris-ia/medica-app/issues/180)).

Convención de estado: `[ ]` pendiente · `[x]` completo. TDD activo
(`openspec/config.yaml` → `strict_tdd: true`): cada comportamiento escribe
primero la prueba que falla (**RED**), luego la implementación mínima
(**GREEN**) y después triangula bordes; el refactor queda en verde.

Runners: `npm test` (Vitest, unitarias) y `npm run test:local`
(`SUPABASE_LOCAL=1` + `supabase start`) para la suite de datos. Auxiliares:
`npx tsc --noEmit`, `npm run lint`, `npm run build`.

Cada tarea cita los requirements del delta
`specs/patient-record-appointments/spec.md` (y los `MODIFIED` de
`specs/patient-record-summary/spec.md`) y las decisiones (`D#`) de `design.md`.

---

## Fase 0 — Artefactos SDD (completado)

- [x] 0.1 `proposal.md` — alcance, decisiones (endpoints dedicados, record sin
  citas, pageSize 10/50, URL por sección), riesgos, rollback y criterios.
- [x] 0.2 `specs/patient-record-appointments/spec.md` — capability nueva
  (ADDED): endpoints upcoming/attended, metadatos, validación, secciones
  independientes, estados, URL y modal.
- [x] 0.3 `specs/patient-record-summary/spec.md` — delta MODIFIED: record sin
  listas de citas y secciones acotadas.
- [x] 0.4 `design.md` — decisiones D1–D8 y estrategia de pruebas.
- [x] 0.5 `tasks.md` — este plan.

---

## Fase 1 — Pruebas (RED)

### 1. Capa de datos — `src/lib/admin/__tests__/patient-record.test.ts` (test:local)

- [x] 1.1 RED (D1, D2): `listPatientUpcomingAppointmentsPage` con > pageSize
  citas futuras devuelve las más próximas, `total` completo y orden ascendente.
  Cubre: "Endpoint paginado de citas futuras".
- [x] 1.2 RED (D2): `upcoming` excluye `attended`/`cancelled`/`rescheduled`/
  `no_show` y citas con `start_at` en el pasado.
- [x] 1.3 RED (D1, D2): `listPatientAttendedAppointmentsPage` devuelve solo
  `attended`, orden descendente y `total` filtrado; paciente sin asistidas →
  arreglo vacío y `total` = 0. Cubre: "Endpoint paginado de citas asistidas".
- [x] 1.4 RED (D1): `page`/`pageSize` acotan con `range` (página 2 ≠ página 1) y
  `total` no depende de la página.
- [x] 1.5 RED (D3): `getPatientRecord` ya no consulta `appointments` (record sin
  listas). Cubre: MODIFIED "Authenticated patient record API".

### 2. Rutas — `app/api/admin/patients/[id]/appointments/{upcoming,attended}/route.test.ts`

- [x] 2.1 RED (D4): `GET ?page=2&pageSize=10` llama a la función de datos con
  los parámetros esperados y responde `{ appointments, pagination }` coherentes.
- [x] 2.2 RED (D4): defaults `page=1`, `pageSize=10` sin parámetros.
- [x] 2.3 RED (D4): `400` para `page=0`, `pageSize=51`, `pageSize=abc`,
  `page=-1` y sin cuerpo de datos; `404` para paciente inexistente; `401` sin
  sesión. Cubre: "Validación de parámetros".
- [x] 2.4 RED (D4): `record/route.test.ts` ajustado: respuesta sin
  `upcomingAppointments`/`attendedAppointments`.

### 3. UI — `PatientRecordView`, tab, modal y página

- [x] 3.1 RED (D5, D7): cada sección fetch a su endpoint, render de filas de la
  página y muestra "Página X de Y (N resultados)" vía `Pagination`.
- [x] 3.2 RED (D7): independencia — cambiar página en asistidas no refetch ni
  altera futuras. Cubre: "Secciones paginadas e independientes".
- [x] 3.3 RED (D7): skeleton durante la carga de una sección sin ocultar la otra;
  estados vacíos con los mensajes vigentes y `total = 0` sin `Pagination`.
- [x] 3.4 RED (D6): en `/patients/[id]` con `syncUrl`, cambiar de página escribe
  `?upcomingPage=2` / `?attendedPage=3` vía `router.replace` y un deep link
  inicializa ambas secciones desde la URL; página 1 se omite.
  Cubre: "Sincronía con la URL".
- [x] 3.5 RED (D6): el modal (`syncUrl` falso) cambia de página sin escribir URL.
- [x] 3.6 RED (D5): `PatientAppointmentsTab`/`PatientRecordModal`/page pasan
  `patient` + `syncUrl` en lugar del `record` completo (tests existentes
  actualizados).

## Fase 2 — Implementación (GREEN)

- [x] 4.1 GREEN (D1–D3): funciones de datos paginadas + record sin citas +
  tipos (`PatientRecord` reducido, tipos de respuesta).
- [x] 4.2 GREEN (D4): rutas `upcoming`/`attended` con validadores estrictos y
  metadatos; ajuste del handler del record.
- [x] 4.3 GREEN (D5–D7): `PatientRecordView` con secciones paginadas
  (skeleton/vacío/error/reintento), `syncUrl` y props nuevas; ajuste de tab,
  modal y página.
- [x] 4.4 Refactor en verde: deduplicar validadores de paginación si procede
  (`app/api/admin/_lib/`), revisar dead code (knip) tras retirar
  `buildPatientRecord` de producción.

## Fase 3 — Verificación

- [x] 5.1 `npm test` en verde (unitarias y UI).
- [x] 5.2 `supabase start` + `supabase db reset` + `npm run test:local` en verde.
- [x] 5.3 `npx tsc --noEmit`, `npm run lint`, `npm run build` en verde.
- [x] 5.4 Validación del change: `npx openspec validate
  agregar-paginacion-citas-expediente` (si hay CLI) y criterios de éxito del
  proposal revisados uno a uno.

## Fase 4 — Cierre

- [x] 6.1 Commits por unidad de trabajo (Conventional Commits) con pruebas y
  docs juntos; identidad: `8fb4aca`, `e32df20`, `a00adbb`, `e72ccb1`.
- [x] 6.2 Push y PR hacia `main`: https://github.com/proyecto-polaris-ia/medica-app/pull/212
- [ ] 6.3 `openspec archive` del change (CLI no instalado en este entorno;
  ejecutarlo donde exista `openspec`, tras el merge).

## Revisión nativa (Gentle AI, RDD)

- Lineage `review-0377c5a34c33829f`, riesgo medio, lente `review-reliability`,
  25 archivos / 2872 líneas, presupuesto de corrección 200.
- Resultado: **approved** sin hallazgos bloqueantes; 3 sugerencias
  informativas (trabajo posterior, no reabren la revisión):
  - R3-appointments-shape — `src/components/admin/PatientRecordView.tsx:85-88`
  - R3-range-retry-duplication — `src/lib/admin/patient-record.ts:202-214`
  - R3-url-page-domain — `src/components/admin/PatientRecordView.tsx:54-58`
- Acknowledgement quemado (`gentle-ai.review-acknowledged/v1`, revisión
  `sha256:28fae6ee…`); delivery por política ordinaria del repo.
