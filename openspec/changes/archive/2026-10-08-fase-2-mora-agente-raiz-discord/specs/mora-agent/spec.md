# Delta for mora-agent (issue #159, Fase 2)

## ADDED Requirements

### Requirement: Authorized Doctor Access via Discord

Mora MUST be reachable as an independent root agent through its own Discord
channel. Only doctors whose Discord user ID is present in the configured
allowlist (`MORA_DISCORD_DOCTOR_IDS`) MUST be allowed to start collections
sessions. An unauthorized Discord user MUST NOT trigger any agent run and MUST
NOT receive any patient or financial data.

#### Scenario: Authorized doctor starts a session
- GIVEN a Discord user whose user ID is in the doctor allowlist
- WHEN the doctor invokes the Mora slash command with a message
- THEN a Mora session starts with a Discord principal identity
- AND Mora answers the collections request

#### Scenario: Unauthorized Discord user is dropped
- GIVEN a Discord user whose user ID is NOT in the doctor allowlist
- WHEN the user invokes the Mora slash command
- THEN no agent session starts
- AND no patient or financial data is disclosed

#### Scenario: Allowlist not configured fails closed
- GIVEN the doctor allowlist environment variable is absent or empty
- WHEN any Discord user invokes the Mora slash command
- THEN no agent session starts
- AND no patient or financial data is disclosed

### Requirement: Patient Resolution by Named Reference

Collections tools MUST resolve the patient from an explicit reference supplied
by the authorized doctor (registered phone in E.164 or patient name), resolved
against the `patients` table. An ambiguous name match MUST return the
candidates for the doctor to disambiguate; Mora MUST NOT guess a patient. If
no patient matches, the tool MUST report it without disclosing any other
patient's data.

#### Scenario: Doctor resolves a patient by phone
- GIVEN an authorized doctor provides a patient's registered phone
- WHEN Mora resolves the patient
- THEN the tools operate on that single patient's data

#### Scenario: Ambiguous name returns candidates
- GIVEN an authorized doctor provides a name that matches more than one patient
- WHEN Mora resolves the patient
- THEN Mora presents the matching patients for the doctor to pick one
- AND no balance is disclosed until the doctor picks one

#### Scenario: No match reports cleanly
- GIVEN an authorized doctor provides a reference that matches no patient
- WHEN Mora resolves the patient
- THEN the tool reports that no patient was found
- AND no other patient's data is disclosed

## MODIFIED Requirements

### Requirement: Balance Inquiry

Mora MUST answer an authorized doctor's questions about how much a named
patient owes by returning the outstanding balance for treatment plans already
accepted in-office, derived from the database via the balance engine. Mora MUST
NOT compute or infer an amount from conversation content, and MUST NOT pass any
amount through the model prompt; the amount MUST originate exclusively from the
balance read tool output.

#### Scenario: Doctor asks for balance of a resolved patient
- GIVEN an authorized doctor who names a patient with one accepted treatment plan and a positive outstanding balance
- WHEN the doctor asks how much that patient owes
- THEN Mora returns the DB-derived outstanding balance
- AND the amount matches the balance engine output for that patient

#### Scenario: Patient with nothing owed
- GIVEN an authorized doctor asks about a patient whose accepted plans are fully paid (outstanding balance is zero)
- WHEN the doctor asks how much the patient owes
- THEN Mora states that there is no outstanding balance
- AND Mora does not quote any amount

#### Scenario: Amount is never derived from the prompt
- GIVEN any doctor conversation that mentions an amount
- WHEN Mora answers a balance question
- THEN the amount in Mora's answer MUST originate from the balance tool output
- AND Mora MUST NOT produce an amount by arithmetic or inference in the prompt

#### Scenario: Non-accepted plan is excluded from balance
- GIVEN a patient has a treatment plan whose status is not `accepted`, `in_progress`, or `completed` (e.g. `draft`, `presented`, `cancelled`)
- WHEN Mora answers a balance question about that patient
- THEN that plan's total MUST NOT be included in the quoted balance

### Requirement: Overdue Balances Listing

For an authorized doctor, the collections capability MUST produce a summary of
a named patient's overdue outstanding balances (per treatment plan), derived
from the balance engine using only eligible accepted plans and non-voided
payments.

#### Scenario: Overdue plans are listed for the resolved patient
- GIVEN an authorized doctor names a patient with overdue eligible-plan balances beyond the configured threshold
- WHEN the overdue listing is produced
- THEN it returns each overdue plan with its DB-derived overdue balance

#### Scenario: Non-overdue and zero-balance plans are excluded
- GIVEN a patient with plans at zero balance or not past due
- WHEN the overdue listing is produced for that patient
- THEN those plans MUST be excluded

#### Scenario: Voided payments do not reduce the balance
- GIVEN a patient has a payment that was voided
- WHEN the overdue listing computes their balance
- THEN the voided payment MUST NOT reduce the outstanding balance

### Requirement: Payment Intent Registration and Escalation

When an authorized doctor reports a patient's intent to pay, Mora MUST register
a structured payment intent (patient identity, and any stated treatment plan or
amount) with source `discord` and MUST escalate to a human. Mora MUST NOT move
money, MUST NOT generate payment links, and MUST NOT confirm a payment as
completed. The escalation MUST use the resolved patient's contact data, never
the doctor's Discord identity as patient contact.

#### Scenario: Intent to pay is registered and escalated
- GIVEN an authorized doctor reports that a resolved patient wants to pay an outstanding balance
- WHEN Mora handles the request
- THEN a structured payment intent is recorded with the patient identity and source `discord`
- AND the request is escalated to a human for manual payment handling

#### Scenario: No money movement
- GIVEN a doctor-reported intent to pay
- WHEN Mora processes the request
- THEN no amount is charged, transferred, or marked as paid
- AND no payment link is generated

#### Scenario: Escalation carries structured context with the patient's contact
- GIVEN a payment intent that includes a treatment plan or amount stated by the doctor
- WHEN Mora escalates
- THEN the escalation surfaces the patient identity, the patient's registered phone, and any stated plan or amount for a human to verify against the ledger

### Requirement: Authorized Access Before Collections Data

Mora MUST require an authorized caller before revealing any collections data.
On Discord, the caller MUST be a doctor whose Discord user ID is in the
configured allowlist. An unauthenticated or unauthorized caller MUST NOT
receive any balance, plan, or patient financial data. Patient data is scoped to
the patient the doctor explicitly names and Mora resolves; data of other
patients MUST NOT be disclosed.

#### Scenario: Unauthorized caller receives no collections data
- GIVEN a Discord caller whose user ID is not in the doctor allowlist
- WHEN the caller asks for any patient's balance
- THEN no collections data is revealed
- AND no patient financial data is disclosed

#### Scenario: Authorized doctor receives only the named patient's data
- GIVEN an authorized doctor who resolves one patient
- WHEN the doctor asks for that patient's balance
- THEN Mora reveals only that patient's DB-derived balance
- AND no other patient's balance is revealed

### Requirement: Collections Intent Routing

Inbound WhatsApp messages about payments, balances, or arrears are no longer
routed by delegation to a Mora subagent. Until a patient-facing collections
surface exists (Fase 3), Eva MUST NOT disclose balances itself and MUST
escalate collections intents to a human. Agenda and FAQ messages MUST continue
to be handled with the existing appointment and knowledge behavior.

#### Scenario: WhatsApp balance request escalates to a human
- GIVEN an inbound WhatsApp message asking how much is owed or about arrears
- WHEN the message is processed
- THEN no balance is disclosed
- AND the request is escalated to a human for follow-up

#### Scenario: Agenda request remains with appointment behavior
- GIVEN an inbound WhatsApp message asking to book or reschedule an appointment
- WHEN the message is processed
- THEN it is handled with the existing appointment behavior
- AND no balance or payment behavior is triggered

#### Scenario: FAQ request remains with knowledge answers
- GIVEN an inbound WhatsApp message asking a general clinic service question
- WHEN the message is processed
- THEN it is answered from approved knowledge
- AND no balance or payment behavior is triggered

### Requirement: Collections Tone and Language

Mora's replies MUST be written in Spanish de México, in a warm and professional
tone, and MUST NOT judge or pressure. Mora speaks with authorized doctors about
patients' balances; the tone is service-oriented and factual.

#### Scenario: Reply is warm, professional, and in Spanish de México
- GIVEN any collections interaction with an authorized doctor
- WHEN Mora composes a reply
- THEN the reply is in Spanish de México
- AND the tone is warm and professional
