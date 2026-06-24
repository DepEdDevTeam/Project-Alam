CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION private.is_admin_or_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin'::public.app_role, 'super_admin'::public.app_role)
  );
$$;

CREATE OR REPLACE FUNCTION private.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'super_admin'::public.app_role
  );
$$;

GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_admin_or_super_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_super_admin(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT private.has_role(_user_id, _role);
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT private.is_admin_or_super_admin(_user_id);
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT private.is_super_admin(_user_id);
$$;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_or_super_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;

DROP POLICY IF EXISTS "Admins read chat analytics" ON public.chat_analytics;
CREATE POLICY "Admins read chat analytics" ON public.chat_analytics
FOR SELECT
USING (private.is_admin_or_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins manage rate limit config" ON public.rate_limit_config;
CREATE POLICY "Admins manage rate limit config" ON public.rate_limit_config
FOR ALL
USING (private.is_admin_or_super_admin(auth.uid()))
WITH CHECK (private.is_admin_or_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins manage schools" ON public.schools;
CREATE POLICY "Admins manage schools" ON public.schools
FOR ALL
USING (private.is_admin_or_super_admin(auth.uid()))
WITH CHECK (private.is_admin_or_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins manage ingest jobs" ON public.schools_ingest_jobs;
CREATE POLICY "Admins manage ingest jobs" ON public.schools_ingest_jobs
FOR ALL
USING (private.is_admin_or_super_admin(auth.uid()))
WITH CHECK (private.is_admin_or_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Admin upload datasets" ON storage.objects;
CREATE POLICY "Admin upload datasets" ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'datasets' AND private.is_admin_or_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Admin update datasets" ON storage.objects;
CREATE POLICY "Admin update datasets" ON storage.objects
FOR UPDATE
USING (bucket_id = 'datasets' AND private.is_admin_or_super_admin(auth.uid()))
WITH CHECK (bucket_id = 'datasets' AND private.is_admin_or_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Admin delete datasets" ON storage.objects;
CREATE POLICY "Admin delete datasets" ON storage.objects
FOR DELETE
USING (bucket_id = 'datasets' AND private.is_admin_or_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Admin read all datasets" ON storage.objects;
CREATE POLICY "Admin read all datasets" ON storage.objects
FOR SELECT
USING (bucket_id = 'datasets' AND private.is_admin_or_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins manage documents storage" ON storage.objects;
CREATE POLICY "Admins manage documents storage" ON storage.objects
FOR ALL
USING (bucket_id = 'documents' AND private.is_admin_or_super_admin(auth.uid()))
WITH CHECK (bucket_id = 'documents' AND private.is_admin_or_super_admin(auth.uid()));