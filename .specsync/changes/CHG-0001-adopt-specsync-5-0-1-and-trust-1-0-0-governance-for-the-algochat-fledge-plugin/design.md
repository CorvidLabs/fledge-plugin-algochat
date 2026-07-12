---
change: CHG-0001-adopt-specsync-5-0-1-and-trust-1-0-0-governance-for-the-algochat-fledge-plugin
artifact: design
---

# Design

Use the standard Trust profile with blocking risk, progressive provenance, and Trust-managed Atlas disabled. The Trust workflow runs on every pull request and main push, installs Bun dependencies, and invokes the immutable Trust 1.0.0 action. SDD verification runs `bun run test` directly to avoid recursively invoking the Trust or SpecSync gates.
