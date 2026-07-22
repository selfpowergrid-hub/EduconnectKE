// LAW (CLAUDE.md): no English string without its Swahili pair.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "../src/i18n");
const en = JSON.parse(readFileSync(join(dir, "en.json"), "utf8"));
const sw = JSON.parse(readFileSync(join(dir, "sw.json"), "utf8"));

test("en and sw have identical key sets", () => {
  const enKeys = Object.keys(en).sort();
  const swKeys = Object.keys(sw).sort();
  assert.deepEqual(swKeys, enKeys);
});

test("no empty translations", () => {
  for (const [k, v] of [...Object.entries(en), ...Object.entries(sw)]) {
    assert.ok(typeof v === "string" && v.trim().length > 0, `empty translation: ${k}`);
  }
});

test("placeholders match between languages", () => {
  const params = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const k of Object.keys(en)) {
    assert.deepEqual(params(sw[k] ?? ""), params(en[k]), `placeholder mismatch in ${k}`);
  }
});
