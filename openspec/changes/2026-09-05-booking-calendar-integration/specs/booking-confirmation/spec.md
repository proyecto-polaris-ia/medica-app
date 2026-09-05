# Booking Confirmation & Appointments List Enhancement

**Baseline**: appointment-booking

## Purpose

Enhance the booking confirmation experience with calendar integration and improve the appointments list with filtering and sorting capabilities.

## Requirements

### Requirement: Calendar integration on booking confirmation
The system MUST provide calendar export options after a successful booking confirmation.

#### Scenario: Google Calendar link
- GIVEN a booking is confirmed
- WHEN the confirmation page is displayed
- THEN a link to add the appointment to Google Calendar MUST be shown
- AND the link MUST open in a new tab with pre-filled event details (title, start, end, description)

#### Scenario: ICS file download
- GIVEN a booking is confirmed
- WHEN the confirmation page is displayed
- THEN a button to download an ICS file MUST be shown
- AND the ICS file MUST contain valid VCALENDAR format with DTSTART, DTEND, SUMMARY, and DESCRIPTION

### Requirement: Link to register another appointment
The system MUST provide a link to start a new booking after confirmation.

#### Scenario: Return to booking flow
- GIVEN a booking is confirmed
- WHEN the user clicks "Registrar otra cita"
- THEN the user MUST be navigated to `/booking` to start a new appointment

### Requirement: Appointments list filters
The system MUST provide filtering capabilities for the appointments list.

#### Scenario: Filter by service
- GIVEN the appointments list is displayed
- WHEN a service filter is selected
- THEN only appointments for that service MUST be shown

#### Scenario: Filter by patient
- GIVEN the appointments list is displayed
- WHEN a patient filter is selected
- THEN only appointments for that patient MUST be shown

#### Scenario: Filter by provider
- GIVEN the appointments list is displayed
- WHEN a provider filter is selected
- THEN only appointments for that provider MUST be shown

#### Scenario: Filter by date range
- GIVEN the appointments list is displayed
- WHEN a date range (from/to) is specified
- THEN only appointments starting within that range MUST be shown

#### Scenario: Clear filters
- GIVEN one or more filters are active
- WHEN the user clicks "Limpiar filtros"
- THEN all filters MUST be cleared and all appointments shown

### Requirement: Appointments list sorting
The system MUST provide sortable columns in the appointments list.

#### Scenario: Sort by column
- GIVEN the appointments list is displayed
- WHEN a column header is clicked
- THEN the list MUST be sorted by that column in ascending order
- AND clicking again MUST toggle to descending order

#### Scenario: Default sort order
- GIVEN the appointments list is displayed
- WHEN no sort is explicitly selected
- THEN the list MUST be sorted by start date (Inicio) in ascending order

#### Scenario: Column order
- GIVEN the appointments list is displayed
- WHEN viewing the table headers
- THEN "Inicio" and "Fin" MUST appear as the first two columns
