# Tasks: WhatsApp Inbound Agent and Command Center

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | >400 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Delivery strategy | size:exception for this implementation pass |

## Tasks

- [x] Add WhatsApp/Supabase data foundation migration.
- [x] Copy and adapt WhatsApp transport, signature verification, normalization, store, escalation, and observability modules.
- [x] Add dental-domain inbound agent decisioning with static knowledge, booking tool actions, and hard clinical/pricing escalation.
- [x] Add webhook route for Meta verification and signed POST processing.
- [x] Add authenticated WhatsApp Command Center dashboard, contacts, conversations, escalations, and knowledge management pages.
- [x] Add simulation script and package command.
- [x] Add focused unit coverage for decisioning, signature verification, and payload normalization.
- [x] Verify with unit tests, typecheck, and production build.
