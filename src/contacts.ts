import algosdk from "algosdk";
import { publicKeyToBase64, base64ToPublicKey } from "@corvidlabs/ts-algochat";
import { loadState, saveState, withState } from "./state.js";

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

export async function addContact(name: string, address: string, psk: string, pubkey?: string): Promise<{ overwrite: boolean }> {
  let overwrite = false;
  await withState(state => {
    const contact: Contact = { name, address, psk, ...(pubkey ? { pubkey } : {}) };
    const existing = state.contacts.findIndex(c => c.name === name);
    if (existing >= 0) {
      state.contacts[existing] = contact;
      overwrite = true;
    } else {
      state.contacts.push(contact);
    }
    return state;
  });
  return { overwrite };
}

export async function removeContact(name: string): Promise<boolean> {
  let removed = false;
  await withState(state => {
    const filtered = state.contacts.filter(c => c.name !== name);
    if (filtered.length === state.contacts.length) return state;
    state.contacts = filtered;
    removed = true;
    return state;
  });
  return removed;
}

export async function findContact(nameOrAddress: string): Promise<Contact | null> {
  const state = await loadState();
  return state.contacts.find(c => c.name === nameOrAddress || c.address === nameOrAddress) ?? null;
}

export async function saveKeypair(publicKey: Uint8Array, privateKey: Uint8Array): Promise<void> {
  await withState(state => {
    state.keypair = {
      publicKey: publicKeyToBase64(publicKey),
      privateKey: publicKeyToBase64(privateKey),
    };
    return state;
  });
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
  let result: AlgoAccount | null = null;
  await withState(state => {
    if (state.account) {
      try {
        const acct = algosdk.mnemonicToSecretKey(state.account.mnemonic);
        result = { address: acct.addr.toString(), sk: acct.sk };
        return state;
      } catch {}
    }
    const account = algosdk.generateAccount();
    state.account = {
      address: account.addr.toString(),
      mnemonic: algosdk.secretKeyToMnemonic(account.sk),
    };
    result = { address: account.addr.toString(), sk: account.sk };
    return state;
  });
  // result is set in every branch above
  return result!;
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
