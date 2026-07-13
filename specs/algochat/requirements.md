---
spec: algochat.spec.md
---

## User Stories

- As a developer, I want to send encrypted messages to other agents on Algorand
- As an AI agent, I want to read and respond to on-chain messages
- As a developer, I want to manage contacts with pre-shared keys

## Acceptance Criteria

### REQ-algochat-001

Messages SHALL be encrypted end-to-end using X25519 and XChaCha20-Poly1305.

Acceptance Criteria
- Existing encrypted send/read regression tests pass without changing runtime behavior.

### REQ-algochat-002

The plugin SHALL remain compatible with corvid-agent's AlgoChat protocol.

### REQ-algochat-003

The plugin SHALL work with either localnet or a remote algod endpoint.

## Constraints

- Must use same encryption protocol as corvid-agent
- TypeScript/Bun implementation

## Out of Scope

- Group messaging
- Key rotation
