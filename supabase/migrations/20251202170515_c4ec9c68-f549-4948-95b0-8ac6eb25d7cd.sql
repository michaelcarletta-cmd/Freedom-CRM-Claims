-- Create storage bucket for AI knowledge base documents
INSERT INTO storage.buckets (id, name, public) VALUES ('ai-knowledge-base', 'ai-knowledge-base', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for ai-knowledge-base bucket
CREATE POLICY "Admins can upload knowledge documents"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'ai-knowledge-base' AND EXISTS (
  SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'
));

CREATE POLICY "Admins can view knowledge documents"
ON storage.objects FOR SELECT
USING (bucket_id = 'ai-knowledge-base' AND EXISTS (
  SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'
));

CREATE POLICY "Admins can delete knowledge documents"
ON storage.objects FOR DELETE
USING (bucket_id = 'ai-knowledge-base' AND EXISTS (
  SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'
));

-- Table for knowledge base documents
CREATE TABLE public.ai_knowledge_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER,
  category TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table for text chunks (for RAG search)
CREATE TABLE public.ai_knowledge_chunks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES public.ai_knowledge_documents(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_knowledge_chunks ENABLE ROW LEVEL SECURITY;

-- RLS policies for ai_knowledge_documents (admin only for management)
CREATE POLICY "Admins can manage knowledge documents"
ON public.ai_knowledge_documents FOR ALL
USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- Staff can read knowledge documents (for AI assistant queries)
CREATE POLICY "Staff can read knowledge documents"
ON public.ai_knowledge_documents FOR SELECT
USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'staff')));

-- RLS policies for ai_knowledge_chunks
CREATE POLICY "Admins can manage knowledge chunks"
ON public.ai_knowledge_chunks FOR ALL
USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "Staff can read knowledge chunks"
ON public.ai_knowledge_chunks FOR SELECT
USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'staff')));

-- Indexes for performance
CREATE INDEX idx_knowledge_documents_category ON public.ai_knowledge_documents(category);
CREATE INDEX idx_knowledge_documents_status ON public.ai_knowledge_documents(status);
CREATE INDEX idx_knowledge_chunks_document_id ON public.ai_knowledge_chunks(document_id);

-- Trigger for updated_at
CREATE TRIGGER update_ai_knowledge_documents_updated_at
BEFORE UPDATE ON public.ai_knowledge_documents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();