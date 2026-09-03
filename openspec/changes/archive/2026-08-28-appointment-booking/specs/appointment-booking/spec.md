# Delta for appointment-booking

**Change**: appointment-booking
**Type**: ADOPTION (implementation of existing baseline — no requirement changes)

## Adoption Note

This change is an **adoption/implementation** of the existing baseline specification
`openspec/specs/appointment-booking/spec.md`. The proposal declares **New Capabilities: None**
and **Modified Capabilities: None**. The baseline `appointment-booking` spec is the
authoritative contract for this change.

## ADDED Requirements

None. No requirements are added. The baseline spec already defines the full target
behavior (providers, services with duration, per-provider business hours, appointments,
DB-derived availability, atomic booking, next-available recommendation,
`America/Mexico_City` timestamptz, cancellation release, patient resolution from contact
phone).

## MODIFIED Requirements

None. No requirement text, scenario, or behavior is modified relative to the baseline.

## REMOVED Requirements

None. No requirement is removed or deprecated.

## RENAMED Requirements

None. No requirement is renamed.

## Authority Statement

- The baseline `appointment-booking` spec (`openspec/specs/appointment-booking/spec.md`)
  is the single source of truth for all requirements and Given/When/Then scenarios of
  this change.
- The `sdd-design`, `sdd-tasks`, and `sdd-apply` phases MUST implement the baseline
  requirements exactly as written.
- Any future change that alters appointment-booking behavior MUST do so via a new
  delta (ADDED/MODIFIED/REMOVED) against this same baseline.
