# Tasks: WhatsApp locked contact identity

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 180-280 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Lock WhatsApp phone identity for Eve writes | PR 1 | `npm run test -- tests/agent/tools/book-appointment.test.ts tests/agent/tools/reschedule-appointment.test.ts tests/agent/channels/whatsapp.test.ts tests/agent/skills.test.ts` | `npm run whatsapp:simulate -- --text "quiero agendar"` after deploy/env | Revert Eve channel/tool/instruction files only |

## Phase 1: RED tests

- [x] 1.1 Add/extend `tests/agent/channels/whatsapp.test.ts` to prove WhatsApp sender phone is forwarded as trusted context.
- [x] 1.2 Extend `tests/agent/tools/book-appointment.test.ts` to prove trusted WhatsApp phone overrides an alternate user-requested phone.
- [x] 1.3 Extend `tests/agent/tools/reschedule-appointment.test.ts` for the same phone-lock behavior.
- [x] 1.4 Add email-forwarding assertions for booking and reschedule tools.

## Phase 2: Implementation

- [x] 2.1 Add a small trusted contact context helper for Eve tool/channel use.
- [x] 2.2 Update `agent/channels/whatsapp.ts` to attach sender phone and business phone number context.
- [x] 2.3 Update `agent/tools/book-appointment.ts` to accept email and select trusted WhatsApp phone when present.
- [x] 2.4 Update `agent/tools/reschedule-appointment.ts` to accept email and select trusted WhatsApp phone when present.

## Phase 3: Agent guidance

- [x] 3.1 Update `agent/instructions.md` to state WhatsApp phone is authoritative and cannot be changed by chat instruction.
- [x] 3.2 Update `agent/skills/booking-flow.md` to ask for phone only when no trusted channel phone exists, and to collect optional email.
- [x] 3.3 Update structural skill tests for phone-lock and email guidance.

## Phase 4: Verification

- [x] 4.1 Run focused Eve tool/channel/skill tests.
- [x] 4.2 Run `npm run typecheck`.
- [x] 4.3 Run `npm run test` before PR.
