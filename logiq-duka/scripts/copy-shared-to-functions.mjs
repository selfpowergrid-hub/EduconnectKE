#!/usr/bin/env node
/**
 * Copies packages/shared/src → supabase/functions/_shared/gen so Edge
 * Functions can bundle the ONE reducer codebase (Deno cannot import
 * outside supabase/functions/). Rewrites TS-ESM import specifiers
 * (".js" → ".ts") and bare npm imports ("zod" → "npm:zod@…") for Deno.
 *
 *   node scripts/copy-shared-to-functions.mjs          # regenerate
 *   node scripts/copy-shared-to-functions.mjs --check  # CI drift check
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(root, "packages/shared/src");
const DEST = join(root, "supabase/functions/_shared/gen");
const CHECK = process.argv.includes("--check");

const HEADER = "// GENERATED from packages/shared/src — DO NOT EDIT. Run `pnpm sync:functions`.\n";
const NPM_PINS = { zod: "npm:zod@3.24.1" };

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (p.endsWith(".ts")) yield p;
  }
}

function transform(source) {
  let out = source.replace(/(from\s+["'])(\.{1,2}\/[^"']+)\.js(["'])/g, "$1$2.ts$3");
  for (const [pkg, pin] of Object.entries(NPM_PINS)) {
    out = out.replace(new RegExp(`(from\\s+["'])${pkg}(["'])`, "g"), `$1${pin}$2`);
  }
  return HEADER + out;
}

let drift = false;
const expected = new Map();
for (const file of walk(SRC)) {
  const rel = relative(SRC, file);
  expected.set(rel, transform(readFileSync(file, "utf8")));
}

if (CHECK) {
  for (const [rel, content] of expected) {
    const dest = join(DEST, rel);
    if (!existsSync(dest) || readFileSync(dest, "utf8") !== content) {
      console.error(`DRIFT: ${rel}`);
      drift = true;
    }
  }
  if (existsSync(DEST)) {
    for (const file of walk(DEST)) {
      const rel = relative(DEST, file);
      if (!expected.has(rel)) {
        console.error(`STALE: ${rel}`);
        drift = true;
      }
    }
  }
  if (drift) {
    console.error("supabase/functions/_shared/gen is out of date. Run: pnpm sync:functions");
    process.exit(1);
  }
  console.log("functions gen is up to date");
} else {
  rmSync(DEST, { recursive: true, force: true });
  for (const [rel, content] of expected) {
    const dest = join(DEST, rel);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, content);
  }
  console.log(`copied ${expected.size} files → supabase/functions/_shared/gen`);
}
