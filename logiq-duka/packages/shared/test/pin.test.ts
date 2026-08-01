import { describe, expect, it } from "vitest";
import { hashPin, verifyPin } from "../src/auth/pin.js";

describe("PIN hashing", () => {
  it("round-trips a valid PIN", async () => {
    const stored = await hashPin("4821", 1_000); // low iterations for test speed
    expect(stored.startsWith("pbkdf2$1000$")).toBe(true);
    expect(await verifyPin("4821", stored)).toBe(true);
    expect(await verifyPin("4822", stored)).toBe(false);
  });

  it("rejects malformed PINs", async () => {
    await expect(hashPin("12")).rejects.toThrow(RangeError);
    await expect(hashPin("abcd")).rejects.toThrow(RangeError);
    await expect(hashPin("1234567")).rejects.toThrow(RangeError);
  });

  it("rejects malformed stored hashes without throwing", async () => {
    expect(await verifyPin("1234", "garbage")).toBe(false);
    expect(await verifyPin("1234", "pbkdf2$x$y$z")).toBe(false);
  });

  it("produces unique salts", async () => {
    const a = await hashPin("5555", 1_000);
    const b = await hashPin("5555", 1_000);
    expect(a).not.toBe(b);
    expect(await verifyPin("5555", a)).toBe(true);
    expect(await verifyPin("5555", b)).toBe(true);
  });
});
