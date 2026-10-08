# Design: Promote Mora to Independent Root Agent with Discord Channel

**Issue**: #159 · **Épico**: #140 · **Fase**: 2

## 1. Topología resultante

```
WhatsApp (Meta Cloud API)            Discord (Interactions HTTP)
        │                                     │
        ▼                                     ▼
/eva/eve/v1/whatsapp ──► servicio eve-eva   /mora/eve/v1/discord ──► servicio eve-mora
        │                                     │
        ▼                                     ▼
   agents/eva/agent/                     agents/mora/agent/
   (Eva, root, pacientes)                (Mora, root, doctores)
```

- Un agente raíz por directorio de workspace (`agents/<name>/agent/`), sin
  `package.json` (Eve nombra al agente por su directorio; `agents/eva` no
  tiene uno — verificación: `ls agents/eva/` solo contiene `agent/`).
- Los canales son root-only: Mora como subagente jamás pudo tener Discord;
  como raíz sí (`eve/docs/getting-started.mdx` L107–117).
- Eva pierde el subagente `mora`; el sistema de delegación (hook
  `delegation-identity.ts`, bindings) queda sin consumidores para Mora.

## 2. Decisiones y rationale

### D1 — Identidad: doctor autorizado nombra al paciente

**Antes**: `resolveCollectionsPatientPhone` (prioridad: auth de WhatsApp →
binding de delegación → negativa) resolvía al *remitente*. **Ahora**: el
llamador es un doctor (staff) y nombra al paciente; la herramienta resuelve al
paciente contra `patients`.

- Se elimina `agents/eva/agent/subagents/mora/identity.ts` (el binding de
  delegación ya no aplica; la sesión raíz conserva `ctx.session.auth` del
  canal — `eve/docs/guides/auth-and-route-protection.md` L254).
- Nuevo módulo `agents/mora/agent/access.ts` con dos funciones puras
  testables:
  - `resolveDoctorAccess(ctx)`: lee el principal Discord de
    `ctx.session.auth.current` (`authenticator: "discord"`, `principalId` =
    user ID) y lo valida contra `MORA_DISCORD_DOCTOR_IDS` (coma-separada,
    trimmed, case-insensitive). Falla cerrado: allowlist ausente/vacía ⇒
    denegado. Nunca lanza; devuelve `{ doctorId }` o `{ error }`.
  - `resolvePatient(reference)`: si es E.164 ⇒ lookup exacto por
    `phone_e164`; si no ⇒ búsqueda por nombre con `ilike`, normalizando
    acentos en SQL (`unaccent` no está garantizado ⇒ se normaliza el término
    y se filtra en memoria sobre un set acotado si hace falta; decisión final
    en implementación, cubierta por tests). >1 match ⇒ candidatos sin datos
    financieros; 0 matches ⇒ reporte limpio.
- Las 3 tools cambian su contrato: input gana `patientPhone?: string` /
  `patientName?: string`; primer paso = `resolveDoctorAccess` + `resolvePatient`.
  Las negativas se reescriben (doctor no autorizado / paciente no encontrado).
- `find-patient` (nueva tool) expone la resolución para desambiguar antes de
  operar; devuelve candidatos con `id`, `full_name`, `phone_e164` enmascarado.

### D2 — Autorización de doctores: env allowlist

`MORA_DISCORD_DOCTOR_IDS="123...,456..."`. Elección: sin migración ni UI,
gestionable en Vercel; la tabla de staff (con `discord_user_id`) queda
anotada para fase posterior (proposal §Out of Scope). El check vive en
`onCommand` del canal (no despacha sesión a no autorizados) **y** en cada tool
(defensa en profundidad: el auth viaja en el principal, no en el texto).

### D3 — Canal Discord: env credentials, sin Vercel Connect

`discordChannel()` de `eve/channels/discord` con
`credentials: { applicationId, botToken, publicKey }` leídos de env con
placeholder no-vacío cuando faltan (mismo patrón de degradación graceful que
`agents/eva/agent/channels/whatsapp.ts`: la ruta debe registrarse aunque el
build no tenga credenciales). `onCommand` devuelve `{ auth: { principalId:
interaction.user.id, principalType: "user", authenticator: "discord",
attributes: { ... } } }` o `null` si no está autorizado. Events: handler
default de `message.completed` (edita la respuesta diferida; typing por
default). Ruta: `POST /mora/eve/v1/discord`.

### D4 — Migración del enum `payment_intent_source`

`supabase/migrations/00XX_payment_intent_source_discord.sql`:
`ALTER TYPE payment_intent_source ADD VALUE IF NOT EXISTS 'discord';`
(idempotente, aditivo; seguro bajo rollback). `register-payment-intent` escribe
`source: 'discord'` y la escalación usa el teléfono del paciente resuelto.

### D5 — Eva transicional: sin delegación, escalación en cobranza

Se elimina la sección "Delegación a Mora" y las líneas de routing (L13–19,
L63, L72 de `instructions.md`). Nueva regla: ante intención de cobranza de un
paciente por WhatsApp, Eva **no** inventa montos y usa `escalate-to-human`
(comportamiento ya existente). Es la opción conservadora y coherente con los
guardrails del épico; la superficie paciente-facing de cobranza se redefine en
Fase 3.

### D6 — Limpieza de delegación: mínima, Fase 3 deferida

- Se eliminan `agents/eva/agent/hooks/delegation-identity.ts` y su test
  (muertos con el subagente; el issue los implica: "subagents/ eliminado").
- `src/lib/agent/delegation-bindings.ts` + tests + tabla
  `agent_delegation_bindings` **se conservan** (el issue: "el sistema de
  delegación (hooks, bindings) se limpia en Fase 3"). knip: exclusión temporal
  en `knip.json` con comentario `// Fase 3 (#160)`.
- `agents/eva/agent/hooks/` conservará los hooks que no sean de Mora (verificar
  en implementación; si solo existe `delegation-identity.ts`, el directorio se
  elimina).

### D7 — Despliegue: servicio Vercel `eve-mora`

Replica de `eve-eva` en `vercel.json` con `EVE_PUBLIC_ROUTE_PREFIX='/mora'`,
build desde `agents/mora`, routes `^/mora/eve/v1/(.*)$` → `/eve/v1/$1` y
rewrite `/mora/eve/v1/(.*)` → `eve-mora` **antes** del catch-all `web`.
`middleware.ts` no cambia (no rutea `/eve/v1/*`).

## 3. Flujo nominal

```
Doctor → /mora "¿Cuánto debe Ana López?"
  → Discord ACK 3s → eve-mora valida firma → onCommand:
      principalId ∈ MORA_DISCORD_DOCTOR_IDS? no → null (sin sesión)
  → sesión Mora → LLM llama find-patient("Ana López")
      → 1 match → LLM llama get-patient-balance({ patientName | patientPhone })
      → access.ts: doctor ok + paciente resuelto
      → balance engine (BD) → Mora redacta → message.completed → Discord
```

## 4. Riesgos

| Riesgo | Mitigación |
|---|---|
| Fuga de PII por doctor no autorizado | Doble check (onCommand + tools), fail-closed sin allowlist, tests RED de guardrail |
| Búsqueda por nombre ambigua | find-patient devuelve candidatos; sin datos financieros hasta elegir |
| Discord slash command global tarda hasta 1 h | Doc de setup lo anota; verificación E2E es post-deploy manual |
| Regresión en Eva WhatsApp | Suite local completa + test de estructura de Eva sin sección de delegación |
| knip rompe por bindings muertos | Exclusión temporal documentada (D6) |

## 5. Verificación

- RED→GREEN en guardrails nuevos: doctor no autorizado, allowlist vacía,
  paciente ambiguo/inexistente, `source: 'discord'`, teléfono de paciente en
  escalación.
- Suites de datos contra Supabase local: `supabase start && supabase db reset`
  + `npm run test:local`.
- `npx eve build` (eva y mora) y `npx eve info` ⇒ 2 agentes raíz.
- `npx tsc --noEmit`, `npm run build`.
- E2E Discord real: manual, post-deploy (credenciales del consultorio).
