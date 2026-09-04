# WCC Command Center Specification

## ADDED Requirements

### Requirement: Authenticated operations dashboard
The system MUST provide an authenticated WhatsApp Command Center for clinic staff.

#### Scenario: Staff reviews WhatsApp operations
- GIVEN an authenticated staff user
- WHEN they open `/whatsapp-command-center`
- THEN they MUST see counts for escalations, conversations, contacts, pending messages, failed messages, knowledge, and recent activity

### Requirement: Conversation visibility
The system MUST expose WhatsApp conversations, messages, and intents to authenticated staff.

#### Scenario: Staff opens a conversation
- GIVEN a WhatsApp conversation exists
- WHEN staff opens its detail page
- THEN the page MUST show message timeline and detected intents

### Requirement: Knowledge management
The system MUST let authenticated staff create, edit, approve, archive, and list static knowledge entries.

#### Scenario: Staff approves knowledge
- GIVEN a draft knowledge entry
- WHEN staff changes its status to approved
- THEN the entry MAY be used by the inbound agent as a cited static answer source
