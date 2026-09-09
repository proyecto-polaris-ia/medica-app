# Tasks

## 1. Backend reschedule behavior

- [x] 1.1 Add a booking-layer reschedule function that updates an existing appointment row.
- [x] 1.2 Translate provider interval conflicts into the existing conflict shape.
- [x] 1.3 Add unit tests proving reschedule updates instead of inserting.

## 2. Eve tool and instructions

- [x] 2.1 Add `agent/tools/reschedule-appointment.ts`.
- [x] 2.2 Update `agent/instructions.md` and `agent/skills/booking-flow.md` to use reschedule for move requests.
- [x] 2.3 Add tool-level and structural skill tests.

## 3. Verification

- [x] 3.1 Run focused tests for reschedule and skills.
- [x] 3.2 Run typecheck.
- [x] 3.3 Open PR linked to an approved issue.
