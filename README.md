# fledge-plugin-algochat

Encrypted on-chain messaging plugin for [fledge](https://github.com/CorvidLabs/fledge). Implements the AlgoChat PSK v1.1 protocol via Algorand transactions, powered by [@corvidlabs/ts-algochat](https://github.com/CorvidLabs/ts-algochat).

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
| `fledge algochat contacts add <name> <addr> <psk> [pubkey]` | Add contact |
| `fledge algochat contacts add-uri <name> <uri>` | Add via PSK exchange URI |
| `fledge algochat contacts remove <name>` | Remove contact |
| `fledge algochat keygen` | Generate X25519 keypair |

## Data Persistence

Keypairs, contacts, Algorand account, and PSK ratchet counters are stored in `.fledge/algochat-state.json` within your project directory (mode `0600`). This file survives plugin reinstalls — your identity, contacts, and message counter state are preserved.

**Important:** If you delete `.fledge/algochat-state.json`, you will lose your keypair and all contacts. Messages already sent on-chain remain, but you will not be able to decrypt them with a new keypair.

## Security

- All sensitive state (private keys, mnemonics, PSKs) is stored with file mode `0600` (owner-read-only).
- Algorand addresses are validated at input boundaries before use.
- PSK ratchet counters are persisted durably to maintain forward secrecy across sessions.

## Prerequisites

- Algorand localnet or remote algod endpoint
- `fledge-plugin-localnet` (optional, for local development)
