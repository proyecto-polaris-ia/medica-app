# Design: Eve appointment rescheduling without duplicates

## Approach

Add a deterministic booking-layer reschedule function and expose it through a dedicated Eve tool. The tool resolves the patient, service, provider, original appointment, and new interval before calling the backend update path.

## Key Decisions

- Reschedule is a separate write tool from `book-appointment`; booking remains insert-only.
- The backend updates the existing appointment row and preserves its current status and notes unless replacement notes are explicitly provided.
- Original appointment identity is safest by `appointmentId`; when unavailable, the tool may use the resolved patient/service/provider plus exact original start/end interval.
- If the original appointment cannot be found, the tool returns a structured failure instead of creating a replacement appointment.

## Data Flow

1. Eve detects a move/reprogram request for an existing appointment.
2. Eve checks the requested new availability with `check-availability`.
3. Eve calls `reschedule-appointment` with original appointment identity and the new interval.
4. The tool resolves catalog and patient identities.
5. The booking layer updates the matching appointment row.
6. If Postgres reports an exclusion violation, the tool returns `conflict: true`.

## Risk

The main risk is moving the wrong appointment if the original identity is ambiguous. The tool avoids this by requiring either `appointmentId` or the exact original interval with patient/service/provider context.
