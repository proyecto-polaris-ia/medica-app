# Proposal: Bugfix Booking Flow

## Summary
Four bugs discovered in production after the booking-ui deployment. All related to the public booking flow (`/booking`).

## Bugs

1. **Patient name not saved**: When creating a new patient via the booking form, the `full_name` field was hardcoded to `Patient ${phone}` instead of using the name entered in the form.

2. **Appointments list shows patient ID**: The admin appointments page displayed the patient UUID instead of the patient name.

3. **Past dates/times selectable**: The booking form allowed selecting dates in the past and past time slots for today.

4. **Confirmation shows UTC**: The booking confirmation page displayed the date/time in UTC ISO format instead of the local timezone (America/Mexico_City).

## Scope
- Fix the 4 bugs in the booking flow.
- No new features, no architectural changes.
- All fixes are backward compatible.

## Status
✅ Fixed in PR #5 (merged to main).
