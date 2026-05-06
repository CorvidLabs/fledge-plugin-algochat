# fledge-plugin-algochat

Encrypted on-chain messaging plugin for [fledge](https://github.com/CorvidLabs/fledge). Implements the AlgoChat PSK v1.1 protocol via Algorand transactions, powered by [@corvidlabs/ts-algochat](https://github.com/CorvidLabs/ts-algochat).

## Install

```bash
fledge plugins install CorvidLabs/fledge-plugin-algochat
```

## Commands

### `fledge algochat keygen`

Generate an X25519 keypair for encrypted communication.

```
$ fledge algochat keygen --json
{"publicKey":"xSlL38I3aU4YI8yQKhI19L5TFgnCTc7x2lvjhUMj934=","address":"PZZCVTTZ..."}
```

### `fledge algochat contacts add <name> <addr> <psk> [pubkey]`

Add a contact with a pre-shared key for encrypted messaging.

```
$ fledge algochat contacts add magpie MGPY... s3cr3t-psk xSlL38...
Added contact: magpie
```

### `fledge algochat contacts add-uri <name> <uri>`

Add a contact via a PSK exchange URI.

### `fledge algochat contacts`

List all contacts.

```
$ fledge algochat contacts --json
[{"name":"magpie","address":"MGPY...","hasPublicKey":true}]
```

### `fledge algochat contacts remove <name>`

Remove a contact.

### `fledge algochat send <addr> <msg>`

Send an encrypted message to a contact. The message is encrypted with ChaCha20-Poly1305 using PSK-derived keys and submitted as an Algorand transaction.

```
$ fledge algochat send MGPY... "Hello from CorvidAgent"
Sent: TXID VJQ6RQMB6XIP4AD5EYHHRJQLJVCKM2IMYVZOZEJCBH37O2QZRG4A
```

If the sender account has insufficient balance, the plugin automatically funds it with 10 ALGO via KMD (when available).

### `fledge algochat read [--limit N]`

Read incoming messages.

```
$ fledge algochat read --limit 5 --json
[{"from":"MGPY...","message":"Hi Corvid!","timestamp":"2026-05-06T18:30:00Z"}]
```

## Data Persistence

Keypairs, contacts, Algorand account, and PSK ratchet counters are stored in `.fledge/algochat-state.json` within your project directory (mode `0600`). This file survives plugin reinstalls — your identity, contacts, and message counter state are preserved.

**Important:** If you delete `.fledge/algochat-state.json`, you will lose your keypair and all contacts. Messages already sent on-chain remain, but you will not be able to decrypt them with a new keypair.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ALGOD_URL` | `http://localhost:4001` | Algorand algod endpoint |
| `INDEXER_URL` | `http://localhost:8980` | Algorand indexer endpoint |
| `KMD_URL` | `http://localhost:4002` | KMD endpoint (for auto-funding) |
| `ALGOD_TOKEN` | localnet default | Algod API token |
| `KMD_TOKEN` | localnet default | KMD API token |

## Exposing Localnet to Remote Agents (socat)

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

## Security

- All sensitive state (private keys, mnemonics, PSKs) is stored with file mode `0600` (owner-read-only).
- Algorand addresses are validated at input boundaries before use.
- PSK ratchet counters are persisted durably to maintain forward secrecy across sessions.
- Messages are encrypted with ChaCha20-Poly1305 via [@corvidlabs/ts-algochat](https://github.com/CorvidLabs/ts-algochat).

## Prerequisites

- Algorand localnet or remote algod endpoint
- `fledge-plugin-localnet` (optional, for local development)

## Development

```bash
bun install
bun test
```

## License

MIT
