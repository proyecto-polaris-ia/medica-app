# Proposal: WhatsApp locked contact identity

## Intent

Make WhatsApp sender phone the authoritative patient contact for Eve booking and rescheduling. This prevents a patient from overriding the contact phone inside the chat and ensures WhatsApp-origin appointments are tied to the number that actually contacted the clinic. Also add email support to Eve appointment creation/rescheduling so web and WhatsApp patient identity fields stay consistent.

## Scope

### In Scope

- Pass trusted WhatsApp sender phone into Eve context when messages arrive through the WhatsApp channel.
- Enforce that `book-appointment` and `reschedule-appointment` use the WhatsApp sender phone when present, even if the user asks to use another phone.
- For non-WhatsApp channels, require/ask for phone at the appropriate booking step.
- Add optional email to Eve appointment creation and rescheduling tools, forwarding it into patient resolution.
- Add tests for locked WhatsApp phone and email forwarding.

### Out of Scope

- Changing Meta webhook verification or app review configuration.
- Modifying `travelhub-app`.
- Changing public/admin web booking UI beyond preserving existing email behavior.
- Migrating or cleaning existing patient records.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `eve-framework`: Eve WhatsApp channel and write tools must enforce trusted contact identity.
- `appointment-booking`: patient resolution for Eve booking/rescheduling must accept phone plus optional email.
- `public-booking`: web booking email behavior remains supported and aligned with booking writes.

## Approach

Forward WhatsApp sender identity as trusted channel context and add deterministic enforcement around Eve write tools. Tool execution must prefer the trusted WhatsApp phone over any model/user-supplied phone. Non-WhatsApp paths keep collecting phone as normal. Email becomes an optional tool input passed to `resolvePatient`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `agent/channels/whatsapp.ts` | Modified | Include trusted sender phone context for Eve turns. |
| `agent/tools/book-appointment.ts` | Modified | Add email input and locked phone enforcement. |
| `agent/tools/reschedule-appointment.ts` | Modified | Add email input and locked phone enforcement. |
| `agent/instructions.md` | Modified | Document WhatsApp phone authority and non-WhatsApp collection. |
| `tests/agent/` | Modified | Add regression tests. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Tool context cannot read channel metadata directly | Medium | Use a small channel context adapter and tests against current Eve message shape. |
| User asks to use another phone | High | Tool ignores alternate phone when trusted WhatsApp phone exists and returns the locked phone used. |
| Email conflicts with existing patient | Medium | Preserve existing `PatientIdentityConflictError` escalation behavior. |

## Rollback Plan

Revert the change commit. Existing booking/reschedule tools will return to accepting model-provided phone only; no database migration rollback is required.

## Dependencies

- Current Eve WhatsApp channel bridge and Chat SDK message metadata.
- Existing patient resolution service with phone/email conflict handling.

## Success Criteria

- [ ] WhatsApp booking uses sender phone even if user provides another phone.
- [ ] WhatsApp reschedule uses sender phone even if user provides another phone.
- [ ] Non-WhatsApp booking still asks/requires phone before writing.
- [ ] Eve booking and reschedule tools accept and forward optional email.
