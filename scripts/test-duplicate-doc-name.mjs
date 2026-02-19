#!/usr/bin/env node
/**
 * Regression: two docs same name (e.g. two HO3) must result in docId NOT filled and note added.
 * Loads pack-two-ho3-same-name.json and simulates the dismantler docId resolution.
 * Run: node scripts/test-duplicate-doc-name.mjs
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packPath = join(__dirname, "..", "tests", "fixtures", "darwin", "pack-two-ho3-same-name.json");
const pack = JSON.parse(readFileSync(packPath, "utf8"));

const nameToIds = new Map();
for (const d of pack.documents) {
  if (!d.docName) continue;
  const list = nameToIds.get(d.docName) ?? [];
  list.push(d.docId);
  nameToIds.set(d.docName, list);
}

const duplicateNames = new Set();
const evidence = [{ docName: "HO3 Policy.pdf", docId: null }];
for (const e of evidence) {
  if (e.docId || !e.docName) continue;
  const ids = nameToIds.get(e.docName);
  if (ids?.length === 1) e.docId = ids[0];
  else if (ids && ids.length > 1) duplicateNames.add(e.docName);
}

const docIdNotFilled = evidence[0].docId == null;
const noteWouldBeAdded = duplicateNames.has("HO3 Policy.pdf");

if (!docIdNotFilled) {
  console.error("FAIL: docId must not be filled when two docs share the same name");
  process.exit(1);
}
if (!noteWouldBeAdded) {
  console.error("FAIL: duplicateNames must contain the doc name so note is added");
  process.exit(1);
}
console.log("OK: two HO3 same name — docId not filled, note would be added");
process.exit(0);
