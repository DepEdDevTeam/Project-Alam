
-- Document type enum
CREATE TYPE public.document_type AS ENUM ('policy', 'report', 'memo', 'manual', 'other');

-- Parent table: one record per uploaded document
CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  source_filename text NOT NULL,
  storage_path text,
  doc_type public.document_type NOT NULL DEFAULT 'other',
  total_pages integer NOT NULL DEFAULT 0,
  file_size_bytes bigint,
  is_public boolean NOT NULL DEFAULT true,
  uploaded_by uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Child table: chunks of text extracted from each document
CREATE TABLE public.document_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  page_number integer,
  section_title text,
  chunk_index integer NOT NULL,
  content text NOT NULL,
  search_vector tsvector,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_document_chunks_document_id ON public.document_chunks(document_id);
CREATE INDEX idx_document_chunks_page ON public.document_chunks(document_id, page_number, chunk_index);
CREATE INDEX idx_document_chunks_search ON public.document_chunks USING GIN(search_vector);
CREATE INDEX idx_documents_doc_type ON public.documents(doc_type);

-- Trigger to populate search_vector on chunks
CREATE OR REPLACE FUNCTION public.document_chunks_update_search_vector()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.search_vector := to_tsvector('simple',
    coalesce(NEW.section_title, '') || ' ' || coalesce(NEW.content, ''));
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_document_chunks_search_vector
BEFORE INSERT OR UPDATE ON public.document_chunks
FOR EACH ROW EXECUTE FUNCTION public.document_chunks_update_search_vector();

-- updated_at trigger on documents
CREATE TRIGGER trg_documents_updated_at
BEFORE UPDATE ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;

-- RLS: documents
CREATE POLICY "Public documents readable"
  ON public.documents FOR SELECT
  USING (is_public = true OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins manage documents"
  ON public.documents FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- RLS: document_chunks (follow parent document visibility)
CREATE POLICY "Document chunks follow document visibility"
  ON public.document_chunks FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_chunks.document_id
      AND (d.is_public = true OR has_role(auth.uid(), 'admin'::app_role))
  ));

CREATE POLICY "Admins manage document chunks"
  ON public.document_chunks FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
