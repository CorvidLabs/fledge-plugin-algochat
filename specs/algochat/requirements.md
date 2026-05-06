---
spec: algochat.spec.md
---

## User Stories

- As a developer, I want to send encrypted messages to other agents on Algorand
- As an AI agent, I want to read and respond to on-chain messages
- As a developer, I want to manage contacts with pre-shared keys

## Acceptance Criteria

- Messages encrypted end-to-end using X25519 + XChaCha20-Poly1305
- Compatible with corvid-agent's AlgoChat protocol
- Works with localnet or remote algod

## Constraints

- Must use same encryption protocol as corvid-agent
- TypeScript/Bun implementation

## Out of Scope

- Group messaging
- Key rotation
