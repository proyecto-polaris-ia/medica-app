# Exploration: WhatsApp locked contact identity

## Current State

- Meta WhatsApp webhooks include the sender phone in `messages[].from`.
- Legacy normalization maps that value to `event.fromPhone`, persists it as `whatsapp_contacts.phone_e164`, and uses it for legacy patient resolution.
- Eve's WhatsApp adapter also keeps the sender in channel metadata (`whatsapp:{phoneNumberId}:{userWaId}`), `message.author.userId`, and `message.raw.message.from`.
- Eve channel handlers currently forward only `message.text` to the agent via `send(message.text, { thread })`, so booking tools still receive `patientPhone` as model-provided input rather than a locked channel-derived value.
- `resolve-patient` already supports email, but `book-appointment` and `reschedule-appointment` only accept `patientPhone`/`patientName` and do not forward email.

## Affected Areas

- `agent/channels/whatsapp.ts` — must inject/attach trusted WhatsApp contact context when forwarding messages.
- `agent/tools/book-appointment.ts` — must accept email and enforce channel phone when present.
- `agent/tools/reschedule-appointment.ts` — must accept email and enforce channel phone when present.
- `agent/tools/resolve-patient.ts` — may need shared contact-source behavior or validation helpers.
- `agent/instructions.md` and `agent/skills/booking-flow.md` — must tell Eve that WhatsApp phone is authoritative and cannot be overridden.
- `tests/agent/**` — must cover WhatsApp phone lock and email forwarding.

## Approaches

1. **Context prefix injection** — prepend trusted metadata to the text sent from WhatsApp.
   - Pros: simple, works with current channel API.
   - Cons: model can still echo/alter it unless tools enforce the value.
   - Effort: Low.

2. **Tool-side trusted contact resolver** — create a shared helper that extracts trusted WhatsApp phone from channel metadata/session context, then ignores user-provided alternate phones.
   - Pros: security boundary lives in deterministic code.
   - Cons: requires confirming how Eve exposes channel metadata to tools.
   - Effort: Medium.

3. **Hybrid: inject for context + enforce in tools** — channel forwards trusted contact metadata and tools select channel phone over user-provided phone.
   - Pros: best UX and deterministic security.
   - Cons: slightly more wiring and tests.
   - Effort: Medium.

## Recommendation

Use the hybrid approach. The agent should know the WhatsApp sender phone for conversation quality, but booking/reschedule writes must enforce the channel-derived phone in deterministic code. For non-WhatsApp channels, tools should require a phone when needed and may collect email.

## Risks

- Eve tool execution context may not expose channel metadata directly; implementation may need a wrapper or structured prefix that is parsed before tool calls.
- Using `wa_id` as E.164-like phone may require normalization compatibility with existing `normalizePatientContact`.
- Email conflicts can surface when a phone-owned patient and email-owned patient differ; current identity conflict behavior should remain.

## Ready for Proposal

Yes. Scope is clear enough for proposal/spec/design/tasks.
