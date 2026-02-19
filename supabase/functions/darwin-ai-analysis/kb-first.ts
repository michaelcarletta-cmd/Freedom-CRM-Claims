export interface KnowledgeBasinSettings {
  pool: number;
  topK: number;
  perDocCap: number;
  softPoolPerDocCap?: number;
  strict: boolean;
  statuses: string[];
  categories?: string[];
  tags?: string[];
}

export interface KnowledgeChunkCandidate {
  chunkId: string;
  docId: string;
  docTitle: string;
  content: string;
  category?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface KnowledgeChunkMatch extends KnowledgeChunkCandidate {
  score: number;
}

export interface KnowledgeSource {
  docId: string;
  docTitle: string;
  chunkId: string;
  score: number;
}

export interface RetrievalDebug {
  pool: number;
  topK: number;
  perDocCap: number;
  health?: RetrievalHealthStats;
  queryExpansion?: {
    totalQueries: number;
    queries: string[];
  };
}

export interface RetrievalHealthStats {
  processedDocs: number;
  docsMatchingFilters: number;
  chunksAvailable: number;
  chunksMatchingDocFilters: number;
  docsWithZeroChunks: number;
  poolCapped: boolean;
  appliedFilters?: {
    statuses: string[];
    categories: string[];
    tags: string[];
    workspaceId?: string | null;
    orgId?: string | null;
  };
  diagnosticHint?: string;
}

export interface KbFirstNoMatchResponse {
  result: string;
  clarifyingQuestion: string;
  suggestedQueries: string[];
  nextSteps: string[];
  diagnosticHint?: string;
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function normalizeStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const normalized = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
  return normalized.length > 0 ? normalized : fallback;
}

function splitTerms(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9&]+/)
        .map((term) => term.trim())
        .filter((term) => term.length >= 2),
    ),
  );
}

function extractQuotedPhrases(text: string): string[] {
  const phrases: string[] = [];
  const regex = /["']([^"']{3,})["']/g;
  let match: RegExpExecArray | null = null;
  while ((match = regex.exec(text)) !== null) {
    const phrase = match[1].trim().toLowerCase();
    if (phrase.length >= 3) phrases.push(phrase);
  }
  return phrases;
}

function metadataTags(metadata: Record<string, unknown> | null | undefined): string[] {
  if (!metadata) return [];
  const raw = metadata.tags;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((tag) => (typeof tag === "string" ? tag.toLowerCase().trim() : ""))
    .filter(Boolean);
}

export function normalizeKnowledgeBasinSettings(
  raw: Partial<KnowledgeBasinSettings> | undefined,
): KnowledgeBasinSettings {
  const pool = clampInt(raw?.pool, 500, 10, 2000);
  const topK = clampInt(raw?.topK, 10, 1, 100);
  const perDocCap = clampInt(raw?.perDocCap, 3, 1, 20);
  const softPoolPerDocCap = clampInt(
    raw?.softPoolPerDocCap,
    Math.max(perDocCap + 1, Math.ceil(topK / 2)),
    perDocCap,
    50,
  );
  return {
    pool,
    topK: Math.min(topK, pool),
    perDocCap,
    softPoolPerDocCap,
    strict: Boolean(raw?.strict),
    statuses: normalizeStringArray(raw?.statuses, ["completed", "processed"]),
    categories: normalizeStringArray(raw?.categories, []),
    tags: normalizeStringArray(raw?.tags, []),
  };
}

const SYNONYM_MAP: Record<string, string[]> = {
  acv: ["actual cash value", "depreciated value"],
  rcv: ["replacement cost value", "replacement cost"],
  "actual cash value": ["acv", "depreciated value"],
  "replacement cost value": ["rcv", "replacement cost"],
  "ordinance and law": ["code upgrade", "increased cost of construction"],
  "code upgrade": ["ordinance and law", "building code compliance"],
  "wear and tear": ["deterioration", "maintenance issue"],
  "pre-existing": ["prior damage", "existing condition"],
  denial: ["coverage denial", "claim rejection"],
  supplement: ["supplemental estimate", "additional scope"],
  xactimate: ["estimate line items", "pricing database"],
  "o&p": ["overhead and profit", "contractor overhead"],
};

export function expandKnowledgeQueries(question: string, maxQueries = 8): string[] {
  const base = (question || "").trim();
  if (!base) return [];

  const lowerBase = base.toLowerCase();
  const expanded: string[] = [base];

  for (const [term, synonyms] of Object.entries(SYNONYM_MAP)) {
    if (!lowerBase.includes(term)) continue;
    for (const synonym of synonyms) {
      expanded.push(`${base} | ${synonym}`);
      const termRegex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
      expanded.push(base.replace(termRegex, synonym));
    }
  }

  const termHints = splitTerms(lowerBase)
    .map((term) => SYNONYM_MAP[term] || [])
    .flat()
    .slice(0, 4);
  if (termHints.length > 0) {
    expanded.push(`${base} | related terms: ${Array.from(new Set(termHints)).join(", ")}`);
  }

  return Array.from(new Set(expanded.map((query) => query.trim()).filter(Boolean))).slice(0, maxQueries);
}

function applySoftPoolDiversity(
  scored: KnowledgeChunkMatch[],
  settings: KnowledgeBasinSettings,
): KnowledgeChunkMatch[] {
  const softPerDocCap = Math.max(
    settings.perDocCap,
    settings.softPoolPerDocCap || settings.perDocCap + 1,
  );
  const minPoolSize = Math.min(scored.length, Math.max(settings.topK * 2, settings.topK + 4));

  const counts: Record<string, number> = {};
  const diverse: KnowledgeChunkMatch[] = [];
  for (const candidate of scored) {
    const used = counts[candidate.docId] || 0;
    if (used >= softPerDocCap) continue;
    diverse.push(candidate);
    counts[candidate.docId] = used + 1;
  }

  // Avoid over-pruning when corpus is small.
  if (diverse.length < minPoolSize) {
    return scored.slice();
  }
  return diverse;
}

export function selectTopKnowledgeMatches(
  matches: KnowledgeChunkMatch[],
  settings: KnowledgeBasinSettings,
): KnowledgeChunkMatch[] {
  const ordered = matches.slice().sort((a, b) => b.score - a.score);
  const perDocCounts: Record<string, number> = {};
  const selected: KnowledgeChunkMatch[] = [];

  for (const candidate of ordered) {
    const count = perDocCounts[candidate.docId] || 0;
    if (count >= settings.perDocCap) continue;
    selected.push(candidate);
    perDocCounts[candidate.docId] = count + 1;
    if (selected.length >= settings.topK) break;
  }

  return selected;
}

export function rankKnowledgeChunks(
  question: string,
  candidates: KnowledgeChunkCandidate[],
  settings: KnowledgeBasinSettings,
): KnowledgeChunkMatch[] {
  const query = (question || "").trim().toLowerCase();
  if (!query) return [];

  const terms = splitTerms(query);
  const quotedPhrases = extractQuotedPhrases(question || "");

  const scored = candidates
    .map((candidate) => {
      const content = (candidate.content || "").toLowerCase();
      const title = (candidate.docTitle || "").toLowerCase();
      const category = (candidate.category || "").toLowerCase();
      const tags = metadataTags(candidate.metadata);

      let score = 0;

      if (query.length >= 10 && content.includes(query)) {
        score += 20;
      }

      for (const phrase of quotedPhrases) {
        if (content.includes(phrase)) {
          score += 18;
        }
      }

      for (const term of terms) {
        if (content.includes(term)) {
          score += term.length >= 5 ? 2 : 1;
        }
        if (title.includes(term)) {
          score += 1.5;
        }
        if (category.includes(term)) {
          score += 0.8;
        }
        if (tags.some((tag) => tag.includes(term))) {
          score += 1;
        }
      }

      return {
        ...candidate,
        score,
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score);

  const diversePool = applySoftPoolDiversity(scored, settings);
  return selectTopKnowledgeMatches(diversePool, settings);
}

export function mergeKnowledgeMatches(
  existing: KnowledgeChunkMatch[],
  incoming: KnowledgeChunkMatch[],
): KnowledgeChunkMatch[] {
  const byChunkId = new Map<string, KnowledgeChunkMatch>();
  for (const match of [...existing, ...incoming]) {
    const prior = byChunkId.get(match.chunkId);
    if (!prior || match.score > prior.score) {
      byChunkId.set(match.chunkId, match);
    }
  }
  return Array.from(byChunkId.values()).sort((a, b) => b.score - a.score);
}

export function toKnowledgeSources(matches: KnowledgeChunkMatch[]): KnowledgeSource[] {
  return matches.map((match) => ({
    docId: match.docId,
    docTitle: match.docTitle,
    chunkId: match.chunkId,
    score: Number(match.score.toFixed(4)),
  }));
}

export function buildKnowledgeContext(matches: KnowledgeChunkMatch[]): string {
  if (!matches.length) return "";
  let context = "=== KNOWLEDGE BASIN CONTEXT (AUTHORITATIVE) ===\n";
  context += "Use ONLY this context plus explicit claim facts already provided in the prompt.\n";
  context += "If the answer is not in this context, respond: \"Not found in Knowledge Base.\"\n";
  context += "Cite source IDs like [KB-1], [KB-2] in your response.\n\n";
  matches.forEach((match, index) => {
    context += `[KB-${index + 1}] docId=${match.docId} title="${match.docTitle}" chunkId=${match.chunkId} score=${match.score.toFixed(3)}\n`;
    context += `${match.content}\n\n`;
  });
  context += "=== END KNOWLEDGE BASIN CONTEXT ===";
  return context;
}

export function buildRetrievalDiagnosticHint(args: {
  health: RetrievalHealthStats;
  settings: KnowledgeBasinSettings;
}): string | undefined {
  const { health, settings } = args;

  if (health.docsMatchingFilters === 0) {
    return (
      "No processed documents matched the current basin filters. " +
      "Check status/category filters or reprocess documents in the AI knowledge basin."
    );
  }

  if (health.chunksAvailable === 0 && health.docsMatchingFilters > 0) {
    if (health.docsWithZeroChunks > 0) {
      return (
        `${health.docsWithZeroChunks} filtered document(s) have zero chunks. ` +
        "This usually indicates ingestion/chunking failures. Reprocess affected docs."
      );
    }
    return (
      "Chunks available under applied filters are zero. " +
      "Filters (tags/category/tenant) may be too restrictive or metadata may be missing."
    );
  }

  if (health.chunksAvailable < Math.max(2, Math.ceil(settings.topK / 2))) {
    return (
      `Knowledge corpus under current filters is very small (${health.chunksAvailable} chunk(s)). ` +
      "Consider broadening filters or adding/reprocessing documents."
    );
  }

  return undefined;
}

export function buildNotFoundKbMessage(
  analysisType: string,
  options?: {
    expandedQueries?: string[];
    strictMode?: boolean;
    diagnosticHint?: string;
  },
): KbFirstNoMatchResponse {
  const baseQuery = options?.expandedQueries?.[0] || "";
  const suggestedQueries = (options?.expandedQueries || [])
    .filter((query) => query && query !== baseQuery)
    .slice(0, 3);
  const nextSteps = [
    "Try one of the suggested rephrased queries below.",
    "Use exact policy clause names, document titles, or quoted phrases.",
    "If this should exist, reprocess or upload the missing knowledge basin document.",
  ];

  const strictNote = options?.strictMode
    ? " KB-only mode is enabled, so I cannot answer without retrieved KB evidence."
    : "";

  return {
    result:
      `Not found in Knowledge Base for "${analysisType}". ` +
      "I can only answer using your AI knowledge basin documents right now." +
      strictNote,
    clarifyingQuestion:
      "Can you share the exact policy clause, document title, or phrase you want me to retrieve from the Knowledge Base?",
    suggestedQueries,
    nextSteps,
    diagnosticHint: options?.diagnosticHint,
  };
}

export async function executeKbFirstFlow<T>(args: {
  analysisType: string;
  query: string;
  settings: KnowledgeBasinSettings;
  kbSearch: (query: string, settings: KnowledgeBasinSettings) => Promise<KnowledgeChunkMatch[]>;
  callLlm: (kbContext: string, matches: KnowledgeChunkMatch[]) => Promise<T>;
}): Promise<{
  usedKb: boolean;
  skippedLlm: boolean;
  retrieval: RetrievalDebug;
  sources: KnowledgeSource[];
  llmResult?: T;
  notFoundResponse?: KbFirstNoMatchResponse;
}> {
  const matches = await args.kbSearch(args.query, args.settings);
  const retrieval: RetrievalDebug = {
    pool: args.settings.pool,
    topK: args.settings.topK,
    perDocCap: args.settings.perDocCap,
    queryExpansion: {
      totalQueries: expandKnowledgeQueries(args.query).length,
      queries: expandKnowledgeQueries(args.query),
    },
  };

  if (!matches.length) {
    const expandedQueries = expandKnowledgeQueries(args.query);
    return {
      usedKb: false,
      skippedLlm: true,
      retrieval,
      sources: [],
      notFoundResponse: buildNotFoundKbMessage(args.analysisType, {
        expandedQueries,
        strictMode: args.settings.strict,
      }),
    };
  }

  const context = buildKnowledgeContext(matches);
  const llmResult = await args.callLlm(context, matches);
  return {
    usedKb: true,
    skippedLlm: false,
    retrieval,
    sources: toKnowledgeSources(matches),
    llmResult,
  };
}
