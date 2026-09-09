# Change: Eve appointment rescheduling without duplicates

## Summary

Fix Eve's appointment move/reschedule flow so an existing appointment is updated in place instead of creating a second appointment with `book-appointment`.

## Problem

When a patient asks Eve to move an appointment, Eve can currently call `book-appointment` for the new time and then tell the patient the appointment was updated. `book-appointment` only inserts new appointment rows, so the original appointment remains active and the admin agenda shows duplicates.

## Goals

- Add a deterministic reschedule path for Eve.
- Preserve the backend rule that the LLM interprets language but does not decide database writes by itself.
- Prevent active duplicate appointments caused by move/reschedule requests.
- Keep availability and write conflicts enforced by the database-backed booking layer.

## Non-goals

- Cleaning up already-created duplicate production rows.
- Changing WhatsApp outbound token configuration.
- Reworking the legacy Flow Engine reschedule flow.

## Rollback Plan

Revert the branch commit. Eve will no longer expose `reschedule-appointment`, and existing `book-appointment` behavior remains unchanged.
