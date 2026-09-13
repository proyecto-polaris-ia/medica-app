# Proposal: Eve Escalation Persistence

## Intent

Bring the current Eve WhatsApp path to parity with the legacy escalation path by persisting human handoff cases into `whatsapp_escalations`, so the WhatsApp command center shows cases that Eve escalates.

## Scope

### In Scope
- Add an Eve tool that creates an open WhatsApp escalation record for the trusted WhatsApp contact.
- Persist supporting contact, conversation, message, and intent rows when needed so escalation FKs remain valid.
- Update Eve instructions so the agent uses the tool before telling the patient a human will follow up.
- Test the persistence helper/tool without requiring live WhatsApp or LLM credentials.

### Out of Scope
- New database schema or migration.
- Human assignment/acknowledgement workflow.
- SLA timers or notification routing changes.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `whatsapp-inbound-automation`: Eve escalations persist into the existing escalation queue.

## Approach

Add a server-side helper that upserts the WhatsApp contact, finds or creates an open conversation, creates a synthetic inbound message marker for the Eve escalation action, creates an intent, inserts an open escalation, and marks the conversation escalated. Expose it through an Eve `escalate-to-human` tool that uses the trusted WhatsApp phone from Eve session auth/context.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Duplicate escalations from repeated tool calls | Medium | Use deterministic synthetic WhatsApp message ids and upsert/lookup behavior before insert. |
| Missing trusted phone in non-WhatsApp sessions | Medium | Return a safe error telling Eve it cannot create the escalation without a trusted WhatsApp contact. |
| Divergence from legacy copy | Low | Reuse legacy priority language and existing table shape. |

## Success Criteria

- [ ] Eve has a tool to create an open `whatsapp_escalations` row.
- [ ] The tool refuses to persist without trusted WhatsApp phone context.
- [ ] Agent instructions require tool use before claiming escalation.
- [ ] Focused tests pass.
