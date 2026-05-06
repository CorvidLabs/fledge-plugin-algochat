import { sendStore, sendLoad } from "./protocol.js";
import { toHex, fromHex } from "./crypto.js";

export interface Contact {
  name: string;
  address: string;
  psk: string;
}

export interface ContactStore {
  contacts: Contact[];
}

const CONTACTS_KEY = "contacts";
const KEYPAIR_KEY = "keypair";

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
  await sendStore(CONTACTS_KEY, JSON.stringify(store));
}

export async function addContact(name: string, address: string, psk: string): Promise<void> {
  const contacts = await loadContacts();
  const existing = contacts.findIndex(c => c.name === name);
  if (existing >= 0) {
    contacts[existing] = { name, address, psk };
  } else {
    contacts.push({ name, address, psk });
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
  await sendStore(KEYPAIR_KEY, JSON.stringify({ publicKey: toHex(publicKey), privateKey: toHex(privateKey) }));
}

export async function loadKeypair(): Promise<{ publicKey: Uint8Array; privateKey: Uint8Array } | null> {
  const raw = await sendLoad(KEYPAIR_KEY);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    return { publicKey: fromHex(data.publicKey), privateKey: fromHex(data.privateKey) };
  } catch {
    return null;
  }
}
