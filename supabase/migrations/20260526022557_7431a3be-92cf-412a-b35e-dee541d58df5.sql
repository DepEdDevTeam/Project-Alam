
-- 1. Audit logs: admins only INSERT
DROP POLICY IF EXISTS "Admins create audit logs" ON public.audit_logs;
CREATE POLICY "Admins create audit logs"
ON public.audit_logs
FOR INSERT
TO authenticated
WITH CHECK (private.is_admin_or_super_admin(auth.uid()) AND auth.uid() = actor_user_id);

-- 2. parser_outputs: admins-only SELECT
DROP POLICY IF EXISTS "Authenticated users read parser outputs" ON public.parser_outputs;
CREATE POLICY "Admins read parser outputs"
ON public.parser_outputs
FOR SELECT
TO authenticated
USING (private.is_admin_or_super_admin(auth.uid()));

-- 3. email-assets bucket: writes admins only
DROP POLICY IF EXISTS "Authenticated users can upload email assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update email assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete email assets" ON storage.objects;

CREATE POLICY "Admins upload email assets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'email-assets' AND private.is_admin_or_super_admin(auth.uid()));

CREATE POLICY "Admins update email assets"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'email-assets' AND private.is_admin_or_super_admin(auth.uid()))
WITH CHECK (bucket_id = 'email-assets' AND private.is_admin_or_super_admin(auth.uid()));

CREATE POLICY "Admins delete email assets"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'email-assets' AND private.is_admin_or_super_admin(auth.uid()));

-- 4. regions-bucket: explicit admin-only access
CREATE POLICY "Admins manage regions-bucket"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'regions-bucket' AND private.is_admin_or_super_admin(auth.uid()))
WITH CHECK (bucket_id = 'regions-bucket' AND private.is_admin_or_super_admin(auth.uid()));

-- 5. Repoint ai_settings policy to private helper before dropping public wrapper
DROP POLICY IF EXISTS "Super admins manage ai_settings" ON public.ai_settings;
CREATE POLICY "Super admins manage ai_settings"
ON public.ai_settings
FOR ALL
TO authenticated
USING (private.is_super_admin(auth.uid()))
WITH CHECK (private.is_super_admin(auth.uid()));

-- 6. Drop unused public wrappers
DROP FUNCTION IF EXISTS public.is_admin_or_super_admin(uuid);
DROP FUNCTION IF EXISTS public.is_super_admin(uuid);
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);

-- 7. Set search_path on email queue functions
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public;

-- 8. Revoke public execute on sensitive SECURITY DEFINER functions
REVOKE ALL ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_first_admin() FROM anon;
