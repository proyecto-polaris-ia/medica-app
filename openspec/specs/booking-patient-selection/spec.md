# Booking Patient Selection Specification

## Purpose

Allow authenticated staff at `/appointments/new` to search and select an
existing patient, or implicitly create a new one, when booking on a patient's
behalf.

## Requirements

### Requirement: Internal booking route
The system MUST expose the internal booking wizard at `/appointments/new`,
reachable only to authenticated users. Unauthenticated requests MUST be
redirected to `/login`.

#### Scenario: Authenticated staff reach internal booking
- GIVEN an authenticated admin
- WHEN they request `/appointments/new`
- THEN the internal booking wizard MUST render

#### Scenario: Unauthenticated redirected
- GIVEN a visitor without a session
- WHEN they request `/appointments/new`
- THEN they MUST be redirected to `/login`

### Requirement: Patient search
The internal booking wizard MUST provide a search field that queries existing
patients by full name or E.164 phone. The search endpoint MUST require an
authenticated session.

#### Scenario: Search by name
- GIVEN an authenticated admin on `/appointments/new`
- WHEN they type a name fragment in the search field
- THEN matching patients (by `full_name`) MUST be returned

#### Scenario: Search by phone
- GIVEN an authenticated admin on `/appointments/new`
- WHEN they type a phone number in the search field
- THEN matching patients (by `phone_e164`) MUST be returned

#### Scenario: Search requires session
- GIVEN a request to the patient search endpoint without a session
- WHEN the request is processed
- THEN it MUST return `401`

### Requirement: Existing patient used as-is
When staff select an existing patient, the booking endpoint MUST use that
patient record as-is. The form MUST NOT allow editing the selected patient's
fields from the booking form.

#### Scenario: Selected patient not editable
- GIVEN staff selected an existing patient
- WHEN the booking form renders the confirm step
- THEN the patient's name and phone fields MUST NOT be editable

#### Scenario: Booking uses selected patient id
- GIVEN staff selected a patient with id `P1`
- WHEN they submit the booking
- THEN the endpoint MUST resolve the patient by `patientId = P1` and MUST NOT
  create a new patient

### Requirement: Implicit create via name and phone
When no existing patient is selected, staff MAY capture a name and phone to
implicitly create a new patient, preserving the current free-text flow.

#### Scenario: No selection, name and phone provided
- GIVEN staff did not select an existing patient
- WHEN they enter a name and phone and submit
- THEN a new patient MUST be created and the booking MUST use it

### Requirement: Internal endpoint resolves by patientId or phone
The internal booking endpoint MUST accept either a `patientId` OR a
`{ phone_e164, fullName }` pair. When `patientId` is provided, it MUST resolve
by id. Otherwise, it MUST resolve or create by phone and name.

#### Scenario: Resolve by patientId
- GIVEN a request with `patientId = P1`
- WHEN the endpoint processes the request
- THEN the appointment MUST be linked to patient `P1`

#### Scenario: Resolve by phone and name
- GIVEN a request with `phone_e164` and `fullName` but no `patientId`
- WHEN the endpoint processes the request
- THEN it MUST resolve or create the patient via existing patient-resolution
  semantics

### Requirement: Internal endpoint requires session
The internal booking endpoint MUST reject requests without a valid session with
`401 Unauthorized`.

#### Scenario: Unauthenticated internal booking rejected
- GIVEN a request to the internal booking endpoint without a session
- WHEN the request is processed
- THEN it MUST return `401` and MUST NOT write data

### Requirement: Atomic booking on internal flow
The internal booking write MUST preserve the atomic no-overlap exclusion
constraint per provider.

#### Scenario: Concurrent internal bookings
- GIVEN two concurrent internal bookings for the same provider interval
- WHEN both are submitted
- THEN at most one MUST succeed
