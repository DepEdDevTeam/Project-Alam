REVOKE EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) FROM authenticated;
REVOKE EXECUTE ON FUNCTION private.is_admin_or_super_admin(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.is_admin_or_super_admin(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION private.is_admin_or_super_admin(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION private.is_super_admin(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.is_super_admin(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION private.is_super_admin(uuid) FROM authenticated;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin'::public.app_role, 'super_admin'::public.app_role)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'super_admin'::public.app_role
  );
$$;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_admin_or_super_admin(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin_or_super_admin(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_or_super_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;