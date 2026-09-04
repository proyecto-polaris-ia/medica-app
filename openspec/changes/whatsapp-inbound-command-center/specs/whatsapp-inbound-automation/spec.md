# WhatsApp Inbound Automation Delta

## ADDED Requirements

### Requirement: Booking tool action execution
The system MUST execute appointment availability and booking actions in backend code, not in the LLM.

#### Scenario: Availability is checked by backend
- GIVEN an inbound WhatsApp message requests an appointment
- WHEN the agent returns a booking tool action
- THEN the orchestrator MUST call the booking availability service
- AND the response MUST be based on database-derived slots only

#### Scenario: Selected slot is booked atomically
- GIVEN a conversation has candidate slots in booking context
- WHEN the patient selects one candidate
- THEN the orchestrator MUST resolve or create the patient by WhatsApp phone
- AND it MUST create the appointment through the existing atomic booking service

### Requirement: Dental safety escalation
The system MUST escalate clinical or pricing-sensitive messages to a human.

#### Scenario: Clinical risk is detected
- GIVEN a message mentions strong pain, urgency, infection, allergy, medication, prescription, diagnosis, bleeding, or swelling
- WHEN the decisioning module evaluates the message
- THEN it MUST return `needs_human`
- AND it MUST NOT provide clinical advice

#### Scenario: Pricing request is detected
- GIVEN a message asks for definitive cost or pricing
- WHEN the decisioning module evaluates the message
- THEN it MUST return `needs_human`
- AND it SHOULD invite the patient to a valuation
