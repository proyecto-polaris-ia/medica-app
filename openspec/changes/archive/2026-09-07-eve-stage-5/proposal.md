# Proposal: Eve Stage 5 — WhatsApp Channel with Chat SDK

## Intent
Connect the Eve agent to Meta WhatsApp Cloud API using the Chat SDK WhatsApp adapter, moving the inbound/outbound message path to Eve's built-in channel support while keeping the legacy webhook handler untouched. This is Stage 5 of the migration.

## Context
Stages 1–4 are complete on `feat/eve-migration` (PRs #38–#41). The agent has all six tools and three skills, and works via the Eve HTTP API. It is not yet wired to WhatsApp; the legacy agent remains live in production and is left untouched in this stage.

## Scope
- Add Chat SDK dependencies pinned to `4.34.0`: `@chat-adapter/whatsapp`, `@chat-adapter/state-memory` (see Scope Adaptation).
- Create `agent/channels/whatsapp.ts` exporting a `chatSdkChannel` bridge with the WhatsApp adapter and handlers for new mentions and subscribed messages.
- Add a credential-free structural test asserting the channel exports a bridge and registers handlers.
- Document the webhook URL for Meta configuration (Stage 6).

## Scope Adaptation (verified against installed Eve 0.52.2)
The issue and the migration plan assume two things that Stage 1 deliberately changed:

1. **State adapter is Redis/KV, but Stage 1 dropped KV/Redis entirely** ("No KV/Redis — Eve 0.52 sessions are durable via Workflows"). There are no `KV_REST_API_URL`/`KV_REST_API_TOKEN`/`REDIS_URL` vars anywhere in the project. `@chat-adapter/state-redis` `createRedisState` accepts `{ url }` (a real Redis URL), not the `{ url, token }` the issue sample shows. Introducing an unconfigured Redis dependency would break the build/booth. Instead we use `@chat-adapter/state-memory` (`createMemoryState`) for the channel's subscription/lock bookkeeping — consistent with Stage 1's decision — while conversation/session durability continues to live in Eve Workflows.
2. **Adapter versions**: Eve 0.52.2 pins `chat@4.34.0` internally and ships `@chat-adapter/{slack,twilio,state-memory}@4.34.0` compiled. Installing the latest adapter (4.40.0, which depends on `chat@4.40.0`) would create a dual-copy type/runtime mismatch. All Chat SDK packages are therefore pinned to `4.34.0`.

## Non-goals
- Do NOT modify the legacy webhook handler (`app/api/whatsapp/webhook/route.ts`) or `src/lib/whatsapp/*`.
- Do NOT change Meta's production webhook URL (Stage 6).
- Do NOT modify existing tools or skills.
- Do NOT change Supabase schema or migrations.

## Rollback
Remove `agent/channels/whatsapp.ts`, the new test, and the three added dependencies. No legacy code is touched, so no legacy rollback is required.
