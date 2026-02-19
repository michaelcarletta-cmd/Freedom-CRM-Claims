#!/usr/bin/env node
/**
 * Fail if CONTRACT_VERSION in supabase/functions/_shared/darwin-contracts.ts
 * does not match CONTRACT_VERSION in src/lib/darwinContracts.ts.
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const re = /CONTRACT_VERSION\s*=\s*["']([^"']+)["']/;

const sharedPath = join(root, "supabase/functions/_shared/darwin-contracts.ts");
const appPath = join(root, "src/lib/darwinContracts.ts");

const sharedContent = readFileSync(sharedPath, "utf8");
const appContent = readFileSync(appPath, "utf8");

const sharedMatch = sharedContent.match(re);
const appMatch = appContent.match(re);

if (!sharedMatch || !appMatch) {
  console.error("check-darwin-contract-version: CONTRACT_VERSION not found in one or both files.");
  process.exit(1);
}
if (sharedMatch[1] !== appMatch[1]) {
  console.error(
    `check-darwin-contract-version: CONTRACT_VERSION mismatch. _shared="${sharedMatch[1]}" app="${appMatch[1]}"`
  );
  process.exit(1);
}
console.log(`CONTRACT_VERSION OK: ${sharedMatch[1]}`);
