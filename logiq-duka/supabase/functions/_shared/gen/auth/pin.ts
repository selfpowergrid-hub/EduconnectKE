// GENERATED from packages/shared/src — DO NOT EDIT. Run `pnpm sync:functions`.
/**
 * Staff PIN hashing — PBKDF2-SHA256 via WebCrypto so the same code runs in
 * React Native (polyfilled), Deno Edge Functions, and Node tests.
 * Verification is local-first: attendants must log in offline (PRD §7.5, §11.2).
 * Format: pbkdf2$<iterations>$<salt_b64>$<hash_b64>
 */
import { cryptoApi, encodeUtf8, fromBase64, toBase64 } from "../platform.ts";

const ITERATIONS = 100_000;
const KEY_BYTES = 32;

export async function hashPin(pin: string, iterations: number = ITERATIONS): Promise<string> {
  validatePin(pin);
  const salt = new Uint8Array(16);
  cryptoApi.getRandomValues(salt);
  const hash = await derive(pin, salt, iterations);
  return `pbkdf2$${iterations}$${toBase64(salt)}$${toBase64(hash)}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  if (!Number.isSafeInteger(iterations) || iterations < 1) return false;
  let salt: Uint8Array, expected: Uint8Array;
  try {
    salt = fromBase64(parts[2]!);
    expected = fromBase64(parts[3]!);
  } catch {
    return false;
  }
  const actual = await derive(pin, salt, iterations);
  return timingSafeEqual(actual, expected);
}

export function validatePin(pin: string): void {
  if (!/^\d{4,6}$/.test(pin)) {
    throw new RangeError("PIN must be 4-6 digits");
  }
}

async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const material = await cryptoApi.subtle.importKey("raw", encodeUtf8(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await cryptoApi.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    material,
    KEY_BYTES * 8,
  );
  return new Uint8Array(bits);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}
