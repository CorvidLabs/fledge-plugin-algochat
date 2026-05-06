import { sendExec, sendLog } from "./protocol.js";

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

export function initState(root: string): void {
  projectRoot = root;
}

export async function loadState(): Promise<DurableState> {
  if (cachedState) return cachedState;
  const filePath = statePath();
  const result = await sendExec(`cat '${filePath}' 2>/dev/null || echo 'null'`);
  try {
    const parsed = JSON.parse(result.stdout.trim());
    if (parsed) {
      cachedState = {
        keypair: parsed.keypair,
        account: parsed.account,
        contacts: parsed.contacts ?? [],
        pskCounters: parsed.pskCounters ?? {},
      };
      return cachedState;
    }
  } catch {}
  cachedState = { contacts: [], pskCounters: {} };
  return cachedState;
}

export async function saveState(state: DurableState): Promise<void> {
  cachedState = state;
  const filePath = statePath();
  const json = JSON.stringify(state, null, 2);
  const escaped = json.replace(/\\/g, "\\\\").replace(/'/g, "'\\''");
  await sendExec(`mkdir -p '${projectRoot}/.fledge' && printf '%s' '${escaped}' > '${filePath}' && chmod 600 '${filePath}'`);
}
