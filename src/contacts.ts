import algosdk from "algosdk";
import { sendStore, sendLoad } from "./protocol.js";
import { publicKeyToBase64, base64ToPublicKey } from "@corvidlabs/ts-algochat";

export interface Contact {
  name: string;
  address: string;
  psk: string; // base64-encoded 32-byte PSK
  pubkey?: string; // base64-encoded X25519 public key
}

export interface AlgoAccount {
  address: string;
  sk: Uint8Array;
}

interface ContactStore {
  contacts: Contact[];
}

const CONTACTS_KEY = "contacts";
const KEYPAIR_KEY = "keypair";
const ACCOUNT_KEY = "algo-account";

export async function loadContacts(): Promise<Contact[]> {
  const raw = await sendLoad(CONTACTS_KEY);
  if (!raw) return [];
  try {
    const store: ContactStore = JSON.parse(raw);
    return store.contacts ?? [];
  } catch {
    return [];
  }
}

export async function saveContacts(contacts: Contact[]): Promise<void> {
  const store: ContactStore = { contacts };
  sendStore(CONTACTS_KEY, JSON.stringify(store));
}

export async function addContact(name: string, address: string, psk: string, pubkey?: string): Promise<void> {
  const contacts = await loadContacts();
  const existing = contacts.findIndex(c => c.name === name);
  const contact: Contact = { name, address, psk, ...(pubkey ? { pubkey } : {}) };
  if (existing >= 0) {
    contacts[existing] = contact;
  } else {
    contacts.push(contact);
  }
  await saveContacts(contacts);
}

export async function removeContact(name: string): Promise<boolean> {
  const contacts = await loadContacts();
  const filtered = contacts.filter(c => c.name !== name);
  if (filtered.length === contacts.length) return false;
  await saveContacts(filtered);
  return true;
}

export async function findContact(nameOrAddress: string): Promise<Contact | null> {
  const contacts = await loadContacts();
  return contacts.find(c => c.name === nameOrAddress || c.address === nameOrAddress) ?? null;
}

export async function saveKeypair(publicKey: Uint8Array, privateKey: Uint8Array): Promise<void> {
  sendStore(KEYPAIR_KEY, JSON.stringify({
    publicKey: publicKeyToBase64(publicKey),
    privateKey: publicKeyToBase64(privateKey),
  }));
}

export async function loadKeypair(): Promise<{ publicKey: Uint8Array; privateKey: Uint8Array } | null> {
  const raw = await sendLoad(KEYPAIR_KEY);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    return {
      publicKey: base64ToPublicKey(data.publicKey),
      privateKey: base64ToPublicKey(data.privateKey),
    };
  } catch {
    return null;
  }
}

export async function getOrCreateAccount(): Promise<AlgoAccount> {
  const raw = await sendLoad(ACCOUNT_KEY);
  if (raw) {
    try {
      const data = JSON.parse(raw);
      const account = algosdk.mnemonicToSecretKey(data.mnemonic);
      return { address: account.addr.toString(), sk: account.sk };
    } catch {}
  }
  const account = algosdk.generateAccount();
  sendStore(ACCOUNT_KEY, JSON.stringify({
    address: account.addr.toString(),
    mnemonic: algosdk.secretKeyToMnemonic(account.sk),
  }));
  return { address: account.addr.toString(), sk: account.sk };
}

export async function loadAccount(): Promise<AlgoAccount | null> {
  const raw = await sendLoad(ACCOUNT_KEY);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    const account = algosdk.mnemonicToSecretKey(data.mnemonic);
    return { address: account.addr.toString(), sk: account.sk };
  } catch {
    return null;
  }
}
