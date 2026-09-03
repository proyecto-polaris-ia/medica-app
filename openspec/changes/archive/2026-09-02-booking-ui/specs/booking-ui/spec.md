# Delta for booking-ui

## ADDED Requirements

### Requirement: Multi-step booking flow
The booking UI MUST present the patient experience as discrete sequential steps — service selection, provider selection, slot selection, confirmation, and result — and MUST NOT cram them into a single page.

#### Scenario: Patient advances through steps
- GIVEN a patient opens the booking flow
- WHEN they complete service and provider selection
- THEN they MUST be shown the slot-selection step before any confirmation is possible

#### Scenario: No skipping ahead
- GIVEN the patient has not selected a service and provider
- WHEN they attempt to reach confirmation
- THEN the UI MUST require the prior steps to be completed first

### Requirement: Service selection with duration
The UI MUST list available services and display each service's duration.

#### Scenario: Services rendered with duration
- GIVEN services exist in the catalog
- WHEN the service step is shown
- THEN each listed service MUST display its name and duration in minutes

### Requirement: Provider selection
The UI MUST list providers and let the patient choose exactly one.

#### Scenario: Provider chosen
- GIVEN at least one provider exists
- WHEN the patient selects a provider
- THEN that provider MUST become the active selection for subsequent steps

### Requirement: Slots sourced from database
The UI MUST display availability returned solely by `booking_free_slots`. It SHALL NOT invent, guess, or hardcode slots.

#### Scenario: Offered slots come from the RPC
- GIVEN a service and provider are selected
- WHEN the slot step loads availability
- THEN every displayed slot MUST correspond to a row returned by `booking_free_slots`

#### Scenario: No fabricated slots
- GIVEN the RPC returns no free slots
- WHEN the slot step renders
- THEN the UI MUST show an empty state and MUST NOT display any fabricated time

### Requirement: Atomic booking confirmation
The UI MUST create the appointment through the existing atomic booking service, resolving or creating the patient by `phone_e164` at confirm time.

#### Scenario: Successful booking
- GIVEN a valid service, provider, slot, and patient phone
- WHEN the patient confirms
- THEN the UI MUST show a success result referencing the created appointment

### Requirement: Conflict and next-available handling
When the selected slot is taken (Postgres `23P01` exclusion violation), the UI MUST surface the conflict and offer the next available slot.

#### Scenario: Slot taken at confirm
- GIVEN the chosen slot was booked by another request
- WHEN the patient confirms
- THEN the UI MUST show a conflict message and offer the next available slot from the service

### Requirement: Server-side secret isolation
The UI SHALL NOT expose the `service_role` key to the browser. All booking operations MUST flow through server-side API routes.

#### Scenario: No secret in client bundle
- GIVEN the booking UI is built and served
- WHEN the browser loads the pages and calls booking operations
- THEN no `service_role` secret MUST appear in client code or responses, and all calls MUST go through `/api/booking/*`

### Requirement: Explicit step states
Each step SHOULD render explicit loading, empty, and error states.

#### Scenario: Loading state
- GIVEN a step is fetching data
- WHEN the request is in flight
- THEN the step MUST show a loading indicator and disable progression

#### Scenario: Error state
- GIVEN a booking API returns an error
- WHEN the step renders the failure
- THEN the UI MUST show an actionable error message with a retry affordance
