# eve-write-tools Specification

## ADDED Requirements

### Requirement: Resolve patient write tool
The Eve agent MUST expose a `resolve-patient` tool that validates patient contact input, resolves an existing patient by phone/email, or creates a new patient through the existing booking patient-resolution service.

#### Scenario: existing patient is resolved without duplication
- **Given** a patient already exists for the supplied phone or email
- **When** the agent calls `resolve-patient`
- **Then** the tool returns `success: true`, patient identity data, and `isNew: false`

#### Scenario: new patient requires a name
- **Given** no patient exists for the supplied contact
- **When** the agent calls `resolve-patient` without `fullName`
- **Then** the tool MUST return a structured error instead of creating a placeholder patient

#### Scenario: crossed phone/email identities are rejected
- **Given** the supplied phone and email belong to different patients
- **When** the agent calls `resolve-patient`
- **Then** the tool MUST return a structured identity-conflict error

### Requirement: Book appointment write tool
The Eve agent MUST expose a `book-appointment` tool that resolves service, provider, and patient, validates requested datetimes, calls the existing atomic booking service, and returns structured appointment confirmation data.

#### Scenario: appointment is booked successfully
- **Given** a valid patient contact, service, provider, and future slot
- **When** the agent calls `book-appointment`
- **Then** the tool MUST call the existing booking service and return `success: true` with patient, service, provider, formatted datetime, and status

#### Scenario: occupied slot returns conflict
- **Given** the existing booking service reports an exclusion-constraint conflict
- **When** the agent calls `book-appointment`
- **Then** the tool MUST return `success: false` and `conflict: true` without hiding the conflict from the model

#### Scenario: invalid booking input is rejected before writing
- **Given** missing catalog matches, invalid dates, past dates, or an end time not after start time
- **When** the agent calls `book-appointment`
- **Then** the tool MUST return a structured error before attempting the booking write when possible

### Requirement: Next available write-stage helper tool
The Eve agent MUST expose a `get-next-available` tool that resolves service and provider, searches for the next slot through the existing availability service, and returns structured slot data.

#### Scenario: next available slot exists
- **Given** a valid service, provider, and search date
- **When** the agent calls `get-next-available`
- **Then** the tool MUST return `success: true`, `available: true`, ISO start/end values, and a Spanish Mexico formatted label

#### Scenario: no next slot exists
- **Given** the existing availability service finds no slot
- **When** the agent calls `get-next-available`
- **Then** the tool MUST return `success: true`, `available: false`, and a message instructing the agent not to invent availability

### Requirement: Write tools remain bounded by backend guardrails
Write tools MUST rely on deterministic backend services for catalog resolution, patient resolution, availability, and booking writes. The model MUST NOT decide availability, fabricate booking success, diagnose, prescribe, or bypass conflict handling.

#### Scenario: agent instructions describe bounded write usage
- **Given** `agent/instructions.md`
- **When** it is read by the Eve runtime
- **Then** it MUST mention the write tools and state that booking is only confirmed after tool success
