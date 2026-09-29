# Design: Planes de tratamiento (Fase 2 del expediente)

## Technical Approach

Extender el patrón consolidado en Fase 1 (`clinical-record`) sin introducir
arquitectura nueva. El cambio es puramente aditivo: dos tablas nuevas
(`treatment_plans` y `treatment_plan_items`), una capa de datos
`src/lib/admin/treatment-plans.ts`, rutas API anidadas bajo
`app/api/admin/patients/[id]/treatment-plans`, y una pestaña nueva en el
expediente del paciente.

El modelo respeta la regla de dominio innegociable: **los montos los define el
staff en consultorio, nunca el LLM**. Esta regla se materializa en dos capas:

1. **Backend valida y ejecuta** (`rules.design`): el LLM del agente de WhatsApp
   no participa en este CRUD. Todo cálculo de `total_amount` y toda transición
   de estado se ejecuta en la capa de datos (`src/lib/admin/*`), que es la
   única escritora de estas tablas (vía `getSupabaseAdmin()` service-role,
   server-side only). El LLM no define montos en ningún punto del flujo.
2. **Snapshot del acuerdo económico**: `total_amount` es una columna almacenada
   que se recalcula automáticamente **solo** mientras `status = 'draft'`. Al
   salir de `draft`, el monto se congela y cualquier mutación de ítems que
   alteraría el total se rechaza (hay que revertir a `draft`).

El mapeo a las specs es directo:

- `treatment-plans/spec.md` → migración, capa de datos, API y validación de
  planes/ítems, semántica de `total_amount`, lifecycle de estados y
  `accepted_at`.
- `patient-record-summary/spec.md` → la pestaña "Plan de tratamiento" en
  `PatientRecordTabs.tsx`.

## Architecture Decisions

### Decision: `total_amount` como snapshot (columna almacenada)

**Choice**: Columna `total_amount numeric(12,2) NOT NULL DEFAULT 0.00` en
`treatment_plans`. La capa de datos recalcula `sum(quantity * unit_price)`
exclusivamente cuando `status = 'draft'`. Toda mutación de ítems
(crear/editar/eliminar) que altere el total se rechaza con `ConflictError`
(409) cuando el plan no está en `draft`; la única vía para volver a editar
montos es transicionar explícitamente de vuelta a `draft`.

**Alternatives considered**:

- **Trigger en la base de datos**: un trigger recalcularía el total en cada
  cambio de ítem. Rechazado porque mutaría en silencio totales ya aceptados,
  destruyendo la semántica de "monto acordado" y dificultando versionar
  acuerdos. (exploration Opción B.)
- **Columna generada / cálculo al vuelo**: derivar el total siempre de los
  ítems. Rechazado porque no puede preservar el monto histórico aceptado; se
  perdería el snapshot que la Fase 3 (mora) necesita. (exploration Opción C.)

**Rationale**: La semántica requerida por la spec es la de una *foto* del
acuerdo económico, no una derivación viva. El guard de "solo en `draft`" vive en
la capa de datos porque es el único escritor (service-role), es fácil de probar
de forma unitaria y es trivial de auditar. El recálculo se hace en la capa de
aplicación (no en un trigger) para que ningún actor externo pueda mutar un total
aceptado.

### Decision: `accepted_at` ahora; pagos diferidos a Fase 3

**Choice**: `accepted_at timestamptz NULL` se puebla con `now()` en la
transición a `accepted`. `due_date` y cualquier campo de pago se difieren a
Fase 3.

**Alternatives considered**:

- **Agregar `due_date` ahora**: rechazado. Es especulativo; no hay reglas de
  negocio definidas para pagos a plazos, abonos o número de pagos. Agregarlo
  prematuramente produce migraciones confusas. (exploration Opción B.)

**Rationale**: Captura el momento de aceptación (insumo para Fase 3) sin
inventar un modelo de pagos. Migración futura mínima.

### Decision: `unit_price` independiente por ítem; `service_id` referencia descriptiva

**Choice**: `treatment_plan_items.unit_price numeric(12,2)` es un valor
independiente capturado por ítem. `service_id uuid NULL REFERENCES services(id)
ON DELETE SET NULL` es una referencia descriptiva opcional (hereda
nombre/duración en la UI, nunca el precio).

**Alternatives considered**:

- **Copiar precio del catálogo**: no viable — `services` solo tiene `name` y
  `duration_minutes`, no precio. (exploration Opción A.)
- **Agregar columna de precio a `services`**: rechazado — cambia la semántica
  del catálogo (procedimientos, no tarifas fijas) y está fuera de alcance.

**Rationale**: Refleja el acuerdo real con el paciente (los precios varían por
caso) sin modificar `services`. `ON DELETE SET NULL` preserva el historial del
ítem (la `description` sobrevive) si un servicio se elimina.

### Decision: Atomicidad / forma de la API de creación (RESUELVE el punto abierto del proposal)

**Choice**: La creación envía **plan + ítems en UNA petición** `POST
/api/admin/patients/[id]/treatment-plans` con body `{ name, providerId,
clinicalVisitId?, notes?, items? }`. La capa de datos inserta la cabecera
(`status='draft'`, `total_amount=0`), inserta los ítems si vienen, recalcula el
total y devuelve el plan con sus ítems. Ante un fallo en la inserción de ítems,
se elimina el plan recién creado (el `ON DELETE CASCADE` borra los ítems
parciales) y se relanza el error. Las mutaciones posteriores de ítems se hacen
por endpoints anidados:

- `POST   /treatment-plans/[planId]/items`
- `PATCH  /treatment-plans/[planId]/items/[itemId]`
- `DELETE /treatment-plans/[planId]/items/[itemId]`

**Alternatives considered**:

- **Ítems como sub-recurso también para la creación** (dos peticiones: primero
  plan vacío, luego ítems): rechazado. Más round-trips, y deja una ventana en la
  que existe un plan `draft` vacío visible para el usuario.
- **Transacción a nivel de BD vía RPC** (`create_treatment_plan_with_items`
  plpgsql SECURITY DEFINER): atomicidad real. Rechazado como primario porque
  introduce un RPC/plpgsql en la capa admin, que es uniformemente
  supabase-js puro en sus archivos hermanos (el precedente de RPC
  `booking_free_slots` vive solo en la capa de booking). La limpieza
  best-effort con `ON DELETE CASCADE` es suficiente para un CRUD administrativo
  de un solo escritor.

**Rationale**: Una sola petición da mejor UX (sin destello de plan vacío) y
honra la recomendación del proposal. La capa de datos se mantiene consistente
con sus hermanos (supabase-js puro, sin RPC). El guard de `total_amount` solo en
`draft` se aplica en los endpoints de ítems.

### Decision: Validación de transiciones de estado en la capa de datos

**Choice**: Las reglas de lifecycle se **aplican en la capa de datos**
(`treatment-plans.ts`), no en un trigger/CHECK de base de datos. La capa
mantiene un mapa explícito de transiciones permitidas y lo valida en
`updateTreatmentPlan` cuando el body trae `status`. La base de datos solo
impone los invariantes estáticos (enums + `CHECK` de no-negatividad).

**Alternatives considered**:

- **Trigger de transición en Postgres**: rechazado. Complejidad innecesaria; la
  capa admin es el único escritor (service-role), por lo que el guard en TS es
  suficiente y más fácil de probar/cambiar.
- **CHECK de `accepted_at` solo cuando `status='accepted'`**: parcialmente
  impracticable con CHECK (necesita trigger); se aplica en la capa de datos.

**Rationale**: Las transiciones son lógica de negocio, no invariante de datos
física. `rules.design` ("the backend validates and executes") se satisface:
la capa de datos valida y ejecuta. Los CHECK estáticos en BD (`total_amount >= 0`,
`unit_price >= 0`, `quantity > 0`, enums) son la red de seguridad secundaria que
sobrevive a cualquier escritor futuro.

Tabla de transiciones permitidas (implementada como mapa en la capa de datos):

| Estado actual | Transiciones permitidas |
|---------------|-------------------------|
| `draft`       | `presented`, `cancelled` |
| `presented`   | `accepted`, `draft`, `cancelled` |
| `accepted`    | `in_progress`, `cancelled` |
| `in_progress` | `completed`, `cancelled` |
| `completed`   | *(terminal)* |
| `cancelled`   | *(terminal)* |

- `draft → accepted` directo está **rechazado** (debe pasar por `presented`).
- `completed` y `cancelled` son terminales (no admiten más cambios de estado).
- Transición a `accepted` puebla `accepted_at = now()`.

### Decision: Estructura de la migración `0015`

**Choice**: `supabase/migrations/0015_treatment_plans.sql` + su contraparte
`supabase/migrations/down/0015_treatment_plans.down.sql`, siguiendo el patrón
idempotente de Fase 1: enums con `CREATE TYPE ... IF NOT EXISTS` dentro de un
bloque `DO $$`, `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, RLS
con `ENABLE ROW LEVEL SECURITY` + `REVOKE ALL ON TABLE ... FROM anon`.

**Alternatives considered**: ninguna relevante — es el patrón establecido y
requerido por el proposal.

**Rationale**: Idempotencia consistente con `0013_clinical_record.sql` y
`0001_agenda_tables.sql`. Índices: `treatment_plans(patient_id, created_at DESC)`
(para el listado por paciente ordenado) y
`treatment_plan_items(treatment_plan_id)` (para el detalle del plan). El
`down` revierte en orden inverso de dependencia: índices → `treatment_plan_items`
→ `treatment_plans` → tipos enum.

## Data Flow

```
Pestaña "Plan de tratamiento" (client)
  │  fetch
  ├─ GET  /api/admin/patients/[id]/treatment-plans ──▶ listTreatmentPlans()
  │                                                     └▶ getSupabaseAdmin() → treatment_plans
  ├─ POST /api/admin/patients/[id]/treatment-plans ──▶ createTreatmentPlan()
  │                                                     └▶ insert plan → insert items → recompute total
  ├─ GET  /.../treatment-plans/[planId] ─────────────▶ getTreatmentPlan()
  │                                                     └▶ plan (.single) + items (list)
  ├─ PATCH /.../treatment-plans/[planId] ────────────▶ updateTreatmentPlan()
  │                                                     └▶ validate transition → set accepted_at?
  ├─ DELETE /.../treatment-plans/[planId] ───────────▶ deleteTreatmentPlan()   [solo draft]
  ├─ POST /.../treatment-plans/[planId]/items ───────▶ createTreatmentPlanItem()  [draft] + recompute
  ├─ PATCH /.../[planId]/items/[itemId] ─────────────▶ updateTreatmentPlanItem()  [status libre; resto draft] + recompute
  └─ DELETE /.../[planId]/items/[itemId] ────────────▶ deleteTreatmentPlanItem()  [draft] + recompute

Cada ruta: requireUser() → handleAdminRequest()  (401 / 400 / 404 / 409 / 500)
```

Flujo de recálculo (mutación de ítem en `draft`):

```
mutateItem()
  1. assertDraft(planId)        → si status ≠ 'draft' lanza ConflictError
  2. insert/update/delete ítem
  3. select quantity, unit_price de todos los ítems del plan
  4. total = sumLineTotals(items)   (aritmética en centavos enteros)
  5. update treatment_plans.total_amount = total
  6. devuelve el ítem (o el plan con ítems)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/0015_treatment_plans.sql` | Create | Enums `treatment_plan_status` y `treatment_plan_item_status`, tablas `treatment_plans` y `treatment_plan_items`, índices, CHECKs y RLS. |
| `supabase/migrations/down/0015_treatment_plans.down.sql` | Create | Reversión ordenada: índices → tablas → tipos. |
| `src/lib/admin/types.ts` | Modify | Tipos `TreatmentPlanStatus`, `TreatmentPlanItemStatus`, `TreatmentPlan`, `TreatmentPlanItem`, `TreatmentPlanWithItems`, `TreatmentPlanInput`, `TreatmentPlanUpdateInput`, `TreatmentPlanItemInput`, `TreatmentPlanItemUpdateInput`. |
| `src/lib/admin/validate.ts` | Modify | `parseTreatmentPlanStatus`, `parseTreatmentPlanItemStatus`, `parseMoney`, `parseFdiTooth`. |
| `src/lib/admin/treatment-plans.ts` | Create | Funciones `list/get/create/update/delete` de planes e ítems + `assertDraft` + `sumLineTotals`/recompute. |
| `src/lib/admin/__tests__/treatment-plans.test.ts` | Create | Pruebas unitarias con mock de `getSupabaseAdmin`, estilo `clinical-visits.test.ts`. |
| `app/api/admin/patients/[id]/treatment-plans/route.ts` | Create | `GET` (list) y `POST` (create plan+items). |
| `app/api/admin/patients/[id]/treatment-plans/[planId]/route.ts` | Create | `GET`, `PATCH`, `DELETE`. |
| `app/api/admin/patients/[id]/treatment-plans/[planId]/items/route.ts` | Create | `GET` (list ítems) y `POST` (create ítem). |
| `app/api/admin/patients/[id]/treatment-plans/[planId]/items/[itemId]/route.ts` | Create | `PATCH` y `DELETE` de ítem. |
| `app/api/admin/patients/[id]/treatment-plans/route.test.ts` | Create | Pruebas de ruta (401/200/201/400), estilo `services/route.test.ts`. |
| `app/api/admin/patients/[id]/treatment-plans/[planId]/route.test.ts` | Create | Pruebas de ruta del plan individual. |
| `app/api/admin/patients/[id]/treatment-plans/[planId]/items/route.test.ts` | Create | Pruebas de ruta de ítems (incluye 409 en no-draft). |
| `app/(admin)/patients/[id]/page.tsx` | Modify | Carga `treatmentPlans` y propaga `onPlansChanged`; pasa estado/errores a las pestañas. |
| `src/components/admin/patient-record/PatientRecordTabs.tsx` | Modify | Agrega `plans` a `TabId` y a `TABS` (etiqueta "Plan de tratamiento"); renderiza `TreatmentPlansTab`. |
| `src/components/admin/patient-record/TreatmentPlansTab.tsx` | Create | Lista de planes (estado, dentista responsable, monto total) + estados vacío/carga/error + botón nuevo/editar/eliminar. |
| `src/components/admin/patient-record/TreatmentPlanForm.tsx` | Create | Formulario cabecera + editor de ítems con total en vivo; solo-lectura cuando el plan no está en `draft`. |

## Interfaces / Contracts

### TypeScript (adiciones a `src/lib/admin/types.ts`)

```ts
export type TreatmentPlanStatus =
  | 'draft'
  | 'presented'
  | 'accepted'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export type TreatmentPlanItemStatus = 'pending' | 'done';

export type TreatmentPlan = {
  id: string;
  patientId: string;
  providerId: string;
  clinicalVisitId: string | null;
  name: string;
  status: TreatmentPlanStatus;
  totalAmount: number;
  acceptedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TreatmentPlanItem = {
  id: string;
  treatmentPlanId: string;
  description: string;
  serviceId: string | null;
  tooth: string | null;
  quantity: number;
  unitPrice: number;
  status: TreatmentPlanItemStatus;
  createdAt: string;
  updatedAt: string;
};

export type TreatmentPlanWithItems = TreatmentPlan & {
  items: TreatmentPlanItem[];
};

export type TreatmentPlanInput = {
  providerId: string;
  clinicalVisitId?: string | null;
  name: string;
  notes?: string | null;
  items?: TreatmentPlanItemInput[]; // para creación atómica
};

export type TreatmentPlanUpdateInput = {
  providerId?: string;
  clinicalVisitId?: string | null;
  name?: string;
  notes?: string | null;
  status?: TreatmentPlanStatus;
  // totalAmount y acceptedAt NO son editables desde el cliente
};

export type TreatmentPlanItemInput = {
  description: string;
  serviceId?: string | null;
  tooth?: string | null;
  quantity?: number;      // default 1
  unitPrice: number;
};

export type TreatmentPlanItemUpdateInput = {
  description?: string;
  serviceId?: string | null;
  tooth?: string | null;
  quantity?: number;
  unitPrice?: number;
  status?: TreatmentPlanItemStatus;
};
```

Nota de mapeo: `total_amount`/`unit_price` (`numeric`) se coercionan con
`Number(row.total_amount ?? 0)` en `mapRow`, porque PostgREST puede devolver
`numeric` como string para preservar precisión. La aritmética de dinero se hace
en centavos enteros (ver `sumLineTotals` abajo).

### API route contract

Todas las rutas usan `requireUser()` + `handleAdminRequest()`; códigos
200/201/204 y errores 400 (`ValidationError`), 401 (`UnauthorizedError`),
404 (`NotFoundError`), 409 (`ConflictError`), 500.

| Método | Ruta | Body | Respuesta |
|--------|------|------|-----------|
| `GET` | `/api/admin/patients/[id]/treatment-plans` | — | `200 { treatmentPlans: TreatmentPlan[] }` |
| `POST` | `/api/admin/patients/[id]/treatment-plans` | `TreatmentPlanInput` | `201 { treatmentPlan: TreatmentPlanWithItems }` |
| `GET` | `.../treatment-plans/[planId]` | — | `200 { treatmentPlan: TreatmentPlanWithItems }` |
| `PATCH` | `.../treatment-plans/[planId]` | `TreatmentPlanUpdateInput` | `200 { treatmentPlan: TreatmentPlan }` |
| `DELETE` | `.../treatment-plans/[planId]` | — | `204` (solo `draft`) |
| `GET` | `.../treatment-plans/[planId]/items` | — | `200 { items: TreatmentPlanItem[] }` |
| `POST` | `.../treatment-plans/[planId]/items` | `TreatmentPlanItemInput` | `201 { item: TreatmentPlanItem }` |
| `PATCH` | `.../treatment-plans/[planId]/items/[itemId]` | `TreatmentPlanItemUpdateInput` | `200 { item: TreatmentPlanItem }` |
| `DELETE` | `.../treatment-plans/[planId]/items/[itemId]` | — | `204` |

Reglas de negocio a nivel de ruta/capa de datos:

- `total_amount` y `accepted_at` nunca se aceptan del body (se calculan/derivan).
- Crear/editar/eliminar ítem (salvo el campo `status` del ítem) → solo con plan
  en `draft`; en otro caso `409`.
- El campo `status` del ítem (`pending`↔`done`) es **independiente** del estado
  del plan y se permite en cualquier estado.
- `DELETE` del plan → solo en `draft` (en `accepted`/`presented` se debe
  cancelar, no borrar, para preservar auditoría).
- `provider_id` es obligatorio (NOT NULL): la spec exige "dentista responsable".

### Supabase table shapes (migración `0015`)

```sql
-- Enums idempotentes (bloque DO $$, patrón 0001).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'treatment_plan_status') THEN
    CREATE TYPE treatment_plan_status AS ENUM (
      'draft', 'presented', 'accepted', 'in_progress', 'completed', 'cancelled'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'treatment_plan_item_status') THEN
    CREATE TYPE treatment_plan_item_status AS ENUM ('pending', 'done');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS treatment_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES providers(id),
  clinical_visit_id uuid REFERENCES clinical_visits(id) ON DELETE SET NULL,
  name text NOT NULL,
  status treatment_plan_status NOT NULL DEFAULT 'draft',
  total_amount numeric(12,2) NOT NULL DEFAULT 0.00,
  accepted_at timestamptz,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT treatment_plans_total_amount_check CHECK (total_amount >= 0)
);

CREATE TABLE IF NOT EXISTS treatment_plan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  treatment_plan_id uuid NOT NULL REFERENCES treatment_plans(id) ON DELETE CASCADE,
  description text NOT NULL,
  service_id uuid REFERENCES services(id) ON DELETE SET NULL,
  tooth text,
  quantity int NOT NULL DEFAULT 1,
  unit_price numeric(12,2) NOT NULL,
  status treatment_plan_item_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT treatment_plan_items_quantity_check CHECK (quantity > 0),
  CONSTRAINT treatment_plan_items_unit_price_check CHECK (unit_price >= 0)
);

CREATE INDEX IF NOT EXISTS idx_treatment_plans_patient_created
  ON treatment_plans (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_treatment_plan_items_plan
  ON treatment_plan_items (treatment_plan_id);

ALTER TABLE treatment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatment_plan_items ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE treatment_plans, treatment_plan_items FROM anon;
```

### Helpers de dinero (en `treatment-plans.ts`)

```ts
function moneyToCents(amount: number): number {
  return Math.round(amount * 100);
}

function sumLineTotals(items: { quantity: number; unitPrice: number }[]): number {
  const cents = items.reduce(
    (acc, it) => acc + it.quantity * moneyToCents(it.unitPrice),
    0
  );
  return cents / 100; // evita deriva de punto flotante (0.1 + 0.2)
}
```

## Testing Strategy

TDD estricto activo (`npm run test`, Vitest). RED → GREEN → REFACTOR; primero
se escriben los tests de validadores y capa de datos, luego la implementación.

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (validadores) | `parseMoney` (rechaza negativo y >2 decimales), `parseFdiTooth` ("11"/"26"/"47"/"18" válidos; "99"/"1"/"a1" inválidos; null→null), `parseQuantity` (rechaza 0/negativo), enums de estado. | Tests directos de funciones puras en `validate.ts`. |
| Unit (capa de datos) | `list/get/create/update/delete` de planes; recálculo de `total_amount` al crear/editar/eliminar ítem en `draft`; `assertDraft` lanza `ConflictError` en no-draft; transiciones (`draft→accepted` rechazada, `presented→accepted` puebla `accepted_at`, `completed` terminal, `cancelled` desde no-`completed`); `createTreatmentPlan` atómico (plan + ítems + total). | Mock de `getSupabaseAdmin` con helper `buildQuery()` (estilo `clinical-visits.test.ts`). |
| Integration (rutas) | 401 sin sesión; GET list 200; POST create 201/400; GET/PATCH/DELETE plan 200/204/404; ítems POST/PATCH/DELETE con 409 en no-draft. | Tests de ruta con `Request` y mocks de `requireUser` + capa de datos (estilo `services/route.test.ts`). |
| E2E | Humo: el expediente muestra la pestaña "Plan de tratamiento"; crear un plan y verlo listado. | Playwright (`npm run test:e2e`) — escenario ligero, opcional. |

## Threat Matrix

`N/A` — este cambio no introduce routing, comandos de shell, subprocesos,
automatización de VCS/PR, clasificación de archivos ejecutables ni integración
de procesos. No se aplican filas de la threat-matrix y no se generan tareas RED
derivadas.

## Migration / Rollout

Migración puramente aditiva (`0015`): no se alteran tablas ni columnas
existentes y no hay backfill de datos. Sin feature flags (CRUD administrativo
aditivo). El rollout es directo: aplicar migración → desplegar código. El
rollback es el del proposal: ejecutar `down/0015_treatment_plans.down.sql`
(índices → ítems → planes → tipos) y `git revert` del commit del cambio;
verificar `npm run test`, `npm run typecheck` y `npm run build` en verde.

## Open Questions

- [ ] **`provider_id` NOT NULL**: se fija `NOT NULL` (la spec exige "dentista
      responsable"). Confirmar que se prefiere `ON DELETE RESTRICT` implícito
      (forzar reasignación antes de borrar un provider) sobre `SET NULL`.
- [ ] **`DELETE` restringido a `draft`**: se recomienda borrar solo planes en
      `draft` y cancelar los ya presentados/aceptados (preserva auditoría). La
      spec solo especifica borrado en `draft`; confirmar que `presented`/
      `accepted`/`in_progress` no son borrables.
- [ ] **`created_by`**: la columna existe pero se deja `null` (espejo de
      `clinical_visits`). Confirmar si debe poblarse con el `id` de
      `requireUser()`.
- [ ] **`accepted_at` al cancelar**: se conserva el valor histórico si un plan
      `accepted` se cancela. Confirmar que no debe limpiarse.
