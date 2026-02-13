
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Add embedding column to ai_knowledge_chunks (1536 dimensions for text-embedding-3-small)
ALTER TABLE public.ai_knowledge_chunks
ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Create index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_chunks_embedding 
ON public.ai_knowledge_chunks 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Create a function for semantic search with per-document cap
CREATE OR REPLACE FUNCTION public.match_knowledge_chunks(
  query_embedding vector(1536),
  match_count int DEFAULT 30,
  filter_category text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  content text,
  metadata jsonb,
  document_id uuid,
  chunk_index int,
  similarity float,
  doc_file_name text,
  doc_category text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.content,
    c.metadata,
    c.document_id,
    c.chunk_index,
    1 - (c.embedding <=> query_embedding) AS similarity,
    d.file_name AS doc_file_name,
    d.category AS doc_category
  FROM ai_knowledge_chunks c
  JOIN ai_knowledge_documents d ON d.id = c.document_id
  WHERE d.status = 'completed'
    AND c.embedding IS NOT NULL
    AND (filter_category IS NULL OR d.category = filter_category)
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
