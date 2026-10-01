# Delta for mora-agent

## ADDED Requirements

### Requirement: Balance Inquiry

Mora MUST answer patient questions about how much they owe by returning the outstanding balance for treatment plans already accepted in-office, derived from the database via the balance engine. Mora MUST NOT compute or infer an amount from conversation content, and MUST NOT pass any amount through the model prompt; the amount MUST originate exclusively from the balance read tool output.

#### Scenario: Patient asks for balance, verified contact
- GIVEN a WhatsApp sender whose phone is linked to a patient with one accepted treatment plan and a positive outstanding balance
- WHEN the patient asks "¿cuánto debo?"
- THEN Mora returns the DB-derived outstanding balance
- AND the amount matches the balance engine output for that patient

#### Scenario: Patient asks for balance with nothing owed
- GIVEN a verified patient whose accepted plans are fully paid (outstanding balance is zero)
- WHEN the patient asks how much they owe
- THEN Mora states that there is no outstanding balance
- AND Mora does not quote any amount

#### Scenario: Amount is never derived from the prompt
- GIVEN any patient conversation that mentions an amount
- WHEN Mora answers a balance question
- THEN the amount in Mora's answer MUST originate from the balance tool output
- AND Mora MUST NOT produce an amount by arithmetic or inference in the prompt

#### Scenario: Non-accepted plan is excluded from balance
- GIVEN a patient has a treatment plan whose status is not `accepted`, `in_progress`, or `completed` (e.g. `draft`, `presented`, `cancelled`)
- WHEN Mora answers a balance question
- THEN that plan's total MUST NOT be included in the quoted balance

### Requirement: Overdue Balances Listing

The collections capability MUST be able to produce a summary of patients with overdue outstanding balances, each derived from the balance engine using only eligible accepted plans and non-voided payments, for use by the proactive reminder path.

#### Scenario: Overdue patients are listed
- GIVEN the database contains patients whose eligible-plan balance is positive and past due beyond the configured threshold
- WHEN the overdue listing is produced
- THEN it returns each overdue patient with their DB-derived overdue balance
- AND only patients with a positive balance are included

#### Scenario: Non-overdue and zero-balance patients are excluded
- GIVEN patients with zero balance or balances that are not past due
- WHEN the overdue listing is produced
- THEN those patients MUST be excluded

#### Scenario: Voided payments do not reduce the balance
- GIVEN a patient has a payment that was voided
- WHEN the overdue listing computes their balance
- THEN the voided payment MUST NOT reduce the outstanding balance

### Requirement: Payment Intent Registration and Escalation

When a patient expresses intent to pay, Mora MUST register a structured payment intent (patient identity, and any stated treatment plan or amount the patient provides) and MUST escalate to a human. Mora MUST NOT move money, MUST NOT generate payment links, and MUST NOT confirm a payment as completed.

#### Scenario: Intent to pay is registered and escalated
- GIVEN a verified patient who says they want to pay an outstanding balance
- WHEN Mora handles the request
- THEN a structured payment intent is recorded with the patient identity
- AND the request is escalated to a human for manual payment handling
- AND the patient receives a warm confirmation that a human will follow up

#### Scenario: No money movement
- GIVEN a patient intent to pay
- WHEN Mora processes the request
- THEN no amount is charged, transferred, or marked as paid
- AND no payment link is generated

#### Scenario: Escalation carries structured context
- GIVEN a payment intent that includes a treatment plan or amount stated by the patient
- WHEN Mora escalates
- THEN the escalation surfaces the patient identity and any stated plan or amount for a human to verify against the ledger

### Requirement: Proactive Overdue Reminders

The collections capability MUST be able to send scheduled outbound reminders to patients with outstanding overdue balances, using DB-derived amounts, without the patient initiating the conversation. Reminders MUST be gated so they can be disabled, and MUST support a dry-run mode that sends nothing.

#### Scenario: Reminder sent to an overdue patient
- GIVEN a patient with an overdue outstanding balance
- WHEN the scheduled reminder runs
- THEN a reminder message is sent to that patient referencing the DB-derived overdue balance
- AND the send is idempotent (the same patient is not reminded more than once per schedule cycle)

#### Scenario: Dry-run sends nothing
- GIVEN the dry-run mode is enabled
- WHEN the scheduled reminder runs
- THEN no outbound message is sent
- AND the intended recipients are recorded for inspection

#### Scenario: Reminder disabled by flag
- GIVEN the reminder feature is disabled
- WHEN the schedule fires
- THEN no outbound reminder is sent

#### Scenario: Meta-compliant outbound channel
- GIVEN proactive outbound reminders are business-initiated
- WHEN a reminder is sent
- THEN it is delivered through a Meta-compliant outbound mechanism (approved template/HSM), never as unapproved free-form text

### Requirement: Collections Intent Routing

Inbound WhatsApp messages about payments, balances, or arrears MUST be handled with collections behavior (Mora), while agenda and FAQ messages MUST continue to be handled with the existing appointment and FAQ behavior. A message about an outstanding balance or a desire to pay MUST NOT be answered as if it were an agenda or FAQ request.

#### Scenario: Balance request uses collections behavior
- GIVEN an inbound WhatsApp message asking how much is owed or about arrears
- WHEN the message is processed
- THEN it is handled with collections behavior and balance tools
- AND it is not treated as an agenda or FAQ request

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

### Requirement: No New-Price Quoting Guardrail

Mora MUST NOT quote new prices, prices for treatment plans that are not yet accepted in-office, or prices for prospective treatments. Mora MAY state balances only for treatment plans already accepted in-office, as derived from the database.

#### Scenario: Request for a new price is refused and escalated
- GIVEN a patient asks the price of a treatment that is not part of an accepted plan
- WHEN Mora handles the request
- THEN Mora does not quote a price
- AND the patient is invited to a valuation appointment with a human

#### Scenario: Non-accepted plan total is not disclosed
- GIVEN a patient has a treatment plan in `draft` or `presented` status
- WHEN the patient asks what they would owe for it
- THEN Mora does not disclose that plan's total as an owed balance
- AND Mora only references balances for accepted plans

### Requirement: No Negotiation Guardrail

Mora MUST NOT negotiate amounts, apply discounts or waivers, or resolve balance disputes. Any discount, waiver, dispute, or amount-negotiation request MUST escalate to a human.

#### Scenario: Discount or waiver request escalates
- GIVEN a patient requests a discount or waiver
- WHEN Mora handles the request
- THEN Mora does not change or promise any amount
- AND the request is escalated to a human

#### Scenario: Dispute escalates
- GIVEN a patient disputes the stated balance
- WHEN Mora handles the dispute
- THEN Mora does not argue or adjust the balance
- AND the dispute is escalated to a human with the DB-derived balance as context

### Requirement: Verified Contact Before Balance Disclosure

Mora MUST verify the WhatsApp sender identity (trusted/linked patient contact) before revealing any balance. A sender whose phone is not linked to a patient MUST NOT receive any balance information.

#### Scenario: Unverified sender receives no balance
- GIVEN a WhatsApp sender whose phone is not linked to any patient
- WHEN the sender asks for a balance
- THEN Mora does not reveal any balance
- AND Mora does not reveal any patient's financial data

#### Scenario: Verified sender receives only their own balance
- GIVEN a WhatsApp sender whose phone is linked to a patient
- WHEN the sender asks for that patient's balance
- THEN Mora reveals only the linked patient's DB-derived balance
- AND no other patient's balance is revealed

### Requirement: Collections Tone and Language

Mora's patient-facing replies MUST be written in Spanish de México, in a warm and professional tone, and MUST NOT judge or pressure the patient about their balance.

#### Scenario: Reply is warm, professional, and in Spanish de México
- GIVEN any collections interaction
- WHEN Mora composes a reply
- THEN the reply is in Spanish de México
- AND the tone is warm and professional
- AND the reply does not pressure or shame the patient

### Requirement: Admin Visibility of Collections Activity

An admin MUST be able to see which overdue reminders have been sent and which balances or payment intents have been escalated, including the patient and the DB-derived amount when applicable.

#### Scenario: Sent reminders are visible
- GIVEN reminders have been sent (or dry-run recipients recorded)
- WHEN an admin reviews the collections surface
- THEN they can see which reminders were sent and to which patients

#### Scenario: Escalated balances and payment intents are visible
- GIVEN payment intents and balance disputes have been escalated
- WHEN an admin reviews the collections surface
- THEN they can see each escalated item with the patient identity and the DB-derived amount
