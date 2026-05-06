import { recvJson, sendOutput, sendError, sendExec, sendConfirm, sendStore, sendLoad, type InitMessage } from "./protocol.js";
import {
  generateEphemeralKeyPair,
  encryptPSKMessage,
  encodePSKEnvelope,
  decodePSKEnvelope,
  decryptPSKMessage,
  isPSKMessage,
  derivePSKAtCounter,
  advanceSendCounter,
  createPSKState,
  publicKeyToBase64,
  base64ToPublicKey,
  fingerprint,
  parsePSKExchangeURI,
  type PSKState,
} from "@corvidlabs/ts-algochat";
import { loadContacts, addContact, removeContact, findContact, saveKeypair, loadKeypair } from "./contacts.js";

async function main() {
  const init = await recvJson<InitMessage>();
  const args = init.args;
  const subcmd = args[0] ?? "help";

  switch (subcmd) {
    case "keygen": await cmdKeygen(); break;
    case "contacts": await cmdContacts(args.slice(1)); break;
    case "send": await cmdSend(args.slice(1)); break;
    case "read": await cmdRead(args.slice(1)); break;
    case "help": case "--help": case "-h": cmdHelp(); break;
    default:
      sendError(`Unknown command: ${subcmd}. Run: fledge algochat help`);
      process.exit(1);
  }

  process.exit(0);
}

async function cmdKeygen() {
  const existing = await loadKeypair();
  if (existing) {
    const confirmed = await sendConfirm("A keypair already exists. Overwrite it?");
    if (!confirmed) {
      sendOutput("Cancelled.");
      return;
    }
  }

  const kp = generateEphemeralKeyPair();
  await saveKeypair(kp.publicKey, kp.privateKey);
  sendOutput(`Generated X25519 keypair.`);
  sendOutput(`Public key: ${publicKeyToBase64(kp.publicKey)}`);
  sendOutput(`Fingerprint: ${fingerprint(kp.publicKey)}`);
}

async function cmdContacts(args: string[]) {
  const action = args[0] ?? "list";

  if (action === "add") {
    const name = args[1];
    const address = args[2];
    const psk = args[3];
    const pubkey = args[4];
    if (!name || !address || !psk) {
      sendError("Usage: fledge algochat contacts add <name> <address> <psk-base64> [<pubkey-base64>]");
      process.exit(1);
    }
    await addContact(name, address, psk, pubkey);
    sendOutput(`Added contact: ${name}`);
    return;
  }

  if (action === "add-uri") {
    const name = args[1];
    const uri = args[2];
    if (!name || !uri) {
      sendError("Usage: fledge algochat contacts add-uri <name> <algochat-psk://...>");
      process.exit(1);
    }
    try {
      const parsed = parsePSKExchangeURI(uri);
      const pskB64 = publicKeyToBase64(parsed.psk);
      await addContact(name, parsed.address, pskB64);
      sendOutput(`Added contact from URI: ${name} (${parsed.address.substring(0, 8)}...)`);
    } catch (err) {
      sendError(`Invalid PSK exchange URI: ${err}`);
      process.exit(1);
    }
    return;
  }

  if (action === "remove") {
    const name = args[1];
    if (!name) {
      sendError("Usage: fledge algochat contacts remove <name>");
      process.exit(1);
    }
    const removed = await removeContact(name);
    if (removed) sendOutput(`Removed contact: ${name}`);
    else sendError(`Contact not found: ${name}`);
    return;
  }

  const contacts = await loadContacts();
  if (contacts.length === 0) {
    sendOutput("No contacts. Add one: fledge algochat contacts add <name> <address> <psk> [<pubkey>]");
    return;
  }

  sendOutput("Name         Address              PSK            PubKey");
  for (const c of contacts) {
    const pskShort = c.psk.substring(0, 8) + "...";
    const addrShort = c.address.length > 16 ? c.address.substring(0, 8) + "..." + c.address.slice(-4) : c.address;
    const pubkeyShort = c.pubkey ? c.pubkey.substring(0, 8) + "..." : "(none)";
    sendOutput(`${c.name.padEnd(13)}${addrShort.padEnd(21)}${pskShort.padEnd(15)}${pubkeyShort}`);
  }
}

async function cmdSend(args: string[]) {
  const kp = await loadKeypair();
  if (!kp) {
    sendError("No keypair generated. Run: fledge algochat keygen");
    process.exit(1);
  }

  const target = args[0];
  const message = args.slice(1).join(" ");
  if (!target || !message) {
    sendError("Usage: fledge algochat send <address-or-name> <message>");
    process.exit(1);
  }

  const contact = await findContact(target);
  const address = contact?.address ?? target;
  const pskB64 = contact?.psk;
  const pubkeyB64 = contact?.pubkey;

  if (!pskB64) {
    sendError(`No PSK found for ${target}. Add a contact first: fledge algochat contacts add <name> <address> <psk> <pubkey>`);
    process.exit(1);
  }

  if (!pubkeyB64) {
    sendError(`No public key for ${target}. Update contact with pubkey: fledge algochat contacts add ${contact?.name ?? target} ${address} ${pskB64} <pubkey-base64>`);
    process.exit(1);
  }

  const initialPSK = base64ToPublicKey(pskB64);
  const recipientPubKey = base64ToPublicKey(pubkeyB64);

  const stateKey = `psk-state:${contact?.name ?? address}`;
  const state = await loadPSKState(stateKey);
  const { counter, state: newState } = advanceSendCounter(state);
  const currentPSK = derivePSKAtCounter(initialPSK, counter);

  const envelope = encryptPSKMessage(message, kp.publicKey, recipientPubKey, currentPSK, counter);
  const encoded = encodePSKEnvelope(envelope);
  const noteB64 = Buffer.from(encoded).toString("base64");

  const sendCmd = `goal clerk send -a 0 -f $(goal account list | head -1 | awk '{print $2}') -t ${address} --note "${noteB64}" 2>&1`;
  const result = await sendExec(sendCmd);

  if (result.code !== 0) {
    sendError(`Transaction failed: ${result.stderr || result.stdout}`);
    process.exit(1);
  }

  await savePSKState(stateKey, newState);

  const txid = result.stdout.trim().split("\n").pop() ?? "unknown";
  sendOutput(`Message sent to ${contact?.name ?? address} (txid: ${txid})`);
}

async function cmdRead(args: string[]) {
  let limit = 20;
  let from: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--limit" && args[i + 1]) {
      limit = parseInt(args[++i], 10);
    } else if (args[i] === "--from" && args[i + 1]) {
      from = args[++i];
    }
  }

  const kp = await loadKeypair();
  if (!kp) {
    sendError("No keypair generated. Run: fledge algochat keygen");
    process.exit(1);
  }

  const myAddress = `$(goal account list | head -1 | awk '{print $2}')`;
  const cmd = `goal account transactions -a ${myAddress} --firstvalid 1 --lastvalid 999999999 2>&1 | head -${limit * 2}`;
  const result = await sendExec(cmd);

  if (result.code !== 0) {
    sendError(`Failed to read transactions: ${result.stderr || result.stdout}`);
    sendOutput("Make sure localnet is running: fledge localnet start");
    process.exit(1);
  }

  if (!result.stdout.trim()) {
    sendOutput("No messages found.");
    return;
  }

  sendOutput("Recent transactions:");
  sendOutput(result.stdout.trim());
}

function cmdHelp() {
  sendOutput("fledge-plugin-algochat — Encrypted on-chain messaging (PSK v1.1)");
  sendOutput("  Powered by @corvidlabs/ts-algochat");
  sendOutput("");
  sendOutput("Commands:");
  sendOutput("  send <addr|name> <msg>                 Send encrypted message");
  sendOutput("  read [--limit N] [--from <addr>]        Read transactions");
  sendOutput("  contacts                                List contacts");
  sendOutput("  contacts add <name> <addr> <psk> [key]  Add contact (base64)");
  sendOutput("  contacts add-uri <name> <uri>           Add via PSK exchange URI");
  sendOutput("  contacts remove <name>                  Remove contact");
  sendOutput("  keygen                                  Generate X25519 keypair");
}

async function loadPSKState(key: string): Promise<PSKState> {
  const raw = await sendLoad(key);
  if (!raw) return createPSKState();
  try {
    const data = JSON.parse(raw);
    return {
      sendCounter: data.sendCounter ?? 0,
      peerLastCounter: data.peerLastCounter ?? -1,
      seenCounters: new Set(data.seenCounters ?? []),
    };
  } catch {
    return createPSKState();
  }
}

async function savePSKState(key: string, state: PSKState): Promise<void> {
  sendStore(key, JSON.stringify({
    sendCounter: state.sendCounter,
    peerLastCounter: state.peerLastCounter,
    seenCounters: Array.from(state.seenCounters),
  }));
}

main().catch((err) => {
  sendError(String(err));
  process.exit(1);
});
