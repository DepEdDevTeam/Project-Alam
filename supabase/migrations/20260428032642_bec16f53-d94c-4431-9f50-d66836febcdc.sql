DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'parser_status') THEN
    CREATE TYPE public.parser_status AS ENUM ('pending', 'processing', 'validated', 'materialized', 'failed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'parser_entity_type') THEN
    CREATE TYPE public.parser_entity_type AS ENUM ('dataset', 'document');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_event_type') THEN
    CREATE TYPE public.audit_event_type AS ENUM (
      'FILE_UPLOADED', 'STRUCTURE_VALIDATED', 'CONTEXT_MATERIALIZED', 'CONTEXT_USED_IN_CHAT', 'CONTEXT_UPDATED',
      'DATASET_DELETED', 'DOCUMENT_DELETED', 'DOCUMENT_DOWNLOADED', 'SYNC_ALL_STATUS_REFRESHED',
      'DATASET_SYNC_STATUS_REFRESHED', 'DOCUMENT_SYNC_STATUS_REFRESHED', 'SYNC_STATUS_REFRESH_FAILED'
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.is_admin_or_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin'::public.app_role, 'super_admin'::public.app_role)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'super_admin'::public.app_role
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin_or_super_admin(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin_or_super_admin(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_admin_or_super_admin(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM authenticated;

ALTER TABLE public.collections
  ADD COLUMN IF NOT EXISTS parser_summary text,
  ADD COLUMN IF NOT EXISTS ai_parsed_context text,
  ADD COLUMN IF NOT EXISTS parser_status public.parser_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS parser_warnings text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS parser_confidence numeric(4,3),
  ADD COLUMN IF NOT EXISTS parser_validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS source_filename text,
  ADD COLUMN IF NOT EXISTS storage_path text;

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS parser_summary text,
  ADD COLUMN IF NOT EXISTS ai_parsed_context text,
  ADD COLUMN IF NOT EXISTS parser_status public.parser_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS parser_warnings text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS parser_confidence numeric(4,3),
  ADD COLUMN IF NOT EXISTS parser_validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.parser_outputs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type public.parser_entity_type NOT NULL,
  collection_id uuid REFERENCES public.collections(id) ON DELETE CASCADE,
  document_id uuid REFERENCES public.documents(id) ON DELETE CASCADE,
  source_filename text NOT NULL,
  source_storage_path text,
  file_type text NOT NULL,
  scope_type text NOT NULL,
  scope_label text NOT NULL,
  raw_output jsonb NOT NULL,
  normalized_summary text,
  confidence numeric(4,3) NOT NULL DEFAULT 0.5,
  warnings text[] NOT NULL DEFAULT '{}',
  validation_status public.parser_status NOT NULL DEFAULT 'pending',
  validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  materialized_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT parser_outputs_entity_target CHECK (
    (entity_type = 'dataset' AND collection_id IS NOT NULL AND document_id IS NULL)
    OR (entity_type = 'document' AND document_id IS NOT NULL AND collection_id IS NULL)
  )
);

ALTER TABLE public.dataset_rows
  ADD COLUMN IF NOT EXISTS parser_output_id uuid REFERENCES public.parser_outputs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_row_index integer;

ALTER TABLE public.document_chunks
  ADD COLUMN IF NOT EXISTS parser_output_id uuid REFERENCES public.parser_outputs(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type public.audit_event_type NOT NULL,
  actor_user_id uuid,
  actor_display_name text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  entity_name text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.parser_outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage collections" ON public.collections;
CREATE POLICY "Admins manage collections" ON public.collections FOR ALL
USING (public.is_admin_or_super_admin(auth.uid()))
WITH CHECK (public.is_admin_or_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Public collections readable" ON public.collections;
CREATE POLICY "Authenticated users read collections" ON public.collections FOR SELECT
USING (auth.uid() IS NOT NULL OR is_public = true);

DROP POLICY IF EXISTS "Admins manage dataset rows" ON public.dataset_rows;
CREATE POLICY "Admins manage dataset rows" ON public.dataset_rows FOR ALL
USING (public.is_admin_or_super_admin(auth.uid()))
WITH CHECK (public.is_admin_or_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Dataset rows follow collection visibility" ON public.dataset_rows;
CREATE POLICY "Dataset rows follow collection visibility" ON public.dataset_rows FOR SELECT
USING (EXISTS (SELECT 1 FROM public.collections c WHERE c.id = dataset_rows.collection_id AND (auth.uid() IS NOT NULL OR c.is_public = true)));

DROP POLICY IF EXISTS "Admins manage documents" ON public.documents;
CREATE POLICY "Admins manage documents" ON public.documents FOR ALL
USING (public.is_admin_or_super_admin(auth.uid()))
WITH CHECK (public.is_admin_or_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Public documents readable" ON public.documents;
CREATE POLICY "Authenticated users read documents" ON public.documents FOR SELECT
USING (auth.uid() IS NOT NULL OR is_public = true);

DROP POLICY IF EXISTS "Admins manage document chunks" ON public.document_chunks;
CREATE POLICY "Admins manage document chunks" ON public.document_chunks FOR ALL
USING (public.is_admin_or_super_admin(auth.uid()))
WITH CHECK (public.is_admin_or_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Document chunks follow document visibility" ON public.document_chunks;
CREATE POLICY "Document chunks follow document visibility" ON public.document_chunks FOR SELECT
USING (EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_chunks.document_id AND (auth.uid() IS NOT NULL OR d.is_public = true)));

DROP POLICY IF EXISTS "Admins manage parser outputs" ON public.parser_outputs;
CREATE POLICY "Admins manage parser outputs" ON public.parser_outputs FOR ALL
USING (public.is_admin_or_super_admin(auth.uid()))
WITH CHECK (public.is_admin_or_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users read parser outputs" ON public.parser_outputs;
CREATE POLICY "Authenticated users read parser outputs" ON public.parser_outputs FOR SELECT
USING (auth.uid() IS NOT NULL OR EXISTS (SELECT 1 FROM public.collections c WHERE c.id = parser_outputs.collection_id AND c.is_public = true) OR EXISTS (SELECT 1 FROM public.documents d WHERE d.id = parser_outputs.document_id AND d.is_public = true));

DROP POLICY IF EXISTS "Admins read audit logs" ON public.audit_logs;
CREATE POLICY "Admins read audit logs" ON public.audit_logs FOR SELECT
USING (public.is_admin_or_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins create audit logs" ON public.audit_logs;
CREATE POLICY "Admins create audit logs" ON public.audit_logs FOR INSERT
WITH CHECK (public.is_admin_or_super_admin(auth.uid()) OR auth.uid() = actor_user_id);

DROP POLICY IF EXISTS "Admins view all profiles" ON public.profiles;
CREATE POLICY "Admins view all profiles" ON public.profiles FOR SELECT
USING (public.is_admin_or_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
CREATE POLICY "Super admins manage roles" ON public.user_roles FOR ALL
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins view all roles" ON public.user_roles;
CREATE POLICY "Admins view all roles" ON public.user_roles FOR SELECT
USING (public.is_admin_or_super_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_parser_outputs_collection ON public.parser_outputs(collection_id);
CREATE INDEX IF NOT EXISTS idx_parser_outputs_document ON public.parser_outputs(document_id);
CREATE INDEX IF NOT EXISTS idx_parser_outputs_created ON public.parser_outputs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON public.audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_dataset_rows_parser_output ON public.dataset_rows(parser_output_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_parser_output ON public.document_chunks(parser_output_id);