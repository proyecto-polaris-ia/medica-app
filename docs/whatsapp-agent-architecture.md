# Arquitectura del Agente de WhatsApp

> **Documento obsoleto (Etapa 7, issue #37).** El pipeline legacy de WhatsApp que
> describía este documento —`orchestrator`, `inbound-service`, `escalation`,
> `onboarding-context`, `flows/onboarding-*`, `ai/whatsapp-inbound-agent` y
> `ai/whatsapp-llm-provider`— se eliminó junto con las flags de routing. El canal
> de WhatsApp lo atiende el agente **Eve** y el webhook solo verifica la firma de
> Meta y reenvía cada mensaje a `/eve/v1/whatsapp`.

## Estado actual

```
Meta WhatsApp Cloud API
  → POST /api/whatsapp/webhook   (verifica x-hub-signature-256)
  → POST /eve/v1/whatsapp        (agente Eve; sin flag ni fallback legacy)
```

- **Webhook**: `app/api/whatsapp/webhook/route.ts` — `GET` atiende la
  verificación de Meta; `POST` reenvía **siempre** a Eve (con la cabecera de
  firma) y devuelve `502` si el reenvío falla.
- **Agente**: `agent/` (`agent.ts`, `instructions.md`, `tools/`, `skills/`).
- **Estado y orquestación de la conversación**: Eve.
- **Escalación humana**: `src/lib/whatsapp/eve-escalation.ts`, invocado por las
  tools `escalate-to-human` y `register-payment-intent`.
- **Módulos compartidos que se conservan**: `src/lib/whatsapp/client.ts`,
  `normalize.ts`, `store.ts`, `signature.ts`, `onboarding-flag.ts`,
  `inbound-decision.ts` y `src/lib/observability/whatsapp-ai.ts`.
- **Flow Engine** (`src/lib/flows/`): runtime determinístico del **web chat**; ya
  no participa en WhatsApp.

## Documentación vigente

- Arquitectura general: [`../architecture.md`](../architecture.md) (secciones 3, 5 y 8).
- Instrucciones del agente Eve: [`../agent/instructions.md`](../agent/instructions.md).
- Operación (monitoreo y rollback): [`eve-runbook.md`](eve-runbook.md).
- Plan de migración y estado final de la Etapa 7:
  [`eve/eve-migration-plan.md`](eve/eve-migration-plan.md).
- Guía de la migración para agentes:
  [`eve/agent-instructions.md`](eve/agent-instructions.md).
- Flow Engine (web chat): [`flow-engine.md`](flow-engine.md).

## Pendiente conocido

`src/lib/citas/reminder-reply*.ts` quedó huérfano tras la eliminación del pipeline
legacy; el seguimiento está en el issue #114.
