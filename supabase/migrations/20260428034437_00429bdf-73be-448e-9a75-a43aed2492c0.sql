CREATE SCHEMA IF NOT EXISTS private;

ALTER FUNCTION public.has_role(uuid, public.app_role) SET SCHEMA private;
ALTER FUNCTION public.is_admin_or_super_admin(uuid) SET SCHEMA private;
ALTER FUNCTION public.is_super_admin(uuid) SET SCHEMA private;

GRANT USAGE ON SCHEMA private TO anon, authenticated;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION private.is_admin_or_super_admin(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION private.is_super_admin(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS "Admins read audit logs" ON public.audit_logs;
CREATE POLICY "Admins read audit logs" ON public.audit_logs
FOR SELECT USING (private.is_admin_or_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins create audit logs" ON public.audit_logs;
CREATE POLICY "Admins create audit logs" ON public.audit_logs
FOR INSERT WITH CHECK (private.is_admin_or_super_admin(auth.uid()) OR auth.uid() = actor_user_id);

DROP POLICY IF EXISTS "Admins read chat analytics" ON public.chat_analytics;
CREATE POLICY "Admins read chat analytics" ON public.chat_analytics
FOR SELECT USING (private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins manage collections" ON public.collections;
CREATE POLICY "Admins manage collections" ON public.collections
FOR ALL USING (private.is_admin_or_super_admin(auth.uid())) WITH CHECK (private.is_admin_or_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins manage dataset rows" ON public.dataset_rows;
CREATE POLICY "Admins manage dataset rows" ON public.dataset_rows
FOR ALL USING (private.is_admin_or_super_admin(auth.uid())) WITH CHECK (private.is_admin_or_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins manage document chunks" ON public.document_chunks;
CREATE POLICY "Admins manage document chunks" ON public.document_chunks
FOR ALL USING (private.is_admin_or_super_admin(auth.uid())) WITH CHECK (private.is_admin_or_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins manage documents" ON public.documents;
CREATE POLICY "Admins manage documents" ON public.documents
FOR ALL USING (private.is_admin_or_super_admin(auth.uid())) WITH CHECK (private.is_admin_or_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins manage parser outputs" ON public.parser_outputs;
CREATE POLICY "Admins manage parser outputs" ON public.parser_outputs
FOR ALL USING (private.is_admin_or_super_admin(auth.uid())) WITH CHECK (private.is_admin_or_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins view all profiles" ON public.profiles;
CREATE POLICY "Admins view all profiles" ON public.profiles
FOR SELECT USING (private.is_admin_or_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins manage rate limit config" ON public.rate_limit_config;
CREATE POLICY "Admins manage rate limit config" ON public.rate_limit_config
FOR ALL USING (private.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins manage schools" ON public.schools;
CREATE POLICY "Admins manage schools" ON public.schools
FOR ALL USING (private.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins manage ingest jobs" ON public.schools_ingest_jobs;
CREATE POLICY "Admins manage ingest jobs" ON public.schools_ingest_jobs
FOR ALL USING (private.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Super admins manage roles" ON public.user_roles;
CREATE POLICY "Super admins manage roles" ON public.user_roles
FOR ALL USING (private.is_super_admin(auth.uid())) WITH CHECK (private.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins view all roles" ON public.user_roles;
CREATE POLICY "Admins view all roles" ON public.user_roles
FOR SELECT USING (private.is_admin_or_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$ SELECT private.has_role(_user_id, _role); $$;

CREATE OR REPLACE FUNCTION public.is_admin_or_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$ SELECT private.is_admin_or_super_admin(_user_id); $$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$ SELECT private.is_super_admin(_user_id); $$;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_or_super_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;