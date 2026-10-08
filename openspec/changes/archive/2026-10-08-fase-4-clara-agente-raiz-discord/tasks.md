# Tasks: fase-4-clara-agente-raiz-discord

Issue [#161](https://github.com/proyecto-polaris-ia/medica-app/issues/161) · épico
#140 · Fase 4. Deltas: `clara-agent`, `clara-discord-channel`,
`clara-follow-up-tools` y `clara-drafting` (modificado).

Convención de estado: `[ ]` pendiente · `[x]` completo.

Regla de diseño que gobierna todas las tareas (`design.md`, `openspec/config.yaml#rules.design`):
**el LLM interpreta y redacta; el backend valida y ejecuta**. Ninguna tarea de
este plan invierte ese orden.

TDD estricto (`openspec/config.yaml#testing.strict_tdd: true`) con runner
`npm run test` y focalizado `npx vitest run tests/agent/clara`. En cada tarea de
comportamiento, la tarea de prueba (RED) precede a la de implementación (GREEN)
y cierra con triángulo (TRIANGULATE) y refactor cuando aplica. Todos los tests
viven bajo `tests/agent/clara/` (paridad con `tests/agent/mora/`), usan
`// @vitest-environment node`, `vi.mock("@/lib/supabase/server")` y el patrón de
cola de query builders de `tests/agent/mora/tools/get-patient-balance.test.ts`.
Cada tarea cabe en una sesión de trabajo y declara archivos exactos (§2 del
design) y el requirement de spec que verifica.

**Non-goal explícito:** NO se crea cron ni generación en lote de la lista diaria
(`clara-follow-up-tools` → "No existe generación en lote"; ver §D4). Toda
generación de borrador es bajo demanda y por paciente.

---

## 1. Base del agente raíz y contrato estructural

Verifica `clara-agent` → "Agente raíz independiente de Clara" y "Configuración
del modelo por entorno sin datos inventados"; `clara-follow-up-tools` → "El envío
queda fuera del set de tools".

- [x] 1.1 **RED:** crear `tests/agent/clara/structure.test.ts`. Debe verificar:
  existen `agents/clara/agent/{agent.ts,model.ts,instructions.md}`; el set exacto
  de los 7 archivos de `agents/clara/agent/tools/`; `channels/discord.ts` con
  `discordChannel` + `onCommand`; las 2 skills; **no** existe `package.json` en
  `agents/clara` (si existe, `isWorkspaceOwnedAgentRoot` deja de resolver el
  agente); **no** existe `subagents/`; el grep de los archivos de tools no
  menciona `claimFollowUpDraftForSend`, `markFollowUpDraftSent`,
  `markFollowUpDraftSentFailed`, `sendFollowUpDraft` ni
  `insertFollowUpOutboundMessage`; `agents/eva/agent/tools` y
  `agents/mora/agent/tools` no cambian. Capturar el fallo observado. Nota de
  TDD: este test permanece rojo hasta cerrar la fase 5 — es el contrato
  estructural del change, no un fallo a esconder.
- [x] 1.2 **GREEN (estructura base):** crear `agents/clara/agent/agent.ts`
  (`defineAgent({ model: createDynamicModel(), limits: { sessionTimeoutMs: 1800000 } })`,
  contenido de §5) y `agents/clara/agent/model.ts` (copia casi literal de
  `agents/mora/agent/model.ts`: `resolveModelConfig(env)` + `createDynamicModel()`).
  Sin `package.json` y sin `subagents/`. Excepción de aplicabilidad TDD: es copia
  de configuración ya cubierta por `tests/agent/model.test.ts`; la verificación
  es estructural (§1.1) más `npx eve info` y `npx tsc --noEmit`.
- [x] 1.3 **TRIANGULATE:** `npx vitest run tests/agent/clara/structure.test.ts` y
  confirmar que los fallos restantes corresponden solo a los archivos de las
  fases 2–5 (canal, acceso, tools, skills, instrucciones), nunca a `agent.ts` /
  `model.ts` / la ausencia de `package.json`.

## 2. Acceso, actor y canal Discord (TDD)

Verifica `clara-discord-channel` → "Canal Discord propio con ruta y comando
propios", "Credenciales por entorno con degradación graceful", "Allowlist
fail-closed de staff y doctores autorizados", "Re-verificación de autorización en
cada tool", "Superficie de staff, no canal de paciente" y "Desactivación de la
superficie conversacional sin cambios de código".

- [x] 2.1 **RED:** crear `tests/agent/clara/access.test.ts`. Casos: allowlist
  ausente / vacía / en blanco ⇒ `{ error }`; principal no-Discord ⇒ `{ error }`;
  `principalType` distinto de `"user"` ⇒ `{ error }`; ID fuera de la lista ⇒
  `{ error }`; ID dentro ⇒ `{ discordId, actorUserId }`;
  `CLARA_DISCORD_ACTOR_MAP` sin entrada ⇒ `actorUserId: null` y
  `requireClaraActor` ⇒ `{ error: CLARA_ACTOR_REFUSAL }`; mapa con UUID inválido
  ⇒ se ignora; `resolvePatient` por id / teléfono / nombre (0 ⇒ `notFound`,
  1 ⇒ `patient`, >1 ⇒ `candidates`); `resolveRoundCase` en lista / ya marcado /
  fuera de ronda; mensajes de negativa sin datos de pacientes.
- [x] 2.2 **GREEN:** crear `agents/clara/agent/access.ts` con la API y reglas
  exactas de §6 (`parseStaffAllowlist`, `parseActorMap`, `resolveClaraAccess`,
  `requireClaraActor`, `resolvePatient`, `resolveRoundCase`,
  `buildPatientNotResolvedError`, `env` inyectable). Adaptado de
  `agents/mora/agent/access.ts` sin importarlo. Repetir `npx vitest run
  tests/agent/clara/access.test.ts` hasta verde.
- [x] 2.3 **TRIANGULATE access:** negativas con allowlist compuesta por comas y
  espacios, `env` inyectado sin mutar `process.env`, y fallo de Supabase que
  devuelve `{ error }` sin lanzar y sin datos inventados.
- [x] 2.4 **RED:** crear `tests/agent/clara/channels/discord.test.ts`. Casos:
  usuario autorizado ⇒ `{ title: "Clara · seguimiento", auth }` con
  `authenticator: "discord"`; usuario no autorizado ⇒ `null`; allowlist ausente
  ⇒ `null`; IDs de la allowlist de Mora **no** autorizan a Clara; el canal no
  registra binding de WhatsApp.
- [x] 2.5 **GREEN:** crear `agents/clara/agent/channels/discord.ts` con
  `discordChannel({ credentials: credential("DISCORD_*"), onCommand })` y
  `handleClaraDiscordCommand` exportado para test (§D8, §6), credenciales
  `DISCORD_APPLICATION_ID` / `DISCORD_BOT_TOKEN` / `DISCORD_PUBLIC_KEY` con
  placeholder `"unconfigured"`. El canal se construye siempre para que
  `eve build` registre la ruta.
- [x] 2.6 **TRIANGULATE canal:** `onCommand` con allowlist válida y
  credenciales ausentes sigue devolviendo principal (degradación graceful en
  build; rechazo en runtime lo prueba §13.1 y §13.2); ID con mayúsculas/espacios
  se normaliza.

## 3. Tools de lectura (TDD, RED primero)

Verifica `clara-follow-up-tools` → "Reutilización de la lógica determinista del
seguimiento", "Tool de lectura de la lista diaria", "Tool de reglas de
segmentación", "Tool de lectura del borrador existente" y "Solo datos de la base
y sin fuga entre pacientes".

- [x] 3.1 **RED:** crear `tests/agent/clara/tools/list-follow-up-cases.test.ts`.
  Casos: devuelve los casos con `reason` / `reasonLabel` / `roundDate`; sin
  autorización ⇒ error y **cero** consultas a Supabase; falla de lectura ⇒
  `{ success: false, error }` sin datos inventados; los contactados/descartados
  de la ronda no aparecen.
- [x] 3.2 **GREEN:** crear `agents/clara/agent/tools/list-follow-up-cases.ts`
  envolviendo `listDailyFollowUpCases` (`src/lib/admin/follow-up/follow-up.ts:190`),
  `input: z.object({})`, salida de §4.1. `resolveClaraAccess` como primer paso.
- [x] 3.3 **RED:** crear `tests/agent/clara/tools/get-follow-up-rules.test.ts`.
  Casos: los valores coinciden con `src/lib/admin/follow-up/config.ts`
  (`NO_SHOW_WINDOW_DAYS=90`, `STALLED_TREATMENT_DAYS=45`,
  `INACTIVE_PATIENT_MONTHS=6` / `INACTIVE_PATIENT_DAYS=180`,
  `UNANSWERED_QUOTE_DAYS=21`, `FOLLOW_UP_REASON_PRIORITY`); `reasonPriority`
  respeta el orden; las etiquetas coinciden con `followUpReasonLabel`
  (`rules.ts:176`); `roundDate` con `currentRoundDate` (`follow-up.ts:179`).
- [x] 3.4 **GREEN:** crear `agents/clara/agent/tools/get-follow-up-rules.ts`
  con `input: z.object({})` y salida de §4.1, leyendo las constantes importadas
  sin repetirlas en texto literal.
- [x] 3.5 **RED:** crear `tests/agent/clara/tools/get-follow-up-draft.test.ts`.
  Casos: con borrador ⇒ `found: true` con estado y texto; sin borrador ⇒
  `found: false`; nombre ambiguo ⇒ `candidates`; sin autorización ⇒ error **sin**
  consulta; nunca crea ni modifica.
- [x] 3.6 **GREEN:** crear `agents/clara/agent/tools/get-follow-up-draft.ts`
  envolviendo `findFollowUpDraftForRound` (`src/lib/admin/follow-up/drafts.ts:110`)
  y `resolvePatient` (§D3), schema y salidas de §4.1.
- [x] 3.7 **TRIANGULATE lectura:** comparar la lista devuelta por
  `list-follow-up-cases` con `listDailyFollowUpCases` para la misma fecha de
  referencia (identidad con el panel admin, mismos pacientes/motivos/orden);
  verificar que una consulta por paciente no expone datos de otros pacientes.

## 4. Tools de escritura (TDD, RED primero)

Verifica `clara-follow-up-tools` → "Tool de redacción y persistencia de
borrador", "Tool de transición de borrador limitada a aprobado o rechazado",
"Tools de escritura deterministas con autorización fail-closed", "Fuente única
del estado de contacto y de los borradores" y "El envío queda fuera del set de
tools"; `clara-drafting` → "Sin canal de WhatsApp ni capacidad de envío".

- [x] 4.1 **RED:** crear
  `tests/agent/clara/tools/draft-follow-up-message.test.ts`. Casos: sin llaves
  del LLM ⇒ persiste plantilla (`source: "template"`) y no falla; LLM que lanza
  ⇒ plantilla; LLM que excede timeout (`DRAFT_LLM_TIMEOUT_MS`, 8 s) ⇒ plantilla;
  LLM que devuelve una salida con patrón prohibido ⇒ plantilla; idempotencia:
  segundo intento con borrador `draft` ⇒ `regenerated` y `dedup_key` sin
  cambios; borrador `approved` ⇒ se devuelve sin llamar al LLM y sin escribir;
  caso fuera de la lista del día ⇒ `{ success: false, error }`; sin actor mapeado
  ⇒ error sin escritura.
- [x] 4.2 **GREEN:** crear `agents/clara/agent/tools/draft-follow-up-message.ts`
  con la secuencia de §4.2 y §D5: autorización → `requireClaraActor` →
  `resolveRoundCase({ patientId })` → `findFollowUpDraftForRound` →
  `generateFollowUpDraftText` (`draft-llm.ts:172`) →
  `validateFollowUpDraftText` (`draft.ts:101`) inmediatamente antes de persistir
  → `createFollowUpDraft` (`drafts.ts:126`) o
  `updateFollowUpDraftBody` (`drafts.ts:220`). Nunca en lote.
- [x] 4.3 **RED:** crear
  `tests/agent/clara/tools/transition-follow-up-draft.test.ts`. Casos:
  `approved`/`rejected` desde `draft` ⇒ estado nuevo y sin envío; `decision:
  "sent"`/`"sent_failed"` es rechazada por el schema; borrador ya decidido ⇒
  error y sin cambios; sin actor ⇒ error sin escritura; no existe fila nueva en
  `whatsapp_messages`.
- [x] 4.4 **GREEN:** crear
  `agents/clara/agent/tools/transition-follow-up-draft.ts` con
  `decision: z.enum(["approved", "rejected"])` (§D6) delegando en
  `transitionFollowUpDraft` (`drafts.ts:170`) y traduciendo `ConflictError` /
  `NotFoundError` (`src/lib/admin/errors.ts`) a `{ success: false, error }`.
- [x] 4.5 **RED:** crear
  `tests/agent/clara/tools/mark-contact-attempted.test.ts`. Casos: persiste
  `contacted` con `contacted_at` y `created_by` = UUID del mapa; el paciente
  desaparece de la lista de la ronda; segunda marca ⇒ mismo registro (upsert en
  `follow_up_contacts` por `(patient_id, round_date)`) y sin duplicado; fuera de
  la ronda ⇒ error sin escritura; sin actor mapeado ⇒ error sin escritura; sin
  autorización ⇒ error sin lectura ni escritura; `note` mayor a
  `MAX_NOTES_LENGTH` (1000) ⇒ `ValidationError` reportado como error de tool.
- [x] 4.6 **GREEN:** crear `agents/clara/agent/tools/mark-contact-attempted.ts`
  envolviendo `markFollowUpContact` (`follow-up.ts:290`) con `status:
  "contacted"` fijo, secuencia y schema de §4.2.
- [x] 4.7 **RED:** crear
  `tests/agent/clara/tools/dismiss-follow-up.test.ts`. Casos: persiste
  `dismissed` con `dismissed_at` y actor; idempotencia; mismos negativos que
  4.5.
- [x] 4.8 **GREEN:** crear `agents/clara/agent/tools/dismiss-follow-up.ts` con
  `status: "dismissed"` fijo, misma firma, módulo e idempotencia que 4.6.
- [x] 4.9 **TRIANGULATE escritura:** confirmar con los tests (y un grep
  estructural en 1.1) que ninguna tool importa `claimFollowUpDraftForSend`,
  `markFollowUpDraftSent`, `markFollowUpDraftSentFailed`, `sendFollowUpDraft`
  (`src/lib/follow-up/send-follow-up-draft.ts:173`) ni
  `insertFollowUpOutboundMessage` (`:133`); que el estado de contacto se
  escribe solo en `follow_up_contacts` y los borradores solo en
  `follow_up_message_drafts`.

## 5. Instrucciones y skills de Clara

Verifica `clara-agent` → "Guardrails de dominio verificables", "Escalamiento
obligatorio a humano", "Sin canal de WhatsApp y sin capacidad de envío", "Skills
de apoyo cargables", "Idioma y tono de las respuestas" y "Alcance limitado al
seguimiento de pacientes".

- [x] 5.1 **RED:** extender `tests/agent/clara/structure.test.ts` con los
  guardrails textuales de las instrucciones y las skills (patrón de
  `tests/agent/mora/structure.test.ts`): presencia de "no diagnostico", "no
  receto", "precio", "disponibilidad", escalamiento (dolor fuerte, urgencia,
  infección, alergia, medicamento, receta, intención ambigua), "no envío"; que
  `drafting-guidelines.md` documente `MAX_DRAFT_LENGTH` (600), el fallback
  determinista y el ciclo `draft → approved | rejected`; que ninguna skill
  introduzca umbrales/prioridades propios. Capturar el fallo observado.
- [x] 5.2 **GREEN (instrucciones):** crear
  `agents/clara/agent/instructions.md` con el outline de §9 (identidad y alcance,
  guardrails innegociables, escalamiento, datos y autorización, ciclo del
  borrador, routing de tools, formato Discord ≤ 1,500 caracteres, habilidades y
  límites de superficie).
- [x] 5.3 **GREEN (skills):** crear
  `agents/clara/agent/skills/follow-up-workflow.md` y
  `agents/clara/agent/skills/drafting-guidelines.md` con el outline de §10
  (markdown plano, sin frontmatter, primera línea como intención de activación;
  sin redefinir reglas, umbrales, deduplicación, prioridad ni orden).
- [x] 5.4 **TRIANGULATE/REFACTOR docs del agente:** `npx vitest run
  tests/agent/clara` completo y confirmar que `structure.test.ts` queda verde
  (todos los archivos de §2 existen, el set de tools es exacto y no hay
  `package.json` ni `subagents/`).

## 6. Despliegue y configuración Vercel

Verifica `clara-discord-channel` → "Canal Discord propio con ruta y comando
propios" y la degradación graceful de credenciales (§D11, §8).

- [x] 6.1 `.eve/vercel-services/eve-clara/README.md` con el mismo texto de
  `.eve/vercel-services/eve-mora/README.md` (scaffold del servicio).
- [x] 6.2 `.gitignore`: agregar `!/.eve/vercel-services/eve-clara/` a
  continuación de las líneas de `eve-eva` / `eve-mora`. Sin esta excepción
  Vercel no puede materializar el `root` del servicio.
- [x] 6.3 `vercel.json`: servicio `eve-clara` (framework `eve`, `root
  ".eve/vercel-services/eve-clara"`, `buildCommand` desde `agents/clara` con
  `EVE_PUBLIC_ROUTE_PREFIX='/clara'`) con `routes` `^/clara/eve/v1/(.*)$`, y
  rewrite `/clara/eve/v1/(.*)` → servicio `eve-clara` **antes** del catch-all
  `web`, exactamente como §8. `middleware.ts` no se toca.
- [ ] 6.4 (OMITIDA - opcional, no requerida por la spec; ver nota) agregar en `.env.local.example`,
  después de `CLARA_DRAFTING_ENABLED=false` (línea 39), `CLARA_DISCORD_STAFF_IDS`
  y `CLARA_DISCORD_ACTOR_MAP` vacías con comentario de fail-closed.
- [x] 6.5 Documentar en el propio change (§7 del design) la tabla de variables
  del servicio `eve-clara`: `DISCORD_APPLICATION_ID`, `DISCORD_BOT_TOKEN`,
  `DISCORD_PUBLIC_KEY`, `CLARA_DISCORD_STAFF_IDS`, `CLARA_DISCORD_ACTOR_MAP`,
  `WHATSAPP_AGENT_LLM_API_KEY`, `WHATSAPP_AGENT_LLM_MODEL`,
  `WHATSAPP_AGENT_LLM_BASE_URL`, `CLARA_DRAFTING_ENABLED`,
  `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (placeholders, sin
  secretos reales en el repo).

## 7. Documentación operativa

Verifica §12 y §D14 del design; sostiene el requirement "Canal Discord propio"
en operación.

- [x] 7.1 Crear `docs/clara-discord-setup.md` con los 7 pasos de §11 (Developer
  Portal, credenciales, slash command `/clara` con opción `message`, Interactions
  Endpoint URL `https://<dominio>/clara/eve/v1/discord`, variables de entorno del
  servicio, instalación OAuth2 con scopes `applications.commands` + `bot`, y la
  validación §13.2). Cerrar con la nota fail-closed y la aclaración de canal de
  staff, no de pacientes. Patrón de `docs/mora-discord-setup.md`.
- [x] 7.2 `docs/eve-runbook.md`: (a) insertar el bullet de Clara en la topología
  después de la línea 21; (b) corregir las líneas 28-29 ("Clara y Nora NO son
  agentes de WhatsApp" ⇒ Nora no es agente raíz y Clara sí es agente raíz con
  canal Discord de staff); (c) después de la línea 31 agregar el enlace a
  `docs/clara-discord-setup.md`. Ediciones exactas de §12.1.
- [x] 7.3 `architecture.md` §3.2: (a) línea 66, agregar `eve-clara` →
  `/clara/eve/v1/*`; (b) insertar el bullet de Clara después de la línea 78
  (canal `/clara/eve/v1/discord`, las 7 tools, las 2 skills, `access.ts` con
  allowlist + mapa de actor, y "no atiende WhatsApp, no atiende pacientes, no
  envía mensajes; importa `src/lib/admin/follow-up/` sin moverla ni duplicarla").
  Ediciones exactas de §12.2.

## 8. Validación final

Verificación de cierre del change; todos los comandos se corren uno a la vez y
en primer plano (`design.md` §13 y §13.1).

- [x] 8.1 `npx tsc --noEmit` sin errores.
- [x] 8.2 `npm run lint` sin errores nuevos.
- [x] 8.3 `npm run test` en verde (incluye `tests/agent/clara/**` y conserva
  las suites de Eva/Mora y de `src/lib/admin/follow-up/` sin duplicarlas).
- [x] 8.4 `npx vitest run tests/agent/clara` en verde (contrato estructural,
  acceso, canal y las 7 tools).
- [x] 8.5 `eve build` de Clara con el prefijo del servicio:
  `cd agents/clara && EVE_PUBLIC_ROUTE_PREFIX='/clara' EVE_INTERNAL_AGENT_WORKSPACE_MEMBER=1 node ../../node_modules/eve/bin/eve.js build`.
  Debe terminar sin diagnósticos y dejar `eve/v1/discord` registrada, **sin**
  credenciales `DISCORD_*` (prueba de degradación graceful).
- [x] 8.6 `npx eve info --agent clara` reporta la ruta `eve/v1/discord` y
  `Diagnostics 0 errors, 0 warnings`.
- [x] 8.7 Regresión de agentes raíz: `npx eve info --agent eva` y
  `npx eve info --agent mora` siguen con `Diagnostics 0 errors, 0 warnings`; el
  workspace reporta tres agentes raíz (eva, mora, clara).
- [x] 8.8 Invariantes manuales del §4.3: ninguna tool expone envío ni reclamo
  para envío; ningún archivo de `src/lib/admin/follow-up/*`,
  `src/lib/follow-up/send-follow-up-draft.ts`, `agents/eva/agent/*`,
  `agents/mora/agent/*`, `middleware.ts` ni migraciones se modificó.
- [ ] 8.9 (POST-DEPLOY: a ejecutar por el propietario del despliegue) Verificación manual post-deploy (§13.2, fuera del repo, la ejecuta el
  responsable del despliegue): lista con usuario autorizado, silencio con usuario
  no autorizado, borrador con `created_by` del mapa, aprobación sin filas nuevas
  en `whatsapp_messages`, marca `contacted`, lectura con el kill switch apagado y
  silencio con la allowlist vacía.

---

## Review Workload Forecast

Estimación por grupo (líneas de código nuevas o modificadas; los artefactos SDD
no se reescriben):

| Grupo | Producción | Pruebas | Total aprox. |
|---|---|---|---|
| 1. Base del agente (`agent.ts`, `model.ts`, `structure.test.ts`) | 85 | 120 | 205 |
| 2. Acceso y canal (`access.ts`, `channels/discord.ts`, 2 tests) | 265 | 350 | 615 |
| 3. Tools de lectura (3 tools + 3 tests) | 220 | 240 | 460 |
| 4. Tools de escritura (4 tools + 4 tests) | 480 | 430 | 910 |
| 5. Instrucciones y skills (+ guardrails en el test estructural) | 210 | 80 | 290 |
| 6. Despliegue y configuración (`vercel.json`, `.gitignore`, scaffold, envs) | 35 | 0 | 35 |
| 7. Documentación (`clara-discord-setup.md`, runbook, `architecture.md`) | 170 | 0 | 170 |
| 8. Validación final (sin archivos nuevos) | 0 | 0 | 0 |
| **Total** | **~1,465** | **~1,220** | **~2,685** |

| Campo | Valor |
|---|---|
| Líneas modificadas estimadas | ~2,700 (≈1,465 de producción y ≈1,220 de pruebas) |
| Riesgo de presupuesto de 400 líneas | High |
| PRs encadenados recomendados | Yes (por tamaño), entregados como single-pr con `size:exception` |
| Estrategia de entrega | single-pr (por defecto) |
| Estrategia de cadena | N/A con la entrega por defecto; puntos de corte abajo si se prefiere partir |

Puntos de corte si el orquestador decide encadenar (no ejecutados por defecto):

1. **Slice 1 — base + acceso + canal:** grupos 1 y 2 (`agent.ts`, `model.ts`,
   `access.ts`, `channels/discord.ts` y sus tests). Sin superficie de tools.
2. **Slice 2 — tools completas:** grupos 3 y 4 (las 7 tools y sus tests). Depende
   de Slice 1.
3. **Slice 3 — instrucciones, skills, despliegue y docs:** grupos 5, 6 y 7 más la
   confirmación estructural de 5.4. Depende de Slice 2.

Decision needed before apply: No (la entrega por defecto es single-pr con
`size:exception`; si se prefiere encadenar, los tres slices ya están definidos
arriba).

Chained PRs recommended: Yes

Chain strategy: single-pr (default)

400-line budget risk: High
