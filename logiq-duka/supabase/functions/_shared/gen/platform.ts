// GENERATED from packages/shared/src — DO NOT EDIT. Run `pnpm sync:functions`.
/**
 * Typed access to platform globals (WebCrypto, base64, TextEncoder)
 * without depending on DOM or Node type libs — this package compiles
 * under React Native, Deno, and Node tsconfigs alike. Runtime objects
 * are the standard globals; only the types are structural.
 */

interface SubtleLike {
  importKey(
    format: string, keyData: Uint8Array, algorithm: string,
    extractable: boolean, keyUsages: string[],
  ): Promise<unknown>;
  deriveBits(
    algorithm: { name: string; hash: string; salt: unknown; iterations: number },
    baseKey: unknown, length: number,
  ): Promise<ArrayBuffer>;
}

interface CryptoLike {
  getRandomValues(array: Uint8Array): Uint8Array;
  subtle: SubtleLike;
}

interface GlobalsLike {
  crypto: CryptoLike;
  TextEncoder: new () => { encode(input: string): Uint8Array };
  btoa(data: string): string;
  atob(data: string): string;
}

const g = globalThis as unknown as GlobalsLike;

export const cryptoApi: CryptoLike = g.crypto;

export function encodeUtf8(s: string): Uint8Array {
  return new g.TextEncoder().encode(s);
}

export function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return g.btoa(bin);
}

export function fromBase64(s: string): Uint8Array {
  const bin = g.atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
