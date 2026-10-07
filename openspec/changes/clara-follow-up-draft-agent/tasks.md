# Tasks: clara-follow-up-draft-agent

Fase 2 del épico #140 (Clara, capacidad admin de redacción). Base invariante:
spec `follow-up` de #89 (cuatro segmentos, deduplicación por paciente, prioridad
de motivos, orden canónico, exclusión por ronda, envío humano). Specs de este
change: `specs/clara-drafting/spec.md` y `specs/follow-up/spec.md`.

## Decisiones confirmadas antes del apply

- **R1 aceptado:** la entrega se mantiene **interna** (redacción asistida +
  edición + auditoría + guardrails). El transporte HSM `seguimiento_paciente`
  queda **sin cambios**; publicar texto personalizado en el teléfono requiere
  una plantilla HSM con parámetro de cuerpo y se cubrirá en un change/issue
  aparte.
- **Entrega en 3 PRs encadenados** (skill `chained-pr`), confirmado por el
  usuario: slice 1 (redacción + kill switch) → slice 2 (migración + datos +
  rutas) → slice 3 (UI + env). Cada slice es verificable por sí solo; el
  slice 2 no depende del slice 3.
- **Strict TDD** (`apply.tdd: true`): cada tarea de implementación se ordena
  RED (test que falla por la razón esperada) → GREEN (cambio mínimo) → checks.
- **Capa de datos contra Supabase local:** `supabase start` + `supabase db reset`
  + `npm run test:local` (`architecture.md` §9).

---

## Slice 1 — PR1: redacción con LLM y kill switch (≈320 líneas)

Objetivo del slice: `generateFollowUpDraftText` redacta con LLM validado y cae a
plantilla determinista ante cualquier falla, con kill switch por defecto **off**.
No toca BD, rutas ni UI.

### 1.1 RED — kill switch `drafting-flag.test.ts`

- [x] Crear `src/lib/admin/follow-up/__tests__/drafting-flag.test.ts`, espejo de
  `src/lib/citas/__tests__/reminder-reply-flag.test.ts`.
- [x] Casos: ausente/`null`/`''`/`false`/`0`/`no`/valor no reconocido ⇒ `false`;
  `true`/`1`/`yes` (con espacios y mayúsculas) ⇒ `true`; sin argumento lee
  `process.env.CLARA_DRAFTING_ENABLED` y el default es **off**.
- [x] Verificar la falla esperada (el módulo aún no existe):
  `npx vitest run src/lib/admin/follow-up/__tests__/drafting-flag.test.ts`

### 1.2 GREEN — `src/lib/admin/follow-up/drafting-flag.ts`

- [x] Implementar `isClaraDraftingEnabled(rawValue?: string | null): boolean`
  con `TRUTHY_VALUES = { true, 1, yes }`, una sola lectura lazy de la env var sin
  argumento. Sin dependencias nuevas.
- [x] Test 1.1 en verde:
  `npx vitest run src/lib/admin/follow-up/__tests__/drafting-flag.test.ts`

### 1.3 RED — prompt puro en `draft-llm.test.ts`

- [x] Crear `src/lib/admin/follow-up/__tests__/draft-llm.test.ts` con los casos
  del **prompt** (`buildFollowUpDraftPrompt`, puro, sin red).
- [x] Casos: incluye primer nombre (`followUpFirstName`) y `reasonLabel`; **no**
  contiene `patientPhoneE164`, `patientId`, `roundDate`, `sourceAppointmentId`,
  `sourcePlanId`; **no** contiene precios, disponibilidad ni términos clínicos;
  instrucción distinta por cada uno de los 4 motivos (`no_show`,
  `treatment_in_progress`, `quote_no_response`, `inactive`); menciona el límite
  de 600 caracteres.
- [x] Verificar la falla esperada:
  `npx vitest run src/lib/admin/follow-up/__tests__/draft-llm.test.ts`

### 1.4 RED — capacidad y degradación en `draft-llm.test.ts`

- [x] Extender `draft-llm.test.ts` con `generateFollowUpDraftText` y provider
  inyectable (sin red).
- [x] Casos: kill switch activo ⇒ no se llama al provider, `source === 'template'`
  y body de `buildFollowUpDraft`; sin llaves ⇒ cero llamadas de red; provider que
  lanza ⇒ template; provider con timeout (`DRAFT_LLM_TIMEOUT_MS = 8000`) ⇒
  template; provider devuelve `''`, 601 caracteres, o texto con `$100`,
  `diagnóstico` o `promoción` ⇒ descarte + template y el texto inválido no
  aparece en el resultado; provider devuelve texto válido ⇒ `source === 'llm'` y
  body normalizado por `validateFollowUpDraftText`; `templateName` siempre
  `seguimiento_paciente`; la función **nunca lanza** por causas del LLM y
  registra el fallback una sola vez sin cuerpo ni datos clínicos.
- [x] Confirmar que los casos nuevos fallan por ausencia del módulo (parte de RED
  es el archivo previo; los casos de capacidad pasan a verde en 1.5).

### 1.5 GREEN — `src/lib/admin/follow-up/draft-llm.ts`

- [x] Implementar el módulo server-only con:
  `DRAFT_LLM_TIMEOUT_MS = 8000`, `DRAFT_LLM_MAX_OUTPUT_TOKENS = 220`,
  `DRAFT_LLM_TEMPERATURE = 0.4`, `buildFollowUpDraftPrompt`,
  `createDraftProviderFromEnv` (provider OpenAI-compatible con
  `WHATSAPP_AGENT_LLM_API_KEY/BASE_URL/MODEL`, default `deepseek-v4-flash`,
  normalización `proveedor/modelo`, lectura **lazy** de env) y
  `generateFollowUpDraftText(caso, deps?)` con guardrail en el borde de salida.
- [x] `generateText({ timeout: { totalMs: 8000 }, maxRetries: 0,
  maxOutputTokens: 220, temperature: 0.4 })`. No leer ni escribir BD; no enviar.
- [x] `agent/**` permanece intacto.
- [x] Tests 1.1–1.4 en verde:
  `npx vitest run src/lib/admin/follow-up/__tests__/drafting-flag.test.ts src/lib/admin/follow-up/__tests__/draft-llm.test.ts`

### 1.6 Checks del slice 1

- [x] `npx vitest run src/lib/admin/follow-up/__tests__/drafting-flag.test.ts src/lib/admin/follow-up/__tests__/draft-llm.test.ts`
  en verde.
- [x] `npx tsc --noEmit` sin errores nuevos.
- [x] `npm run lint` sin errores nuevos.

---

## Slice 2 — PR2: migración 0023, capa de datos y rutas (≈420 líneas)

Objetivo del slice: auditoría de edición persistida, edición solo en `draft`,
regeneración sin gastar LLM sobre borradores ya decididos. Depende del slice 1.

### 2.1 RED — test estructural `migration-0023.test.ts`

- [x] Crear `src/lib/admin/follow-up/__tests__/migration-0023.test.ts` (estilo de
  `migration-0020.test.ts`). **Trampa:** el test existente quedó desfasado y lee
  `0021_*.sql`; el nuevo se llama `migration-0023.test.ts` y lee
  `0023_*.sql`, sin repetir el off-by-one.
- [x] Casos: el SQL contiene `ADD COLUMN IF NOT EXISTS edited_by uuid` y
  `edited_at timestamptz` (nullable, sin `NOT NULL`, sin `DEFAULT`); no contiene
  `CREATE POLICY`, `GRANT`, `REVOKE`, `DROP` ni `NOT NULL`; el down
  `down/0023_*.down.sql` elimina `edited_at` y luego `edited_by`.
- [x] Verificar la falla esperada:
  `npx vitest run src/lib/admin/follow-up/__tests__/migration-0023.test.ts`

### 2.2 GREEN — migración `0023` up + down

- [x] Crear `supabase/migrations/0023_follow_up_draft_edit_audit.sql`:
  `ALTER TABLE follow_up_message_drafts ADD COLUMN IF NOT EXISTS edited_by uuid,
  ADD COLUMN IF NOT EXISTS edited_at timestamptz;` (sin FK, sin default, sin
  backfill; RLS y policy existentes intactas). **0022 ya está ocupado por
  `0022_patient_files.sql`; no reutilizar ese número.**
- [x] Crear `supabase/migrations/down/0023_follow_up_draft_edit_audit.down.sql`
  con `DROP COLUMN IF EXISTS edited_at, DROP COLUMN IF EXISTS edited_by`.
- [x] Test 2.1 en verde:
  `npx vitest run src/lib/admin/follow-up/__tests__/migration-0023.test.ts`

### 2.3 RED — capa de datos `drafts.test.ts` (extender)

- [x] Extender `src/lib/admin/follow-up/__tests__/drafts.test.ts`.
- [x] Casos: `findFollowUpDraftForRound({ patientId, roundDate })` encuentra por
  `dedup_key` y devuelve `null` si no existe; `updateFollowUpDraftBody({ id, body,
  userId, now })` en `draft` persiste body + `edited_by` + `edited_at` y conserva
  `status`; en `approved`/`rejected`/`sent`/`sent_failed` lanza `ConflictError` y
  **no** escribe; id desconocido ⇒ `NotFoundError`; texto inválido ⇒
  `ValidationError` y **no** escribe; `DRAFT_SELECT_COLUMNS` y
  `mapFollowUpDraftRow` exponen `editedBy`/`editedAt`.

### 2.4 GREEN — `types.ts` + `drafts.ts`

- [x] `src/lib/admin/follow-up/types.ts`: agregar `editedBy`/`editedAt` a
  `FollowUpDraft`.
- [x] `src/lib/admin/follow-up/drafts.ts`: exportar `findFollowUpDraftForRound`
  (envuelve la búsqueda privada por `dedup_key`), agregar
  `updateFollowUpDraftBody` (único punto de escritura de texto; verifica
  `status === 'draft'`, valida con `validateFollowUpDraftText`, persiste
  `edited_by`/`edited_at`) y extender `DRAFT_SELECT_COLUMNS` /
  `mapFollowUpDraftRow`. No tocar `rules.ts`, `follow-up.ts` ni `config.ts`.

### 2.5 Capa de datos contra Supabase local

- [x] `supabase start`
- [x] `supabase db reset` (aplica `0023`)
- [x] `npm run test:local` — los casos de 2.3 en verde contra columnas reales y
  `edited_by`/`edited_at` persistidos.

### 2.6 RED — ruta POST `route.test.ts` (extender)

- [x] Extender `app/api/admin/follow-up/drafts/route.test.ts` con `draft-llm`
  mockeado.
- [x] Casos: `201` al crear con texto LLM; `200` al regenerar un `draft`
  (llamando al generador y a `updateFollowUpDraftBody`); `200` **sin** llamar al
  generador ni escribir cuando el borrador existente está en
  `approved`/`sent`/`rejected`; `401` sin sesión; `400` con `patientId` inválido;
  `404` con paciente fuera de la lista; el body cumple guardrails en todos los
  caminos.

### 2.7 GREEN — `POST /api/admin/follow-up/drafts/route.ts`

- [x] Modificar `POST`: `requireUser()` → `parseUuid` → `listDailyFollowUpCases`
  (solo lectura) → `findFollowUpDraftForRound`: no existe ⇒ generar + crear
  (`201`); existe en `draft` ⇒ regenerar + `updateFollowUpDraftBody` (`200`,
  `regenerated: true`); existe en otro estado ⇒ `200` sin LLM ni escritura
  (`regenerated: false`). Incluir `source` en la respuesta sin persistirlo.

### 2.8 RED — ruta PATCH `[id]/route.test.ts` (extender)

- [x] Extender `app/api/admin/follow-up/drafts/[id]/route.test.ts`.
- [x] Casos: `{ status: 'approved' | 'rejected' }` sigue funcionando igual;
  `{ action: 'edit', body }` válido ⇒ `200` y persiste texto + auditoría dejando
  `draft`; guardrail violado ⇒ `400` y sin escritura; estado no-`draft` ⇒ `409` y
  sin escritura; payload sin `status` ni `action` ⇒ `400`.

### 2.9 GREEN — `PATCH /api/admin/follow-up/drafts/[id]/route.ts`

- [x] Extender `PATCH` con el payload discriminado:
  `{ status }` → `transitionFollowUpDraft` (sin cambios);
  `{ action: 'edit', body }` → `parseNonEmptyString` + `updateFollowUpDraftBody`
  (`409` fuera de `draft`, `400` si viola guardrail);
  cualquier otro payload → `ValidationError` (`400`). Sin envío y sin cambios de
  estado.

### 2.10 Checks del slice 2

- [x] `npx vitest run src/lib/admin/follow-up/__tests__/migration-0023.test.ts src/lib/admin/follow-up/__tests__/drafts.test.ts --exclude 'tests/e2e/**'`
  en verde.
- [x] `npm run test` en verde.
- [x] `npm run test:local` en verde (con Supabase local levantado y reseteado).
- [x] `npx tsc --noEmit` y `npm run lint` sin errores nuevos.

---

## Slice 3 — PR3: UI de edición, regenerar y env (≈260 líneas)

Objetivo del slice: la secretaria edita el borrador en el WCC y regenera desde el
panel; auditoría visible. No depende del slice 2 para compilar los tests (mocks),
pero se encadena después por orden de revisión.

### 3.1 RED — `page.test.tsx` del WCC (extender)

- [x] Extender
  `app/(admin)/whatsapp-command-center/follow-up-drafts/page.test.tsx`.
- [x] Casos: en `draft` se renderiza el `<textarea>` con el body y el aviso "El
  envío requiere aprobación; guardar no envía nada."; guardar hace `fetch` a
  `/api/admin/follow-up/drafts/<id>` con `method: 'PATCH'` y
  `{ action: 'edit', body }`; en `approved`/`sent` no hay editor; se muestra
  "Editado {fecha}" cuando `editedAt` existe. Triangulación: 409 muestra error
  visible y no llama a `router.refresh()`.

### 3.2 RED — `FollowUpList.test.tsx` (extender)

- [x] Extender
  `src/components/admin/follow-up/__tests__/FollowUpList.test.tsx`.
- [x] Casos: con `draftGenerated === true` el botón dice "Regenerar borrador" y
  sigue haciendo `POST` al endpoint de borradores; "Agendar cita" sigue siendo un
  `Link`.

### 3.3 GREEN — editor WCC + data layer

- [x] Crear `app/(admin)/whatsapp-command-center/follow-up-drafts/draft-editor.tsx`
  (client): `<textarea>`, "Guardar cambios" (`PATCH { action: 'edit' }`), estado
  `busy`, error visible, `router.refresh()`, aviso de que guardar no envía. Solo
  se renderiza cuando `status === 'draft'`.
- [x] Modificar
  `app/(admin)/whatsapp-command-center/follow-up-drafts/page.tsx`: renderiza
  `<DraftEditor>` en `DraftCard` cuando `status === 'draft'` y muestra "Editado …"
  con `formatRelativeTime` cuando `editedAt` no es `null`; ajustar el copy de
  "generados por plantilla" a "redactados por Clara y revisados por una persona".
- [x] Modificar `src/lib/wcc-follow-up-drafts.ts`: `WccFollowUpDraftRow`/`mapDraft`
  agregan `editedBy`/`editedAt` y el `select` incluye `edited_by, edited_at`;
  mantener la degradación a cola vacía.
- [x] `draft-actions.tsx` sin cambios funcionales (Aprobar / Rechazar / Enviar).

### 3.4 GREEN — `FollowUpCaseCard.tsx` (+ `FollowUpList.tsx` si aplica)

- [x] `src/components/admin/follow-up/FollowUpCaseCard.tsx`: el botón dice
  "Generar borrador" y, con `draftGenerated`, "Regenerar borrador" (mismo
  `onGenerateDraft`); conservar el enlace al WCC. El copy del botón vive en la
  tarjeta, así que `FollowUpList.tsx` no requiere cambios.
- [x] Tests 3.1–3.2 en verde:
  `npx vitest run "app/(admin)/whatsapp-command-center/follow-up-drafts/page.test.tsx" src/components/admin/follow-up/__tests__/FollowUpList.test.tsx`

### 3.5 GREEN — `.env.local.example`

- [x] Agregar `CLARA_DRAFTING_ENABLED=false` con comentario de rollback
  (patrón de `WHATSAPP_REMINDER_REPLY_ENABLED`): `true` enciende el LLM; `false`
  o unset fuerza la plantilla y restaura el comportamiento previo.
  **Resuelto:** aplicado por el orquestador (ruta `.env*` denegada al worker;
  archivo de ejemplo versionado, sin secretos).

### 3.6 Checks del slice 3

- [x] `npm run test` en verde.
- [x] `npx tsc --noEmit` y `npm run lint` sin errores nuevos.
- [ ] `npm run build` en verde (lo ejecuta el orquestador en la fase Verify).

---

## Fase de verificación (final, tras el slice 3)

- [ ] V.1 `supabase start` + `supabase db reset` (aplica `0023`).
- [ ] V.2 `npm run test:local` en verde (capa de datos + migración).
- [ ] V.3 `npm run test` en verde (suites unit/integración).
- [ ] V.4 `npx tsc --noEmit` sin errores.
- [ ] V.5 `npm run lint` sin errores.
- [ ] V.6 `npm run build` en verde.
- [ ] V.7 Preparación de archivo (archive): confirmar deltas MODIFIED de
  `follow-up`, la capability nueva `clara-drafting`, el `verify-report.md` con
  evidencia y la bitácora en `odd/tasks/clara-follow-up-draft-agent.md`. El
  archive SDD formal se ejecuta en su fase propia (no en este change).

---

## Forecast de carga

| Slice / PR | Contenido | Líneas estimadas | Archivos de test |
|---|---|---|---|
| 1 — PR1 | flag + `draft-llm.ts` + prompt + unit tests | ≈320 | `drafting-flag.test.ts`, `draft-llm.test.ts` (nuevos) |
| 2 — PR2 | migración 0023 up/down + `types.ts` + `drafts.ts` + rutas POST/PATCH + tests | ≈420 | `migration-0023.test.ts` (nuevo); `drafts.test.ts`, `route.test.ts`, `[id]/route.test.ts` (extendidos) |
| 3 — PR3 | `draft-editor.tsx` + `page.tsx` + `wcc-follow-up-drafts.ts` + `FollowUpCaseCard.tsx` (+`FollowUpList.tsx`) + `.env.local.example` + tests | ≈260 | `page.test.tsx`, `FollowUpList.test.tsx` (extendidos) |

- **Conteo de archivos de test:** 8 archivos (9 filas del plan TDD;
  `draft-llm.test.ts` cubre prompt y capacidad). Casos estimados: ≈14 (slice 1),
  ≈18 (slice 2), ≈8 (slice 3).
- **Archivos nuevos (exactos):** `src/lib/admin/follow-up/drafting-flag.ts`,
  `src/lib/admin/follow-up/draft-llm.ts`,
  `supabase/migrations/0023_follow_up_draft_edit_audit.sql`,
  `supabase/migrations/down/0023_follow_up_draft_edit_audit.down.sql`,
  `app/(admin)/whatsapp-command-center/follow-up-drafts/draft-editor.tsx`.
- **Decision needed before apply: No** — las decisiones de implementación
  (superficie, kill switch, timeout, módulo, prompt, migración, rutas, UI) están
  cerradas en `design.md`; R1 se resolvió por el usuario (alcance interno, HSM
  sin cambios).
