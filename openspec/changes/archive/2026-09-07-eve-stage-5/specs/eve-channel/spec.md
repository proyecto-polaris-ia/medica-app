# eve-channel Specification

**Baseline**: new-capability

## Purpose

Add a WhatsApp channel backed by the Chat SDK adapter so inbound Meta WhatsApp webhooks route to the Eve agent and agent replies are delivered back over WhatsApp, without touching the legacy webhook handler. The channel is additive and version-pinned to Eve's compiled Chat SDK line.

## Requirements

### Requirement: Chat SDK dependencies are pinned and compatible

The project MUST depend on `@chat-adapter/whatsapp` and `@chat-adapter/state-memory`, both pinned to `4.34.0`, matching the `chat@4.34.0` line Eve 0.52.2 compiles internally.

#### Scenario: versions match the Eve Chat SDK line
- GIVEN `package.json`
- WHEN inspected
- THEN `@chat-adapter/whatsapp` and `@chat-adapter/state-memory` are pinned to `4.34.0`

### Requirement: WhatsApp channel bridge is exported

`agent/channels/whatsapp.ts` MUST export a `chatSdkChannel` bridge built with a WhatsApp adapter and a memory state adapter, with `userName` set to the clinic display name and `streaming` disabled.

#### Scenario: bridge carries WhatsApp and state adapters
- GIVEN `agent/channels/whatsapp.ts` imported
- WHEN its exported object is inspected
- THEN it exposes `bot`, `channel`, and `send`
- AND the configuration includes a WhatsApp adapter and a memory state adapter

#### Scenario: channel is the module default export
- GIVEN `agent/channels/whatsapp.ts`
- WHEN inspected
- THEN the `channel` bridge member is re-exported as the module `default` export, because Eve resolves an authored channel module by its default export

### Requirement: WhatsApp adapter reads credentials from environment

The WhatsApp adapter MUST be configured through `createWhatsAppAdapter` with `accessToken`, `phoneNumberId`, `verifyToken`, and `appSecret` resolved from the existing `WHATSAPP_*` environment variables (which the adapter auto-detects). The channel MUST not hardcode credentials.

#### Scenario: credentials come from env, not source
- GIVEN `agent/channels/whatsapp.ts` content
- WHEN inspected
- THEN no plaintext token or secret is present, and the adapter relies on the `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, and `WHATSAPP_APP_SECRET` variables

### Requirement: Channel degrades gracefully when credentials are missing

The channel MUST always construct the WhatsApp adapter (so the adapter key is always present and the webhook route is always registered — eve's build-time validation rejects a channel module that emits no routes), while resolving each credential from its `WHATSAPP_*` environment variable with a non-empty placeholder fallback. This keeps `eve build` from crashing in credential-less environments (e.g. Vercel preview builds) while degrading gracefully at runtime.

#### Scenario: build succeeds without credentials
- GIVEN no `WHATSAPP_*` variables set
- WHEN `agent/channels/whatsapp.ts` is imported during `eve build`
- THEN the module loads without throwing and the WhatsApp webhook route stays registered

#### Scenario: channel uses real credentials when present
- GIVEN the four `WHATSAPP_*` variables set to non-empty values
- WHEN the channel config is built
- THEN the adapter resolves access token, app secret, phone number id, and verify token from the environment

#### Scenario: missing credentials fall back without crashing
- GIVEN only some or none of the `WHATSAPP_*` variables set
- WHEN the channel config is built
- THEN the adapter is constructed with placeholder values instead of throwing

### Requirement: Inbound message handlers route to the agent

The channel MUST register a new-mention handler and a subscribed-message handler that subscribe the thread and hand the inbound message text to the Eve bridge via `send`.

#### Scenario: new and subscribed messages are both handled
- GIVEN the channel bridge
- WHEN an inbound WhatsApp message arrives
- THEN the handler subscribes the thread and forwards the message text to the agent

### Requirement: Streaming is disabled for WhatsApp

The channel configuration MUST set `streaming: false` because WhatsApp does not deliver streamed deltas natively; replies post as a single message.

#### Scenario: streaming is off
- GIVEN the channel configuration
- WHEN inspected
- THEN `streaming` is `false`

### Requirement: Legacy webhook and WhatsApp code remain untouched

Stage 5 MUST NOT modify `app/api/whatsapp/webhook/route.ts` or any file under `src/lib/whatsapp/`.

#### Scenario: legacy paths unchanged
- GIVEN the Stage 5 diff
- WHEN inspected
- THEN no file under `app/api/whatsapp/` or `src/lib/whatsapp/` is modified

### Requirement: Channel is structurally tested without credentials

A credential-free test MUST import the channel module (without connecting to Meta) and assert it exports a bridge with `bot`, `channel`, and `send`. The test MUST pass with no env vars and no network.

#### Scenario: bridge shape is asserted off-line
- GIVEN no environment and no network
- WHEN the channel test runs
- THEN it passes, asserting the bridge exposes the three members

### Requirement: Type safety and test suite

The project MUST pass `npx tsc --noEmit` and `npm run test` with the channel added.

#### Scenario: typecheck and tests pass
- GIVEN Stage 5 applied
- WHEN `npx tsc --noEmit` and `npm run test` run
- THEN both exit 0
