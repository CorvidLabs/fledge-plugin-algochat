---
module: algochat
version: 1
status: active
files:
  - src/index.ts
  - src/protocol.ts
  - src/contacts.ts
  - src/state.ts
  - src/algorand.ts

db_tables: []
depends_on:
  - "@corvidlabs/ts-algochat (X25519, XChaCha20-Poly1305, PSK ratchet, envelope codec)"
---

# Algochat

## Purpose

Encrypted on-chain messaging via Algorand transactions. Implements the AlgoChat protocol: X25519 key exchange, XChaCha20-Poly1305 encryption, messages stored as Algorand transaction note fields. Compatible with corvid-agent's AlgoChat system.

## Public API

### Commands

| Command | Args | Description |
|---------|------|-------------|
| `send` | `<address-or-name> <message>` | Encrypt and send on-chain |
| `read` | `[--limit N] [--from <addr>]` | Read and decrypt messages |
| `contacts` | | List PSK contacts |
| `contacts add` | `<name> <addr> <psk> [pubkey]` | Add contact |
| `contacts add-uri` | `<name> <algochat-psk://...>` | Add contact via PSK exchange URI |
| `contacts remove` | `<name>` | Remove contact |
| `keygen` | | Generate X25519 keypair |
| `version` | | Print plugin version |

### Modules

| File | Responsibility |
|------|---------------|
| `src/index.ts` | Entry point, init message parsing, command dispatch |
| `src/protocol.ts` | fledge-v1 send/recv helpers |
| `src/contacts.ts` | Contact CRUD, keypair/account persistence |
| `src/state.ts` | Durable state (`.fledge/algochat-state.json`), file locking |
| `src/algorand.ts` | Algorand client helpers (algod, indexer, KMD) |

> **Note:** Crypto (X25519, XChaCha20-Poly1305, PSK ratchet, envelope codec) is provided by the `@corvidlabs/ts-algochat` library — there is no local `src/crypto.ts`.

## Invariants

1. All messages are encrypted with XChaCha20-Poly1305 before being sent on-chain.
2. Nonces are 24 bytes, randomly generated per message, prepended to ciphertext.
3. Keys are derived via HKDF-SHA256 from the X25519 shared secret.
4. Contacts, keypairs, account, and PSK ratchet counters are stored in `.fledge/algochat-state.json` (mode `0600`) with file-lock protection for concurrent access.
5. The plugin never sends a plaintext message on-chain.
6. `keygen` overwrites any existing keypair after user confirmation.
7. `send` resolves contact names to addresses before sending.
8. `read` decrypts messages from known contacts; unknown senders shown as `[encrypted, unknown sender]`.

## Behavioral Examples

```
$ fledge algochat keygen
  Generated X25519 keypair.
  Public key: base64encodedkey==

$ fledge algochat contacts add alice ALGO_ADDR presharedkeyhere
  Added contact: alice

$ fledge algochat contacts
  Name     Address              Key Fingerprint
  alice    ALGO...XYZ           a1b2c3d4

$ fledge algochat send alice "Hello from fledge!"
  Message sent to alice (txid: ABC123...)

$ fledge algochat read --limit 5
  [2026-05-06 10:30] alice: Hello back!
```

## Error Cases

| Error | When | Behavior |
|-------|------|----------|
| `No keypair generated` | `send`/`read` before `keygen` | Error with hint |
| `Contact not found` | `send` with unknown name | Error listing contacts |
| `Algod not available` | No localnet, no env vars | Error with setup instructions |
| `Decryption failed` | Unknown sender | Show `[encrypted, unknown sender]` |
| `Transaction failed` | Algorand rejection | Error with details |

## Dependencies

- `@corvidlabs/ts-algochat` — X25519, XChaCha20-Poly1305, HKDF, PSK ratchet, envelope codec
- `algosdk` — Algorand transactions
- fledge-v1 protocol

## Change Log

| Version | Date | Changes |
|---------|------|---------|
| 1 | 2026-05-06 | Initial spec |
