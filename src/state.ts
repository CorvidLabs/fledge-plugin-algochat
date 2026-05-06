import { sendLog } from "./protocol.js";
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, chmodSync, openSync, closeSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";

let projectRoot = ".";
let cachedState: DurableState | null = null;

export interface DurableState {
  keypair?: { publicKey: string; privateKey: string };
  account?: { address: string; mnemonic: string };
  contacts: { name: string; address: string; psk: string; pubkey?: string }[];
  pskCounters: Record<string, { sendCounter: number; peerLastCounter: number; seenCounters: number[] }>;
}

function statePath(): string {
  return `${projectRoot}/.fledge/algochat-state.json`;
}

function lockPath(): string {
  return `${projectRoot}/.fledge/algochat-state.lock`;
}

export function initState(root: string): void {
  projectRoot = root;
}

export async function loadState(): Promise<DurableState> {
  if (cachedState) return cachedState;
  const filePath = statePath();
  try {
    if (existsSync(filePath)) {
      const raw = readFileSync(filePath, "utf-8").trim();
      if (raw) {
        const parsed = JSON.parse(raw);
        cachedState = {
          keypair: parsed.keypair,
          account: parsed.account,
          contacts: parsed.contacts ?? [],
          pskCounters: parsed.pskCounters ?? {},
        };
        return cachedState;
      }
    }
  } catch (err) {
    sendLog("warn", `state load failed, starting fresh: ${(err as Error).message}`);
  }
  cachedState = { contacts: [], pskCounters: {} };
  return cachedState;
}

// Acquire a coarse write lock so concurrent `send` calls can't read-modify-
// write the ratchet counters in parallel. The lock is a file created with
// O_EXCL; if it exists, we wait briefly and retry. Held only for the
// duration of one save (milliseconds), so contention is rare.
function acquireLock(): number {
  const lock = lockPath();
  const start = Date.now();
  for (;;) {
    try {
      return openSync(lock, "wx");
    } catch (err: any) {
      if (err.code !== "EEXIST") throw err;
      if (Date.now() - start > 2000) {
        // Stale lock from a crashed process — break it.
        try { unlinkSync(lock); } catch {}
      } else {
        Bun.sleepSync(20);
      }
    }
  }
}

function releaseLock(fd: number): void {
  try { closeSync(fd); } catch {}
  try { unlinkSync(lockPath()); } catch {}
}

// A mutator runs inside the write lock with the *freshly re-read* state, so
// concurrent processes can safely read-modify-write the same file without
// clobbering each other's changes. Any mutation that touches state must go
// through this path rather than calling saveState(state) directly.
export async function withState(mutate: (state: DurableState) => DurableState | Promise<DurableState>): Promise<DurableState> {
  const filePath = statePath();
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });

  const fd = acquireLock();
  try {
    // Re-read inside the lock — another process may have updated the file
    // since this one cached it.
    let fresh: DurableState = { contacts: [], pskCounters: {} };
    if (existsSync(filePath)) {
      try {
        const raw = readFileSync(filePath, "utf-8").trim();
        if (raw) {
          const parsed = JSON.parse(raw);
          fresh = {
            keypair: parsed.keypair,
            account: parsed.account,
            contacts: parsed.contacts ?? [],
            pskCounters: parsed.pskCounters ?? {},
          };
        }
      } catch (err) {
        sendLog("warn", `state re-read failed inside lock: ${(err as Error).message}`);
      }
    }
    const updated = await mutate(fresh);
    const json = JSON.stringify(updated, null, 2);
    // Atomic temp + rename: a partial write or crash mid-write never leaves
    // the canonical file truncated, and a concurrent reader sees either the
    // old or new file in full — never a torn write.
    const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}`;
    writeFileSync(tmp, json, { mode: 0o600 });
    chmodSync(tmp, 0o600);
    renameSync(tmp, filePath);
    cachedState = updated;
    return updated;
  } finally {
    releaseLock(fd);
  }
}

// Kept for compatibility with call sites that don't yet use the mutator
// form. Note: this path is *not* race-safe under concurrent processes —
// prefer withState for any read-modify-write sequence.
export async function saveState(state: DurableState): Promise<void> {
  await withState(() => state);
}
