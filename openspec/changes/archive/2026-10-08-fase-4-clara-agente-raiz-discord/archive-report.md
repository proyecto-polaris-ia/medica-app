# Archive Report — `fase-4-clara-agente-raiz-discord`

- **Change:** `fase-4-clara-agente-raiz-discord`
- **Issue:** [#161 — Fase 4: Crear Clara como agente raíz + canal Discord](https://github.com/proyecto-polaris-ia/medica-app/issues/161) (épico #140)
- **Rama:** `feat/fase-4-clara-deploy-docs`
- **Fecha de archivo:** 2026-10-08
- **Estado de verificación heredado:** PASS WITH WARNINGS (`verify-report.md`)
- **Estado del archive:** COMPLETADO (con pendientes no bloqueantes)

## Resultado

El change se archivó en
`openspec/changes/archive/2026-10-08-fase-4-clara-agente-raiz-discord/` (movido con
`git mv`, historial preservado) y sus deltas se fusionaron en las specs
principales. La implementación quedó en 44/45 tareas; la única tarea abierta
(8.9) es la verificación manual post-deploy, propiedad de quien despliega.

## Requisitos fusionados en `openspec/specs/`

| Capability | Operación | Resultado | Requirements |
|---|---|---|---|
| `clara-agent` | ADDED → spec nueva | `openspec/specs/clara-agent/spec.md` | 8 |
| `clara-discord-channel` | ADDED → spec nueva | `openspec/specs/clara-discord-channel/spec.md` | 6 |
| `clara-follow-up-tools` | ADDED → spec nueva | `openspec/specs/clara-follow-up-tools/spec.md` | 10 |
| `clara-drafting` | MODIFIED + RENAMED | `openspec/specs/clara-drafting/spec.md` | 7 (1 renombrado y reemplazado) |

### `clara-drafting` — detalle del merge

- **RENAMED:** `### Requirement: Sin canal propio ni capacidad de envío` →
  `### Requirement: Sin canal de WhatsApp ni capacidad de envío`. El heading
  original se verificó contra la spec principal antes de renombrar.
- **MODIFIED:** se reemplazó el bloque completo del requirement por la versión
  actualizada, preservando todos los escenarios previos y agregando dos:
  "El canal de staff es una superficie de consulta y preparación" y "La
  superficie de staff no acepta mensajes de pacientes". Los demás requirements
  (`Redacción de borrador bajo demanda`, `Fallback determinista`,
  `Aislamiento de las reglas`, `Texto asesor sin alterar el orden`, `Edición
  humana con auditoría`, `Degradación por kill switch`) permanecen sin cambios.

### Capabilities sin delta

- `follow-up`: sin cambios. El principal de Discord autorizado queda contenido en
  `clara-follow-up-tools`; reglas, deduplicación, prioridad y umbrales invariantes.
- `eve-framework`: sin cambio de comportamiento; `eve-clara` es configuración de
  despliegue.

## Decisiones D1–D14 (avaladas)

| # | Decisión | Estado |
|---|---|---|
| D1 | Identidad del principal: allowlist `CLARA_DISCORD_STAFF_IDS` fail-closed en el canal y re-verificada en cada tool | Avalada |
| D2 | Actor de auditoría vía `CLARA_DISCORD_ACTOR_MAP` (Discord ID → UUID de usuario Supabase) | Avalada |
| D3 | Resolución del paciente (id/teléfono/nombre) y precondición de ronda antes de escribir | Avalada |
| D4 | Set final de 7 tools, con lectura (3) y escritura (4) separadas | Avalada |
| D5 | `draft-follow-up-message` replica la ruta admin (crear o regenerar) y revalida guardrails antes de persistir | Avalada |
| D6 | Transiciones limitadas por el tipo de entrada (`approved`/`rejected`; nunca `sent`/`sent_failed`) | Avalada |
| D7 | El envío queda fuera del set de tools, explícitamente | Avalada |
| D8 | Canal Discord propio con credenciales `DISCORD_*`, placeholder `"unconfigured"` y app independiente de Mora | Avalada |
| D9 | `access.ts` de Clara con la misma forma que la de Mora más dos extensiones (mapa de actor y resolución de paciente) | Avalada |
| D10 | Acceso a Supabase desde `eve-clara` con service role, replicando `eve-eva`/`eve-mora` | Avalada |
| D11 | Despliegue: tercer servicio Vercel `eve-clara`, aditivo, con rewrite antes del catch-all | Avalada |
| D12 | Alcance del kill switch `CLARA_DRAFTING_ENABLED`: solo el camino LLM de redacción | Avalada |
| D13 | Skills planas, sin redefinir reglas, umbrales, prioridad ni orden | Avalada |
| D14 | Reconciliación de documentación (`docs/eve-runbook.md`, `architecture.md`, `docs/clara-discord-setup.md`) | Avalada |

Decisiones abiertas de `design.md` §16 resueltas: `CLARA_DISCORD_ACTOR_MAP` se
acepta como variable adicional; `.gitignore` y
`.eve/vercel-services/eve-clara/README.md` se incluyen como requisitos duros del
despliegue; `draft-follow-up-message` regenera con paridad al panel.

## Verificación

Ejecutada por el agente de verificación (solo lectura) más regresión del
orquestador; matriz completa en `verify-report.md`.

- `npx tsc --noEmit` — PASS
- `npm run lint` — PASS (0 errores; 28 warnings preexistentes, 0 de Clara)
- `npm run test` — PASS (157 archivos, 1519 tests)
- `npm run test:local` — PASS (179 archivos, 1763 tests)
- `npx vitest run tests/agent/clara` — PASS (10 archivos, 111 tests)
- `eve build` con prefijos `/clara`, `/eva`, `/mora` — PASS ×3
- `npx eve info --agent clara|eva|mora` — `0 errors, 0 warnings`, 3 agentes raíz
- No-regresión: `git diff main...HEAD` sin diff en `agents/eva/`, `agents/mora/`,
  `src/`, `middleware.ts`, `supabase/`

## Pendientes (no bloqueantes)

1. **Tarea 8.9 — verificación manual post-deploy** (propietario del despliegue):
   lista con usuario autorizado, silencio con usuario no autorizado, borrador con
   `created_by` del mapa, aprobación sin filas nuevas en `whatsapp_messages`,
   marca `contacted`, lectura con el kill switch apagado y silencio con la
   allowlist vacía (`design.md` §13.2).
2. **Tarea 6.4 omitida (opcional):** agregar `CLARA_DISCORD_STAFF_IDS` y
   `CLARA_DISCORD_ACTOR_MAP` a `.env.local.example`. Omitida por política del
   harness; las variables quedan documentadas en `docs/clara-discord-setup.md` y
   en `design.md` §7.
3. **Follow-up de pruebas (warning 1 del verify):** `model.ts` de Clara se
   verificó estructuralmente (contains-symbols), no conductualmente. Agregar un
   test directo de `resolveModelConfig` para Clara, en paridad con el de Eva.
4. **Follow-up de pruebas (warning 2 del verify):** el tono y alcance de
   `instructions.md` se verifican por presencia de texto. Endurecer con
   aserciones completas de frases cuando se consoliden las guías de tono.

## Notas de archive

- Movimiento con `git mv` para preservar el historial; no se modificó ningún
  contenido de los artefactos archivados.
- El archive es una bitácora de auditoría: no debe modificarse después.
- El delta no incluyó secciones `REMOVED`.
