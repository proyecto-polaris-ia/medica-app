# Appointments Calendar View Specification

## Purpose

Provide a calendar visualization of appointments reachable from `/appointments`,
with month/year navigation, provider-color-coded time blocks, and a list/calendar
toggle that preserves existing list behavior.

## Requirements

### Requirement: View toggle from appointments page
The `/appointments` page MUST provide a toggle that switches between the existing
list (`DataTable`) and the new calendar view. The toggle MUST preserve any active
list filters and MUST share the existing loading and error states. The default
view SHALL be the list.

#### Scenario: Toggle to calendar preserves filters
- GIVEN an authenticated admin on `/appointments` with a filter applied
- WHEN they activate the calendar toggle
- THEN the calendar MUST render and the applied filter MUST remain active

#### Scenario: Toggle back to list keeps session
- GIVEN the calendar is shown
- WHEN they switch back to the list
- THEN the `DataTable` MUST render with the same filters and no session loss

### Requirement: Calendar month and year navigation
The calendar MUST support previous/next month navigation and a year selector that
jumps to any year. Navigation MUST NOT reload the page or drop the session.

#### Scenario: Next and previous month
- GIVEN the calendar shows March 2026
- WHEN the user clicks next then previous
- THEN it MUST show April 2026 then return to March 2026

#### Scenario: Year jump
- GIVEN the calendar shows 2026
- WHEN the user selects 2027 in the year selector
- THEN all month views MUST resolve within 2027

### Requirement: Range-scoped appointment loading
The calendar MUST load only appointments whose `start` falls within the visible
month window via a range query (`start`/`end`), and MUST NOT load the full
appointment table.

#### Scenario: Loads visible month only
- GIVEN the calendar shows June 2026
- WHEN it queries the data layer
- THEN it MUST request appointments within June 1–30 2026 and MUST NOT fetch rows outside the window

### Requirement: Provider-colored appointment time blocks
Each appointment in the visible range MUST render as a time block in its day
column, positioned by its start/end time, and colored by its provider's `color`.

#### Scenario: Block reflects provider color
- GIVEN a provider with color `#1f77b4` has an appointment June 10 09:00–10:00
- WHEN the calendar renders June 2026
- THEN the June 10 block MUST appear in the 09:00–10:00 slot using `#1f77b4`

### Requirement: Provider color legend
The calendar MUST render a legend mapping each visible provider to its color, and
the legend colors MUST match the rendered blocks.

#### Scenario: Legend matches blocks
- GIVEN two providers with distinct colors are present in the visible month
- WHEN the legend renders
- THEN each entry MUST show the provider name with its block color

### Requirement: Missing provider-color fallback
A provider without a `color` MUST fall back to a neutral color in both blocks and
legend; the calendar MUST remain usable.

#### Scenario: Provider without color
- GIVEN a provider has no `color` set
- WHEN the calendar renders that provider's appointments
- THEN the blocks and legend entry MUST use a defined neutral color

### Requirement: Clinic timezone rendering
Appointment times MUST be rendered in the clinic timezone `America/Mexico_City`,
including daylight-saving transitions.

#### Scenario: DST boundary correctness
- GIVEN an appointment stored as `timestamptz` near a DST change
- WHEN the calendar renders it
- THEN the displayed wall-clock time MUST be correct for `America/Mexico_City`

### Requirement: Block opens existing edit flow
Clicking a time block MUST open the existing appointment edit flow; the calendar
SHALL NOT edit appointment data inline.

#### Scenario: Click opens edit
- GIVEN a rendered appointment block
- WHEN the user clicks it
- THEN the existing appointment edit UI MUST open for that record
