# Delta for admin-panel

## MODIFIED Requirements

### Requirement: Providers CRUD
The admin panel MUST allow an authenticated user to list, create, update, and
delete `providers` records (name, color). The `color` MUST be stored as a text/hex
value per provider and MUST be editable through the provider form. The calendar
view consumes this `color` for block coloring.

(Previously: providers managed only a `name` field; `color` was not part of the
CRUD contract.)

#### Scenario: Manage providers
- GIVEN an authenticated admin
- WHEN they create, read, update, and delete providers
- THEN each operation MUST persist the corresponding change to the `providers` table

#### Scenario: Provider color persists
- GIVEN an authenticated admin
- WHEN they set or update a provider's `color` and save
- THEN the `color` value MUST persist on the `providers` record and MUST be
retrievable by the calendar view

#### Scenario: Missing or invalid color is tolerated
- GIVEN an admin submits a provider with no color or an unsupported color string
- WHEN the record is saved
- THEN the system SHOULD accept the record and the calendar MUST fall back to a
neutral color for that provider
