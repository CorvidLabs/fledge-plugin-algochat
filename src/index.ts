import algosdk from "algosdk";
import { recvJson, sendOutput, sendError, sendConfirm, type InitMessage } from "./protocol.js";
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
import { loadContacts, addContact, removeContact, findContact, saveKeypair, loadKeypair, getOrCreateAccount, loadAccount } from "./contacts.js";
import { checkAlgod, getAlgod, getIndexer, getSuggestedParams, submitAndWait, ensureFunded } from "./algorand.js";
import { initState, loadState, saveState, withState } from "./state.js";

let jsonMode = false;

function isValidAlgorandAddress(addr: string): boolean {
  try {
    algosdk.Address.fromString(addr);
    return true;
  } catch {
    return false;
  }
}

function sendJson(data: unknown): void {
  sendOutput(JSON.stringify(data));
}

async function main() {
  const init = await recvJson<InitMessage>();
  const args = init.args;
  initState(init.project.root);
  jsonMode = args.includes("--json");
  const filteredArgs = args.filter(a => a !== "--json");
  const subcmd = filteredArgs[0] ?? "help";

  switch (subcmd) {
    case "keygen": await cmdKeygen(); break;
    case "contacts": await cmdContacts(filteredArgs.slice(1)); break;
    case "send": await cmdSend(filteredArgs.slice(1)); break;
    case "read": await cmdRead(filteredArgs.slice(1)); break;
    case "help": case "--help": case "-h": cmdHelp(); break;
    default:
      sendError(`Unknown command: ${subcmd}. Run: fledge algochat help`);
      process.exit(1);
  }

  process.exit(0);
}

async function cmdKeygen() {
  const existing = await loadKeypair();
  if (existing && !jsonMode) {
    const confirmed = await sendConfirm("A keypair already exists. Overwrite it?");
    if (!confirmed) {
      sendOutput("Cancelled.");
      return;
    }
  }

  const kp = generateEphemeralKeyPair();
  await saveKeypair(kp.publicKey, kp.privateKey);
  const data = {
    publicKey: publicKeyToBase64(kp.publicKey),
    fingerprint: fingerprint(kp.publicKey),
  };
  if (jsonMode) {
    sendJson({ ok: true, ...data });
  } else {
    sendOutput(`Generated X25519 keypair.`);
    sendOutput(`Public key: ${data.publicKey}`);
    sendOutput(`Fingerprint: ${data.fingerprint}`);
  }
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
    if (!isValidAlgorandAddress(address)) {
      sendError(`Invalid Algorand address: ${address}`);
      process.exit(1);
    }
    await addContact(name, address, psk, pubkey);
    if (jsonMode) {
      sendJson({ ok: true, action: "add", name, address });
    } else {
      sendOutput(`Added contact: ${name}`);
    }
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
      if (jsonMode) {
        sendJson({ ok: true, action: "add-uri", name, address: parsed.address });
      } else {
        sendOutput(`Added contact from URI: ${name} (${parsed.address.substring(0, 8)}...)`);
      }
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
    if (jsonMode) {
      sendJson({ ok: removed, action: "remove", name });
      if (!removed) process.exit(1);
    } else {
      if (removed) sendOutput(`Removed contact: ${name}`);
      else {
        sendError(`Contact not found: ${name}`);
        process.exit(1);
      }
    }
    return;
  }

  const contacts = await loadContacts();
  if (jsonMode) {
    sendJson({ contacts: contacts.map(c => ({ name: c.name, address: c.address, hasPsk: !!c.psk, hasPubkey: !!c.pubkey })) });
    return;
  }

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

  if (!await checkAlgod()) {
    sendError("Cannot reach algod. Is localnet running? Set ALGOD_URL if using a remote node.");
    process.exit(1);
  }

  const contact = await findContact(target);
  const address = contact?.address ?? target;

  if (!contact && !isValidAlgorandAddress(address)) {
    sendError(`Unknown contact and invalid Algorand address: ${target}`);
    process.exit(1);
  }
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

  const account = await getOrCreateAccount();
  await ensureFunded(account.address);
  const initialPSK = base64ToPublicKey(pskB64);
  const recipientPubKey = base64ToPublicKey(pubkeyB64);

  const stateKey = `psk-state:${contact?.name ?? address}`;
  const state = await loadPSKState(stateKey);
  const { counter, state: newState } = advanceSendCounter(state);
  const currentPSK = derivePSKAtCounter(initialPSK, counter);

  const envelope = encryptPSKMessage(message, kp.publicKey, recipientPubKey, currentPSK, counter);
  const encoded = encodePSKEnvelope(envelope);
  const note = new Uint8Array(encoded);

  const params = await getSuggestedParams();
  const sender = algosdk.Address.fromString(account.address);
  const receiver = algosdk.Address.fromString(address);

  const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender,
    receiver,
    amount: BigInt(0),
    suggestedParams: params,
    note,
  });

  const signed = txn.signTxn(account.sk);
  const txid = await submitAndWait(signed);
  await savePSKState(stateKey, newState);

  if (jsonMode) {
    sendJson({ ok: true, to: contact?.name ?? address, txid, counter });
  } else {
    sendOutput(`Message sent to ${contact?.name ?? address} (txid: ${txid})`);
  }
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

  const account = await loadAccount();
  if (!account) {
    sendError("No Algorand account. Send a message first or run: fledge algochat keygen");
    process.exit(1);
  }

  let transactions: any[];
  try {
    const indexer = getIndexer();
    const result = await indexer
      .lookupAccountTransactions(account.address)
      .limit(limit)
      .do();
    transactions = result.transactions ?? [];
  } catch {
    sendError("Could not reach indexer. Make sure localnet is running. Set INDEXER_URL for remote.");
    process.exit(1);
  }

  const contacts = await loadContacts();
  const messages: { round: number; direction: string; peer: string; text: string; txid: string }[] = [];

  for (const tx of transactions) {
    const noteB64: string | undefined = tx.note;
    if (!noteB64) continue;

    let noteBytes: Uint8Array;
    try {
      noteBytes = new Uint8Array(Buffer.from(noteB64, "base64"));
    } catch {
      continue;
    }

    if (!isPSKMessage(noteBytes)) continue;

    let envelope;
    try {
      envelope = decodePSKEnvelope(noteBytes);
    } catch {
      continue;
    }

    const senderAddr = tx["payment-transaction"]?.receiver === account.address
      ? tx.sender
      : tx["payment-transaction"]?.receiver ?? tx.sender;

    const contact = from
      ? contacts.find(c => c.name === from || c.address === from)
      : contacts.find(c => c.address === senderAddr || c.address === tx.sender);

    if (!contact?.psk) continue;

    const initialPSK = base64ToPublicKey(contact.psk);
    const currentPSK = derivePSKAtCounter(initialPSK, envelope.ratchetCounter);

    try {
      const decrypted = decryptPSKMessage(envelope, kp.privateKey, kp.publicKey, currentPSK);
      if (!decrypted) continue;

      const direction = tx.sender === account.address ? "out" : "in";
      const peer = contact.name ?? senderAddr.substring(0, 8) + "...";
      const round = tx["confirmed-round"] ?? 0;
      messages.push({ round, direction, peer, text: decrypted.text, txid: tx.id ?? "" });
    } catch {
      continue;
    }
  }

  if (jsonMode) {
    sendJson({ messages, total: transactions.length });
    return;
  }

  if (messages.length === 0) {
    const totalWithNotes = transactions.filter((t: any) => t.note).length;
    if (totalWithNotes > 0) {
      sendOutput(`Found ${totalWithNotes} transaction(s) with notes, but none could be decrypted.`);
      sendOutput("Check that sender is in your contacts with the correct PSK.");
    } else if (transactions.length === 0) {
      sendOutput("No transactions found.");
    } else {
      sendOutput("No messages found.");
    }
  } else {
    for (const m of messages) {
      const arrow = m.direction === "out" ? "→" : "←";
      sendOutput(`[${m.round}] ${arrow} ${m.peer}: ${m.text}`);
    }
  }
}

function cmdHelp() {
  sendOutput("fledge-plugin-algochat — Encrypted on-chain messaging (PSK v1.1)");
  sendOutput("  Powered by @corvidlabs/ts-algochat");
  sendOutput("");
  sendOutput("Commands:");
  sendOutput("  send <addr|name> <msg> [--json]         Send encrypted message");
  sendOutput("  read [--limit N] [--from <name>] [--json]  Read & decrypt messages");
  sendOutput("  contacts [--json]                        List contacts");
  sendOutput("  contacts add <name> <addr> <psk> [key]   Add contact (base64)");
  sendOutput("  contacts add-uri <name> <uri>            Add via PSK exchange URI");
  sendOutput("  contacts remove <name>                   Remove contact");
  sendOutput("  keygen [--json]                          Generate X25519 keypair");
  sendOutput("");
  sendOutput("Use --json for machine-readable output.");
}

async function loadPSKState(key: string): Promise<PSKState> {
  const state = await loadState();
  const data = state.pskCounters[key];
  if (!data) return createPSKState();
  return {
    sendCounter: data.sendCounter ?? 0,
    peerLastCounter: data.peerLastCounter ?? -1,
    seenCounters: new Set(data.seenCounters ?? []),
  };
}

async function savePSKState(key: string, pskState: PSKState): Promise<void> {
  await withState(state => {
    state.pskCounters[key] = {
      sendCounter: pskState.sendCounter,
      peerLastCounter: pskState.peerLastCounter,
      seenCounters: Array.from(pskState.seenCounters),
    };
    return state;
  });
}

main().catch((err) => {
  sendError(String(err));
  process.exit(1);
});
