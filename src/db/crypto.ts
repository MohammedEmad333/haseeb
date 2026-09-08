/**
 * Encryption at rest for the local database file.
 *
 * The whole SQLite image is sealed with AES-256-GCM before it is written to
 * storage, and opened only in memory. The key is either
 *
 *   • derived from a passphrase the owner sets (PBKDF2-SHA256, 210k rounds),
 *     in which case nothing on the device can open the file without it; or
 *   • a random device key held in the platform key store.
 *
 * The device-key mode protects the file at rest — a copied database file,
 * a stolen backup, another app reading shared storage — but not an attacker
 * who already controls the running device. That trade-off is spelled out in
 * the README so nobody mistakes it for something stronger.
 */

const PBKDF2_ROUNDS = 210_000;
const KEY_BITS = 256;
const IV_BYTES = 12;
const SALT_BYTES = 16;
/** File magic + version, so a future format change is detectable. */
const MAGIC = new Uint8Array([0x48, 0x53, 0x42, 0x01]); // "HSB\x01"

function subtle(): SubtleCrypto {
  const c = globalThis.crypto;
  if (!c?.subtle) {
    throw new Error('WebCrypto is unavailable; the local database cannot be encrypted');
  }
  return c.subtle;
}

export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

/** Derive a key from an owner-supplied passphrase. */
export async function deriveKeyFromPassphrase(
  passphrase: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const material = await subtle().importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return subtle().deriveKey(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations: PBKDF2_ROUNDS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: KEY_BITS },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Import a raw 32-byte device key. */
export async function importRawKey(raw: Uint8Array): Promise<CryptoKey> {
  return subtle().importKey('raw', raw as unknown as BufferSource, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
}

export function generateRawKey(): Uint8Array {
  return randomBytes(KEY_BITS / 8);
}

export function generateSalt(): Uint8Array {
  return randomBytes(SALT_BYTES);
}

/** Seal database bytes: MAGIC ‖ IV ‖ ciphertext. */
export async function seal(key: CryptoKey, plaintext: Uint8Array): Promise<Uint8Array> {
  const iv = randomBytes(IV_BYTES);
  const cipher = new Uint8Array(
    await subtle().encrypt({ name: 'AES-GCM', iv: iv as unknown as BufferSource }, key, plaintext as unknown as BufferSource),
  );
  const out = new Uint8Array(MAGIC.length + iv.length + cipher.length);
  out.set(MAGIC, 0);
  out.set(iv, MAGIC.length);
  out.set(cipher, MAGIC.length + iv.length);
  return out;
}

/** Open a sealed image. Throws if the key is wrong or the file was tampered with. */
export async function open(key: CryptoKey, sealed: Uint8Array): Promise<Uint8Array> {
  if (sealed.length < MAGIC.length + IV_BYTES) {
    throw new Error('database file is truncated');
  }
  for (let i = 0; i < MAGIC.length; i += 1) {
    if (sealed[i] !== MAGIC[i]) throw new Error('not a حسيب database file');
  }
  const iv = sealed.subarray(MAGIC.length, MAGIC.length + IV_BYTES);
  const cipher = sealed.subarray(MAGIC.length + IV_BYTES);
  try {
    return new Uint8Array(
      await subtle().decrypt({ name: 'AES-GCM', iv: iv as unknown as BufferSource }, key, cipher as unknown as BufferSource),
    );
  } catch {
    // GCM authentication failure — a wrong key or a modified file, and we
    // deliberately do not distinguish the two.
    throw new Error('could not open the local database — wrong key or corrupted file');
  }
}
