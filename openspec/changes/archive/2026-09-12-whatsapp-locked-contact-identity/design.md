# Design: WhatsApp locked contact identity

## Technical Approach

Treat WhatsApp sender phone as trusted channel identity and make Eve write tools deterministic about contact selection. The LLM may interpret intent, but it must not choose or override the patient phone for WhatsApp-origin writes.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Trust source | WhatsApp adapter metadata (`from` / `userWaId`) wins over conversation text | Ask patient which phone to use | The sender phone is the authenticated channel identity for the chat. |
| Enforcement layer | Tool/backend helper, not prompt-only | Prompt instruction only | Security rules must live in deterministic code. |
| Non-WhatsApp path | Require explicit phone collection | Allow email-only booking everywhere | User asked phone to be requested when no WhatsApp phone exists. |
| Email | Optional Eve tool input forwarded to `resolvePatient` | Add email later | Web already asks email; Eve writes should align now. |

## Data Flow

```text
WhatsApp webhook → adapter message.raw/message.author/thread
  → channel trusted contact context
  → Eve turn/tool call
  → contact resolver selects trusted phone when present
  → resolvePatient({ phone: trustedPhone, email, fullName })
  → bookAppointment/rescheduleAppointment
```

For non-WhatsApp channels:

```text
Other channel → no trusted phone
  → agent asks for phone before write
  → resolvePatient({ phone: collectedPhone, email, fullName })
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `agent/channels/whatsapp.ts` | Modify | Attach trusted sender phone/business phone context to Eve turns. |
| `agent/tools/book-appointment.ts` | Modify | Add optional email and choose trusted phone over model/user phone. |
| `agent/tools/reschedule-appointment.ts` | Modify | Add optional email and choose trusted phone over model/user phone. |
| `agent/instructions.md` | Modify | State WhatsApp phone cannot be changed by user instruction. |
| `agent/skills/booking-flow.md` | Modify | Add contact collection rules for WhatsApp vs other channels. |
| `tests/agent/tools/*.test.ts` | Modify/Create | Cover email forwarding and locked phone behavior. |
| `tests/agent/channels/whatsapp.test.ts` | Modify | Cover trusted contact context forwarding. |

## Interfaces / Contracts

```ts
type TrustedContactContext = {
  source: 'whatsapp' | 'unknown';
  phone?: string;
  businessPhoneNumberId?: string;
};
```

Write tools should resolve contact approximately as:

```ts
const phone = trustedContact.source === 'whatsapp' && trustedContact.phone
  ? trustedContact.phone
  : input.patientPhone;
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|--------------|----------|
| Unit | trusted phone wins over alternate phone | Mock tool execution and assert `resolvePatient` args. |
| Unit | email forwards to patient resolution | Extend booking/reschedule tool tests. |
| Channel | WhatsApp sender metadata is attached | Mock Chat SDK message shape. |
| Regression | non-WhatsApp missing phone fails/asks | Tool validation/instruction tests. |

## Threat Matrix

N/A — no shell, subprocess, VCS/PR automation, executable-file classification, or external process boundary. This changes channel data flow and deterministic tool validation inside the existing app runtime.

## Migration / Rollout

No database migration required. Roll out with normal deploy. Existing patient/contact rows remain unchanged.

## Open Questions

- [ ] Confirm the exact Eve-supported API for passing per-turn metadata from `chatSdkChannel.send` into tool execution context; if unavailable, use a deterministic structured system prefix plus tool-side parser.
