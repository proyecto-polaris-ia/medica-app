# Delta for Eve Framework

## ADDED Requirements

### Requirement: Read-Only Catalog Tool

The Eve agent MUST expose a `list-catalog` tool that returns clinic services and providers from existing catalog functions without modifying database state.

#### Scenario: Catalog is returned as structured data
- GIVEN services and providers exist in the database
- WHEN the agent calls `list-catalog`
- THEN the tool returns `services` with `id`, `name`, and human-readable `duration`
- AND it returns `providers` with `id` and `name`

#### Scenario: Catalog read fails gracefully
- GIVEN the catalog data source throws an error
- WHEN the agent calls `list-catalog`
- THEN the tool returns `success: false` with an actionable error message

### Requirement: Read-Only Availability Tool

The Eve agent MUST expose a `check-availability` tool that accepts `serviceName`, `providerName`, and `date` (`YYYY-MM-DD`) and returns up to five available slots computed by existing availability logic.

#### Scenario: Available slots are returned
- GIVEN a matching service, matching provider, and free slots for the requested date
- WHEN the agent calls `check-availability`
- THEN the tool resolves the service and provider using existing catalog functions
- AND returns `success: true`, `available: true`, the resolved service/provider names, the date, and local time slot strings

#### Scenario: Missing service or provider is handled
- GIVEN the requested service or provider cannot be resolved
- WHEN the agent calls `check-availability`
- THEN the tool returns `success: false`, `available: false`, and an error describing the missing entity

#### Scenario: Invalid date is rejected
- GIVEN a date that is not in `YYYY-MM-DD` format or is not a valid calendar date
- WHEN the agent calls `check-availability`
- THEN the tool returns `success: false`, `available: false`, and a format hint

#### Scenario: No availability is handled
- GIVEN the service and provider resolve but no slots exist
- WHEN the agent calls `check-availability`
- THEN the tool returns `success: true`, `available: false`, and a message suggesting another date

### Requirement: Read-Only Knowledge Search Tool

The Eve agent MUST expose a `search-knowledge` tool that searches only approved `whatsapp_knowledge_entries` and returns up to three relevant entries.

#### Scenario: Approved knowledge matches are returned
- GIVEN approved knowledge entries match the query by topic, question, answer, or tags
- WHEN the agent calls `search-knowledge`
- THEN the tool returns `success: true`, `found: true`, and up to three entries with `topic`, `question`, and `answer`

#### Scenario: Draft and archived entries are not exposed
- GIVEN matching entries exist with statuses other than `approved`
- WHEN the agent calls `search-knowledge`
- THEN those entries are excluded from the result

#### Scenario: No knowledge match is handled
- GIVEN no approved entries match the query
- WHEN the agent calls `search-knowledge`
- THEN the tool returns `success: true`, `found: false`, and a helpful message

### Requirement: Tool Instructions

`agent/instructions.md` MUST mention the available read-only tools and MUST tell the agent to consult them instead of inventing catalog, availability, or knowledge answers.

#### Scenario: Agent instructions include tool guidance
- GIVEN `agent/instructions.md` is read
- WHEN the tool guidance section is inspected
- THEN it names `list-catalog`, `check-availability`, and `search-knowledge`
- AND it preserves the existing clinical guardrails
