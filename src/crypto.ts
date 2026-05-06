import { x25519 } from "@noble/curves/ed25519";
import { xchacha20poly1305 } from "@noble/ciphers/chacha";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";
import { randomBytes } from "@noble/ciphers/webcrypto";

export interface Keypair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export function generateKeypair(): Keypair {
  const privateKey = randomBytes(32);
  const publicKey = x25519.getPublicKey(privateKey);
  return { publicKey, privateKey };
}

export function deriveSharedKey(privateKey: Uint8Array, peerPublicKey: Uint8Array): Uint8Array {
  const sharedSecret = x25519.getSharedSecret(privateKey, peerPublicKey);
  return hkdf(sha256, sharedSecret, undefined, "algochat-v1", 32);
}

export function deriveKeyFromPsk(psk: Uint8Array): Uint8Array {
  return hkdf(sha256, psk, undefined, "algochat-psk-v1", 32);
}

export function encrypt(key: Uint8Array, plaintext: Uint8Array): Uint8Array {
  const nonce = randomBytes(24);
  const cipher = xchacha20poly1305(key, nonce);
  const ciphertext = cipher.encrypt(plaintext);
  const result = new Uint8Array(24 + ciphertext.length);
  result.set(nonce, 0);
  result.set(ciphertext, 24);
  return result;
}

export function decrypt(key: Uint8Array, data: Uint8Array): Uint8Array | null {
  if (data.length < 25) return null;
  const nonce = data.slice(0, 24);
  const ciphertext = data.slice(24);
  try {
    const cipher = xchacha20poly1305(key, nonce);
    return cipher.decrypt(ciphertext);
  } catch {
    return null;
  }
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

export function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

export function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

export function fromBase64(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, "base64"));
}
