/**
 * @file signing.ts
 * @brief Signing a program for a device that accepts only signed ones (COM-026): Ed25519 over the whole artifact.
 *
 * The device holds the public key (SIGNING_KEY_SET, over the serial link) and verifies the signature that is sent
 * with the program before it activates it. The private key is a 32-byte seed that stays with its owner; this module
 * turns it into a signature with the Web Crypto API, which has Ed25519 in the runtimes Studio runs in.
 */

/** PKCS#8 of an Ed25519 private key: this prefix and the 32-byte seed (RFC 8410). */
const PKCS8_PREFIX = Uint8Array.from([0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20]);

async function privateKeyOf(seed: Uint8Array): Promise<CryptoKey> {
  if (seed.length !== 32) throw new RangeError('an Ed25519 seed is 32 bytes');
  const pkcs8 = new Uint8Array(PKCS8_PREFIX.length + seed.length);
  pkcs8.set(PKCS8_PREFIX, 0);
  pkcs8.set(seed, PKCS8_PREFIX.length);
  return globalThis.crypto.subtle.importKey('pkcs8', pkcs8, { name: 'Ed25519' }, true, ['sign']);
}

/** The signature of an artifact (64 bytes). */
export async function signProgram(seed: Uint8Array, artifact: Uint8Array): Promise<Uint8Array> {
  const key = await privateKeyOf(seed);
  return new Uint8Array(await globalThis.crypto.subtle.sign({ name: 'Ed25519' }, key, artifact as BufferSource));
}

/** The public key of a seed (32 bytes): what the device is given. */
export async function publicKeyOf(seed: Uint8Array): Promise<Uint8Array> {
  const key = await privateKeyOf(seed);
  const jwk = await globalThis.crypto.subtle.exportKey('jwk', key);
  if (typeof jwk.x !== 'string') throw new Error('The runtime did not export the public part of the key');
  const base64 = jwk.x.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

/** The signer a FramedSerialAdapter takes: the seed stays in the closure and is never sent anywhere. */
export function programSignerOf(seed: Uint8Array): (artifact: Uint8Array) => Promise<Uint8Array> {
  const copy = Uint8Array.from(seed);
  return (artifact) => signProgram(copy, artifact);
}
