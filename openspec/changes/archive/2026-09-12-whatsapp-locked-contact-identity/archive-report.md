# Archive Report: WhatsApp locked contact identity

## Status

Archived successfully on 2026-09-12.

## Summary

This change locks Eve WhatsApp appointment writes to the inbound WhatsApp sender phone via channel-owned context/session auth, asks for patient phone when no trusted channel phone exists, and forwards optional patient email during appointment creation and rescheduling.

## Specs Synced

| Domain | Action | Details |
|---|---|---|
| `eve-framework` | Updated | Modified WhatsApp channel bridge and booking tool requirements; added/updated reschedule tool requirement. |
| `appointment-booking` | Updated | Modified patient resolution to include trusted channel phone precedence, optional email, and non-WhatsApp phone collection. |
| `public-booking` | Updated | Added public booking patient contact requirement clarifying that web booking uses submitted phone/email fields. |

## Verification Evidence

| Command | Result |
|---|---|
| `npm run test -- tests/agent/channels/whatsapp.test.ts tests/agent/tools/book-appointment.test.ts tests/agent/tools/reschedule-appointment.test.ts tests/agent/skills.test.ts` | PASS — 4 files / 19 tests |
| `npm run typecheck` | PASS |
| `npm run test` | PASS — 67 files / 436 tests |
| `npm run build` | PASS |

## Final Task State

14/14 tasks complete in archived `tasks.md`.

## Notes

No CRITICAL, WARNING, or SUGGESTION blockers remain. Production WhatsApp simulation should be rerun after deploy with valid Meta credentials to prove the external provider path.
