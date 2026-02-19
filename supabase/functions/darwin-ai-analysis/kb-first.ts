export interface KnowledgeBasinSettings {
  pool: number;
  topK: number;
  perDocCap: number;
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
}

export interface KbFirstNoMatchResponse {
  result: string;
  clarifyingQuestion: string;
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
  return {
    pool,
    topK: Math.min(topK, pool),
    perDocCap,
    strict: Boolean(raw?.strict),
    statuses: normalizeStringArray(raw?.statuses, ["completed", "processed"]),
    categories: normalizeStringArray(raw?.categories, []),
    tags: normalizeStringArray(raw?.tags, []),
  };
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

  const perDocCounts: Record<string, number> = {};
  const selected: KnowledgeChunkMatch[] = [];

  for (const candidate of scored) {
    const count = perDocCounts[candidate.docId] || 0;
    if (count >= settings.perDocCap) continue;
    selected.push(candidate);
    perDocCounts[candidate.docId] = count + 1;
    if (selected.length >= settings.topK) break;
  }

  return selected;
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

export function buildNotFoundKbMessage(analysisType: string): KbFirstNoMatchResponse {
  return {
    result:
      `Not found in Knowledge Base for "${analysisType}". ` +
      "I can only answer using your AI knowledge basin documents right now.",
    clarifyingQuestion:
      "Can you share the exact policy clause, document title, or phrase you want me to retrieve from the Knowledge Base?",
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
  };

  if (!matches.length) {
    return {
      usedKb: false,
      skippedLlm: true,
      retrieval,
      sources: [],
      notFoundResponse: buildNotFoundKbMessage(args.analysisType),
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
