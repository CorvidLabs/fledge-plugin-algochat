import { recvJson, sendOutput, sendError, sendExec, sendConfirm, type InitMessage } from "./protocol.js";
import { generateKeypair, encrypt, decrypt, deriveKeyFromPsk, toBase64, toHex, fromHex } from "./crypto.js";
import { loadContacts, addContact, removeContact, findContact, saveKeypair, loadKeypair } from "./contacts.js";

async function main() {
  const init = await recvJson<InitMessage>();
  const args = init.args;
  const subcmd = args[0] ?? "help";

  switch (subcmd) {
    case "keygen":
      await cmdKeygen();
      break;
    case "contacts":
      await cmdContacts(args.slice(1));
      break;
    case "send":
      await cmdSend(args.slice(1));
      break;
    case "read":
      await cmdRead(args.slice(1));
      break;
    case "help":
    case "--help":
    case "-h":
      cmdHelp();
      break;
    default:
      sendError(`Unknown command: ${subcmd}. Run: fledge algochat help`);
      process.exit(1);
  }
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

  const kp = generateKeypair();
  await saveKeypair(kp.publicKey, kp.privateKey);
  sendOutput(`Generated X25519 keypair.`);
  sendOutput(`Public key: ${toBase64(kp.publicKey)}`);
}

async function cmdContacts(args: string[]) {
  const action = args[0] ?? "list";

  if (action === "add") {
    const name = args[1];
    const address = args[2];
    const psk = args[3];
    if (!name || !address || !psk) {
      sendError("Usage: fledge algochat contacts add <name> <address> <psk>");
      process.exit(1);
    }
    await addContact(name, address, psk);
    sendOutput(`Added contact: ${name}`);
    return;
  }

  if (action === "remove") {
    const name = args[1];
    if (!name) {
      sendError("Usage: fledge algochat contacts remove <name>");
      process.exit(1);
    }
    const removed = await removeContact(name);
    if (removed) {
      sendOutput(`Removed contact: ${name}`);
    } else {
      sendError(`Contact not found: ${name}`);
    }
    return;
  }

  const contacts = await loadContacts();
  if (contacts.length === 0) {
    sendOutput("No contacts. Add one: fledge algochat contacts add <name> <address> <psk>");
    return;
  }

  sendOutput("Name         Address                    Key Fingerprint");
  for (const c of contacts) {
    const fingerprint = c.psk.substring(0, 8);
    const addrShort = c.address.length > 20 ? c.address.substring(0, 8) + "..." + c.address.slice(-4) : c.address;
    sendOutput(`${c.name.padEnd(13)}${addrShort.padEnd(27)}${fingerprint}`);
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
  const psk = contact?.psk;

  if (!psk) {
    sendError(`No PSK found for ${target}. Add a contact first: fledge algochat contacts add <name> <address> <psk>`);
    process.exit(1);
  }

  const key = deriveKeyFromPsk(fromHex(psk));
  const plaintext = new TextEncoder().encode(message);
  const encrypted = encrypt(key, plaintext);
  const noteB64 = toBase64(encrypted);

  const sendCmd = `goal clerk send -a 0 -f $(goal account list | head -1 | awk '{print $2}') -t ${address} --note "${noteB64}" 2>&1`;
  const result = await sendExec(sendCmd);

  if (result.exit_code !== 0) {
    sendError(`Transaction failed: ${result.stderr || result.stdout}`);
    process.exit(1);
  }

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

  if (result.exit_code !== 0) {
    sendError(`Failed to read transactions: ${result.stderr || result.stdout}`);
    sendOutput("Make sure localnet is running: fledge localnet start");
    process.exit(1);
  }

  if (!result.stdout.trim()) {
    sendOutput("No messages found.");
    return;
  }

  sendOutput("Recent messages:");
  sendOutput(result.stdout.trim());
}

function cmdHelp() {
  sendOutput("fledge-plugin-algochat — Encrypted on-chain messaging");
  sendOutput("");
  sendOutput("Commands:");
  sendOutput("  send <addr|name> <msg>            Send encrypted message");
  sendOutput("  read [--limit N] [--from <addr>]   Read messages");
  sendOutput("  contacts                           List contacts");
  sendOutput("  contacts add <name> <addr> <psk>   Add contact");
  sendOutput("  contacts remove <name>             Remove contact");
  sendOutput("  keygen                             Generate X25519 keypair");
}

main().catch((err) => {
  sendError(String(err));
  process.exit(1);
});
