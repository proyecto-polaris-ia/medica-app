# Design: Eve Stage 5 WhatsApp Channel

## Dependencies Verified
- Stages 1–4 merged into `feat/eve-migration` (PRs #38–#41). `agent/agent.ts`, `agent/instructions.md`, six tools, and three skills are present.
- Eve 0.52.2 compiles `chat@4.34.0` and ships `@chat-adapter/{slack,twilio,state-memory}@4.34.0` internally.

## Approach
Add `agent/channels/whatsapp.ts` exporting `chatSdkChannel({ userName, adapters, state, streaming })`. Eve discovers channel modules under `agent/channels/` and mounts the webhook route under `/eve/v1/whatsapp` for the `whatsapp` adapter.

## Channel Configuration (verified signatures)

```ts
chatSdkChannel({
  userName: "Consultorio Dental",
  adapters: {
    whatsapp: createWhatsAppAdapter(), // credentials auto-detected from WHATSAPP_* env
  },
  state: createMemoryState(), // see State Adapter decision below
  streaming: false,           // WhatsApp delivers single messages
});
```

The bridge returns `{ bot, channel, send }`. Handlers:

```ts
bot.onNewMention(async (thread, message) => {
  await thread.subscribe();
  await send(message.text, { thread });
});
bot.onSubscribedMessage(async (thread, message) => {
  await send(message.text, { thread });
});
```

## State Adapter Decision
The issue and migration plan assumed Redis/Vercel KV from Stage 1, but Stage 1's own design dropped KV/Redis: "No KV/Redis — Eve 0.52 sessions are durable via Workflows." There is no `REDIS_URL`/`KV_REST_API_*` anywhere. `@chat-adapter/state-redis#createRedisState` takes `{ url }` (real Redis URL), not the issue's `{ url, token }` KV shape, and depends on a live Redis (`redis@^5`). Introducing it would fail without a configured server. Therefore the channel uses `createMemoryState()` for the adapter's subscription/lock bookkeeping. This keeps the change credential-free and boot-safe, and matches Stage 1; if the team later provisions Redis, swapping the state adapter is a one-line change.

## Version Pinning
All Chat SDK packages pinned to `4.34.0`, the exact `chat` version Eve 0.52.2 compiles, avoiding a dual-copy mismatch against `chat@4.40.0`.

## Testing
Credential-free `tests/agent/channels/whatsapp.test.ts` that dynamically imports the channel module and asserts `bot`, `channel`, and `send` exist and are callable-shaped, without connecting to Meta or Redis. Tests stay outside `agent/` (Eve treats unknown `agent/` subdirectories as tool entries).

## Webhook Route
Default route is `/eve/v1` + adapter name `whatsapp` → `/eve/v1/whatsapp`. Meta callback URL is configured in Stage 6; this stage only documents it.

## Risk Controls
- No legacy webhook changes; no tools/skills/schema changes.
- No plaintext credentials in source — the adapter auto-detects env vars.
- Memory state avoids an unconfigured Redis failure at boot; Eve Workflows still own session durability.
