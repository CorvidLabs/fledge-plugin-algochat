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

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ALGOD_URL` | `http://localhost:4001` | Algorand algod endpoint |
| `INDEXER_URL` | `http://localhost:8980` | Algorand indexer endpoint |
| `KMD_URL` | `http://localhost:4002` | KMD endpoint (for auto-funding) |
| `ALGOD_TOKEN` | localnet default | Algod API token |
| `KMD_TOKEN` | localnet default | KMD API token |

When sending a message, the plugin automatically checks if the sender account is funded. If not and KMD is reachable, it auto-funds with 10 ALGO from the default wallet.

## Remote Localnet (socat)

If the Algorand localnet runs on a different machine (e.g., a host providing Docker to a sandboxed agent), bridge the ports with socat:

```bash
# On the host running Docker/AlgoKit localnet:
socat TCP-LISTEN:4001,fork,reuseaddr,bind=0.0.0.0 TCP:localhost:4001 &
socat TCP-LISTEN:8980,fork,reuseaddr,bind=0.0.0.0 TCP:localhost:8980 &
socat TCP-LISTEN:4002,fork,reuseaddr,bind=0.0.0.0 TCP:localhost:4002 &
```

Then set env vars on the agent side:

```bash
export ALGOD_URL=http://<host-ip>:4001
export INDEXER_URL=http://<host-ip>:8980
export KMD_URL=http://<host-ip>:4002
```

## Prerequisites

- Algorand localnet or remote algod endpoint
- `fledge-plugin-localnet` (optional, for local development)
