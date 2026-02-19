#!/usr/bin/env node
/**
 * Tests for mergeMissingDocRequests: dedupe by key, pack baseline, dismantler can add/upgrade not downgrade.
 * Run: node scripts/test-merge-missing-doc-requests.mjs
 */

const PRIORITY_ORDER = { high: 3, med: 2, low: 1 };
const PRIORITY_FROM_LEVEL = { 3: "high", 2: "med", 1: "low" };
function priorityLevel(p) {
  return PRIORITY_ORDER[p] ?? 0;
}
function priorityFromLevel(n) {
  return PRIORITY_FROM_LEVEL[Math.max(1, Math.min(3, Math.round(n)))] ?? "med";
}

function mergeMissingDocRequests(packRequests, dismantlerRequests) {
  const byKey = new Map();
  for (const r of packRequests ?? []) {
    if (r?.key) byKey.set(r.key, { ...r });
  }
  for (const r of dismantlerRequests ?? []) {
    if (!r?.key) continue;
    const existing = byKey.get(r.key);
    if (!existing) {
      byKey.set(r.key, { key: r.key, title: r.title ?? r.key, whyNeeded: r.whyNeeded ?? "", whereToFind: r.whereToFind, priority: r.priority ?? "med" });
      continue;
    }
    const plExisting = priorityLevel(existing.priority);
    const plNew = priorityLevel(r.priority ?? "med");
    const mergedLevel = Math.max(plExisting, plNew);
    existing.priority = priorityFromLevel(mergedLevel);
    const priorityUpgraded = plNew > plExisting;
    const packTitleEmpty = !existing.title?.trim();
    const packWhyEmpty = !existing.whyNeeded?.trim();
    const packWhereEmpty = existing.whereToFind == null || !String(existing.whereToFind).trim();
    if (r.title?.trim() && (priorityUpgraded || packTitleEmpty)) existing.title = r.title;
    if (r.whyNeeded?.trim() && (priorityUpgraded || packWhyEmpty)) existing.whyNeeded = r.whyNeeded;
    if (r.whereToFind != null && String(r.whereToFind).trim() && (priorityUpgraded || packWhereEmpty)) existing.whereToFind = r.whereToFind;
  }
  return Array.from(byKey.values());
}

let failed = 0;

// Pack baseline only
const onlyPack = mergeMissingDocRequests(
  [{ key: "decl", title: "Declarations", whyNeeded: "Coverage", priority: "high" }],
  undefined
);
if (onlyPack.length !== 1 || onlyPack[0].priority !== "high") {
  console.error("FAIL: pack only should return 1 request with high");
  failed++;
} else console.log("OK: pack only");

// Dismantler adds new key
const added = mergeMissingDocRequests(
  [{ key: "decl", title: "Declarations", whyNeeded: "Coverage", priority: "med" }],
  [{ key: "denial", title: "Denial letter", whyNeeded: "Context", priority: "high" }]
);
if (added.length !== 2 || added.find((r) => r.key === "denial")?.priority !== "high") {
  console.error("FAIL: dismantler add new key");
  failed++;
} else console.log("OK: dismantler add new key");

// Dismantler upgrades priority (med -> high)
const upgraded = mergeMissingDocRequests(
  [{ key: "decl", title: "Declarations", whyNeeded: "Coverage", priority: "med" }],
  [{ key: "decl", title: "Declarations", whyNeeded: "Confirm limit", priority: "high" }]
);
if (upgraded.length !== 1 || upgraded[0].priority !== "high" || upgraded[0].whyNeeded !== "Confirm limit") {
  console.error("FAIL: dismantler upgrade priority and whyNeeded", upgraded);
  failed++;
} else console.log("OK: dismantler upgrade");

// Dismantler must not downgrade (high -> med); pack text must not be overwritten when priority not upgraded
const noDowngrade = mergeMissingDocRequests(
  [{ key: "decl", title: "Declarations", whyNeeded: "Coverage", priority: "high" }],
  [{ key: "decl", title: "Declarations", whyNeeded: "Confirm limit", priority: "med" }]
);
if (noDowngrade.length !== 1 || noDowngrade[0].priority !== "high" || noDowngrade[0].whyNeeded !== "Coverage") {
  console.error("FAIL: must not downgrade priority and must keep pack whyNeeded", noDowngrade);
  failed++;
} else console.log("OK: no downgrade, pack text preserved");

// Dedupe by key
const dedupe = mergeMissingDocRequests(
  [{ key: "a", title: "A", whyNeeded: "X", priority: "med" }],
  [{ key: "a", title: "A (context)", whyNeeded: "Y", priority: "med" }]
);
if (dedupe.length !== 1) {
  console.error("FAIL: dedupe by key", dedupe);
  failed++;
} else console.log("OK: dedupe by key");

process.exit(failed > 0 ? 1 : 0);
