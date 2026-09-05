# WhatsApp Inbound Automation Specification

**Baseline**: new-capability

## Purpose

Receive, understand, and operationalize inbound WhatsApp conversations for the
dental clinic while preserving private patient communication data and enforcing
clinical guardrails.

## Requirements

### Requirement: WhatsApp contact records
The system MUST store WhatsApp contact records by canonical phone number without
requiring an existing patient record.

#### Scenario: New sender has no linked patient
- GIVEN a WhatsApp sender messages the clinic for the first time
- WHEN the sender is persisted
- THEN a WhatsApp contact record MUST represent the phone identity
- AND the record MAY have no linked patient

### Requirement: Conversation lifecycle
The system MUST represent WhatsApp conversation state as open, awaiting agent
attention, escalated, resolved, or archived.

#### Scenario: Conversation escalates
- GIVEN a conversation cannot be answered safely by automation
- WHEN it is handed off to a human
- THEN the conversation MUST be representable as escalated

### Requirement: Idempotent message ledger
The system MUST store WhatsApp messages with a unique provider message id.

#### Scenario: Duplicate webhook delivery
- GIVEN the provider delivers the same message more than once
- WHEN the message is stored
- THEN only one row SHOULD exist for that provider message id

### Requirement: Intent staging
The system MUST store detected intents with confidence, extracted entities,
summary, and review/sync status.

#### Scenario: Appointment request detected
- GIVEN an inbound message asks to book an appointment
- WHEN intent extraction runs
- THEN the intent MUST be representable with type, confidence, entities, and detected status

### Requirement: Escalation records
The system MUST store human escalations with reason, priority, status, and resolution metadata.

#### Scenario: Clinical escalation
- GIVEN a message reports pain, urgency, or requests medication
- WHEN it is escalated
- THEN an escalation record MUST exist with reason and priority

### Requirement: Knowledge approval
The system MUST distinguish draft, approved, and archived knowledge entries for
static agent answer sourcing.

#### Scenario: Approved answer source
- GIVEN a knowledge entry has approved status
- WHEN the agent searches usable knowledge
- THEN the entry MAY be used as an answer source

### Requirement: Private WhatsApp data
The system MUST NOT expose WhatsApp contact, conversation, message, intent,
escalation, or knowledge tables to anonymous users.

#### Scenario: Anonymous access denied
- GIVEN a request uses the anon database role
- WHEN it accesses WhatsApp inbound data tables
- THEN it MUST have no direct table privileges

### Requirement: Meta webhook verification
The system MUST expose `GET /api/whatsapp/webhook` so Meta can verify the webhook
using the configured server-side verify token.

#### Scenario: Verification succeeds
- GIVEN `WHATSAPP_VERIFY_TOKEN` is configured
- AND Meta sends `hub.mode=subscribe`, the matching `hub.verify_token`, and a `hub.challenge`
- WHEN the webhook GET request is handled
- THEN the response MUST be HTTP 200
- AND the response body MUST equal the challenge value as plain text

#### Scenario: Verification fails
- GIVEN `WHATSAPP_VERIFY_TOKEN` is configured
- WHEN a webhook GET request omits the expected subscribe mode, challenge, or matching token
- THEN the response MUST be HTTP 403

### Requirement: Meta payload normalization
The system MUST normalize inbound WhatsApp webhook payloads into stable internal
message events while preserving the raw provider payload for audit/debugging.

#### Scenario: Text payload normalized
- GIVEN a Meta WhatsApp webhook payload with an inbound text message
- WHEN the payload is normalized
- THEN the normalized event MUST include provider message id, sender phone,
  profile name, business phone number id, message type `text`, text body,
  occurred timestamp, raw message, and raw change value

### Requirement: Inbound webhook persistence
The system MUST persist normalized inbound webhook messages into the private
WhatsApp contact, conversation, and message tables.

#### Scenario: Duplicate message delivery is idempotent
- GIVEN a WhatsApp message row already exists for a provider message id
- WHEN Meta retries the same inbound message payload
- THEN the webhook MUST return success
- AND no duplicate WhatsApp message row SHOULD be created for that provider message id

### Requirement: Side-effect-free agent decisioning
The system MUST classify inbound messages and return a validated structured
decision without writing database rows or sending WhatsApp messages.

#### Scenario: Static knowledge supports an answer
- GIVEN an inbound message and approved knowledge that directly answers it
- AND the model returns valid structured output citing that knowledge
- WHEN the decisioning module evaluates the message
- THEN the result MUST include intent, summary, confidence, decision
  `auto_answer`, response text, and cited knowledge ids

#### Scenario: Booking request proposes a tool action
- GIVEN an inbound message asks for an appointment
- WHEN the decisioning module evaluates the message
- THEN the result MUST use decision `tool_action`
- AND include a tool request with name and typed arguments for availability or booking

#### Scenario: Clinical or commercial-specific request
- GIVEN an inbound message reports pain, urgency, medication, or asks for pricing
- WHEN the decisioning module evaluates the message
- THEN the result MUST use decision `needs_human`
- AND include an escalation reason

### Requirement: Name-to-ID resolution for booking
The system MUST resolve natural language service and provider names to their
corresponding UUIDs when the agent returns a booking tool action with names
instead of IDs.

#### Scenario: User mentions doctor by name
- GIVEN an inbound message requests an appointment with "Dra. Ana Martínez"
- WHEN the agent returns a tool_action with providerName
- THEN the system MUST resolve the name to a provider UUID
- AND proceed with the booking flow using the resolved ID

#### Scenario: Name resolution fails
- GIVEN an inbound message mentions a service or provider name that cannot be resolved
- WHEN the system attempts name-to-ID resolution
- THEN the system MUST show a formatted list of available services and doctors
- AND request the user to select from the available options

### Requirement: Booking catalog injection
The system MUST provide the booking catalog (services and providers) to the
agent so it can use natural language names in tool actions.

#### Scenario: Agent receives catalog
- GIVEN a new inbound message is being processed
- WHEN the agent is invoked
- THEN the agent MUST receive the list of available services with names
- AND the list of available providers with names

### Requirement: Knowledge-Service Mapping
The system MUST resolve knowledge entries to service IDs using explicit links first, then fuzzy matching as fallback, with logging for debugging.

#### Scenario: Explicit link exists
- GIVEN a knowledge entry with an explicit service link in `whatsapp_knowledge_service_links`
- WHEN the system resolves the entry to a service
- THEN it MUST return the linked service_id
- AND it MUST NOT perform fuzzy matching

#### Scenario: No explicit link, fuzzy match succeeds
- GIVEN a knowledge entry without an explicit service link
- AND the entry's tags or topic match a service name via fuzzy matching
- WHEN the system resolves the entry to a service
- THEN it MUST return the matched service_id
- AND it MUST log the fuzzy match for admin review

#### Scenario: No explicit link, no fuzzy match
- GIVEN a knowledge entry without an explicit service link
- AND no fuzzy match is found
- WHEN the system resolves the entry to a service
- THEN it MUST return the default service "Valoración general"
- AND it MUST log the unresolved attempt

### Requirement: Appointment Notes Field
The system MUST provide a nullable `notes` text column on `appointments` to capture detailed service information and conversation context.

#### Scenario: Appointment created with notes
- GIVEN a user requests a specific service from knowledge
- WHEN the appointment is created
- THEN the `notes` field MUST include the detailed service name from knowledge
- AND the `notes` field MUST include a conversation summary
- AND the `notes` field MUST include user preferences (doctor, time, special requests)

#### Scenario: Appointment created without notes
- GIVEN an appointment is created through the public booking form
- WHEN no conversation context exists
- THEN the `notes` field MAY be null
- AND the appointment MUST still be created successfully

### Requirement: Conversation Summary Field
The system MUST provide a nullable `summary` text column on `whatsapp_conversations` to capture rolling conversation context for escalations.

#### Scenario: Summary updated after message
- GIVEN an inbound message is processed
- WHEN the conversation context is updated
- THEN the `summary` field MUST be updated with key decisions and preferences
- AND the summary MUST be concise (max 500 characters)

#### Scenario: Escalation includes summary
- GIVEN a conversation is escalated to a human
- WHEN the escalation is created
- THEN the escalation context MUST include the conversation summary

### Requirement: Validated conservative model output
The system MUST validate structured model/provider output before using it.

#### Scenario: Low-confidence auto-answer
- GIVEN the model returns `auto_answer` with confidence below the safe threshold
- WHEN the decisioning module validates the output
- THEN the result MUST be converted to `needs_human`
- AND include an escalation reason

### Requirement: Inbound orchestration side effects
The system MUST orchestrate each newly persisted inbound message through agent
decisioning, durable intent persistence, and either an automatic response,
a booking tool execution, or human escalation.

#### Scenario: Booking tool action is executed and recorded
- GIVEN a new inbound message resolves to a `tool_action` booking decision
- WHEN inbound orchestration processes the message
- THEN the system MUST execute the availability or booking tool against the DB
- AND it MUST persist the detected intent and outbound response

#### Scenario: Human escalation is executed and recorded
- GIVEN a new inbound message cannot be answered safely by automation
- WHEN inbound orchestration processes the message
- THEN the system MUST create an open human escalation record
- AND it MUST attempt a customer follow-up WhatsApp message

### Requirement: Flow Engine integration
The system MUST support deterministic flow execution for multi-step conversations
when the Flow Engine is enabled via feature flag.

#### Scenario: Flow Engine processes booking intent
- GIVEN `WHATSAPP_FLOW_ENGINE_ENABLED=true`
- AND a message is classified as `book_appointment`
- WHEN the orchestrator processes the message
- THEN the Flow Engine MUST handle the conversation flow
- AND the flow state MUST be persisted in `whatsapp_conversations.flow_state`
- AND the flow MUST follow the defined states (see `flow-engine` spec)

#### Scenario: Legacy path when Flow Engine disabled
- GIVEN `WHATSAPP_FLOW_ENGINE_ENABLED=false` or not set
- WHEN a message is processed
- THEN the legacy LLM-based path MUST be used
- AND backward compatibility MUST be maintained

**See also**: `flow-engine` spec for detailed Flow Engine requirements.

### Requirement: Orchestration idempotency
The system MUST NOT duplicate outbound sends or side effects for a provider
message id that was already persisted and processed.

#### Scenario: Duplicate delivery skips side effects
- GIVEN a WhatsApp provider message id already exists in the message ledger
- WHEN inbound orchestration receives the same inbound event again
- THEN it MUST acknowledge the duplicate and MUST NOT send an outbound message

### Requirement: WhatsApp Cloud API transport
The system MUST centralize server-side WhatsApp Cloud API text sends in a
transport wrapper that builds Meta API requests without deciding intent or
persistence behavior.

#### Scenario: Missing credentials skip safely
- GIVEN server-side WhatsApp credentials are missing
- WHEN the transport is asked to send a text message
- THEN it MUST return a structured skipped/failed result
- AND it MUST NOT throw only because credentials are missing

### Requirement: Guardrails enforced server-side
The system MUST enforce clinical guardrails deterministically in the backend,
independent of the model prompt.

#### Scenario: The model proposes an invented slot
- GIVEN the model proposes a booking time that is not present in the agenda
- WHEN the booking tool executes
- THEN it MUST reject the time and return availability from the DB only

#### Scenario: Diagnosis or prescription request
- GIVEN an inbound message requests a diagnosis or a prescription
- WHEN the message is classified
- THEN the result MUST use decision `needs_human`
- AND the agent MUST NOT provide clinical advice or medication instructions
