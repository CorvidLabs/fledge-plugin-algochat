import algosdk from "algosdk";
import { publicKeyToBase64, base64ToPublicKey } from "@corvidlabs/ts-algochat";
import { loadState, saveState } from "./state.js";

export interface Contact {
  name: string;
  address: string;
  psk: string;
  pubkey?: string;
}

export interface AlgoAccount {
  address: string;
  sk: Uint8Array;
}

export async function loadContacts(): Promise<Contact[]> {
  const state = await loadState();
  return state.contacts;
}

export async function addContact(name: string, address: string, psk: string, pubkey?: string): Promise<void> {
  const state = await loadState();
  const contact: Contact = { name, address, psk, ...(pubkey ? { pubkey } : {}) };
  const existing = state.contacts.findIndex(c => c.name === name);
  if (existing >= 0) {
    state.contacts[existing] = contact;
  } else {
    state.contacts.push(contact);
  }
  await saveState(state);
}

export async function removeContact(name: string): Promise<boolean> {
  const state = await loadState();
  const filtered = state.contacts.filter(c => c.name !== name);
  if (filtered.length === state.contacts.length) return false;
  state.contacts = filtered;
  await saveState(state);
  return true;
}

export async function findContact(nameOrAddress: string): Promise<Contact | null> {
  const state = await loadState();
  return state.contacts.find(c => c.name === nameOrAddress || c.address === nameOrAddress) ?? null;
}

export async function saveKeypair(publicKey: Uint8Array, privateKey: Uint8Array): Promise<void> {
  const state = await loadState();
  state.keypair = {
    publicKey: publicKeyToBase64(publicKey),
    privateKey: publicKeyToBase64(privateKey),
  };
  await saveState(state);
}

export async function loadKeypair(): Promise<{ publicKey: Uint8Array; privateKey: Uint8Array } | null> {
  const state = await loadState();
  if (!state.keypair) return null;
  try {
    return {
      publicKey: base64ToPublicKey(state.keypair.publicKey),
      privateKey: base64ToPublicKey(state.keypair.privateKey),
    };
  } catch {
    return null;
  }
}

export async function getOrCreateAccount(): Promise<AlgoAccount> {
  const state = await loadState();
  if (state.account) {
    try {
      const account = algosdk.mnemonicToSecretKey(state.account.mnemonic);
      return { address: account.addr.toString(), sk: account.sk };
    } catch {}
  }
  const account = algosdk.generateAccount();
  state.account = {
    address: account.addr.toString(),
    mnemonic: algosdk.secretKeyToMnemonic(account.sk),
  };
  await saveState(state);
  return { address: account.addr.toString(), sk: account.sk };
}

export async function loadAccount(): Promise<AlgoAccount | null> {
  const state = await loadState();
  if (!state.account) return null;
  try {
    const account = algosdk.mnemonicToSecretKey(state.account.mnemonic);
    return { address: account.addr.toString(), sk: account.sk };
  } catch {
    return null;
  }
}
