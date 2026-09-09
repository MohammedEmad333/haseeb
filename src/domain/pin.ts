/**
 * Passcode handling for local sign-in.
 *
 * What this protects against, precisely: someone picking up an unlocked
 * device and opening a screen that is not theirs — the cashier reading the
 * profit report, or ringing up a sale under the manager's name. That is the
 * real threat in a shop.
 *
 * What it does not protect against: an attacker who has both the device and
 * its key store. A four-digit passcode has ten thousand possibilities, and no
 * amount of hashing makes that a secret against an offline attacker. The
 * database's own encryption is what stands in that person's way; this is the
 * lock on the till drawer, not the lock on the shop.
 *
 * So: PBKDF2 to make each guess cost something, a per-user salt so one
 * cracked passcode says nothing about the next, and a lockout so guessing at
 * the keypad stops being viable.
 */

import { NOUNS, counted } from '@/lib/format';

const PBKDF2_ROUNDS = 120_000;
const KEY_BITS = 256;
const SALT_BYTES = 16;

export const MIN_PIN_LENGTH = 4;
export const MAX_PIN_LENGTH = 12;

/** Failed attempts before the account is locked. */
export const MAX_ATTEMPTS = 5;
/** How long a locked account stays locked. */
export const LOCKOUT_MS = 5 * 60 * 1000;

export interface PinValidationError {
  message: string;
}

/** Reject the passcodes that make the lock decorative. */
export function validatePin(pin: string): PinValidationError | null {
  if (pin.length < MIN_PIN_LENGTH) {
    return { message: `الرمز لا يقل عن ${counted(MIN_PIN_LENGTH, NOUNS.digit)}.` };
  }
  if (pin.length > MAX_PIN_LENGTH) {
    return { message: `الرمز لا يزيد عن ${counted(MAX_PIN_LENGTH, NOUNS.digit)}.` };
  }
  if (/^(.)\1*$/.test(pin)) {
    return { message: 'لا تستخدم رمزاً من رقم واحد مكرر.' };
  }
  if (isSequential(pin)) {
    return { message: 'لا تستخدم أرقاماً متتابعة.' };
  }
  return null;
}

function isSequential(pin: string): boolean {
  if (!/^\d+$/.test(pin)) return false;
  let ascending = true;
  let descending = true;
  for (let i = 1; i < pin.length; i += 1) {
    const step = pin.charCodeAt(i) - pin.charCodeAt(i - 1);
    if (step !== 1) ascending = false;
    if (step !== -1) descending = false;
  }
  return ascending || descending;
}

export interface PinHash {
  hash: string;
  salt: string;
}

function subtle(): SubtleCrypto {
  const c = globalThis.crypto;
  if (!c?.subtle) throw new Error('WebCrypto is unavailable; passcodes cannot be hashed');
  return c.subtle;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

async function derive(pin: string, salt: Uint8Array): Promise<string> {
  const material = await subtle().importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await subtle().deriveBits(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations: PBKDF2_ROUNDS, hash: 'SHA-256' },
    material,
    KEY_BITS,
  );
  return toHex(new Uint8Array(bits));
}

export async function hashPin(pin: string): Promise<PinHash> {
  const salt = new Uint8Array(SALT_BYTES);
  globalThis.crypto.getRandomValues(salt);
  return { hash: await derive(pin, salt), salt: toHex(salt) };
}

export async function verifyPin(pin: string, stored: PinHash): Promise<boolean> {
  if (!stored.hash || !stored.salt) return false;
  const candidate = await derive(pin, fromHex(stored.salt));
  return timingSafeEqual(candidate, stored.hash);
}

/**
 * Compare in constant time. The margin this buys over a network is small and
 * over a local keypad smaller still, but a comparison that leaks its answer
 * through timing is a bad habit to leave in an auth path.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface LockoutState {
  failedAttempts: number;
  lockedUntil: number | null;
}

export function isLockedOut(state: LockoutState, now = Date.now()): boolean {
  return state.lockedUntil !== null && state.lockedUntil > now;
}

export function remainingLockoutMs(state: LockoutState, now = Date.now()): number {
  if (!isLockedOut(state, now)) return 0;
  return state.lockedUntil! - now;
}

/** The next lockout state after a failed attempt. */
export function afterFailure(state: LockoutState, now = Date.now()): LockoutState {
  const failedAttempts = state.failedAttempts + 1;
  return {
    failedAttempts,
    lockedUntil: failedAttempts >= MAX_ATTEMPTS ? now + LOCKOUT_MS : null,
  };
}

export const CLEARED_LOCKOUT: LockoutState = { failedAttempts: 0, lockedUntil: null };

/**
 * A recovery code, shown once when the owner account is created.
 *
 * There is no server and no reset e-mail: if the owner forgets the passcode
 * and has no code, the books are unreachable. So the code is generated up
 * front and the owner is told, plainly, to write it down.
 */
export function generateRecoveryCode(): string {
  // Crockford-style alphabet: no 0/O or 1/I to mis-transcribe.
  const alphabet = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]);
  return [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join('')).join('-');
}

export function normaliseRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^0-9A-Z]/g, '');
}
