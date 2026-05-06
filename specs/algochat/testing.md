---
spec: algochat.spec.md
---

## Test Plan

### Unit Tests

- X25519 keypair generation
- XChaCha20-Poly1305 encrypt/decrypt roundtrip
- HKDF key derivation determinism
- Contact serialization/deserialization

### Integration Tests

- Full send/read cycle on localnet
- Contact add/list/remove
- Error handling for missing keypair
