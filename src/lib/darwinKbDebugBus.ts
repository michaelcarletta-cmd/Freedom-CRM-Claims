export type DarwinKbSource = {
  docId: string;
  docTitle: string;
  chunkId: string;
  score: number;
};

export type DarwinKbRetrievalHealth = {
  processedDocs: number;
  docsMatchingFilters: number;
  chunksAvailable: number;
  chunksMatchingDocFilters: number;
  docsWithZeroChunks: number;
  poolCapped: boolean;
  diagnosticHint?: string;
};

export type DarwinKbRetrievalDebug = {
  pool: number;
  topK: number;
  perDocCap: number;
  health?: DarwinKbRetrievalHealth;
  queryExpansion?: {
    totalQueries: number;
    queries: string[];
  };
};

export type DarwinKbDebugEventDetail = {
  claimId: string;
  analysisType: string;
  usedKb: boolean;
  retrieval?: DarwinKbRetrievalDebug | null;
  sources: DarwinKbSource[];
  diagnosticHint?: string | null;
  error?: string | null;
  timestamp: string;
};

const EVENT_NAME = "darwin:kbDebug";

export function publishDarwinKbDebug(detail: DarwinKbDebugEventDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<DarwinKbDebugEventDetail>(EVENT_NAME, { detail }));
}

export function subscribeDarwinKbDebug(
  handler: (detail: DarwinKbDebugEventDetail) => void,
) {
  if (typeof window === "undefined") return () => {};
  const listener = (event: Event) => {
    const customEvent = event as CustomEvent<DarwinKbDebugEventDetail>;
    if (customEvent?.detail) handler(customEvent.detail);
  };
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}
