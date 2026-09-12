# Apply Progress: WhatsApp locked contact identity

## Status

Complete — all implementation tasks are done.

## Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and exact result | `npm run test -- tests/agent/channels/whatsapp.test.ts tests/agent/tools/book-appointment.test.ts tests/agent/tools/reschedule-appointment.test.ts tests/agent/skills.test.ts` → PASS, 4 files / 19 tests |
| Runtime harness command/scenario and exact result | `npm run build` → PASS. WhatsApp end-to-end simulator requires deployed env and valid Meta token, so local runtime boundary is covered by channel/tool tests plus production build. |
| Rollback boundary | Revert `agent/trusted-contact-context.ts`, `agent/channels/whatsapp.ts`, booking/reschedule tool schema changes, guidance docs, and corresponding tests. |

## Completed Tasks

- [x] 1.1 Add/extend `tests/agent/channels/whatsapp.test.ts` to prove WhatsApp sender phone is forwarded as trusted context.
- [x] 1.2 Extend `tests/agent/tools/book-appointment.test.ts` to prove trusted WhatsApp phone overrides an alternate user-requested phone.
- [x] 1.3 Extend `tests/agent/tools/reschedule-appointment.test.ts` for the same phone-lock behavior.
- [x] 1.4 Add email-forwarding assertions for booking and reschedule tools.
- [x] 2.1 Add a small trusted contact context helper for Eve tool/channel use.
- [x] 2.2 Update `agent/channels/whatsapp.ts` to attach sender phone and business phone number context.
- [x] 2.3 Update `agent/tools/book-appointment.ts` to accept email and select trusted WhatsApp phone when present.
- [x] 2.4 Update `agent/tools/reschedule-appointment.ts` to accept email and select trusted WhatsApp phone when present.
- [x] 3.1 Update `agent/instructions.md` to state WhatsApp phone is authoritative and cannot be changed by chat instruction.
- [x] 3.2 Update `agent/skills/booking-flow.md` to ask for phone only when no trusted channel phone exists, and to collect optional email.
- [x] 3.3 Update structural skill tests for phone-lock and email guidance.
- [x] 4.1 Run focused Eve tool/channel/skill tests.
- [x] 4.2 Run `npm run typecheck`.
- [x] 4.3 Run `npm run test` before PR.

## Implementation Notes

- `agent/trusted-contact-context.ts` extracts WhatsApp sender identity from raw adapter payload, author metadata, or thread id and emits Eve `SendPayload.context` and trusted session auth attributes.
- `book-appointment` and `reschedule-appointment` now prefer `trustedPatientPhone` when `trustedContactSource` is `whatsapp`, ignoring alternate `patientPhone` values supplied by chat.
- When no trusted channel phone exists and no patient phone is supplied, write tools return a clear missing-phone error before resolving patient identity or writing appointments.
- `patientEmail` is forwarded to patient resolution for both booking and rescheduling.
