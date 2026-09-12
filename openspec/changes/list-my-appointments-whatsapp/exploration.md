# Exploration: WhatsApp patient appointment lookup

## Current State

The Eve agent has write tools for booking and rescheduling appointments, plus read tools for catalog, availability, knowledge, and next availability. There is no Eve tool that answers “what appointments do I have?” from the patient side.

PR #52 introduced trusted WhatsApp sender identity in two places:

- Channel-owned `SendPayload.context`, so the model sees the trusted WhatsApp phone.
- `ctx.session.auth` attributes, so tools can read a backend-provided trusted phone instead of relying on user text.

Admin appointment listing exists in `src/lib/admin/appointments.ts`, but it is admin-wide and not suitable as a patient-facing Eve tool because it is not scoped by trusted WhatsApp identity.

## Affected Areas

- `agent/tools/` — add a new read-only Eve tool, likely `list-my-appointments.ts`.
- `agent/trusted-contact-context.ts` — reuse or expose a helper to require trusted WhatsApp phone from tool context.
- `agent/instructions.md` — tell Eva when to use the new tool and how to refuse unsafe lookup.
- `agent/skills/booking-flow.md` or a new appointment lookup guidance section — document patient appointment lookup flow.
- `tests/agent/tools/` — add tool tests for trusted lookup, no trusted WhatsApp refusal, empty result, and successful appointment formatting.
- `openspec/specs/eve-framework/spec.md` and `openspec/specs/appointment-booking/spec.md` — add/modify requirements for patient-scoped appointment lookup.

## Approaches

1. **New Eve read tool scoped by trusted WhatsApp auth**
   - Pros: secure backend enforcement, follows Eve tool pattern, testable without Meta credentials.
   - Cons: needs new query and formatting surface.
   - Effort: Medium.

2. **Prompt-only behavior using existing admin list/query code**
   - Pros: faster to sketch.
   - Cons: unsafe; the LLM would be deciding identity and could leak appointments.
   - Effort: Low, but unacceptable.

## Recommendation

Create a new read-only Eve tool, `list-my-appointments`, that only reads the trusted WhatsApp phone from `ctx.session.auth`. If no trusted WhatsApp phone is present, it must refuse with the security message. If present, it resolves the patient by `patients.phone_e164`, queries upcoming appointments for that patient, joins service/provider names, and returns structured results for Eva to summarize.

## Risks

- Returning too much appointment history could expose sensitive data. Limit the first slice to upcoming active appointments.
- If patient phone is not linked to a patient, the tool should return an empty/unknown-safe result, not create a patient.
- The tool must not accept arbitrary `patientPhone` input; otherwise the user could enumerate another patient’s appointments.

## Ready for Proposal

Yes. The requirement is clear: patient-facing appointment lookup by trusted WhatsApp identity only, with a hard refusal when no trusted WhatsApp phone exists.
