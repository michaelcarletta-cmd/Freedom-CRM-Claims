/**
 * Privacy-safe telemetry for Darwin dismantler and evidence index.
 * No PII; aggregates only counts and distributions for improvement tracking.
 */

import type { DismantlerResult, ClaimFactsPack } from "./darwinContracts";

export interface DarwinDismantlerTelemetry {
  /** Fraction of objections that have at least one evidence chip (0–1). */
  objectionsWithEvidencePct: number;
  /** Average evidence chips per objection. */
  avgEvidencePerObjection: number;
  /** Top missingDocRequest keys (e.g. ["policy_declarations", "denial_letter"]). */
  topMissingDocRequestKeys: string[];
  /** Whether the result was parsed successfully (structured result). */
  parseSuccess: boolean;
  /** Confidence value (0 | 0.25 | 0.5 | 0.75 | 1). */
  confidence: number;
  /** Count of objections. */
  objectionCount: number;
  /** Count of decision cards. */
  decisionCardCount: number;
  /** Times no-policy-language guardrail fired (objection needed policy cite but had none). */
  policyGuardrailTriggeredCount: number;
  /** Objections with zero evidence chips. */
  noEvidenceObjectionCount: number;
  /** Doc names that had multiple docs (docId not resolved). */
  duplicateDocNameCount: number;
  /** Evidence chips with evidenceMethod === "inference". */
  inferenceChipCount: number;
}

export interface DarwinEvidenceIndexTelemetry {
  /** Document count by folder key (no names). */
  docCountByFolder: Record<string, number>;
  /** Total pages known. */
  totalPagesKnown: number;
  /** Number of missing doc requests. */
  missingDocRequestCount: number;
  /** Has policy section. */
  hasPolicy: boolean;
  /** Has estimate section. */
  hasEstimate: boolean;
}

/**
 * Compute privacy-safe telemetry from a DismantlerResult.
 * Call after parse/normalize; log or send the return value (no PII).
 */
export function computeDismantlerTelemetry(
  result: DismantlerResult | null,
  parseSuccess: boolean
): DarwinDismantlerTelemetry {
  if (!result || !Array.isArray(result.objections)) {
    return {
      objectionsWithEvidencePct: 0,
      avgEvidencePerObjection: 0,
      topMissingDocRequestKeys: [],
      parseSuccess,
      confidence: result?.confidence ?? 0,
      objectionCount: 0,
      decisionCardCount: 0,
      policyGuardrailTriggeredCount: 0,
      noEvidenceObjectionCount: 0,
      duplicateDocNameCount: 0,
      inferenceChipCount: 0,
    };
  }
  const objections = result.objections;
  const withEvidence = objections.filter((o) => o.evidence?.length > 0).length;
  const totalChips = objections.reduce((sum, o) => sum + (o.evidence?.length ?? 0), 0);
  const keys = (result.missingDocRequests ?? []).map((r) => r.key).filter(Boolean);
  const keyCounts: Record<string, number> = {};
  for (const k of keys) {
    keyCounts[k] = (keyCounts[k] ?? 0) + 1;
  }
  const topMissingDocRequestKeys = Object.entries(keyCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([k]) => k);
  const noEvidenceObjectionCount = objections.filter((o) => (o.evidence?.length ?? 0) === 0).length;
  const inferenceChipCount = objections.reduce(
    (s, o) => s + (o.evidence ?? []).filter((e) => e.evidenceMethod === "inference").length,
    0
  );

  return {
    objectionsWithEvidencePct: objections.length ? withEvidence / objections.length : 0,
    avgEvidencePerObjection: objections.length ? totalChips / objections.length : 0,
    topMissingDocRequestKeys,
    parseSuccess,
    confidence: result.confidence ?? 0,
    objectionCount: objections.length,
    decisionCardCount: (result.decisionCards ?? []).length,
    policyGuardrailTriggeredCount: 0,
    noEvidenceObjectionCount,
    duplicateDocNameCount: 0,
    inferenceChipCount,
  };
}

/**
 * Compute privacy-safe telemetry from a ClaimFactsPack (evidence index output).
 */
export function computeEvidenceIndexTelemetry(pack: ClaimFactsPack | null): DarwinEvidenceIndexTelemetry | null {
  if (!pack) return null;
  const byFolder = pack.evidenceIndexSummary?.byFolderKey ?? {};
  const docCountByFolder: Record<string, number> = {};
  for (const [k, v] of Object.entries(byFolder)) {
    if (typeof v === "number") docCountByFolder[k] = v;
  }
  return {
    docCountByFolder,
    totalPagesKnown: pack.evidenceIndexSummary?.totalPagesKnown ?? 0,
    missingDocRequestCount: (pack.missingDocRequests ?? []).length,
    hasPolicy: !!pack.policy,
    hasEstimate: !!pack.estimate,
  };
}

/**
 * Log telemetry to console (or replace with your analytics backend).
 * Safe to call in production; no PII.
 */
export function logDismantlerTelemetry(metrics: DarwinDismantlerTelemetry): void {
  if (typeof console?.log !== "function") return;
  console.log("[Darwin telemetry] dismantler", {
    objectionsWithEvidencePct: Math.round(metrics.objectionsWithEvidencePct * 100) + "%",
    avgEvidencePerObjection: Math.round(metrics.avgEvidencePerObjection * 10) / 10,
    topMissingDocRequestKeys: metrics.topMissingDocRequestKeys.slice(0, 5),
    parseSuccess: metrics.parseSuccess,
    confidence: metrics.confidence,
    objectionCount: metrics.objectionCount,
    decisionCardCount: metrics.decisionCardCount,
    policyGuardrailTriggeredCount: metrics.policyGuardrailTriggeredCount,
    noEvidenceObjectionCount: metrics.noEvidenceObjectionCount,
    duplicateDocNameCount: metrics.duplicateDocNameCount,
    inferenceChipCount: metrics.inferenceChipCount,
  });
}
