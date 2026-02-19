#!/usr/bin/env node
/**
 * Validates Darwin golden fixtures (ClaimFactsPack and DismantlerResult shapes).
 * Run: node scripts/validate-darwin-fixtures.mjs
 */

import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "..", "tests", "fixtures", "darwin");

function required(obj, key, type) {
  if (obj[key] === undefined) throw new Error(`Missing required: ${key}`);
  if (type === "array" && !Array.isArray(obj[key])) throw new Error(`${key} must be array`);
  if (type === "object" && (typeof obj[key] !== "object" || Array.isArray(obj[key])))
    throw new Error(`${key} must be object`);
  if (type === "number" && typeof obj[key] !== "number") throw new Error(`${key} must be number`);
  if (type === "string" && typeof obj[key] !== "string") throw new Error(`${key} must be string`);
}

function validateClaimFactsPack(pack) {
  required(pack, "meta", "object");
  required(pack.meta, "claimId", "string");
  required(pack.meta, "createdAt", "string");
  required(pack, "documents", "array");
  required(pack, "evidenceGaps", "array");
  for (const d of pack.documents) {
    if (!d.docId || !d.docName || !d.folderKey) throw new Error("Document must have docId, docName, folderKey");
  }
  if (pack.evidenceIndexSummary) {
    if (typeof pack.evidenceIndexSummary.byFolderKey !== "object")
      throw new Error("evidenceIndexSummary.byFolderKey must be object");
  }
  if (pack.missingDocRequests) {
    if (!Array.isArray(pack.missingDocRequests)) throw new Error("missingDocRequests must be array");
    for (const r of pack.missingDocRequests) {
      if (!r.key || !r.title || !r.whyNeeded || !r.priority) throw new Error("MissingDocRequest must have key, title, whyNeeded, priority");
    }
  }
}

function validateDismantlerResult(result) {
  required(result, "confidence", "number");
  required(result, "missingDocs", "array");
  required(result, "objections", "array");
  required(result, "requestedResolutionOverall", "string");
  required(result, "notesForUser", "array");
  for (const o of result.objections) {
    if (!o.verbatim || !o.type || !Array.isArray(o.evidence)) throw new Error("Objection must have verbatim, type, evidence");
  }
  if (result.decisionCards) {
    if (!Array.isArray(result.decisionCards)) throw new Error("decisionCards must be array");
    for (const c of result.decisionCards) {
      if (!c.key || !c.decision || !Array.isArray(c.requiredFacts) || !Array.isArray(c.requiredDocs) || !c.ifTrue || !c.ifFalse)
        throw new Error("DecisionCard must have key, decision, requiredFacts, requiredDocs, ifTrue, ifFalse");
    }
  }
}

const files = readdirSync(FIXTURES_DIR).filter((f) => f.endsWith(".json"));
let failed = 0;
for (const file of files) {
  const path = join(FIXTURES_DIR, file);
  try {
    const raw = readFileSync(path, "utf8");
    const data = JSON.parse(raw);
    if (data.meta?.claimId && Array.isArray(data.documents)) {
      validateClaimFactsPack(data);
      console.log(`OK pack: ${file}`);
    } else if (typeof data.confidence === "number" && Array.isArray(data.objections)) {
      validateDismantlerResult(data);
      console.log(`OK dismantler: ${file}`);
    } else {
      console.log(`SKIP ${file}: unknown shape`);
    }
  } catch (e) {
    console.error(`FAIL ${file}:`, e.message);
    failed++;
  }
}
process.exit(failed > 0 ? 1 : 0);
