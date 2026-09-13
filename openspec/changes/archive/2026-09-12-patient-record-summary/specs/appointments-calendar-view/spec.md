# Appointments Calendar View Delta

## Modified Requirements

### Requirement: Calendar patient record access
The calendar view MUST allow authenticated staff to open a read-only patient record modal by activating the patient name within a calendar appointment block.

#### Scenario: Calendar patient name opens record modal
- GIVEN an authenticated admin is viewing the appointments calendar
- AND a calendar block is linked to patient `P1`
- WHEN they activate the patient name inside that block
- THEN the app MUST open a modal showing patient `P1` record information

#### Scenario: Calendar block still opens appointment edit
- GIVEN an authenticated admin is viewing the appointments calendar
- WHEN they activate the appointment block outside the patient-name action
- THEN the existing appointment edit flow MUST still open
