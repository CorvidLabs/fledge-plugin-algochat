---
spec: algochat.spec.md
---

## Context

Extracted from corvid-agent's AlgoChat on-chain messaging system.

## Related Modules

- fledge-plugin-localnet (provides the Algorand network)
- corvid-agent AlgoChat (compatible protocol)

## Design Decisions

- Uses @noble libraries instead of tweetnacl — more modern, audited, tree-shakeable
- Single compiled binary via bun build --compile
- PSK-based contacts matches corvid-agent's current approach
