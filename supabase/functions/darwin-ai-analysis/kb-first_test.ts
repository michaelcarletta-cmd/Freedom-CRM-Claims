import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  executeKbFirstFlow,
  normalizeKnowledgeBasinSettings,
  rankKnowledgeChunks,
  type KnowledgeChunkCandidate,
} from "./kb-first.ts";

Deno.test("Test A: when KB search returns 0 chunks, LLM is not called", async () => {
  const settings = normalizeKnowledgeBasinSettings({
    pool: 500,
    topK: 10,
    perDocCap: 3,
    strict: true,
  });

  let llmCalled = false;
  const result = await executeKbFirstFlow({
    analysisType: "next_steps",
    query: "What does the policy say about ordinance and law?",
    settings,
    kbSearch: async () => [],
    callLlm: async () => {
      llmCalled = true;
      return "This should never run";
    },
  });

  assertEquals(llmCalled, false);
  assertEquals(result.usedKb, false);
  assertEquals(result.skippedLlm, true);
  assert(result.notFoundResponse);
  assertStringIncludes(result.notFoundResponse!.result, "Not found in Knowledge Base");
});

Deno.test("Test B: unique phrase in new doc is retrievable and appears in sources", async () => {
  const settings = normalizeKnowledgeBasinSettings({
    pool: 500,
    topK: 10,
    perDocCap: 3,
    strict: true,
  });

  const uniquePhrase = "KB_UNIQUE_PHRASE_7E3C1A9F";
  const candidates: KnowledgeChunkCandidate[] = [
    {
      chunkId: "chunk-old-1",
      docId: "doc-old",
      docTitle: "General Claims Playbook",
      content: "General claims notes about timelines and communication.",
      category: "training-materials",
      metadata: null,
    },
    {
      chunkId: "chunk-new-1",
      docId: "doc-new",
      docTitle: "Newly Uploaded Strategy Notes",
      content: `This document contains ${uniquePhrase} and should be returned by retrieval.`,
      category: "training-materials",
      metadata: null,
    },
  ];

  const ranked = rankKnowledgeChunks(
    `Find the exact phrase "${uniquePhrase}" in the knowledge basin`,
    candidates,
    settings,
  );

  assert(ranked.length > 0);
  assertStringIncludes(ranked[0].content, uniquePhrase);

  const result = await executeKbFirstFlow({
    analysisType: "document_compilation",
    query: `Find "${uniquePhrase}"`,
    settings,
    kbSearch: async () => ranked,
    callLlm: async (_kbContext, matches) => `Used ${matches.length} KB chunks`,
  });

  assertEquals(result.usedKb, true);
  assert(result.sources.some((source) => source.docId === "doc-new"));
  assert(result.sources.some((source) => source.chunkId === "chunk-new-1"));
});
