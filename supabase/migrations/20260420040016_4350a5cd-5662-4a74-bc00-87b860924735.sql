
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE public.schools (
  school_id TEXT PRIMARY KEY,
  school_name TEXT,
  region TEXT,
  division TEXT,
  district TEXT,
  municipality TEXT,
  province TEXT,
  barangay TEXT,
  sector TEXT,
  school_management TEXT,
  school_subclassification TEXT,
  street_address TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  extra JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_schools_region ON public.schools(region);
CREATE INDEX idx_schools_division ON public.schools(division);
CREATE INDEX idx_schools_municipality ON public.schools(municipality);
CREATE INDEX idx_schools_name_trgm ON public.schools USING gin(school_name gin_trgm_ops);

CREATE TRIGGER update_schools_updated_at
BEFORE UPDATE ON public.schools
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Schools readable by everyone" ON public.schools FOR SELECT USING (true);
CREATE POLICY "Admins manage schools" ON public.schools FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.schools_ingest_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  storage_path TEXT NOT NULL,
  filename TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  total_rows INTEGER NOT NULL DEFAULT 0,
  processed_rows INTEGER NOT NULL DEFAULT 0,
  inserted_rows INTEGER NOT NULL DEFAULT 0,
  updated_rows INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  column_mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.schools_ingest_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage ingest jobs" ON public.schools_ingest_jobs FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_schools_ingest_jobs_updated_at
BEFORE UPDATE ON public.schools_ingest_jobs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('datasets', 'datasets', false, 524288000)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Admins read datasets bucket" ON storage.objects FOR SELECT
  USING (bucket_id = 'datasets' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins upload datasets bucket" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'datasets' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update datasets bucket" ON storage.objects FOR UPDATE
  USING (bucket_id = 'datasets' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete datasets bucket" ON storage.objects FOR DELETE
  USING (bucket_id = 'datasets' AND public.has_role(auth.uid(), 'admin'));
