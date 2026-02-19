/**
 * Privacy-safe telemetry for Darwin (edge). No PII; log only aggregates.
 * Guardrail counters are early-warning signals.
 */

export function logDismantlerTelemetry(metrics: {
  objectionsWithEvidencePct: number;
  avgEvidencePerObjection: number;
  topMissingDocRequestKeys: string[];
  parseSuccess: boolean;
  confidence: number;
  objectionCount: number;
  decisionCardCount: number;
  policyGuardrailTriggeredCount: number;
  noEvidenceObjectionCount: number;
  duplicateDocNameCount: number;
  inferenceChipCount: number;
}): void {
  try {
    console.log("[Darwin telemetry] dismantler", JSON.stringify({
      objectionsWithEvidencePct: Math.round(metrics.objectionsWithEvidencePct * 100),
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
    }));
  } catch (_) {
    // no-op
  }
}
