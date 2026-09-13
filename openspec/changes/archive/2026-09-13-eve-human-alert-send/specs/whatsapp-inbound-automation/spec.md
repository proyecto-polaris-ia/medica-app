## MODIFIED Requirements

### Requirement: Escalation records
The system MUST store human escalations with reason, priority, status, and resolution metadata. When an Eve-origin WhatsApp escalation creates a new escalation record and `WHATSAPP_HUMAN_ALERT_PHONE` is configured, the system MUST send a WhatsApp alert to that human phone and persist the outbound alert message with `purpose: human_alert`. The system MUST NOT send a duplicate human alert when an idempotent Eve escalation call resolves to an existing escalation record.

#### Scenario: Clinical escalation
- GIVEN a message reports pain, urgency, or requests medication
- WHEN it is escalated
- THEN an escalation record MUST exist with reason and priority

#### Scenario: Eve escalation alerts the configured human phone
- GIVEN Eve creates a new WhatsApp escalation
- AND `WHATSAPP_HUMAN_ALERT_PHONE` is configured
- WHEN the escalation is persisted
- THEN the system MUST send a WhatsApp alert to the configured human phone
- AND the outbound alert MUST be persisted with `purpose: human_alert`

#### Scenario: Eve escalation remains idempotent
- GIVEN an Eve escalation synthetic message already has an escalation record
- WHEN the same Eve escalation is processed again
- THEN the existing escalation MUST be reused
- AND a duplicate human alert MUST NOT be sent
