# Proposal: WhatsApp patient appointment lookup

## Intent

Let a WhatsApp patient ask which appointments they have, while preventing appointment lookup by arbitrary phone numbers typed in chat.

## Scope

### In Scope
- Add a read-only Eve tool to list the current WhatsApp patient’s upcoming appointments.
- Resolve identity only from trusted WhatsApp channel auth/context, not tool input.
- Refuse lookup when no trusted WhatsApp phone is present: “Por seguridad no puedo consultar citas sin un WhatsApp vinculado al paciente.”
- Update Eva instructions and tests for the new lookup behavior.

### Out of Scope
- Cancel appointment flow.
- Historical/clinical record lookup.
- Admin appointment search changes.
- Creating/linking patients during lookup.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `eve-framework`: add a read-only patient appointment lookup tool and guidance.
- `appointment-booking`: define patient-scoped appointment lookup by trusted WhatsApp contact.

## Approach

Add `agent/tools/list-my-appointments.ts`. The tool reads trusted WhatsApp phone from `ctx.session.auth` using the existing trusted-contact helper. It rejects calls without trusted WhatsApp identity, resolves the patient by `patients.phone_e164`, and queries upcoming non-cancelled appointments joined with service/provider names. Eva summarizes the structured results.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `agent/tools/` | New | Patient-scoped read-only appointment lookup tool. |
| `agent/trusted-contact-context.ts` | Modified | Expose helper for requiring trusted WhatsApp phone. |
| `agent/instructions.md` | Modified | Add tool usage/refusal rules. |
| `tests/agent/tools/` | New | Cover success, empty state, and refusal. |
| `openspec/specs/` | Modified | Sync Eve and appointment lookup requirements. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Appointment leak by user-supplied phone | Medium | Do not include `patientPhone` in tool schema; read only trusted auth. |
| Confusing empty result for unlinked phone | Low | Return safe “no appointments found for this WhatsApp” result. |

## Rollback Plan

Revert the new tool, instruction updates, tests, and OpenSpec deltas. Existing booking/reschedule behavior remains unchanged.

## Dependencies

- PR #52 trusted WhatsApp contact identity must be merged first.

## Success Criteria

- [ ] WhatsApp-authenticated lookup returns only appointments for the trusted sender phone.
- [ ] Lookup without trusted WhatsApp identity refuses for security.
- [ ] Tool does not accept arbitrary phone input.
- [ ] Tests, typecheck, and build pass.
