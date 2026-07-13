---
module: algochat
version: 2
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

### Exported Symbols

| Export | Module | Description |
|--------|--------|-------------|
| `send` | `src/protocol.ts` | Send a fledge protocol message. |
| `recv` | `src/protocol.ts` | Receive one protocol line. |
| `recvJson` | `src/protocol.ts` | Receive and decode a JSON protocol message. |
| `sendOutput` | `src/protocol.ts` | Emit user-facing output. |
| `sendError` | `src/protocol.ts` | Emit a protocol error. |
| `sendLog` | `src/protocol.ts` | Emit a structured log message. |
| `sendExec` | `src/protocol.ts` | Request command execution through fledge. |
| `sendStore` | `src/protocol.ts` | Store a value through fledge. |
| `sendLoad` | `src/protocol.ts` | Load a stored value through fledge. |
| `sendPrompt` | `src/protocol.ts` | Request text input. |
| `sendConfirm` | `src/protocol.ts` | Request confirmation. |
| `InitMessage` | `src/protocol.ts` | Initialization-message shape. |
| `Contact` | `src/contacts.ts` | Stored AlgoChat contact shape. |
| `AlgoAccount` | `src/contacts.ts` | Persisted Algorand account shape. |
| `loadContacts` | `src/contacts.ts` | Load stored contacts. |
| `addContact` | `src/contacts.ts` | Add or replace a contact. |
| `removeContact` | `src/contacts.ts` | Remove a named contact. |
| `findContact` | `src/contacts.ts` | Find a contact by name or address. |
| `saveKeypair` | `src/contacts.ts` | Persist the encryption keypair. |
| `loadKeypair` | `src/contacts.ts` | Load the persisted encryption keypair. |
| `getOrCreateAccount` | `src/contacts.ts` | Load or create the Algorand account. |
| `loadAccount` | `src/contacts.ts` | Load the persisted Algorand account. |
| `DurableState` | `src/state.ts` | Durable plugin-state shape. |
| `initState` | `src/state.ts` | Initialize state storage for a project. |
| `loadState` | `src/state.ts` | Load durable state. |
| `withState` | `src/state.ts` | Mutate durable state under the file lock. |
| `saveState` | `src/state.ts` | Persist durable state. |
| `getAlgod` | `src/algorand.ts` | Create the configured algod client. |
| `getIndexer` | `src/algorand.ts` | Create the configured indexer client. |
| `checkAlgod` | `src/algorand.ts` | Check algod availability. |
| `getSuggestedParams` | `src/algorand.ts` | Fetch transaction parameters. |
| `submitAndWait` | `src/algorand.ts` | Submit a signed transaction and wait for confirmation. |
| `ensureFunded` | `src/algorand.ts` | Check that an address meets the minimum balance. |

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
| 2 | 2026-07-13 | Reconciled existing API documentation and stable requirement IDs for SpecSync 5.0.1 governance; runtime behavior is unchanged. |
| 2026-07-13 | CHG-0001-adopt-specsync-5-0-1-and-trust-1-0-0-governance-for-the-algochat-fledge-plugin: Adopt SpecSync 5.0.1 and Trust 1.0.0 governance for the AlgoChat Fledge plugin |
