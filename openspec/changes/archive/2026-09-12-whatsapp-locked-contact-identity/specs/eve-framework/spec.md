## MODIFIED Requirements

### Requirement: WhatsApp Channel Bridge

The Eve agent MUST provide `agent/channels/whatsapp.ts` exporting a `chatSdkChannel` bridge built with a WhatsApp adapter (`createWhatsAppAdapter`) and a memory state adapter (`createMemoryState`), with `streaming` disabled and handlers for new mentions and subscribed messages. When forwarding a WhatsApp message to the agent, the channel MUST include trusted sender context derived from the adapter message metadata, including the sender phone/WhatsApp ID and business phone number ID.

#### Scenario: WhatsApp sender phone reaches Eve context
- GIVEN Meta sends an inbound WhatsApp message with `from = P`
- WHEN the Eve WhatsApp channel forwards the message to the agent
- THEN the forwarded turn MUST include trusted channel contact phone `P`
- AND the agent MUST NOT rely only on user-written text for patient phone identity

### Requirement: Write Appointment Booking Tool

The Eve agent MUST expose a `book-appointment` tool that resolves service, provider, and patient data, validates the requested interval, and writes appointments only through the existing atomic booking service. The tool MUST accept optional patient email. When the turn originates from WhatsApp, it MUST use the trusted WhatsApp sender phone for patient resolution and MUST ignore any different phone requested in the conversation.

#### Scenario: WhatsApp phone is locked for booking
- GIVEN a WhatsApp sender phone `P`
- AND the user says to use another phone `Q`
- WHEN Eve books the appointment
- THEN patient resolution MUST use phone `P`
- AND MUST NOT use phone `Q`

#### Scenario: Booking forwards optional email
- GIVEN a booking request includes email `E`
- WHEN Eve calls `book-appointment`
- THEN patient resolution MUST receive email `E` with the selected phone/contact identity

### Requirement: Eve Reschedule Appointment Tool

The Eve agent MUST expose a `reschedule-appointment` tool for patient requests to move or reprogram an existing appointment. The tool MUST update an existing appointment row instead of inserting a new appointment row. The tool MUST accept optional patient email. When the turn originates from WhatsApp, it MUST use the trusted WhatsApp sender phone for patient resolution and MUST ignore any different phone requested in the conversation.

#### Scenario: WhatsApp phone is locked for reschedule
- GIVEN a WhatsApp sender phone `P`
- AND the user asks to reprogram using another phone `Q`
- WHEN Eve calls `reschedule-appointment`
- THEN patient resolution MUST use phone `P`
- AND MUST NOT use phone `Q`
