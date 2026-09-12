# Design: WhatsApp patient appointment lookup

## Technical Approach

Add a read-only Eve tool, `agent/tools/list-my-appointments.ts`, that reads trusted WhatsApp identity from Eve tool context and queries Supabase for upcoming active appointments. The tool does not accept phone input, so the LLM cannot use a phone typed in chat to enumerate another patient.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Identity source | Reuse trusted WhatsApp session auth from PR #52 | Accept `patientPhone` tool input | Backend-owned identity is the security boundary; user text is not trusted. |
| Patient behavior | Lookup by `patients.phone_e164`, no creation | Call `resolvePatient` | Lookup should not create patients just because someone asks “what appointments do I have?”. |
| Appointment scope | Upcoming active statuses only | Return all history | First slice minimizes sensitive data exposure and answers the operational question. |
| Output | Structured rows plus safe message | Free-form text only | Structured output lets Eva summarize consistently and keeps tests deterministic. |

## Data Flow

```text
WhatsApp message
  -> agent/channels/whatsapp.ts binds trustedPatientPhone in session auth
  -> Eva calls list-my-appointments
  -> tool reads ctx.session.auth trusted phone
  -> patients(phone_e164) lookup
  -> appointments(patient_id + future + active statuses)
  -> structured result for Eva response
```

## File Changes

| File | Action | Description |
|---|---|---|
| `agent/tools/list-my-appointments.ts` | Create | Read-only Eve tool for trusted patient appointment lookup. |
| `agent/trusted-contact-context.ts` | Modify | Export helper to require trusted WhatsApp phone from tool context. |
| `agent/instructions.md` | Modify | Add lookup usage and refusal guidance. |
| `tests/agent/tools/list-my-appointments.test.ts` | Create | Cover trusted lookup, missing trusted identity refusal, no arbitrary phone input, and empty results. |
| `tests/agent/skills.test.ts` | Modify | Assert instructions include lookup guidance. |
| `openspec/specs/*` | Modify during archive | Sync final requirements. |

## Interfaces / Contracts

```ts
type ListMyAppointmentsInput = {
  maxResults?: number; // 1..10, default 5
};
```

The tool schema MUST NOT include any phone field.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | Tool refuses without trusted WhatsApp identity | Mock Eve context and Supabase. |
| Unit | Tool uses trusted phone and only patient appointments | Assert Supabase filters and result shape. |
| Unit | Tool schema excludes arbitrary phone input | Inspect schema shape/source. |
| Structural | Instructions mention tool and refusal rule | Extend existing skill/instruction tests. |
| Full | Regression | Run `npm run typecheck`, `npm run test`, and `npm run build`. |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary changes.

## Migration / Rollout

No migration required. This is an additive read-only Eve tool and instruction update.

## Open Questions

None.
