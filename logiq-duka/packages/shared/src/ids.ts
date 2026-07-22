/**
 * UUIDv7 — time-ordered UUIDs (48-bit unix ms + random), per PRD conventions.
 * Pure implementation: works in Node, Deno, React Native (with crypto.getRandomValues).
 */
import { cryptoApi } from "./platform.js";
export function uuidv7(now: number = Date.now(), rng: (n: number) => Uint8Array = randomBytes): string {
  const bytes = new Uint8Array(16);
  // 48-bit big-endian timestamp
  bytes[0] = (now / 2 ** 40) & 0xff;
  bytes[1] = (now / 2 ** 32) & 0xff;
  bytes[2] = (now / 2 ** 24) & 0xff;
  bytes[3] = (now / 2 ** 16) & 0xff;
  bytes[4] = (now / 2 ** 8) & 0xff;
  bytes[5] = now & 0xff;
  const rand = rng(10);
  bytes.set(rand, 6);
  bytes[6] = (bytes[6]! & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variant 10
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  cryptoApi.getRandomValues(out);
  return out;
}

/** Millisecond timestamp encoded in a UUIDv7 (for ordering/debugging). */
export function uuidv7Time(id: string): number {
  const hex = id.replace(/-/g, "").slice(0, 12);
  return parseInt(hex, 16);
}
