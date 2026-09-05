# Knowledge-Services Mapping Specification

**Baseline**: whatsapp-inbound-automation

## Purpose

Bridge the semantic gap between WhatsApp knowledge entries (informative) and the services table (operational) by implementing explicit knowledge-to-service mapping, fuzzy fallback resolution, and capturing detailed service information in appointment notes.

## Requirements

### Requirement: Knowledge-Service Linking Table
The system MUST provide a table to explicitly link knowledge entries to service IDs, with RLS policies restricting write access to authenticated admins and read access to the agent.

#### Scenario: Admin creates explicit link
- GIVEN an authenticated admin user
- WHEN they create a link between a knowledge entry and a service
- THEN the link MUST be stored in `whatsapp_knowledge_service_links`
- AND the link MUST reference valid knowledge_entry_id and service_id

#### Scenario: Agent reads explicit link
- GIVEN a knowledge entry with an explicit service link
- WHEN the agent resolves the knowledge entry to a service
- THEN the system MUST return the linked service_id
- AND the explicit link MUST take precedence over fuzzy matching

### Requirement: Knowledge-to-Service Resolution
The system MUST resolve knowledge entries to service IDs using explicit links first, then fuzzy matching as fallback, with logging for debugging.

#### Scenario: Explicit link exists
- GIVEN a knowledge entry with an explicit service link
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

#### Scenario: Backward compatibility
- GIVEN existing appointments without notes
- WHEN they are queried or updated
- THEN they MUST continue to work without errors
- AND the `notes` field MUST be nullable

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
- AND the human agent MUST be able to see the summary in the WhatsApp Command Center

#### Scenario: Backward compatibility
- GIVEN existing conversations without summary
- WHEN they are queried
- THEN they MUST continue to work without errors
- AND the `summary` field MUST be nullable

### Requirement: Fuzzy Matching Algorithm
The system MUST use the same fuzzy matching algorithm as provider resolution, with accent normalization and substring matching.

#### Scenario: Accent normalization
- GIVEN a knowledge entry with tag "blanqueamiento"
- AND a service named "Blanqueamiento Dental"
- WHEN fuzzy matching is performed
- THEN the system MUST match them after normalizing accents

#### Scenario: Substring matching
- GIVEN a knowledge entry with topic "limpieza dental profesional"
- AND a service named "Limpieza"
- WHEN fuzzy matching is performed
- THEN the system MUST match them via substring containment

#### Scenario: Case insensitivity
- GIVEN a knowledge entry with tag "ORTODONCIA"
- AND a service named "Ortodoncia"
- WHEN fuzzy matching is performed
- THEN the system MUST match them case-insensitively
