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
{"ok":true,"publicKey":"xSlL38I3aU4YI8yQKhI19L5TFgnCTc7x2lvjhUMj934=","fingerprint":"a1b2c3d4e5f6..."}
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
{"contacts":[{"name":"magpie","address":"MGPY...","hasPsk":true,"hasPubkey":true}]}
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
{"messages":[{"round":42,"direction":"in","peer":"magpie","text":"Hi Corvid!","txid":"VJQ6...","pubkeyVerified":true,"timestamp":"2026-05-06T18:30:00Z"}],"total":5}
```

## JSON Output Reference

All commands accept `--json` for machine-readable output. The shapes are:

### `keygen --json`
```json
{ "ok": true, "publicKey": "<base64>", "fingerprint": "<hex>" }
```

### `contacts --json`
```json
{ "contacts": [{ "name": "alice", "address": "ALGO...", "hasPsk": true, "hasPubkey": true }] }
```

### `contacts add ... --json`
```json
{ "ok": true, "action": "add", "name": "alice", "address": "ALGO..." }
```

### `contacts add-uri ... --json`
```json
{ "ok": true, "action": "add-uri", "name": "alice", "address": "ALGO..." }
```

### `contacts remove ... --json`
```json
{ "ok": true, "action": "remove", "name": "alice" }
```

### `send ... --json`
```json
{ "ok": true, "to": "alice", "txid": "TXID...", "counter": 0 }
```

### `read --json`
```json
{ "messages": [{ "round": 42, "direction": "in", "peer": "alice", "text": "Hello!", "txid": "TXID...", "pubkeyVerified": true, "timestamp": "2026-05-06T18:30:00Z" }], "total": 20 }
```

The `timestamp` field is present only when the indexer provides `round-time`.

### `version --json`
```json
{ "name": "fledge-plugin-algochat", "version": "0.3.0" }
```

## Data Persistence

Keypairs, contacts, Algorand account, and PSK ratchet counters are stored in `.fledge/algochat-state.json` within your project directory (mode `0600`). Reinstalling the plugin won't touch this file. Your identity, contacts, and message counter state persist across updates.

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

## Security Considerations

- All sensitive state (private keys, mnemonics, PSKs) is stored with file mode `0600` (owner-read-only).
- Algorand addresses are validated at input boundaries before use.
- PSK ratchet counters are persisted durably to maintain forward secrecy across sessions.
- Messages are encrypted with ChaCha20-Poly1305 via [@corvidlabs/ts-algochat](https://github.com/CorvidLabs/ts-algochat).
- **Key material at rest is not encrypted.** The state file (`.fledge/algochat-state.json`) contains X25519 private keys, Algorand account mnemonics, and pre-shared keys as plaintext base64. Protection relies solely on UNIX file permissions (`0600`). This means any process running as the same user can read the file. If you need stronger isolation, restrict access at the OS level (e.g., separate user accounts, encrypted home directories, or a secrets manager). Encryption at rest may be added in a future version.

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
