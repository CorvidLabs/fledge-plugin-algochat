# fledge-plugin-algochat

Encrypted on-chain messaging plugin for [fledge](https://github.com/CorvidLabs/fledge). Implements the AlgoChat protocol via Algorand transactions.

## Install

```bash
fledge plugins install CorvidLabs/fledge-plugin-algochat
```

## Commands

| Command | Description |
|---------|-------------|
| `fledge algochat send <addr> <msg>` | Send encrypted message |
| `fledge algochat read [--limit N]` | Read incoming messages |
| `fledge algochat contacts` | List contacts |
| `fledge algochat contacts add <name> <addr> <psk>` | Add contact |
| `fledge algochat contacts remove <name>` | Remove contact |
| `fledge algochat keygen` | Generate X25519 keypair |

## Prerequisites

- Algorand localnet or remote algod endpoint
- `fledge-plugin-localnet` (optional, for local development)
